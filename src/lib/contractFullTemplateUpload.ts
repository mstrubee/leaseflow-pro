import * as XLSX from 'xlsx';
import { supabase } from '@/integrations/supabase/client';
import { validateExcelFile, withParseTimeout } from '@/lib/excelFileValidation';

export interface ContractFullTemplateResult {
  success: boolean;
  errors: string[];
  warnings: string[];
}

const SHEET_MAIN = 'Datos del Contrato';
const SHEET_ESCALATIONS = 'Escalonados';
const SHEET_ENTRY_EXPENSES = 'Gastos de Entrada';
const SHEET_NOTICE_RANGES = 'Terminos Anticipados';
const SHEET_VERSION_NOTICES = 'Avisos Multiples';

const YES_VALUES = new Set(['si', 'sí', 'yes', 'true', '1']);
const toBool = (value: any): boolean => YES_VALUES.has(String(value ?? '').trim().toLowerCase());

const toNumberOrNull = (value: any): number | null => {
  if (value === undefined || value === null || String(value).trim() === '') return null;
  const num = Number(value);
  return isNaN(num) ? null : num;
};

const toStringOrNull = (value: any): string | null => {
  const str = value === undefined || value === null ? '' : String(value).trim();
  return str === '' ? null : str;
};

const parseDateToDB = (value: any): string | null => {
  if (!value) return null;
  // Excel serial date
  if (typeof value === 'number') {
    const excelEpoch = new Date(1899, 11, 30);
    const date = new Date(excelEpoch.getTime() + value * 86400000);
    return isNaN(date.getTime()) ? null : date.toISOString().split('T')[0];
  }
  const parts = String(value).trim().split('/');
  if (parts.length === 3) {
    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const year = parseInt(parts[2], 10);
    const date = new Date(year, month, day);
    if (!isNaN(date.getTime())) return date.toISOString().split('T')[0];
  }
  return null;
};

const validateEnum = (
  value: any,
  allowed: string[],
  field: string,
  errors: string[]
): string | undefined => {
  const str = toStringOrNull(value);
  if (str === null) return undefined;
  if (!allowed.includes(str)) {
    errors.push(`Campo "${field}": valor "${str}" no es válido. Valores permitidos: ${allowed.join(', ')}`);
    return undefined;
  }
  return str;
};

/**
 * Sube y aplica una plantilla Excel de un solo contrato (generada por
 * generateContractFullTemplate) actualizando todos los datos del contrato,
 * su versión vigente y sus grupos repetidos (escalonados, gastos de entrada,
 * rangos de aviso y avisos múltiples). Los grupos repetidos se reemplazan
 * por completo con el contenido de la hoja correspondiente.
 */
export const uploadContractFullTemplate = async (
  contractId: string,
  versionId: string | null,
  file: File
): Promise<ContractFullTemplateResult> => {
  const errors: string[] = [];
  const warnings: string[] = [];

  const validation = validateExcelFile(file);
  if (!validation.valid) {
    return { success: false, errors: [validation.error || 'Archivo inválido'], warnings };
  }

  const workbook = await withParseTimeout(
    new Promise<XLSX.WorkBook>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target?.result as ArrayBuffer);
          resolve(XLSX.read(data, { type: 'array' }));
        } catch {
          reject(new Error('Error al leer el archivo Excel'));
        }
      };
      reader.onerror = () => reject(new Error('Error al leer el archivo'));
      reader.readAsArrayBuffer(file);
    }),
    30000
  );

  const mainSheet = workbook.Sheets[SHEET_MAIN];
  if (!mainSheet) {
    return { success: false, errors: [`No se encontró la hoja "${SHEET_MAIN}" en el archivo`], warnings };
  }

  // La hoja "Datos del Contrato" viene transpuesta: dos columnas (Campo /
  // Valor), una fila por campo -- se arma un objeto { campo: valor } igual
  // al que se obtenía antes con sheet_to_json sobre una fila ancha.
  const mainSheetAoa = XLSX.utils.sheet_to_json<any[]>(mainSheet, { header: 1, defval: '' });
  const mainRow: Record<string, any> = {};
  for (const [field, value] of mainSheetAoa.slice(1)) {
    if (field !== undefined && field !== '') mainRow[String(field).trim()] = value;
  }
  if (Object.keys(mainRow).length === 0) {
    return { success: false, errors: ['La hoja de datos del contrato no tiene ninguna fila de datos'], warnings };
  }

  // ---- Validate enum-constrained fields up front ----
  const moneda = validateEnum(mainRow.moneda, ['UF', 'CLP'], 'moneda', errors);
  const tipoGarantia = validateEnum(
    mainRow.tipo_garantia,
    ['multiplier', 'fixed_uf', 'fixed_clp', 'avg_rent'],
    'tipo_garantia',
    errors
  );
  const garantiaMonedaFija = validateEnum(mainRow.garantia_moneda_fija, ['UF', 'CLP'], 'garantia_moneda_fija', errors);
  const gastosComunesMetodologia = validateEnum(
    mainRow.gastos_comunes_metodologia,
    ['uf_m2', 'percentage'],
    'gastos_comunes_metodologia',
    errors
  );
  const gastosComunesTopeTipo = validateEnum(
    mainRow.gastos_comunes_tope_tipo,
    ['fixed', 'uf_m2'],
    'gastos_comunes_tope_tipo',
    errors
  );
  const reajusteTipo = validateEnum(mainRow.reajuste_tipo, ['percentage', 'fixed'], 'reajuste_tipo', errors);
  const renovacionAutomaticaTipo = validateEnum(
    mainRow.renovacion_automatica_tipo,
    ['unilateral_gp', 'bilateral'],
    'renovacion_automatica_tipo',
    errors
  );
  const tipoAviso = validateEnum(
    mainRow.tipo_aviso,
    ['fecha', 'meses', 'rangos', 'desde_mes', 'sin_termino'],
    'tipo_aviso',
    errors
  );
  const avisoBilateralidad = validateEnum(
    mainRow.aviso_bilateralidad,
    ['unilateral_gp', 'bilateral'],
    'aviso_bilateralidad',
    errors
  );
  const avisoTerminoBilateralidadSinTermino = validateEnum(
    mainRow.aviso_termino_bilateralidad_sin_termino,
    ['unilateral_gp', 'bilateral'],
    'aviso_termino_bilateralidad_sin_termino',
    errors
  );

  const fechaFirma = parseDateToDB(mainRow.fecha_firma);
  if (mainRow.fecha_firma && !fechaFirma) {
    errors.push('Campo "fecha_firma": formato de fecha inválido (usar DD/MM/YYYY)');
  }
  const fechaInicio = parseDateToDB(mainRow.fecha_inicio);
  if (mainRow.fecha_inicio && !fechaInicio) {
    errors.push('Campo "fecha_inicio": formato de fecha inválido (usar DD/MM/YYYY)');
  }

  if (errors.length > 0) {
    return { success: false, errors, warnings };
  }

  try {
    // ---- contracts ----
    const { error: contractError } = await supabase
      .from('contracts')
      .update({
        name: toStringOrNull(mainRow.nombre_contrato) || undefined,
        superficie_edificada_local: toNumberOrNull(mainRow.superficie_edificada_local),
        metros_lineales_frente: toNumberOrNull(mainRow.metros_lineales_frente),
        signed_date: fechaFirma,
        display_currency: moneda || 'UF',
      } as any)
      .eq('id', contractId);
    if (contractError) throw new Error(`contracts: ${contractError.message}`);

    // ---- contract_companies (replace-all by name lookup) ----
    const companyNames = String(mainRow.empresas || '')
      .split(',')
      .map((n) => n.trim())
      .filter(Boolean);
    if (companyNames.length > 0) {
      const { data: companies } = await supabase.from('companies').select('id, name');
      const companyMap = new Map((companies || []).map((c: any) => [c.name.toLowerCase(), c.id]));
      const resolvedIds: string[] = [];
      for (const cname of companyNames) {
        const cid = companyMap.get(cname.toLowerCase());
        if (cid) resolvedIds.push(cid);
        else warnings.push(`Empresa "${cname}" no encontrada, se omitió de las asociaciones`);
      }
      await supabase.from('contract_companies').delete().eq('contract_id', contractId);
      if (resolvedIds.length > 0) {
        await supabase
          .from('contract_companies')
          .insert(resolvedIds.map((company_id) => ({ contract_id: contractId, company_id })));
      }
    }

    // ---- contract_addresses ----
    const { data: existingAddress } = await supabase
      .from('contract_addresses')
      .select('id')
      .eq('contract_id', contractId)
      .maybeSingle();

    const addressPayload = {
      street: toStringOrNull(mainRow.calle) || '',
      number: toStringOrNull(mainRow.numero) || '',
      region: toStringOrNull(mainRow.region) || '',
      commune: toStringOrNull(mainRow.comuna) || '',
      rol_sii: toStringOrNull(mainRow.rol_sii),
      lat: toNumberOrNull(mainRow.lat),
      lng: toNumberOrNull(mainRow.lng),
      geocode_source: toStringOrNull(mainRow.geocode_source),
    };

    if (existingAddress) {
      const { error } = await supabase.from('contract_addresses').update(addressPayload).eq('id', existingAddress.id);
      if (error) throw new Error(`contract_addresses: ${error.message}`);
    } else if (addressPayload.region && addressPayload.commune) {
      const { error } = await supabase
        .from('contract_addresses')
        .insert({ contract_id: contractId, country: 'Chile', ...addressPayload });
      if (error) throw new Error(`contract_addresses: ${error.message}`);
    }

    // ---- contract_contacts ----
    const { data: existingContact } = await supabase
      .from('contract_contacts')
      .select('id')
      .eq('contract_id', contractId)
      .maybeSingle();

    const contactPayload = {
      company: toStringOrNull(mainRow.contacto_empresa) || '',
      name: toStringOrNull(mainRow.contacto_nombre) || '',
      phone: toStringOrNull(mainRow.contacto_telefono) || '',
      email: toStringOrNull(mainRow.contacto_email) || '',
      domicilio_comercial: toStringOrNull(mainRow.contacto_domicilio_comercial),
    };

    if (existingContact) {
      const { error } = await supabase.from('contract_contacts').update(contactPayload).eq('id', existingContact.id);
      if (error) throw new Error(`contract_contacts: ${error.message}`);
    } else if (contactPayload.company || contactPayload.name) {
      const { error } = await supabase
        .from('contract_contacts')
        .insert({ contract_id: contractId, ...contactPayload });
      if (error) throw new Error(`contract_contacts: ${error.message}`);
    }

    // ---- contract_versions ----
    const noticeType = tipoAviso || 'meses';
    const noticeValue =
      noticeType === 'rangos'
        ? ''
        : noticeType === 'sin_termino'
          ? toStringOrNull(mainRow.aviso_termino_meses_sin_termino) || '6'
          : toStringOrNull(mainRow.valor_aviso) || '3';
    const noticeBilaterality =
      noticeType === 'sin_termino' ? (avisoTerminoBilateralidadSinTermino || 'bilateral') : (avisoBilateralidad || 'unilateral_gp');

    const hasPeriodicAdjustments = toBool(mainRow.tiene_reajustes_periodicos);
    const gastosComunesMethodology = gastosComunesMetodologia || 'uf_m2';

    const versionPayload = {
      effective_date: fechaInicio,
      initial_rent: toNumberOrNull(mainRow.canon_arriendo_inicial),
      regime_rent: toNumberOrNull(mainRow.canon_arriendo_regimen) || 0,
      regime_rent_is_uf_m2: toBool(mainRow.canon_arriendo_es_uf_m2),
      grace_months: toNumberOrNull(mainRow.meses_gracia) || 0,
      grace_ggcc_applies: toBool(mainRow.meses_gracia_aplica_ggcc),
      variable_rent_percentage: toNumberOrNull(mainRow.renta_variable_porcentaje),
      duration_months: toNumberOrNull(mainRow.duracion_meses) || 12,
      notice_type: noticeType as any,
      notice_value: noticeValue,
      notice_bilaterality: noticeBilaterality,
      guarantee_type: tipoGarantia || 'multiplier',
      guarantee_multiplier:
        (tipoGarantia === 'multiplier' || tipoGarantia === 'avg_rent') ? toNumberOrNull(mainRow.garantia_multiplicador) : null,
      guarantee_fixed_amount:
        (tipoGarantia === 'fixed_uf' || tipoGarantia === 'fixed_clp') ? toNumberOrNull(mainRow.garantia_monto_fijo) : null,
      guarantee_fixed_currency: tipoGarantia === 'fixed_clp' ? 'CLP' : garantiaMonedaFija || 'UF',
      has_periodic_adjustments: hasPeriodicAdjustments,
      adjustment_type: hasPeriodicAdjustments ? reajusteTipo || 'percentage' : null,
      adjustment_value: hasPeriodicAdjustments ? toNumberOrNull(mainRow.reajuste_valor) : null,
      first_adjustment_month: hasPeriodicAdjustments ? toNumberOrNull(mainRow.reajuste_primer_mes) : null,
      adjustment_periodicity_months: hasPeriodicAdjustments ? toNumberOrNull(mainRow.reajuste_periodicidad_meses) : null,
      gastos_comunes_methodology: gastosComunesMethodology,
      gastos_comunes_uf_m2: gastosComunesMethodology === 'uf_m2' ? toNumberOrNull(mainRow.gastos_comunes_uf_m2) : null,
      gastos_comunes_uf_ml_frente:
        gastosComunesMethodology === 'uf_m2' ? toNumberOrNull(mainRow.gastos_comunes_uf_ml_frente) : null,
      gastos_comunes_prorrata_kwh_clima:
        gastosComunesMethodology === 'uf_m2' ? toNumberOrNull(mainRow.gastos_comunes_prorrata_kwh_clima) : null,
      gastos_comunes_fixed_admin_uf:
        gastosComunesMethodology === 'uf_m2' ? toNumberOrNull(mainRow.gastos_comunes_admin_fijo_uf) : null,
      gastos_comunes_percentage:
        gastosComunesMethodology === 'percentage' ? toNumberOrNull(mainRow.gastos_comunes_porcentaje) : null,
      gastos_comunes_total_centro:
        gastosComunesMethodology === 'percentage' ? toNumberOrNull(mainRow.gastos_comunes_total_centro) : null,
      gastos_comunes_tope: gastosComunesMethodology === 'percentage' ? toNumberOrNull(mainRow.gastos_comunes_tope) : null,
      gastos_comunes_tope_type: gastosComunesMethodology === 'percentage' ? gastosComunesTopeTipo || 'fixed' : null,
      has_extended_gastos_comunes: gastosComunesMethodology === 'uf_m2' ? toBool(mainRow.gastos_comunes_extendidos) : false,
      fondo_promocion_percentage: toNumberOrNull(mainRow.fondo_promocion_porcentaje),
      adicional_administracion_percentage: toNumberOrNull(mainRow.adicional_administracion_porcentaje),
      otros_egresos_amount: toNumberOrNull(mainRow.otros_egresos_monto),
      otros_egresos_description: toStringOrNull(mainRow.otros_egresos_descripcion),
      auto_renewal: toBool(mainRow.renovacion_automatica),
      auto_renewal_type: toBool(mainRow.renovacion_automatica) ? renovacionAutomaticaTipo || 'bilateral' : null,
      auto_renewal_months: toBool(mainRow.renovacion_automatica) ? toNumberOrNull(mainRow.renovacion_automatica_meses) : null,
    };

    let currentVersionId = versionId;
    if (versionId) {
      const { error } = await supabase.from('contract_versions').update(versionPayload as any).eq('id', versionId);
      if (error) throw new Error(`contract_versions: ${error.message}`);
    } else {
      const { data: newVersion, error } = await supabase
        .from('contract_versions')
        .insert({ contract_id: contractId, version_number: 1, is_current: true, ...versionPayload } as any)
        .select()
        .single();
      if (error) throw new Error(`contract_versions: ${error.message}`);
      currentVersionId = newVersion.id;
    }

    if (!currentVersionId) throw new Error('No se pudo determinar la versión del contrato');

    // ---- custom fields (upsert per field) ----
    const customFieldColumns = Object.keys(mainRow).filter((k) => k.startsWith('custom__'));
    if (customFieldColumns.length > 0) {
      const { data: customFields } = await supabase
        .from('contract_custom_fields')
        .select('id, field_name')
        .eq('is_active', true);
      const fieldByName = new Map((customFields || []).map((f: any) => [f.field_name, f.id]));

      for (const column of customFieldColumns) {
        const fieldName = column.replace('custom__', '');
        const fieldId = fieldByName.get(fieldName);
        if (!fieldId) {
          warnings.push(`Campo personalizado "${fieldName}" ya no existe, se omitió`);
          continue;
        }
        const value = toStringOrNull(mainRow[column]);
        const { data: existingValue } = await supabase
          .from('contract_custom_field_values')
          .select('id')
          .eq('contract_id', contractId)
          .eq('field_id', fieldId)
          .maybeSingle();

        if (existingValue) {
          await supabase
            .from('contract_custom_field_values')
            .update({ field_value: value })
            .eq('id', existingValue.id);
        } else if (value !== null) {
          await supabase
            .from('contract_custom_field_values')
            .insert({ contract_id: contractId, field_id: fieldId, field_value: value });
        }
      }
    }

    // ---- rent_escalations (replace-all) ----
    const escalationSheet = workbook.Sheets[SHEET_ESCALATIONS];
    if (escalationSheet) {
      const escalationRows = XLSX.utils.sheet_to_json<Record<string, any>>(escalationSheet, { defval: '' });
      const escalations = escalationRows
        .filter((r) => toStringOrNull(r.mes_desde) !== null)
        .map((r) => ({
          version_id: currentVersionId,
          month_number: toNumberOrNull(r.mes_desde) || 0,
          amount: toNumberOrNull(r.monto) || 0,
          is_uf_m2: toBool(r.es_uf_m2),
        }));

      await supabase.from('rent_escalations').delete().eq('version_id', currentVersionId);
      if (escalations.length > 0) {
        const { error } = await supabase.from('rent_escalations').insert(escalations);
        if (error) throw new Error(`rent_escalations: ${error.message}`);
      }
    }

    // ---- entry_expenses (replace-all, scoped by contract) ----
    const entryExpensesSheet = workbook.Sheets[SHEET_ENTRY_EXPENSES];
    if (entryExpensesSheet) {
      const entryExpenseRows = XLSX.utils.sheet_to_json<Record<string, any>>(entryExpensesSheet, { defval: '' });
      const entryExpenses = entryExpenseRows
        .filter((r) => toStringOrNull(r.nombre) !== null)
        .map((r, index) => ({
          contract_id: contractId,
          name: toStringOrNull(r.nombre) || '',
          amount_uf: toNumberOrNull(r.monto_uf) || 0,
          amount_clp: toNumberOrNull(r.monto_clp),
          currency: toStringOrNull(r.moneda) || 'UF',
          description: toStringOrNull(r.descripcion),
          display_order: index + 1,
        }));

      await supabase.from('entry_expenses').delete().eq('contract_id', contractId);
      if (entryExpenses.length > 0) {
        const { error } = await supabase.from('entry_expenses').insert(entryExpenses);
        if (error) throw new Error(`entry_expenses: ${error.message}`);
      }
    }

    // ---- notice_ranges (replace-all, scoped by version, only meaningful if tipo_aviso = rangos) ----
    const noticeRangeSheet = workbook.Sheets[SHEET_NOTICE_RANGES];
    if (noticeRangeSheet) {
      const noticeRangeRows = XLSX.utils.sheet_to_json<Record<string, any>>(noticeRangeSheet, { defval: '' });
      const ranges = noticeRangeRows
        .filter((r) => toStringOrNull(r.mes_inicio) !== null)
        .map((r) => ({
          version_id: currentVersionId,
          start_month: toNumberOrNull(r.mes_inicio) || 0,
          end_month: toNumberOrNull(r.mes_termino) || 0,
        }));

      await supabase.from('notice_ranges').delete().eq('version_id', currentVersionId);
      if (ranges.length > 0) {
        if (noticeType !== 'rangos') {
          warnings.push('Se cargaron "Terminos Anticipados" pero "tipo_aviso" no es "rangos", por lo que se ignorarán');
        }
        const { error } = await supabase.from('notice_ranges').insert(ranges);
        if (error) throw new Error(`notice_ranges: ${error.message}`);
      }
    }

    // ---- version_notices (replace-all, scoped by version) ----
    const versionNoticeSheet = workbook.Sheets[SHEET_VERSION_NOTICES];
    if (versionNoticeSheet) {
      const versionNoticeRows = XLSX.utils.sheet_to_json<Record<string, any>>(versionNoticeSheet, { defval: '' });
      const notices = versionNoticeRows
        .filter((r) => toStringOrNull(r.tipo_aviso) !== null && toStringOrNull(r.valor_aviso) !== null)
        .map((r) => ({
          version_id: currentVersionId,
          notice_type: toStringOrNull(r.tipo_aviso) || 'meses',
          notice_value: toStringOrNull(r.valor_aviso) || '',
          notice_bilaterality: toStringOrNull(r.bilateralidad),
          description: toStringOrNull(r.descripcion),
        }));

      await supabase.from('version_notices').delete().eq('version_id', currentVersionId);
      if (notices.length > 0) {
        const { error } = await supabase.from('version_notices').insert(notices);
        if (error) throw new Error(`version_notices: ${error.message}`);
      }
    }

    return { success: true, errors: [], warnings };
  } catch (error: any) {
    errors.push(error.message || 'Error desconocido al actualizar el contrato');
    return { success: false, errors, warnings };
  }
};
