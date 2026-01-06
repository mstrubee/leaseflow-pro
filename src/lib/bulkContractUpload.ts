import * as XLSX from 'xlsx';
import { supabase } from '@/integrations/supabase/client';
import { CHILE_DEMOGRAPHICS } from '@/data/chileRegionsData';

export interface ContractRow {
  rowNumber: number;
  nombre_contrato: string;
  calle?: string;
  numero?: string;
  comuna?: string;
  region?: string;
  empresa?: string;
  nombre_contacto?: string;
  fecha_firma?: string;
  fecha_inicio?: string;
  moneda: string;
  duracion_meses: number;
  canon_arriendo: number;
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
          nombre_contrato: String(row.nombre_contrato || '').trim(),
          calle: row.calle ? String(row.calle).trim() : undefined,
          numero: row.numero ? String(row.numero).trim() : undefined,
          comuna: row.comuna ? String(row.comuna).trim() : undefined,
          region: row.region ? String(row.region).trim() : undefined,
          empresa: row.empresa ? String(row.empresa).trim() : undefined,
          nombre_contacto: row.nombre_contacto ? String(row.nombre_contacto).trim() : undefined,
          fecha_firma: row.fecha_firma ? String(row.fecha_firma) : undefined,
          fecha_inicio: row.fecha_inicio ? String(row.fecha_inicio) : undefined,
          moneda: String(row.moneda || '').trim().toUpperCase(),
          duracion_meses: Number(row.duracion_meses) || 0,
          canon_arriendo: Number(row.canon_arriendo) || 0,
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

export const validateRows = (rows: ContractRow[]): ValidationResult => {
  const valid: ContractRow[] = [];
  const errors: { row: number; field: string; message: string }[] = [];
  
  rows.forEach((row) => {
    let hasError = false;
    
    // Required fields
    if (!row.nombre_contrato) {
      errors.push({ row: row.rowNumber, field: 'nombre_contrato', message: 'Nombre del contrato es obligatorio' });
      hasError = true;
    }
    
    if (!row.moneda || !['UF', 'CLP'].includes(row.moneda)) {
      errors.push({ row: row.rowNumber, field: 'moneda', message: 'Moneda debe ser UF o CLP' });
      hasError = true;
    }
    
    if (!row.duracion_meses || row.duracion_meses <= 0) {
      errors.push({ row: row.rowNumber, field: 'duracion_meses', message: 'Duración en meses es obligatoria y debe ser mayor a 0' });
      hasError = true;
    }
    
    if (!row.canon_arriendo || row.canon_arriendo <= 0) {
      errors.push({ row: row.rowNumber, field: 'canon_arriendo', message: 'Canon de arriendo es obligatorio y debe ser mayor a 0' });
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
  });
  
  return { valid, errors };
};

export const uploadContracts = async (rows: ContractRow[]): Promise<UploadResult> => {
  const results: UploadResult = {
    success: 0,
    failed: 0,
    details: []
  };
  
  for (const row of rows) {
    try {
      // Parse dates
      const fechaFirma = row.fecha_firma ? parseDate(row.fecha_firma) : null;
      const fechaInicio = row.fecha_inicio ? parseDate(row.fecha_inicio) : fechaFirma;
      
      // Create contract
      const contractData = {
        name: row.nombre_contrato,
        status: 'firmado' as const,
        display_currency: row.moneda,
        signed_date: fechaFirma ? formatDateForDB(fechaFirma) : null,
      };
      
      const { data: contract, error: contractError } = await supabase
        .from('contracts')
        .insert([contractData])
        .select()
        .single();
      
      if (contractError) throw contractError;
      
      // Create address if all required fields exist
      if (row.calle && row.numero && row.comuna && row.region) {
        await supabase.from('contract_addresses').insert({
          contract_id: contract.id,
          street: row.calle,
          number: row.numero,
          commune: row.comuna,
          region: row.region,
        });
      }
      
      // Create contact if all required fields exist
      if (row.empresa && row.nombre_contacto) {
        await supabase.from('contract_contacts').insert({
          contract_id: contract.id,
          company: row.empresa,
          name: row.nombre_contacto,
          email: '',
          phone: '',
        });
      }
      
      // Create version with commercial conditions
      // notice_value based on aviso_termino_meses
      const noticeValue = row.aviso_termino_meses ? `${row.aviso_termino_meses} meses` : '0 meses';
      
      await supabase.from('contract_versions').insert({
        contract_id: contract.id,
        version_number: 1,
        effective_date: fechaInicio ? formatDateForDB(fechaInicio) : null,
        duration_months: row.duracion_meses,
        regime_rent: row.canon_arriendo,
        initial_rent: row.canon_arriendo,
        otros_egresos_amount: row.otros_arrendamientos_monto || null,
        otros_egresos_description: row.otros_arrendamientos_descripcion || null,
        guarantee_multiplier: row.garantia_meses || null,
        notice_type: 'meses' as const,
        notice_value: noticeValue,
      });
      
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
