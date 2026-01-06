import * as XLSX from 'xlsx';
import { supabase } from '@/integrations/supabase/client';

export interface MinimalContractRow {
  rowNumber: number;
  empresas: string;
  nombre_contrato: string;
  cebe?: string;
  codigo?: string;
}

export interface MinimalValidationResult {
  valid: MinimalContractRow[];
  errors: { row: number; field: string; message: string }[];
}

export interface MinimalUploadResult {
  success: number;
  failed: number;
  details: { name: string; success: boolean; error?: string }[];
}

export const parseMinimalExcelFile = async (file: File): Promise<MinimalContractRow[]> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: '' });
        
        const rows: MinimalContractRow[] = jsonData.map((row: any, index: number) => ({
          rowNumber: index + 2,
          empresas: String(row.empresas || '').trim(),
          nombre_contrato: String(row.nombre_contrato || '').trim(),
          cebe: row.cebe ? String(row.cebe).trim() : undefined,
          codigo: row.codigo ? String(row.codigo).trim() : undefined,
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

export const validateMinimalRows = async (rows: MinimalContractRow[]): Promise<MinimalValidationResult> => {
  const valid: MinimalContractRow[] = [];
  const errors: { row: number; field: string; message: string }[] = [];
  
  // Fetch all companies for validation
  const { data: companies } = await supabase
    .from('companies')
    .select('id, name');
  
  const companyNames = companies?.map(c => c.name.toLowerCase()) || [];
  
  for (const row of rows) {
    let hasError = false;
    
    // Required fields
    if (!row.nombre_contrato) {
      errors.push({ row: row.rowNumber, field: 'nombre_contrato', message: 'Nombre del contrato es obligatorio' });
      hasError = true;
    }
    
    if (!row.empresas) {
      errors.push({ row: row.rowNumber, field: 'empresas', message: 'Empresa(s) es obligatorio' });
      hasError = true;
    } else {
      // Validate each company exists
      const companyList = row.empresas.split(';').map(c => c.trim()).filter(c => c);
      for (const company of companyList) {
        if (!companyNames.includes(company.toLowerCase())) {
          errors.push({ row: row.rowNumber, field: 'empresas', message: `Empresa "${company}" no existe en el sistema` });
          hasError = true;
        }
      }
    }
    
    if (!hasError) {
      valid.push(row);
    }
  }
  
  return { valid, errors };
};

export const uploadMinimalContracts = async (rows: MinimalContractRow[]): Promise<MinimalUploadResult> => {
  const results: MinimalUploadResult = {
    success: 0,
    failed: 0,
    details: []
  };
  
  // Fetch companies and custom fields
  const { data: companies } = await supabase
    .from('companies')
    .select('id, name');
  
  const { data: customFields } = await supabase
    .from('contract_custom_fields')
    .select('id, field_name')
    .eq('is_active', true);
  
  const cebeField = customFields?.find(f => f.field_name === 'CEBE');
  const codigoField = customFields?.find(f => f.field_name === 'Código');
  
  for (const row of rows) {
    try {
      // Create contract with minimal data
      const contractData = {
        name: row.nombre_contrato,
        status: 'firmado' as const,
        display_currency: 'UF',
      };
      
      const { data: contract, error: contractError } = await supabase
        .from('contracts')
        .insert([contractData])
        .select()
        .single();
      
      if (contractError) throw contractError;
      
      // Link companies
      const companyList = row.empresas.split(';').map(c => c.trim()).filter(c => c);
      for (const companyName of companyList) {
        const company = companies?.find(c => c.name.toLowerCase() === companyName.toLowerCase());
        if (company) {
          await supabase.from('contract_companies').insert({
            contract_id: contract.id,
            company_id: company.id,
          });
        }
      }
      
      // Create custom field values for CEBE and Codigo
      if (cebeField && row.cebe) {
        await supabase.from('contract_custom_field_values').insert({
          contract_id: contract.id,
          field_id: cebeField.id,
          field_value: row.cebe,
        });
      }
      
      if (codigoField && row.codigo) {
        await supabase.from('contract_custom_field_values').insert({
          contract_id: contract.id,
          field_id: codigoField.id,
          field_value: row.codigo,
        });
      }
      
      // Create a minimal version record
      await supabase.from('contract_versions').insert({
        contract_id: contract.id,
        version_number: 1,
        duration_months: 12, // Default value
        regime_rent: 0, // To be updated later
        notice_type: 'meses' as const,
        notice_value: '0 meses',
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
