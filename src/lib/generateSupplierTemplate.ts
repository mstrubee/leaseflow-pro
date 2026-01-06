import * as XLSX from 'xlsx';

export const generateSupplierTemplate = () => {
  const workbook = XLSX.utils.book_new();

  // Sheet 1: Proveedores (data entry) - Headers in column A, data in columns B onwards
  const rows = [
    ["Nombre Empresa *"],
    ["RUT"],
    ["Calle"],
    ["Número"],
    ["Comuna"],
    ["Banco"],
    ["Tipo Cuenta"],
    ["Número Cuenta"],
    ["Nombre Contacto"],
    ["Teléfono"],
    ["Email 1"],
    ["Email 2"],
    ["Email 3"],
    ["Rubro *"],
    ["Proveedor Genérico (SI/NO)"]
  ];

  const suppliersSheet = XLSX.utils.aoa_to_sheet(rows);
  
  // Set column widths - Column A for labels, B+ for data
  suppliersSheet['!cols'] = [
    { wch: 30 }, // Column A: Labels
    { wch: 30 }, // Column B: Proveedor 1
    { wch: 30 }, // Column C: Proveedor 2
    { wch: 30 }, // Column D: Proveedor 3
    { wch: 30 }, // Column E: Proveedor 4
    { wch: 30 }, // Column F: Proveedor 5
  ];

  XLSX.utils.book_append_sheet(workbook, suppliersSheet, "Proveedores");

  // Sheet 2: Instrucciones
  const instructions = [
    ["Instrucciones para completar la plantilla de Proveedores"],
    [""],
    ["Columnas:"],
    ["1. Nombre Empresa *: Nombre completo de la empresa proveedora (OBLIGATORIO)"],
    ["2. RUT: RUT de la empresa (formato: 12.345.678-9)"],
    ["3. Calle: Dirección de la empresa"],
    ["4. Número: Número de la dirección"],
    ["5. Comuna: Comuna de la empresa"],
    ["6. Banco: Nombre del banco para pagos"],
    ["7. Tipo Cuenta: corriente, vista o ahorro"],
    ["8. Número Cuenta: Número de cuenta bancaria"],
    ["9. Nombre Contacto: Nombre de la persona de contacto"],
    ["10. Teléfono: Número de teléfono de contacto"],
    ["11-13. Email 1-3: Hasta 3 correos electrónicos (el primero será el principal)"],
    ["14. Rubro *: Nombre del rubro del proveedor (OBLIGATORIO)"],
    ["15. Proveedor Genérico: SI si está disponible para todos los rubros, NO en caso contrario"],
    [""],
    ["Notas importantes:"],
    ["- Los campos marcados con * son obligatorios"],
    ["- Si el rubro no existe, se creará automáticamente"],
    ["- Debe ingresar al menos un email o teléfono por proveedor"],
    ["- Los proveedores duplicados (mismo nombre o RUT) serán ignorados"],
    ["- Tipo de cuenta válidos: corriente, vista, ahorro"],
  ];

  const instructionsSheet = XLSX.utils.aoa_to_sheet(instructions);
  instructionsSheet['!cols'] = [{ wch: 80 }];
  XLSX.utils.book_append_sheet(workbook, instructionsSheet, "Instrucciones");

  // Sheet 3: Tipos de cuenta válidos
  const accountTypes = [
    ["Tipos de Cuenta Válidos"],
    ["corriente"],
    ["vista"],
    ["ahorro"],
  ];

  const accountTypesSheet = XLSX.utils.aoa_to_sheet(accountTypes);
  accountTypesSheet['!cols'] = [{ wch: 25 }];
  XLSX.utils.book_append_sheet(workbook, accountTypesSheet, "Tipos_Cuenta");

  // Generate and download
  const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = 'plantilla_proveedores.xlsx';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

export interface ParsedSupplier {
  name: string;
  rut: string;
  street: string;
  street_number: string;
  commune: string;
  bank_name: string;
  bank_account_type: string;
  bank_account_number: string;
  contact_name: string;
  phone: string;
  emails: string[];
  category_name: string;
  is_generic: boolean;
}

export const parseSupplierExcel = async (file: File): Promise<{ suppliers: ParsedSupplier[]; errors: string[] }> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];
        
        // New format: headers in column A, data in columns B onwards
        // Each column (starting from B) represents one supplier
        if (jsonData.length < 15) {
          resolve({ suppliers: [], errors: ["El archivo no tiene el formato correcto (faltan filas)"] });
          return;
        }

        const suppliers: ParsedSupplier[] = [];
        const errors: string[] = [];

        // Find how many columns have data (starting from column B = index 1)
        const maxCols = Math.max(...jsonData.map(row => row?.length || 0));
        
        // Process each column starting from B (index 1)
        for (let col = 1; col < maxCols; col++) {
          const colLetter = String.fromCharCode(65 + col); // B, C, D, etc.
          
          // Extract data from each row for this column
          const name = String(jsonData[0]?.[col] || "").trim();
          const rut = String(jsonData[1]?.[col] || "").trim();
          const street = String(jsonData[2]?.[col] || "").trim();
          const street_number = String(jsonData[3]?.[col] || "").trim();
          const commune = String(jsonData[4]?.[col] || "").trim();
          const bank_name = String(jsonData[5]?.[col] || "").trim();
          let bank_account_type = String(jsonData[6]?.[col] || "").trim().toLowerCase();
          const bank_account_number = String(jsonData[7]?.[col] || "").trim();
          const contact_name = String(jsonData[8]?.[col] || "").trim();
          const phone = String(jsonData[9]?.[col] || "").trim();
          const email1 = String(jsonData[10]?.[col] || "").trim();
          const email2 = String(jsonData[11]?.[col] || "").trim();
          const email3 = String(jsonData[12]?.[col] || "").trim();
          const category_name = String(jsonData[13]?.[col] || "").trim();
          const genericValue = String(jsonData[14]?.[col] || "").trim().toUpperCase();

          // Skip empty columns
          if (!name) continue;

          // Validate required fields
          if (!category_name) {
            errors.push(`Columna ${colLetter}: Rubro es requerido para "${name}"`);
            continue;
          }

          // Parse emails
          const emails: string[] = [];
          if (email1) emails.push(email1);
          if (email2) emails.push(email2);
          if (email3) emails.push(email3);
          
          // Validate at least email or phone
          if (emails.length === 0 && !phone) {
            errors.push(`Columna ${colLetter}: Debe tener al menos un email o teléfono para "${name}"`);
            continue;
          }

          // Parse is_generic
          const isGeneric = genericValue === "SI" || genericValue === "SÍ" || genericValue === "YES" || genericValue === "1" || genericValue === "TRUE";

          // Validate bank account type
          if (bank_account_type && !["corriente", "vista", "ahorro"].includes(bank_account_type)) {
            errors.push(`Columna ${colLetter}: Tipo de cuenta inválido "${bank_account_type}" para "${name}". Usando vacío.`);
            bank_account_type = "";
          }

          suppliers.push({
            name,
            rut,
            street,
            street_number,
            commune,
            bank_name,
            bank_account_type,
            bank_account_number,
            contact_name,
            phone,
            emails,
            category_name,
            is_generic: isGeneric,
          });
        }

        resolve({ suppliers, errors });
      } catch (error) {
        reject(error);
      }
    };

    reader.onerror = () => reject(new Error("Error reading file"));
    reader.readAsArrayBuffer(file);
  });
};
