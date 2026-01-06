import * as XLSX from 'xlsx';
import { supabase } from '@/integrations/supabase/client';

export const generateMinimalContractTemplate = async () => {
  const workbook = XLSX.utils.book_new();

  // Fetch companies for reference
  const { data: companies } = await supabase
    .from('companies')
    .select('name')
    .order('name');

  // Sheet 1: Contratos (headers only)
  const contractHeaders = [
    'empresas',
    'nombre_contrato',
    'cebe',
    'codigo'
  ];

  const contractsSheet = XLSX.utils.aoa_to_sheet([contractHeaders]);
  
  // Set column widths
  contractsSheet['!cols'] = [
    { wch: 40 }, // empresas
    { wch: 40 }, // nombre_contrato
    { wch: 20 }, // cebe
    { wch: 20 }, // codigo
  ];

  XLSX.utils.book_append_sheet(workbook, contractsSheet, 'Contratos');

  // Sheet 2: Instrucciones
  const instructions = [
    ['INSTRUCCIONES DE LLENADO - PLANTILLA MÍNIMA'],
    [''],
    ['Esta plantilla permite crear contratos con información mínima.'],
    ['Posteriormente puedes actualizar los contratos usando la plantilla estándar.'],
    [''],
    ['Columna', 'Descripción', 'Obligatorio', 'Formato/Valores'],
    ['empresas', 'Nombre(s) de la(s) empresa(s)', 'SÍ', 'Separar múltiples empresas con ";"'],
    ['nombre_contrato', 'Nombre identificador del contrato', 'SÍ', 'Texto libre'],
    ['cebe', 'Código CEBE', 'NO', 'Texto libre'],
    ['codigo', 'Código del contrato', 'NO', 'Texto libre'],
    [''],
    ['NOTAS IMPORTANTES:'],
    ['- El campo "empresas" es obligatorio y debe coincidir con empresas existentes en el sistema'],
    ['- Para múltiples empresas, sepáralas con punto y coma (;)'],
    ['- Ejemplo: "Empresa A; Empresa B"'],
    ['- Los contratos se crearán con estado "firmado" y valores por defecto'],
  ];

  const instructionsSheet = XLSX.utils.aoa_to_sheet(instructions);
  instructionsSheet['!cols'] = [
    { wch: 20 },
    { wch: 45 },
    { wch: 12 },
    { wch: 40 },
  ];
  XLSX.utils.book_append_sheet(workbook, instructionsSheet, 'Instrucciones');

  // Sheet 3: Empresas disponibles
  const companiesData: string[][] = [['Empresas Disponibles']];
  if (companies) {
    companies.forEach((company) => {
      companiesData.push([company.name]);
    });
  }

  const companiesSheet = XLSX.utils.aoa_to_sheet(companiesData);
  companiesSheet['!cols'] = [{ wch: 40 }];
  XLSX.utils.book_append_sheet(workbook, companiesSheet, 'Empresas');

  // Generate and download
  const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'plantilla_contratos_minima.xlsx';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};
