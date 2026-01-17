import React, { useRef, useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Save, X, Download, FileSpreadsheet } from "lucide-react";
import { ContractDataPanel, ContractDataForBC } from "./ContractDataPanel";
import { toast } from "sonner";
import * as XLSX from "xlsx";

// Import jspreadsheet styles
import "jsuites/dist/jsuites.css";
import "jspreadsheet-ce/dist/jspreadsheet.css";

interface BusinessCaseEditorProps {
  initialData: any;
  name: string;
  contractData: ContractDataForBC;
  onSave: (data: any, name: string) => Promise<void>;
  onClose: () => void;
  saving: boolean;
}

// Helper function to apply styles to specific rows based on content
const applyBusinessCaseStyles = (instance: any, data: any[][]) => {
  if (!instance || !data) return;

  // Define row styles based on content patterns
  const headerRows = [1, 4]; // Tasas de Rendimiento, Resumen Ejecutivo
  const summaryLabelRows: number[] = [];
  const yearHeaderRow: number[] = [];
  const financialHighlightRows: number[] = [];
  const ebitdaRows: number[] = [];
  const paybackRows: number[] = [];

  data.forEach((row, index) => {
    const cellB = String(row[1] || "").toLowerCase();
    
    if (cellB.includes("tasas de rendimiento") || cellB.includes("resumen ejecutivo")) {
      headerRows.push(index);
    }
    if (cellB === "año" && row[2] === "0") {
      yearHeaderRow.push(index);
    }
    if (cellB.includes("ebitda") || cellB.includes("ebit")) {
      ebitdaRows.push(index);
    }
    if (cellB.includes("payback") || cellB.includes("tir") || cellB.includes("van") || cellB.includes("rentabilidad")) {
      financialHighlightRows.push(index);
    }
    if (cellB.includes("ingresos") || cellB.includes("margen de contribucion")) {
      summaryLabelRows.push(index);
    }
  });

  // Apply styles using jspreadsheet's setStyle method
  try {
    // Header rows - dark blue background
    headerRows.forEach(row => {
      for (let col = 1; col <= 7; col++) {
        const cellName = `${String.fromCharCode(65 + col)}${row + 1}`;
        instance.setStyle(cellName, 'background-color', '#1e3a5f');
        instance.setStyle(cellName, 'color', '#ffffff');
        instance.setStyle(cellName, 'font-weight', 'bold');
      }
    });

    // Year header row - medium blue
    yearHeaderRow.forEach(row => {
      for (let col = 1; col <= 7; col++) {
        const cellName = `${String.fromCharCode(65 + col)}${row + 1}`;
        instance.setStyle(cellName, 'background-color', '#2563eb');
        instance.setStyle(cellName, 'color', '#ffffff');
        instance.setStyle(cellName, 'font-weight', 'bold');
        instance.setStyle(cellName, 'text-align', 'center');
      }
    });

    // EBITDA rows - light green
    ebitdaRows.forEach(row => {
      for (let col = 1; col <= 7; col++) {
        const cellName = `${String.fromCharCode(65 + col)}${row + 1}`;
        instance.setStyle(cellName, 'background-color', '#dcfce7');
        instance.setStyle(cellName, 'font-weight', 'bold');
      }
    });

    // Financial highlight rows (TIR, VAN, Rentabilidad) - light yellow
    financialHighlightRows.forEach(row => {
      for (let col = 1; col <= 7; col++) {
        const cellName = `${String.fromCharCode(65 + col)}${row + 1}`;
        instance.setStyle(cellName, 'background-color', '#fef9c3');
        instance.setStyle(cellName, 'font-weight', 'bold');
      }
    });

    // Income/margin rows - light blue
    summaryLabelRows.forEach(row => {
      for (let col = 1; col <= 7; col++) {
        const cellName = `${String.fromCharCode(65 + col)}${row + 1}`;
        instance.setStyle(cellName, 'background-color', '#dbeafe');
      }
    });

    // Apply borders to all cells with content
    data.forEach((row, rowIndex) => {
      row.forEach((cell, colIndex) => {
        if (cell && String(cell).trim() !== "") {
          const cellName = `${String.fromCharCode(65 + colIndex)}${rowIndex + 1}`;
          instance.setStyle(cellName, 'border', '1px solid #e5e7eb');
        }
      });
    });

    // Column B (labels) - bold and left aligned
    data.forEach((row, rowIndex) => {
      if (row[1] && String(row[1]).trim() !== "") {
        const cellName = `B${rowIndex + 1}`;
        instance.setStyle(cellName, 'font-weight', 'bold');
        instance.setStyle(cellName, 'text-align', 'left');
      }
    });

    // Numeric columns - right aligned
    data.forEach((row, rowIndex) => {
      for (let col = 3; col <= 7; col++) {
        const cellValue = row[col];
        if (cellValue && (typeof cellValue === 'number' || /^[\d\-$%.,]+$/.test(String(cellValue).trim()))) {
          const cellName = `${String.fromCharCode(65 + col)}${rowIndex + 1}`;
          instance.setStyle(cellName, 'text-align', 'right');
        }
      }
    });

  } catch (error) {
    console.error("Error applying styles:", error);
  }
};

export const BusinessCaseEditor: React.FC<BusinessCaseEditorProps> = ({
  initialData,
  name: initialName,
  contractData,
  onSave,
  onClose,
  saving
}) => {
  const jspreadsheetRef = useRef<HTMLDivElement>(null);
  const spreadsheetInstanceRef = useRef<any>(null);
  const [bcName, setBcName] = useState(initialName);
  const [hasChanges, setHasChanges] = useState(false);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    let mounted = true;
    
    const initSpreadsheet = async () => {
      if (!jspreadsheetRef.current) return;
      
      try {
        // Dynamically import jspreadsheet
        const jspreadsheet = (await import("jspreadsheet-ce")).default;
        
        if (!mounted || !jspreadsheetRef.current) return;
        
        // Parse initial data or use defaults
        let data: any[][] = initialData?.data || [];
        if (!data || data.length === 0) {
          // Create default template with 50 rows x 10 cols
          data = Array(50).fill(null).map(() => Array(10).fill(""));
        }
        
        // Initialize jspreadsheet with enhanced styling
        spreadsheetInstanceRef.current = jspreadsheet(jspreadsheetRef.current, {
          data,
          columns: initialData?.columns || [
            { type: "text", width: 40 },
            { type: "text", width: 220 },
            { type: "text", width: 80 },
            { type: "text", width: 100 },
            { type: "text", width: 100 },
            { type: "text", width: 100 },
            { type: "text", width: 100 },
            { type: "text", width: 100 },
            { type: "text", width: 100 },
            { type: "text", width: 100 },
          ],
          minDimensions: [10, 50],
          tableOverflow: true,
          tableWidth: "100%",
          tableHeight: "100%",
          defaultColWidth: 100,
          onchange: () => setHasChanges(true),
          oninsertrow: () => setHasChanges(true),
          ondeleterow: () => setHasChanges(true),
          oninsertcolumn: () => setHasChanges(true),
          ondeletecolumn: () => setHasChanges(true),
        });
        
        // Apply custom styles after initialization
        setTimeout(() => {
          applyBusinessCaseStyles(spreadsheetInstanceRef.current, data);
        }, 100);
        
        setIsReady(true);
      } catch (error) {
        console.error("Error initializing spreadsheet:", error);
        toast.error("Error al cargar el editor");
      }
    };
    
    initSpreadsheet();
    
    return () => {
      mounted = false;
      if (spreadsheetInstanceRef.current?.destroy) {
        spreadsheetInstanceRef.current.destroy();
      }
    };
  }, []);

  const getCurrentData = useCallback(() => {
    if (!spreadsheetInstanceRef.current) return null;
    
    const data = spreadsheetInstanceRef.current.getData();
    return { data };
  }, []);

  const handleSave = async () => {
    const data = getCurrentData();
    if (!data) return;
    
    try {
      await onSave(data, bcName);
      setHasChanges(false);
      toast.success("Business Case guardado exitosamente");
    } catch (error) {
      console.error("Error saving business case:", error);
      toast.error("Error al guardar el Business Case");
    }
  };

  const handleExportExcel = () => {
    if (!spreadsheetInstanceRef.current) return;
    
    try {
      const data = spreadsheetInstanceRef.current.getData();
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet(data);
      
      // Apply some basic styling to Excel export
      const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
      for (let R = range.s.r; R <= range.e.r; ++R) {
        for (let C = range.s.c; C <= range.e.c; ++C) {
          const addr = XLSX.utils.encode_cell({ r: R, c: C });
          if (!ws[addr]) continue;
          ws[addr].s = {
            border: {
              top: { style: 'thin', color: { rgb: 'E5E7EB' } },
              bottom: { style: 'thin', color: { rgb: 'E5E7EB' } },
              left: { style: 'thin', color: { rgb: 'E5E7EB' } },
              right: { style: 'thin', color: { rgb: 'E5E7EB' } }
            }
          };
        }
      }
      
      XLSX.utils.book_append_sheet(wb, ws, "Business Case");
      XLSX.writeFile(wb, `${bcName}.xlsx`);
      toast.success("Archivo Excel exportado");
    } catch (error) {
      console.error("Error exporting to Excel:", error);
      toast.error("Error al exportar el archivo");
    }
  };

  const handleClose = () => {
    if (hasChanges) {
      if (window.confirm("Hay cambios sin guardar. ¿Deseas guardar antes de cerrar?")) {
        handleSave().then(() => onClose());
      } else {
        onClose();
      }
    } else {
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b bg-card shrink-0">
        <div className="flex items-center gap-4">
          <FileSpreadsheet className="h-6 w-6 text-primary" />
          <Input
            value={bcName}
            onChange={(e) => {
              setBcName(e.target.value);
              setHasChanges(true);
            }}
            className="w-64 font-medium"
            placeholder="Nombre del Business Case"
          />
          {hasChanges && (
            <span className="text-sm text-muted-foreground">• Sin guardar</span>
          )}
        </div>
        
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleExportExcel} disabled={!isReady}>
            <Download className="h-4 w-4 mr-2" />
            Exportar Excel
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={handleSave}
            disabled={saving || !hasChanges || !isReady}
          >
            <Save className="h-4 w-4 mr-2" />
            {saving ? "Guardando..." : "Guardar"}
          </Button>
          <Button variant="ghost" size="icon" onClick={handleClose}>
            <X className="h-5 w-5" />
          </Button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Spreadsheet */}
        <div className="flex-1 overflow-auto p-4 bc-spreadsheet-container">
          {!isReady && (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full mx-auto mb-3" />
                <p className="text-muted-foreground">Cargando editor...</p>
              </div>
            </div>
          )}
          <div ref={jspreadsheetRef} className={isReady ? "bc-spreadsheet" : "hidden"} />
        </div>

        {/* Side Panel */}
        <div className="w-72 border-l overflow-y-auto bg-muted/30 shrink-0">
          <ContractDataPanel contractData={contractData} />
        </div>
      </div>

      {/* Custom styles for the spreadsheet */}
      <style>{`
        .bc-spreadsheet-container .jexcel {
          font-family: var(--font-sans);
          font-size: 13px;
        }
        
        .bc-spreadsheet-container .jexcel td {
          border: 1px solid hsl(var(--border));
          padding: 6px 8px;
        }
        
        .bc-spreadsheet-container .jexcel thead td {
          background-color: hsl(var(--muted));
          color: hsl(var(--muted-foreground));
          font-weight: 600;
          border-bottom: 2px solid hsl(var(--border));
        }
        
        .bc-spreadsheet-container .jexcel tbody tr:hover td {
          background-color: hsl(var(--accent) / 0.3);
        }
        
        .bc-spreadsheet-container .jexcel .highlight {
          background-color: hsl(var(--primary) / 0.1);
        }
        
        .bc-spreadsheet-container .jexcel .highlight-selected {
          background-color: hsl(var(--primary) / 0.2);
          border: 2px solid hsl(var(--primary));
        }
        
        .bc-spreadsheet-container .jexcel_content {
          border-radius: 8px;
          overflow: hidden;
          border: 1px solid hsl(var(--border));
        }
        
        .bc-spreadsheet-container .jexcel tbody td:first-child {
          background-color: hsl(var(--muted));
          color: hsl(var(--muted-foreground));
          font-weight: 500;
          text-align: center;
        }
      `}</style>
    </div>
  );
};
