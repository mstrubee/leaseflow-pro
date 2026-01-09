import * as XLSX from 'xlsx';
import { supabase } from '@/integrations/supabase/client';
import { CHILE_DEMOGRAPHICS } from '@/data/chileRegionsData';

interface ContractData {
  empresas: string;
  nombre_contrato: string;
  cebe: string;
  codigo: string;
  calle: string;
  numero: string;
  comuna: string;
  region: string;
  rol_sii: string;
  empresa: string;
  nombre_contacto: string;
  fecha_firma: string;
  fecha_inicio: string;
  moneda: string;
  duracion_meses: string;
  canon_arriendo: string;
  otros_arrendamientos_monto: string;
  otros_arrendamientos_descripcion: string;
  garantia_meses: string;
  aviso_termino_meses: string;
}

const formatDate = (dateString: string | null): string => {
  if (!dateString) return '';
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return '';
  const day = date.getDate().toString().padStart(2, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
};

export const generateContractTemplateWithData = async () => {
  // Fetch all contracts with their related data
  const { data: contracts, error: contractsError } = await supabase
    .from('contracts')
    .select(`
      id,
      name,
      signed_date,
      display_currency,
      contract_addresses (
        street,
        number,
        commune,
        region,
        rol_sii
      ),
      contract_contacts (
        company,
        name
      ),
      contract_versions (
        duration_months,
        regime_rent,
        guarantee_multiplier,
        notice_value,
        otros_egresos_amount,
        otros_egresos_description,
        is_current,
        effective_date
      ),
      contract_companies (
        company_id,
        companies (
          name
        )
      ),
      contract_custom_field_values (
        field_id,
        field_value,
        contract_custom_fields (
          field_name
        )
      )
    `)
    .is('deleted_at', null)
    .order('name');

  if (contractsError) {
    throw new Error(`Error fetching contracts: ${contractsError.message}`);
  }

  const workbook = XLSX.utils.book_new();

  // Build contract data rows
  const contractData: ContractData[] = (contracts || []).map(contract => {
    // Get current version
    const currentVersion = contract.contract_versions?.find(v => v.is_current) 
      || contract.contract_versions?.[0];
    
    // Get first address
    const address = contract.contract_addresses?.[0];
    
    // Get first contact
    const contact = contract.contract_contacts?.[0];
    
    // Get companies
    const companies = contract.contract_companies
      ?.map(cc => cc.companies?.name)
      .filter(Boolean)
      .join(', ') || '';
    
    // Get custom fields (CEBE, Código)
    const customFields = contract.contract_custom_field_values || [];
    const cebeField = customFields.find(cf => 
      cf.contract_custom_fields?.field_name?.toLowerCase() === 'cebe'
    );
    const codigoField = customFields.find(cf => 
      cf.contract_custom_fields?.field_name?.toLowerCase() === 'código' ||
      cf.contract_custom_fields?.field_name?.toLowerCase() === 'codigo'
    );

    return {
      empresas: companies,
      nombre_contrato: contract.name || '',
      cebe: cebeField?.field_value || '',
      codigo: codigoField?.field_value || '',
      calle: address?.street || '',
      numero: address?.number || '',
      comuna: address?.commune || '',
      region: address?.region || '',
      rol_sii: address?.rol_sii || '',
      empresa: contact?.company || '',
      nombre_contacto: contact?.name || '',
      fecha_firma: formatDate(contract.signed_date),
      fecha_inicio: formatDate(currentVersion?.effective_date || null),
      moneda: contract.display_currency || '',
      duracion_meses: currentVersion?.duration_months?.toString() || '',
      canon_arriendo: currentVersion?.regime_rent?.toString() || '',
      otros_arrendamientos_monto: currentVersion?.otros_egresos_amount?.toString() || '',
      otros_arrendamientos_descripcion: currentVersion?.otros_egresos_description || '',
      garantia_meses: currentVersion?.guarantee_multiplier?.toString() || '',
      aviso_termino_meses: currentVersion?.notice_value || '',
    };
  });

  // Sheet 1: Contratos with data
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

  const dataRows = contractData.map(row => [
    row.empresas,
    row.nombre_contrato,
    row.cebe,
    row.codigo,
    row.calle,
    row.numero,
    row.comuna,
    row.region,
    row.rol_sii,
    row.empresa,
    row.nombre_contacto,
    row.fecha_firma,
    row.fecha_inicio,
    row.moneda,
    row.duracion_meses,
    row.canon_arriendo,
    row.otros_arrendamientos_monto,
    row.otros_arrendamientos_descripcion,
    row.garantia_meses,
    row.aviso_termino_meses,
  ]);

  const contractsSheet = XLSX.utils.aoa_to_sheet([contractHeaders, ...dataRows]);
  
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
    ['INSTRUCCIONES DE LLENADO - CARGA/ACTUALIZACIÓN DE CONTRATOS'],
    [''],
    ['Este archivo permite crear contratos nuevos o actualizar contratos existentes.'],
    ['Si el nombre del contrato existe en el sistema, se actualizará. Si no existe, se creará uno nuevo.'],
    ['Solo se actualizarán/crearán los campos que contengan datos.'],
    [''],
    ['Columna', 'Descripción', 'Obligatorio', 'Formato/Valores'],
    ['empresas', 'Empresas asociadas al contrato (separadas por coma)', 'NO', 'Texto libre (ej: Empresa1, Empresa2)'],
    ['nombre_contrato', 'Nombre identificador del contrato', 'SÍ', 'Texto único para identificar'],
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
    ['- "nombre_contrato" es obligatorio para identificar el contrato'],
    ['- Si el contrato existe, se actualiza. Si no existe, se crea nuevo.'],
    ['- Los campos vacíos NO se actualizarán (se mantienen los valores existentes)'],
    ['- Las fechas deben estar en formato DD/MM/YYYY'],
    ['- La moneda debe ser exactamente "UF" o "CLP"'],
    ['- Los montos no deben tener símbolos, puntos ni comas'],
    ['- Las comunas y regiones deben coincidir con los valores de la hoja Regiones_Comunas'],
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
  link.download = 'plantilla_contratos_con_datos.xlsx';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);

  return contractData.length;
};
