import * as XLSX from 'xlsx';
import { CHILE_DEMOGRAPHICS } from '@/data/chileRegionsData';

export const generateContractTemplate = () => {
  const workbook = XLSX.utils.book_new();

  // Sheet 1: Contratos (headers only) - Updated columns
  const contractHeaders = [
    'empresas',
    'nombre_contrato',
    'cebe',
    'codigo',
    'calle',
    'numero',
    'comuna',
    'region',
    'rol_sii',
    'empresa',
    'nombre_contacto',
    'fecha_firma',
    'fecha_inicio',
    'moneda',
    'duracion_meses',
    'canon_arriendo',
    'otros_arrendamientos_monto',
    'otros_arrendamientos_descripcion',
    'garantia_meses',
    'aviso_termino_meses'
  ];

  const contractsSheet = XLSX.utils.aoa_to_sheet([contractHeaders]);
  
  // Set column widths
  contractsSheet['!cols'] = [
    { wch: 30 }, // empresas
    { wch: 30 }, // nombre_contrato
    { wch: 15 }, // cebe
    { wch: 15 }, // codigo
    { wch: 25 }, // calle
    { wch: 10 }, // numero
    { wch: 20 }, // comuna
    { wch: 25 }, // region
    { wch: 15 }, // rol_sii
    { wch: 25 }, // empresa (contacto)
    { wch: 25 }, // nombre_contacto
    { wch: 12 }, // fecha_firma
    { wch: 12 }, // fecha_inicio
    { wch: 8 },  // moneda
    { wch: 15 }, // duracion_meses
    { wch: 15 }, // canon_arriendo
    { wch: 20 }, // otros_arrendamientos_monto
    { wch: 30 }, // otros_arrendamientos_descripcion
    { wch: 15 }, // garantia_meses
    { wch: 18 }, // aviso_termino_meses
  ];

  XLSX.utils.book_append_sheet(workbook, contractsSheet, 'Contratos');

  // Sheet 2: Instrucciones
  const instructions = [
    ['INSTRUCCIONES DE LLENADO - ACTUALIZACIÓN DE CONTRATOS'],
    [''],
    ['Este archivo permite actualizar contratos existentes. Solo se actualizarán los campos que contengan datos.'],
    ['El contrato se identifica por el campo "nombre_contrato" que debe coincidir exactamente con el nombre en el sistema.'],
    [''],
    ['Columna', 'Descripción', 'Obligatorio', 'Formato/Valores'],
    ['empresas', 'Empresas asociadas al contrato (separadas por coma)', 'NO', 'Texto libre (ej: Empresa1, Empresa2)'],
    ['nombre_contrato', 'Nombre identificador del contrato', 'SÍ', 'Debe coincidir con contrato existente'],
    ['cebe', 'Código CEBE del contrato', 'NO', 'Texto libre'],
    ['codigo', 'Código interno del contrato', 'NO', 'Texto libre'],
    ['calle', 'Nombre de la calle', 'NO', 'Texto libre'],
    ['numero', 'Número de la dirección', 'NO', 'Texto o número'],
    ['comuna', 'Comuna de la dirección', 'NO', 'Ver hoja Regiones_Comunas'],
    ['region', 'Región de la dirección', 'NO', 'Ver hoja Regiones_Comunas'],
    ['rol_sii', 'Rol SII de la propiedad', 'NO', 'Texto libre'],
    ['empresa', 'Nombre de la empresa arrendador', 'NO', 'Texto libre'],
    ['nombre_contacto', 'Nombre de la persona de contacto', 'NO', 'Texto libre'],
    ['fecha_firma', 'Fecha de firma del contrato', 'NO', 'DD/MM/YYYY'],
    ['fecha_inicio', 'Fecha de inicio del contrato', 'NO', 'DD/MM/YYYY'],
    ['moneda', 'Moneda del canon', 'NO', 'UF o CLP'],
    ['duracion_meses', 'Duración del contrato en meses', 'NO', 'Número entero'],
    ['canon_arriendo', 'Monto del canon en régimen', 'NO', 'Número (sin puntos ni comas para miles)'],
    ['otros_arrendamientos_monto', 'Monto de otros egresos', 'NO', 'Número'],
    ['otros_arrendamientos_descripcion', 'Descripción de otros egresos', 'NO', 'Texto libre'],
    ['garantia_meses', 'Meses de garantía', 'NO', 'Número entero'],
    ['aviso_termino_meses', 'Meses de anticipación para aviso', 'NO', 'Número entero'],
    [''],
    ['NOTAS IMPORTANTES:'],
    ['- Solo "nombre_contrato" es obligatorio para identificar el contrato a actualizar'],
    ['- Los campos vacíos NO se actualizarán (se mantienen los valores existentes)'],
    ['- Las fechas deben estar en formato DD/MM/YYYY'],
    ['- La moneda debe ser exactamente "UF" o "CLP"'],
    ['- Los montos no deben tener símbolos, puntos ni comas'],
    ['- Las comunas y regiones deben coincidir con los valores de la hoja Regiones_Comunas'],
    ['- CEBE y Código son campos personalizados que deben existir en el sistema'],
  ];

  const instructionsSheet = XLSX.utils.aoa_to_sheet(instructions);
  instructionsSheet['!cols'] = [
    { wch: 30 },
    { wch: 45 },
    { wch: 12 },
    { wch: 45 },
  ];
  XLSX.utils.book_append_sheet(workbook, instructionsSheet, 'Instrucciones');

  // Sheet 3: Regiones y Comunas
  const regionCommuneData: string[][] = [['Región', 'Comuna']];
  
  Object.entries(CHILE_DEMOGRAPHICS).forEach(([regionName, regionData]) => {
    regionData.communes.forEach((commune) => {
      regionCommuneData.push([regionName, commune.name]);
    });
  });

  const regionCommuneSheet = XLSX.utils.aoa_to_sheet(regionCommuneData);
  regionCommuneSheet['!cols'] = [
    { wch: 35 },
    { wch: 25 },
  ];
  XLSX.utils.book_append_sheet(workbook, regionCommuneSheet, 'Regiones_Comunas');

  // Generate and download
  const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'plantilla_actualizar_contratos.xlsx';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};
