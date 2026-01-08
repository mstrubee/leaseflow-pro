import * as XLSX from 'xlsx';
import { supabase } from '@/integrations/supabase/client';
import { CHILE_DEMOGRAPHICS } from '@/data/chileRegionsData';

export interface ContractRow {
  rowNumber: number;
  empresas?: string;
  nombre_contrato: string;
  cebe?: string;
  codigo?: string;
  calle?: string;
  numero?: string;
  comuna?: string;
  region?: string;
  rol_sii?: string;
  empresa?: string;
  nombre_contacto?: string;
  fecha_firma?: string;
  fecha_inicio?: string;
  moneda?: string;
  duracion_meses?: number;
  canon_arriendo?: number;
  otros_arrendamientos_monto?: number;
  otros_arrendamientos_descripcion?: string;
  garantia_meses?: number;
  aviso_termino_meses?: number;
}

export interface ValidationResult {
  valid: ContractRow[];
  errors: { row: number; field: string; message: string }[];
}

export interface UploadResult {
  success: number;
  failed: number;
  details: { name: string; success: boolean; error?: string }[];
}

const parseDate = (dateStr: string): Date | null => {
  if (!dateStr) return null;
  
  // Handle Excel serial date numbers
  if (typeof dateStr === 'number') {
    const excelEpoch = new Date(1899, 11, 30);
    const date = new Date(excelEpoch.getTime() + dateStr * 86400000);
    return date;
  }
  
  // Try DD/MM/YYYY format
  const parts = String(dateStr).split('/');
  if (parts.length === 3) {
    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const year = parseInt(parts[2], 10);
    const date = new Date(year, month, day);
    if (!isNaN(date.getTime())) return date;
  }
  
  return null;
};

const formatDateForDB = (date: Date): string => {
  return date.toISOString().split('T')[0];
};

const validateRegionCommune = (region?: string, comuna?: string): boolean => {
  if (!region && !comuna) return true;
  if (region && !CHILE_DEMOGRAPHICS[region]) return false;
  if (region && comuna) {
    const regionData = CHILE_DEMOGRAPHICS[region];
    return regionData.communes.some(c => c.name.toLowerCase() === comuna.toLowerCase());
  }
  return true;
};

export const parseExcelFile = async (file: File): Promise<ContractRow[]> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: '' });
        
        const rows: ContractRow[] = jsonData.map((row: any, index: number) => ({
          rowNumber: index + 2, // +2 because Excel rows start at 1 and we skip header
          empresas: row.empresas ? String(row.empresas).trim() : undefined,
          nombre_contrato: String(row.nombre_contrato || '').trim(),
          cebe: row.cebe ? String(row.cebe).trim() : undefined,
          codigo: row.codigo ? String(row.codigo).trim() : undefined,
          calle: row.calle ? String(row.calle).trim() : undefined,
          numero: row.numero ? String(row.numero).trim() : undefined,
          comuna: row.comuna ? String(row.comuna).trim() : undefined,
          region: row.region ? String(row.region).trim() : undefined,
          rol_sii: row.rol_sii ? String(row.rol_sii).trim() : undefined,
          empresa: row.empresa ? String(row.empresa).trim() : undefined,
          nombre_contacto: row.nombre_contacto ? String(row.nombre_contacto).trim() : undefined,
          fecha_firma: row.fecha_firma ? String(row.fecha_firma) : undefined,
          fecha_inicio: row.fecha_inicio ? String(row.fecha_inicio) : undefined,
          moneda: row.moneda ? String(row.moneda).trim().toUpperCase() : undefined,
          duracion_meses: row.duracion_meses ? Number(row.duracion_meses) : undefined,
          canon_arriendo: row.canon_arriendo ? Number(row.canon_arriendo) : undefined,
          otros_arrendamientos_monto: row.otros_arrendamientos_monto ? Number(row.otros_arrendamientos_monto) : undefined,
          otros_arrendamientos_descripcion: row.otros_arrendamientos_descripcion ? String(row.otros_arrendamientos_descripcion).trim() : undefined,
          garantia_meses: row.garantia_meses ? Number(row.garantia_meses) : undefined,
          aviso_termino_meses: row.aviso_termino_meses ? Number(row.aviso_termino_meses) : undefined,
        }));
        
        resolve(rows);
      } catch (error) {
        reject(new Error('Error al leer el archivo Excel'));
      }
    };
    
    reader.onerror = () => reject(new Error('Error al leer el archivo'));
    reader.readAsArrayBuffer(file);
  });
};

export const validateRows = async (rows: ContractRow[]): Promise<ValidationResult> => {
  const valid: ContractRow[] = [];
  const errors: { row: number; field: string; message: string }[] = [];
  
  // Get all existing contracts to validate
  const { data: existingContracts } = await supabase
    .from('contracts')
    .select('id, name')
    .is('deleted_at', null);
  
  const contractNames = new Set(existingContracts?.map(c => c.name.toLowerCase()) || []);
  
  for (const row of rows) {
    let hasError = false;
    
    // Required field: nombre_contrato
    if (!row.nombre_contrato) {
      errors.push({ row: row.rowNumber, field: 'nombre_contrato', message: 'Nombre del contrato es obligatorio' });
      hasError = true;
    } else if (!contractNames.has(row.nombre_contrato.toLowerCase())) {
      errors.push({ row: row.rowNumber, field: 'nombre_contrato', message: `Contrato "${row.nombre_contrato}" no existe en el sistema` });
      hasError = true;
    }
    
    // Validate moneda if provided
    if (row.moneda && !['UF', 'CLP'].includes(row.moneda)) {
      errors.push({ row: row.rowNumber, field: 'moneda', message: 'Moneda debe ser UF o CLP' });
      hasError = true;
    }
    
    // Validate duracion_meses if provided
    if (row.duracion_meses !== undefined && row.duracion_meses <= 0) {
      errors.push({ row: row.rowNumber, field: 'duracion_meses', message: 'Duración en meses debe ser mayor a 0' });
      hasError = true;
    }
    
    // Validate canon_arriendo if provided
    if (row.canon_arriendo !== undefined && row.canon_arriendo <= 0) {
      errors.push({ row: row.rowNumber, field: 'canon_arriendo', message: 'Canon de arriendo debe ser mayor a 0' });
      hasError = true;
    }
    
    // Date validation
    if (row.fecha_firma && !parseDate(row.fecha_firma)) {
      errors.push({ row: row.rowNumber, field: 'fecha_firma', message: 'Formato de fecha inválido (usar DD/MM/YYYY)' });
      hasError = true;
    }
    
    if (row.fecha_inicio && !parseDate(row.fecha_inicio)) {
      errors.push({ row: row.rowNumber, field: 'fecha_inicio', message: 'Formato de fecha inválido (usar DD/MM/YYYY)' });
      hasError = true;
    }
    
    // Region/Comuna validation
    if (!validateRegionCommune(row.region, row.comuna)) {
      errors.push({ row: row.rowNumber, field: 'region/comuna', message: 'Región o comuna no válida' });
      hasError = true;
    }
    
    if (!hasError) {
      valid.push(row);
    }
  }
  
  return { valid, errors };
};

export const uploadContracts = async (rows: ContractRow[]): Promise<UploadResult> => {
  const results: UploadResult = {
    success: 0,
    failed: 0,
    details: []
  };
  
  // Get all existing contracts
  const { data: existingContracts } = await supabase
    .from('contracts')
    .select('id, name')
    .is('deleted_at', null);
  
  const contractMap = new Map(existingContracts?.map(c => [c.name.toLowerCase(), c.id]) || []);
  
  // Get all companies
  const { data: companies } = await supabase.from('companies').select('id, name');
  const companyMap = new Map(companies?.map(c => [c.name.toLowerCase(), c.id]) || []);
  
  // Get custom fields for CEBE and Código
  const { data: customFields } = await supabase
    .from('contract_custom_fields')
    .select('id, field_name')
    .eq('is_active', true);
  
  const cebeField = customFields?.find(f => f.field_name.toLowerCase() === 'cebe');
  const codigoField = customFields?.find(f => f.field_name.toLowerCase() === 'código' || f.field_name.toLowerCase() === 'codigo');
  
  for (const row of rows) {
    try {
      const contractId = contractMap.get(row.nombre_contrato.toLowerCase());
      if (!contractId) {
        throw new Error('Contrato no encontrado');
      }
      
      // Update contract main data if provided
      const contractUpdates: Record<string, any> = {};
      
      if (row.fecha_firma) {
        const fechaFirma = parseDate(row.fecha_firma);
        if (fechaFirma) contractUpdates.signed_date = formatDateForDB(fechaFirma);
      }
      
      if (row.moneda) {
        contractUpdates.display_currency = row.moneda;
      }
      
      if (Object.keys(contractUpdates).length > 0) {
        const { error: contractError } = await supabase
          .from('contracts')
          .update(contractUpdates)
          .eq('id', contractId);
        
        if (contractError) throw contractError;
      }
      
      // Update or create address if any address field is provided
      if (row.calle || row.numero || row.comuna || row.region || row.rol_sii) {
        const { data: existingAddress } = await supabase
          .from('contract_addresses')
          .select('id, street, number, commune, region, rol_sii')
          .eq('contract_id', contractId)
          .maybeSingle();
        
        const addressData: Record<string, any> = {};
        if (row.calle) addressData.street = row.calle;
        if (row.numero) addressData.number = row.numero;
        if (row.comuna) addressData.commune = row.comuna;
        if (row.region) addressData.region = row.region;
        if (row.rol_sii) addressData.rol_sii = row.rol_sii;
        
        if (existingAddress) {
          // Update existing address
          await supabase
            .from('contract_addresses')
            .update(addressData)
            .eq('id', existingAddress.id);
        } else if (row.calle && row.numero && row.comuna && row.region) {
          // Create new address only if all required fields are present
          await supabase.from('contract_addresses').insert({
            contract_id: contractId,
            street: row.calle,
            number: row.numero,
            commune: row.comuna,
            region: row.region,
            rol_sii: row.rol_sii || null,
          });
        }
      }
      
      // Update or create contact if any contact field is provided
      if (row.empresa || row.nombre_contacto) {
        const { data: existingContact } = await supabase
          .from('contract_contacts')
          .select('id')
          .eq('contract_id', contractId)
          .maybeSingle();
        
        const contactData: Record<string, any> = {};
        if (row.empresa) contactData.company = row.empresa;
        if (row.nombre_contacto) contactData.name = row.nombre_contacto;
        
        if (existingContact) {
          await supabase
            .from('contract_contacts')
            .update(contactData)
            .eq('id', existingContact.id);
        } else if (row.empresa && row.nombre_contacto) {
          await supabase.from('contract_contacts').insert({
            contract_id: contractId,
            company: row.empresa,
            name: row.nombre_contacto,
            email: '',
            phone: '',
          });
        }
      }
      
      // Update current version if commercial conditions are provided
      if (row.duracion_meses || row.canon_arriendo || row.fecha_inicio || 
          row.otros_arrendamientos_monto !== undefined || row.otros_arrendamientos_descripcion ||
          row.garantia_meses || row.aviso_termino_meses) {
        
        const { data: currentVersion } = await supabase
          .from('contract_versions')
          .select('*')
          .eq('contract_id', contractId)
          .eq('is_current', true)
          .maybeSingle();
        
        const versionUpdates: Record<string, any> = {};
        
        if (row.fecha_inicio) {
          const fechaInicio = parseDate(row.fecha_inicio);
          if (fechaInicio) versionUpdates.effective_date = formatDateForDB(fechaInicio);
        }
        
        if (row.duracion_meses) versionUpdates.duration_months = row.duracion_meses;
        if (row.canon_arriendo) {
          versionUpdates.regime_rent = row.canon_arriendo;
          versionUpdates.initial_rent = row.canon_arriendo;
        }
        if (row.otros_arrendamientos_monto !== undefined) versionUpdates.otros_egresos_amount = row.otros_arrendamientos_monto;
        if (row.otros_arrendamientos_descripcion) versionUpdates.otros_egresos_description = row.otros_arrendamientos_descripcion;
        if (row.garantia_meses) versionUpdates.guarantee_multiplier = row.garantia_meses;
        if (row.aviso_termino_meses) versionUpdates.notice_value = `${row.aviso_termino_meses} meses`;
        
        if (currentVersion && Object.keys(versionUpdates).length > 0) {
          await supabase
            .from('contract_versions')
            .update(versionUpdates)
            .eq('id', currentVersion.id);
        }
      }
      
      // Update company associations if empresas is provided
      if (row.empresas) {
        const companyNames = row.empresas.split(',').map(n => n.trim()).filter(Boolean);
        
        // Remove existing associations
        await supabase
          .from('contract_companies')
          .delete()
          .eq('contract_id', contractId);
        
        // Add new associations
        for (const companyName of companyNames) {
          const companyId = companyMap.get(companyName.toLowerCase());
          if (companyId) {
            await supabase.from('contract_companies').insert({
              contract_id: contractId,
              company_id: companyId,
            });
          }
        }
      }
      
      // Update custom field values (CEBE and Código)
      if (row.cebe && cebeField) {
        const { data: existingValue } = await supabase
          .from('contract_custom_field_values')
          .select('id')
          .eq('contract_id', contractId)
          .eq('field_id', cebeField.id)
          .maybeSingle();
        
        if (existingValue) {
          await supabase
            .from('contract_custom_field_values')
            .update({ field_value: row.cebe })
            .eq('id', existingValue.id);
        } else {
          await supabase.from('contract_custom_field_values').insert({
            contract_id: contractId,
            field_id: cebeField.id,
            field_value: row.cebe,
          });
        }
      }
      
      if (row.codigo && codigoField) {
        const { data: existingValue } = await supabase
          .from('contract_custom_field_values')
          .select('id')
          .eq('contract_id', contractId)
          .eq('field_id', codigoField.id)
          .maybeSingle();
        
        if (existingValue) {
          await supabase
            .from('contract_custom_field_values')
            .update({ field_value: row.codigo })
            .eq('id', existingValue.id);
        } else {
          await supabase.from('contract_custom_field_values').insert({
            contract_id: contractId,
            field_id: codigoField.id,
            field_value: row.codigo,
          });
        }
      }
      
      results.success++;
      results.details.push({ name: row.nombre_contrato, success: true });
      
    } catch (error: any) {
      results.failed++;
      results.details.push({ 
        name: row.nombre_contrato, 
        success: false, 
        error: error.message || 'Error desconocido' 
      });
    }
  }
  
  return results;
};
