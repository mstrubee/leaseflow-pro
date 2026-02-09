import * as XLSX from 'xlsx';
import { validateExcelFile, withParseTimeout } from '@/lib/excelFileValidation';

/**
 * Generates a downloadable Excel template for OC (Purchase Order) requests.
 * The template can later be uploaded and parsed to auto-fill the request form.
 */
export const generateOCRequestTemplate = (contractName?: string, lineName?: string) => {
  const workbook = XLSX.utils.book_new();

  // Sheet 1: Solicitud de OC - vertical layout (labels in A, values in B)
  const rows: (string | number | null)[][] = [
    ["Campo", "Valor"],
    ["Descripción", lineName || ""],
    ["Monto", ""],
    ["Moneda", "UF"],
    ["Proveedor", ""],
    ["Proyecto", contractName || ""],
    ["", ""],
    ["PLAN DE PAGOS (opcional)", ""],
    ["Descripción Pago", "Monto (UF)", "Fecha Vencimiento (DD/MM/YYYY)"],
    ["Pago 1", "", ""],
    ["Pago 2", "", ""],
    ["Pago 3", "", ""],
  ];

  const sheet = XLSX.utils.aoa_to_sheet(rows);

  // Column widths
  sheet['!cols'] = [
    { wch: 35 },
    { wch: 30 },
    { wch: 25 },
  ];

  XLSX.utils.book_append_sheet(workbook, sheet, "Solicitud_OC");

  // Sheet 2: Instrucciones
  const instructions: string[][] = [
    ["Instrucciones para completar la Solicitud de Orden de Compra"],
    [""],
    ["Campos principales (filas 2-6):"],
    ["- Descripción: Detalle de lo que se solicita"],
    ["- Monto: Valor numérico del monto solicitado"],
    ["- Moneda: UF o CLP (pesos chilenos)"],
    ["- Proveedor: Nombre del proveedor (opcional)"],
    ["- Proyecto: Nombre del proyecto/contrato"],
    [""],
    ["Plan de Pagos (filas 10-12):"],
    ["- Puede agregar más filas si necesita más cuotas"],
    ["- Descripción: Ej: Pago 1, Anticipo, Pago contra entrega"],
    ["- Monto: Valor en UF de cada cuota"],
    ["- Fecha Vencimiento: Formato DD/MM/YYYY (opcional)"],
    [""],
    ["Notas:"],
    ["- El plan de pagos es opcional"],
    ["- Si no ingresa plan de pagos, se asumirá un pago único"],
    ["- Al subir este archivo, el sistema completará los campos automáticamente"],
  ];

  const instrSheet = XLSX.utils.aoa_to_sheet(instructions);
  instrSheet['!cols'] = [{ wch: 80 }];
  XLSX.utils.book_append_sheet(workbook, instrSheet, "Instrucciones");

  // Sheet 3: Monedas válidas
  const currencies: string[][] = [
    ["Monedas Válidas"],
    ["UF"],
    ["CLP"],
  ];
  const currSheet = XLSX.utils.aoa_to_sheet(currencies);
  currSheet['!cols'] = [{ wch: 20 }];
  XLSX.utils.book_append_sheet(workbook, currSheet, "Monedas");

  // Generate and download
  const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = 'plantilla_solicitud_oc.xlsx';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

export interface ParsedOCRequest {
  description: string;
  amount: number;
  currency: "UF" | "CLP";
  supplier_name: string;
  project_name: string;
  paymentPlan: {
    description: string;
    amount: number;
    due_date: string; // yyyy-MM-dd or empty
  }[];
}

/**
 * Parses an uploaded Excel file (generated from the OC request template)
 * and returns the extracted data.
 */
export const parseOCRequestExcel = async (file: File): Promise<ParsedOCRequest> => {
  const validation = validateExcelFile(file);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  const parsePromise = new Promise<ParsedOCRequest>((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });

        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];

        if (jsonData.length < 5) {
          throw new Error("El archivo no tiene el formato esperado de solicitud de OC");
        }

        // Read main fields from column B (index 1), rows 2-6 (index 1-5)
        const description = String(jsonData[1]?.[1] || "").trim();
        const amountRaw = jsonData[2]?.[1];
        const amount = typeof amountRaw === 'number' ? amountRaw : parseFloat(String(amountRaw || "0").replace(/[^\d.,\-]/g, '').replace(',', '.')) || 0;
        const currencyRaw = String(jsonData[3]?.[1] || "UF").trim().toUpperCase();
        const currency: "UF" | "CLP" = currencyRaw === "CLP" ? "CLP" : "UF";
        const supplier_name = String(jsonData[4]?.[1] || "").trim();
        const project_name = String(jsonData[5]?.[1] || "").trim();

        // Read payment plan - starts at row 10 (index 9)
        const paymentPlan: ParsedOCRequest['paymentPlan'] = [];
        for (let i = 9; i < jsonData.length; i++) {
          const row = jsonData[i];
          if (!row || !row[0]) break; // Stop at first empty row

          const payDesc = String(row[0] || "").trim();
          if (!payDesc) break;

          const payAmountRaw = row[1];
          const payAmount = typeof payAmountRaw === 'number' ? payAmountRaw : parseFloat(String(payAmountRaw || "0").replace(/[^\d.,\-]/g, '').replace(',', '.')) || 0;

          if (payAmount <= 0) continue; // Skip rows without amount

          // Parse date - could be a JS date serial or string
          let dueDate = "";
          const dateVal = row[2];
          if (dateVal) {
            if (typeof dateVal === 'number') {
              // Excel serial date
              const parsed = XLSX.SSF.parse_date_code(dateVal);
              if (parsed) {
                dueDate = `${parsed.y}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`;
              }
            } else {
              const dateStr = String(dateVal).trim();
              // Try DD/MM/YYYY
              const match = dateStr.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
              if (match) {
                dueDate = `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`;
              }
            }
          }

          paymentPlan.push({ description: payDesc, amount: payAmount, due_date: dueDate });
        }

        resolve({
          description,
          amount,
          currency,
          supplier_name,
          project_name,
          paymentPlan,
        });
      } catch (error) {
        reject(error);
      }
    };

    reader.onerror = () => reject(new Error("Error al leer el archivo"));
    reader.readAsArrayBuffer(file);
  });

  return withParseTimeout(parsePromise, 15000);
};
