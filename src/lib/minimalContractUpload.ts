import * as XLSX from 'xlsx';
import { supabase } from '@/integrations/supabase/client';
import { CHILE_DEMOGRAPHICS } from '@/data/chileRegionsData';

// Normaliza strings eliminando tildes, NBSP, espacios múltiples, etc.
const normalizeString = (str: string): string => {
  return str
    .toLowerCase()
    .trim()
    .replace(/\u00A0/g, ' ')
    .replace(/\s+/g, ' ')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[''`]/g, "'");
};

// Calcular distancia de Levenshtein para fuzzy matching
const levenshteinDistance = (a: string, b: string): number => {
  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      matrix[i][j] = b.charAt(i - 1) === a.charAt(j - 1)
        ? matrix[i - 1][j - 1]
        : Math.min(matrix[i - 1][j - 1] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j] + 1);
    }
  }
  return matrix[b.length][a.length];
};

// Alias comunes para regiones
const REGION_ALIASES: Record<string, string> = {
  'region metropolitana': 'metropolitana de santiago',
  'metropolitana': 'metropolitana de santiago',
  'rm': 'metropolitana de santiago',
  'santiago': 'metropolitana de santiago',
  'region de valparaiso': 'valparaiso',
  'region del maule': 'maule',
  'region del biobio': 'biobio',
  'region de la araucania': 'la araucania',
  'araucania': 'la araucania',
  'region de los lagos': 'los lagos',
  'region de coquimbo': 'coquimbo',
  'region de atacama': 'atacama',
  'region de antofagasta': 'antofagasta',
  'region del nuble': 'ñuble',
  'nuble': 'ñuble',
  'region de ohiggins': "o'higgins",
  'ohiggins': "o'higgins",
};

const findRegionKey = (region: string): string | undefined => {
  const normalized = normalizeString(region);
  
  // Match directo
  const directMatch = Object.keys(CHILE_DEMOGRAPHICS).find(key => normalizeString(key) === normalized);
  if (directMatch) return directMatch;
  
  // Buscar por alias
  const aliasMatch = REGION_ALIASES[normalized];
  if (aliasMatch) {
    return Object.keys(CHILE_DEMOGRAPHICS).find(key => normalizeString(key) === normalizeString(aliasMatch));
  }
  
  // Match parcial
  const partialMatch = Object.keys(CHILE_DEMOGRAPHICS).find(key => 
    normalized.includes(normalizeString(key)) || normalizeString(key).includes(normalized)
  );
  if (partialMatch) return partialMatch;
  
  // Fuzzy match
  for (const key of Object.keys(CHILE_DEMOGRAPHICS)) {
    if (levenshteinDistance(normalized, normalizeString(key)) <= 2) {
      return key;
    }
  }
  
  return undefined;
};

const findCommuneInRegion = (comuna: string, regionKey: string): string | undefined => {
  const regionData = CHILE_DEMOGRAPHICS[regionKey];
  if (!regionData) return undefined;
  
  const normalizedCommune = normalizeString(comuna);
  
  // Match exacto
  const exactMatch = regionData.communes.find(c => normalizeString(c.name) === normalizedCommune);
  if (exactMatch) return exactMatch.name;
  
  // Fuzzy match
  for (const c of regionData.communes) {
    if (levenshteinDistance(normalizedCommune, normalizeString(c.name)) <= 2) {
      return c.name;
    }
  }
  
  return undefined;
};

export interface MinimalContractRow {
  rowNumber: number;
  empresas: string;
  nombre_contrato: string;
  cebe?: string;
  codigo?: string;
  calle?: string;
  numero?: string;
  comuna?: string;
  region?: string;
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
          calle: row.calle ? String(row.calle).trim() : undefined,
          numero: row.numero ? String(row.numero).trim() : undefined,
          comuna: row.comuna ? String(row.comuna).trim() : undefined,
          region: row.region ? String(row.region).trim() : undefined,
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
    
    // Validate and correct region/comuna if provided
    if (row.region) {
      const matchedRegion = findRegionKey(row.region);
      if (!matchedRegion) {
        errors.push({ row: row.rowNumber, field: 'region', message: `Región "${row.region}" no reconocida` });
        hasError = true;
      } else {
        row.region = matchedRegion; // Auto-correct
        
        if (row.comuna) {
          const matchedCommune = findCommuneInRegion(row.comuna, matchedRegion);
          if (!matchedCommune) {
            errors.push({ row: row.rowNumber, field: 'comuna', message: `Comuna "${row.comuna}" no encontrada en región "${matchedRegion}"` });
            hasError = true;
          } else {
            row.comuna = matchedCommune; // Auto-correct
          }
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
      
      // Create address if region/comuna provided
      if (row.region || row.comuna) {
        await supabase.from('contract_addresses').insert({
          contract_id: contract.id,
          street: row.calle || '',
          number: row.numero || '',
          commune: row.comuna || '',
          region: row.region || '',
          country: 'Chile',
        });
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

// Nueva función para actualizar contratos existentes (solo campos vacíos)
export const updateExistingContractsFromExcel = async (rows: MinimalContractRow[]): Promise<MinimalUploadResult> => {
  const results: MinimalUploadResult = {
    success: 0,
    failed: 0,
    details: []
  };
  
  // Get existing contracts
  const { data: existingContracts } = await supabase
    .from('contracts')
    .select('id, name')
    .is('deleted_at', null);
  
  const contractMap = new Map(existingContracts?.map(c => [c.name.toLowerCase(), c.id]) || []);
  
  // Get companies
  const { data: companies } = await supabase
    .from('companies')
    .select('id, name');
  
  for (const row of rows) {
    try {
      const contractId = contractMap.get(row.nombre_contrato.toLowerCase());
      if (!contractId) {
        results.failed++;
        results.details.push({ 
          name: row.nombre_contrato, 
          success: false, 
          error: 'Contrato no encontrado' 
        });
        continue;
      }
      
      // Check if address exists
      const { data: existingAddress } = await supabase
        .from('contract_addresses')
        .select('id, commune, region, street, number')
        .eq('contract_id', contractId)
        .maybeSingle();
      
      // Correct region/comuna if provided
      let correctedRegion = row.region;
      let correctedCommune = row.comuna;
      
      if (row.region) {
        const matchedRegion = findRegionKey(row.region);
        if (matchedRegion) {
          correctedRegion = matchedRegion;
          if (row.comuna) {
            const matchedCommune = findCommuneInRegion(row.comuna, matchedRegion);
            if (matchedCommune) {
              correctedCommune = matchedCommune;
            }
          }
        }
      }
      
      if (existingAddress) {
        // Update only if commune or region are empty
        const updates: Record<string, string> = {};
        if (!existingAddress.commune && correctedCommune) {
          updates.commune = correctedCommune;
        }
        if (!existingAddress.region && correctedRegion) {
          updates.region = correctedRegion;
        }
        if (row.calle && !existingAddress.street) {
          updates.street = row.calle;
        }
        if (row.numero && !existingAddress.number) {
          updates.number = row.numero;
        }
        
        if (Object.keys(updates).length > 0) {
          await supabase
            .from('contract_addresses')
            .update(updates)
            .eq('id', existingAddress.id);
        }
      } else if (correctedRegion || correctedCommune) {
        // Create new address if none exists
        await supabase.from('contract_addresses').insert({
          contract_id: contractId,
          street: row.calle || '',
          number: row.numero || '',
          commune: correctedCommune || '',
          region: correctedRegion || '',
          country: 'Chile',
        });
      }
      
      // Check and link companies if not already linked
      if (row.empresas) {
        const { data: existingCompanyLinks } = await supabase
          .from('contract_companies')
          .select('company_id')
          .eq('contract_id', contractId);
        
        const linkedCompanyIds = new Set(existingCompanyLinks?.map(c => c.company_id) || []);
        
        const companyList = row.empresas.split(';').map(c => c.trim()).filter(c => c);
        for (const companyName of companyList) {
          const company = companies?.find(c => c.name.toLowerCase() === companyName.toLowerCase());
          if (company && !linkedCompanyIds.has(company.id)) {
            await supabase.from('contract_companies').insert({
              contract_id: contractId,
              company_id: company.id,
            });
          }
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