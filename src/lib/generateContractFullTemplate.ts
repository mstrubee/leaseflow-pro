import * as XLSX from 'xlsx';
import { supabase } from '@/integrations/supabase/client';
import { CHILE_DEMOGRAPHICS } from '@/data/chileRegionsData';

const formatDate = (dateString: string | null | undefined): string => {
  if (!dateString) return '';
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return '';
  const day = date.getDate().toString().padStart(2, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
};

const boolLabel = (value: boolean | null | undefined): string => (value ? 'SI' : 'NO');

/**
 * Genera y descarga una plantilla Excel multi-hoja pre-llenada con los datos
 * actuales de UN contrato, para permitir editarlos fuera de la UI y luego
 * re-subirlos con contractFullTemplateUpload.ts.
 */
export const generateContractFullTemplate = async (contractId: string): Promise<void> => {
  const { data: contract, error: contractError } = await supabase
    .from('contracts')
    .select(`
      *,
      contract_addresses (*),
      contract_contacts (*),
      contract_companies (company_id, companies (name)),
      contract_versions (*, rent_escalations (*)),
      contract_custom_field_values (field_id, field_value)
    `)
    .eq('id', contractId)
    .single();

  if (contractError) throw new Error(`Error al obtener el contrato: ${contractError.message}`);
  if (!contract) throw new Error('Contrato no encontrado');

  const version = (contract.contract_versions || []).find((v: any) => v.is_current) || contract.contract_versions?.[0];
  const address = contract.contract_addresses?.[0];
  const contact = contract.contract_contacts?.[0];
  const companies = (contract.contract_companies || [])
    .map((cc: any) => cc.companies?.name)
    .filter(Boolean)
    .join(', ');

  const { data: customFields } = await supabase
    .from('contract_custom_fields')
    .select('id, field_name, is_active')
    .order('display_order');

  const activeCustomFields = (customFields || []).filter((f: any) => f.is_active);
  const customFieldValueByFieldId = new Map(
    (contract.contract_custom_field_values || []).map((v: any) => [v.field_id, v.field_value])
  );

  let noticeRanges: Array<{ start_month: number; end_month: number }> = [];
  let versionNotices: Array<{ notice_type: string; notice_value: string; notice_bilaterality: string | null; description: string | null }> = [];
  let entryExpenses: Array<{ name: string; amount_uf: number; amount_clp: number | null; currency: string; description: string | null; display_order: number | null }> = [];

  if (version?.id) {
    const [rangesRes, noticesRes] = await Promise.all([
      supabase.from('notice_ranges').select('start_month, end_month').eq('version_id', version.id).order('start_month'),
      supabase.from('version_notices').select('notice_type, notice_value, notice_bilaterality, description').eq('version_id', version.id).order('created_at'),
    ]);
    noticeRanges = rangesRes.data || [];
    versionNotices = noticesRes.data || [];
  }

  const entryExpensesRes = await supabase
    .from('entry_expenses')
    .select('name, amount_uf, amount_clp, currency, description, display_order')
    .eq('contract_id', contractId)
    .order('display_order', { ascending: true });
  entryExpenses = entryExpensesRes.data || [];

  const workbook = XLSX.utils.book_new();

  // ---- Sheet 1: Datos del Contrato ----
  const mainHeaders: string[] = [
    'nombre_contrato', 'empresas', 'superficie_edificada_local', 'metros_lineales_frente',
    'fecha_firma', 'moneda',
    'calle', 'numero', 'region', 'comuna', 'rol_sii', 'lat', 'lng', 'geocode_source',
    'contacto_empresa', 'contacto_nombre', 'contacto_telefono', 'contacto_domicilio_comercial', 'contacto_email',
    'fecha_inicio', 'canon_arriendo_regimen', 'canon_arriendo_es_uf_m2', 'canon_arriendo_inicial',
    'meses_gracia', 'meses_gracia_aplica_ggcc',
    'renta_variable_porcentaje',
    'tipo_garantia', 'garantia_multiplicador', 'garantia_monto_fijo', 'garantia_moneda_fija',
    'gastos_comunes_metodologia',
    'gastos_comunes_uf_m2', 'gastos_comunes_uf_ml_frente', 'gastos_comunes_prorrata_kwh_clima', 'gastos_comunes_admin_fijo_uf',
    'gastos_comunes_porcentaje', 'gastos_comunes_total_centro', 'gastos_comunes_tope', 'gastos_comunes_tope_tipo',
    'gastos_comunes_extendidos',
    'fondo_promocion_porcentaje', 'adicional_administracion_porcentaje',
    'otros_egresos_monto', 'otros_egresos_descripcion',
    'tiene_reajustes_periodicos', 'reajuste_tipo', 'reajuste_valor', 'reajuste_primer_mes', 'reajuste_periodicidad_meses',
    'duracion_meses',
    'renovacion_automatica', 'renovacion_automatica_tipo', 'renovacion_automatica_meses',
    'tipo_aviso', 'valor_aviso', 'aviso_bilateralidad',
    'aviso_termino_meses_sin_termino', 'aviso_termino_bilateralidad_sin_termino',
    ...activeCustomFields.map((f: any) => `custom__${f.field_name}`),
  ];

  const mainRow: (string | number)[] = [
    contract.name || '',
    companies,
    contract.superficie_edificada_local ?? '',
    contract.metros_lineales_frente ?? '',
    formatDate(contract.signed_date),
    contract.display_currency || 'UF',
    address?.street || '',
    address?.number || '',
    address?.region || '',
    address?.commune || '',
    address?.rol_sii || '',
    address?.lat ?? '',
    address?.lng ?? '',
    address?.geocode_source || '',
    contact?.company || '',
    contact?.name || '',
    contact?.phone || '',
    contact?.domicilio_comercial || '',
    contact?.email || '',
    formatDate(version?.effective_date),
    version?.regime_rent ?? '',
    boolLabel(version?.regime_rent_is_uf_m2),
    version?.initial_rent ?? '',
    version?.grace_months ?? 0,
    boolLabel(version?.grace_ggcc_applies ?? true),
    version?.variable_rent_percentage ?? '',
    version?.guarantee_type || 'multiplier',
    version?.guarantee_multiplier ?? '',
    version?.guarantee_fixed_amount ?? '',
    version?.guarantee_fixed_currency || '',
    version?.gastos_comunes_methodology || 'uf_m2',
    version?.gastos_comunes_uf_m2 ?? '',
    version?.gastos_comunes_uf_ml_frente ?? '',
    version?.gastos_comunes_prorrata_kwh_clima ?? '',
    version?.gastos_comunes_fixed_admin_uf ?? '',
    version?.gastos_comunes_percentage ?? '',
    version?.gastos_comunes_total_centro ?? '',
    version?.gastos_comunes_tope ?? '',
    version?.gastos_comunes_tope_type || '',
    boolLabel(version?.has_extended_gastos_comunes),
    version?.fondo_promocion_percentage ?? '',
    version?.adicional_administracion_percentage ?? '',
    version?.otros_egresos_amount ?? '',
    version?.otros_egresos_description || '',
    boolLabel(version?.has_periodic_adjustments),
    version?.adjustment_type || '',
    version?.adjustment_value ?? '',
    version?.first_adjustment_month ?? '',
    version?.adjustment_periodicity_months ?? '',
    version?.duration_months ?? '',
    boolLabel(version?.auto_renewal),
    version?.auto_renewal_type || '',
    version?.auto_renewal_months ?? '',
    version?.notice_type || 'meses',
    version?.notice_type === 'sin_termino' ? '' : (version?.notice_value ?? ''),
    version?.notice_bilaterality || '',
    version?.notice_type === 'sin_termino' ? (version?.notice_value ?? '') : '',
    version?.notice_type === 'sin_termino' ? (version?.notice_bilaterality || '') : '',
    ...activeCustomFields.map((f: any) => customFieldValueByFieldId.get(f.id) || ''),
  ];

  // Se transpone a dos columnas (Campo / Valor), una fila por campo -- con
  // ~60 columnas en una sola fila era muy difícil de visualizar/completar
  // (pedido explícito de Matias). El resto de las hojas ya son "una fila
  // por ítem" y no necesitan este tratamiento.
  const mainSheetRows = [
    ['Campo', 'Valor'],
    ...mainHeaders.map((header, i) => [header, mainRow[i]]),
  ];
  const mainSheet = XLSX.utils.aoa_to_sheet(mainSheetRows);
  mainSheet['!cols'] = [{ wch: 40 }, { wch: 40 }];
  XLSX.utils.book_append_sheet(workbook, mainSheet, 'Datos del Contrato');

  // ---- Sheet 2: Escalonados ----
  const escalationHeaders = ['mes_desde', 'monto', 'es_uf_m2'];
  const escalationRows = (version?.rent_escalations || [])
    .slice()
    .sort((a: any, b: any) => a.month_number - b.month_number)
    .map((e: any) => [e.month_number, e.amount, boolLabel(e.is_uf_m2)]);
  const escalationSheet = XLSX.utils.aoa_to_sheet([escalationHeaders, ...escalationRows]);
  escalationSheet['!cols'] = [{ wch: 14 }, { wch: 14 }, { wch: 10 }];
  XLSX.utils.book_append_sheet(workbook, escalationSheet, 'Escalonados');

  // ---- Sheet 3: Gastos de Entrada ----
  const entryExpenseHeaders = ['nombre', 'monto_uf', 'monto_clp', 'moneda', 'descripcion'];
  const entryExpenseRows = entryExpenses.map((e) => [
    e.name,
    e.amount_uf ?? '',
    e.amount_clp ?? '',
    e.currency || 'UF',
    e.description || '',
  ]);
  const entryExpenseSheet = XLSX.utils.aoa_to_sheet([entryExpenseHeaders, ...entryExpenseRows]);
  entryExpenseSheet['!cols'] = [{ wch: 25 }, { wch: 14 }, { wch: 16 }, { wch: 10 }, { wch: 35 }];
  XLSX.utils.book_append_sheet(workbook, entryExpenseSheet, 'Gastos de Entrada');

  // ---- Sheet 4: Términos Anticipados ----
  const noticeRangeHeaders = ['mes_inicio', 'mes_termino'];
  const noticeRangeRows = noticeRanges
    .slice()
    .sort((a, b) => a.start_month - b.start_month)
    .map((r) => [r.start_month, r.end_month]);
  const noticeRangeSheet = XLSX.utils.aoa_to_sheet([noticeRangeHeaders, ...noticeRangeRows]);
  noticeRangeSheet['!cols'] = [{ wch: 14 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(workbook, noticeRangeSheet, 'Terminos Anticipados');

  // ---- Sheet 5: Avisos Múltiples ----
  const versionNoticeHeaders = ['tipo_aviso', 'valor_aviso', 'bilateralidad', 'descripcion'];
  const versionNoticeRows = versionNotices.map((n) => [
    n.notice_type,
    n.notice_value,
    n.notice_bilaterality || '',
    n.description || '',
  ]);
  const versionNoticeSheet = XLSX.utils.aoa_to_sheet([versionNoticeHeaders, ...versionNoticeRows]);
  versionNoticeSheet['!cols'] = [{ wch: 14 }, { wch: 14 }, { wch: 16 }, { wch: 25 }];
  XLSX.utils.book_append_sheet(workbook, versionNoticeSheet, 'Avisos Multiples');

  // ---- Sheet 6: Instrucciones ----
  const instructions: (string | number)[][] = [
    ['INSTRUCCIONES DE LLENADO - PLANTILLA DE CONTRATO'],
    [''],
    [`Contrato: ${contract.name}`],
    ['Este archivo contiene los datos actuales del contrato. Complete o corrija los campos vacíos y vuelva a subir el archivo con el botón "Subir Plantilla" en la página de edición del contrato.'],
    [''],
    ['HOJA "Datos del Contrato"'],
    ['Dos columnas (Campo / Valor): cada fila es un campo distinto, con los datos generales, de dirección, contacto y condiciones comerciales de la versión vigente. No agregue ni elimine filas de esta hoja, ni cambie el texto de la columna "Campo".'],
    ['Los campos que empiezan con "custom__" corresponden a campos personalizados definidos por el administrador.'],
    [''],
    ['HOJAS DE GRUPOS REPETIDOS ("Escalonados", "Gastos de Entrada", "Terminos Anticipados", "Avisos Multiples")'],
    ['IMPORTANTE: al subir el archivo, las filas de estas hojas REEMPLAZAN COMPLETAMENTE los datos actuales de esa sección.'],
    ['Si desea eliminar una fila existente, simplemente bórrela de la hoja antes de subir el archivo.'],
    ['"Escalonados": cada fila define un tramo que comienza en "mes_desde" (1 = primer mes del contrato). El término de cada tramo es implícito: termina el mes anterior al inicio del siguiente tramo, o al término del contrato para el último tramo. NO agregar columna de mes de término.'],
    ['"Terminos Anticipados" solo se usa si "tipo_aviso" en la hoja principal es "rangos"; de lo contrario esta hoja se ignora.'],
    ['"Avisos Multiples" corresponde a avisos de término anticipado adicionales al aviso principal.'],
    [''],
    ['CAMPOS CON VALORES RESTRINGIDOS (usar exactamente uno de estos valores)'],
    ['moneda: UF | CLP'],
    ['canon_arriendo_es_uf_m2 / meses_gracia_aplica_ggcc / gastos_comunes_extendidos / tiene_reajustes_periodicos / renovacion_automatica / es_uf_m2: SI | NO'],
    ['tipo_garantia: multiplier | fixed_uf | fixed_clp | avg_rent'],
    ['garantia_moneda_fija: UF | CLP'],
    ['gastos_comunes_metodologia: uf_m2 | percentage'],
    ['gastos_comunes_tope_tipo: fixed | uf_m2'],
    ['reajuste_tipo: percentage | fixed'],
    ['renovacion_automatica_tipo: unilateral_gp | bilateral'],
    ['tipo_aviso: fecha | meses | rangos | desde_mes | sin_termino'],
    ['  - "meses": valor_aviso = cantidad de meses de aviso previo (ej. "6").'],
    ['  - "fecha": valor_aviso = fecha específica antes de la cual debe avisarse.'],
    ['  - "rangos": valor_aviso se ignora; usar la hoja "Terminos Anticipados".'],
    ['  - "desde_mes": valor_aviso = SOLO el número de mes del contrato desde el cual se puede ejercer el término anticipado (ej. "61"), sin plazo de aviso adicional -- el aviso puede darse desde ese mes hasta el final del contrato. NO escribir aquí un plazo de aviso (días/meses) ni combinarlo con el mes: si la cláusula exige además un plazo de aviso propio dentro de esa ventana, ese matiz no tiene campo en esta plantilla y debe completarse manualmente en la plataforma.'],
    ['  - "sin_termino": valor_aviso no se usa; ver aviso_termino_meses_sin_termino.'],
    ['aviso_bilateralidad / aviso_termino_bilateralidad_sin_termino / bilateralidad (hoja Avisos Multiples): unilateral_gp | unilateral_arrendador | bilateral'],
    ['  - unilateral_gp: solo el arrendatario (Grupo Planet) puede dar el aviso de término.'],
    ['  - unilateral_arrendador: solo el Arrendador puede dar el aviso de término (ej. con X meses de anticipación pagando una indemnización), sin que el arrendatario deba estar de acuerdo.'],
    ['  - bilateral: ambas partes deben acordar el término.'],
    ['fecha_firma / fecha_inicio: DD/MM/YYYY'],
    ['region / comuna: ver hoja "Regiones_Comunas"'],
    [''],
    ['Los campos vacíos se guardan como vacíos/nulos según corresponda: revise cada valor antes de subir.'],
  ];
  const instructionsSheet = XLSX.utils.aoa_to_sheet(instructions);
  instructionsSheet['!cols'] = [{ wch: 110 }];
  XLSX.utils.book_append_sheet(workbook, instructionsSheet, 'Instrucciones');

  // ---- Sheet 7: Regiones_Comunas ----
  const regionCommuneData: string[][] = [['Región', 'Comuna']];
  Object.entries(CHILE_DEMOGRAPHICS).forEach(([regionName, regionData]) => {
    regionData.communes.forEach((commune) => {
      regionCommuneData.push([regionName, commune.name]);
    });
  });
  const regionCommuneSheet = XLSX.utils.aoa_to_sheet(regionCommuneData);
  regionCommuneSheet['!cols'] = [{ wch: 35 }, { wch: 25 }];
  XLSX.utils.book_append_sheet(workbook, regionCommuneSheet, 'Regiones_Comunas');

  // ---- Download ----
  const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

  const sanitizedName = (contract.name || 'contrato')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `plantilla_contrato_${sanitizedName || contractId}.xlsx`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};
