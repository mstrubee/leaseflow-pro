import * as XLSX from 'xlsx';

export const generateSupplierTemplate = () => {
  const workbook = XLSX.utils.book_new();

  // Sheet 1: Proveedores (data entry)
  const headers = [
    "Nombre Empresa *",
    "RUT",
    "Calle",
    "Número",
    "Comuna",
    "Banco",
    "Tipo Cuenta",
    "Número Cuenta",
    "Nombre Contacto",
    "Teléfono",
    "Email 1",
    "Email 2",
    "Email 3",
    "Rubro *",
    "Proveedor Genérico (SI/NO)"
  ];

  const suppliersSheet = XLSX.utils.aoa_to_sheet([headers]);
  
  // Set column widths
  suppliersSheet['!cols'] = [
    { wch: 30 }, // Nombre Empresa
    { wch: 15 }, // RUT
    { wch: 25 }, // Calle
    { wch: 10 }, // Número
    { wch: 20 }, // Comuna
    { wch: 20 }, // Banco
    { wch: 18 }, // Tipo Cuenta
    { wch: 18 }, // Número Cuenta
    { wch: 25 }, // Nombre Contacto
    { wch: 18 }, // Teléfono
    { wch: 30 }, // Email 1
    { wch: 30 }, // Email 2
    { wch: 30 }, // Email 3
    { wch: 25 }, // Rubro
    { wch: 20 }, // Proveedor Genérico
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
        
        if (jsonData.length < 2) {
          resolve({ suppliers: [], errors: ["El archivo está vacío o solo tiene encabezados"] });
          return;
        }

        const suppliers: ParsedSupplier[] = [];
        const errors: string[] = [];

        // Skip header row
        for (let i = 1; i < jsonData.length; i++) {
          const row = jsonData[i];
          if (!row || row.length === 0 || !row[0]) continue;

          const rowNum = i + 1;
          const name = String(row[0] || "").trim();
          const categoryName = String(row[13] || "").trim();

          // Validate required fields
          if (!name) {
            errors.push(`Fila ${rowNum}: Nombre de empresa es requerido`);
            continue;
          }
          if (!categoryName) {
            errors.push(`Fila ${rowNum}: Rubro es requerido`);
            continue;
          }

          // Parse emails
          const emails: string[] = [];
          if (row[10]) emails.push(String(row[10]).trim());
          if (row[11]) emails.push(String(row[11]).trim());
          if (row[12]) emails.push(String(row[12]).trim());

          const phone = String(row[9] || "").trim();
          
          // Validate at least email or phone
          if (emails.filter(e => e).length === 0 && !phone) {
            errors.push(`Fila ${rowNum}: Debe tener al menos un email o teléfono`);
            continue;
          }

          // Parse is_generic
          const genericValue = String(row[14] || "").trim().toUpperCase();
          const isGeneric = genericValue === "SI" || genericValue === "SÍ" || genericValue === "YES" || genericValue === "1" || genericValue === "TRUE";

          // Parse bank account type
          let bankAccountType = String(row[6] || "").trim().toLowerCase();
          if (bankAccountType && !["corriente", "vista", "ahorro"].includes(bankAccountType)) {
            errors.push(`Fila ${rowNum}: Tipo de cuenta inválido "${bankAccountType}". Usando vacío.`);
            bankAccountType = "";
          }

          suppliers.push({
            name,
            rut: String(row[1] || "").trim(),
            street: String(row[2] || "").trim(),
            street_number: String(row[3] || "").trim(),
            commune: String(row[4] || "").trim(),
            bank_name: String(row[5] || "").trim(),
            bank_account_type: bankAccountType,
            bank_account_number: String(row[7] || "").trim(),
            contact_name: String(row[8] || "").trim(),
            phone,
            emails: emails.filter(e => e),
            category_name: categoryName,
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
