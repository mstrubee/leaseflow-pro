import React, { useRef, useEffect, useState, useCallback } from "react";
import { Workbook } from "@fortune-sheet/react";
import "@fortune-sheet/react/dist/index.css";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Save, X, Download, FileSpreadsheet } from "lucide-react";
import { ContractDataPanel, ContractDataForBC } from "./ContractDataPanel";
import { toast } from "sonner";
import * as XLSX from "xlsx";

interface BusinessCaseEditorProps {
  initialData: any[];
  name: string;
  contractData: ContractDataForBC;
  onSave: (data: any[], name: string) => Promise<void>;
  onClose: () => void;
  saving: boolean;
}

export const BusinessCaseEditor: React.FC<BusinessCaseEditorProps> = ({
  initialData,
  name: initialName,
  contractData,
  onSave,
  onClose,
  saving
}) => {
  const [sheetData, setSheetData] = useState<any[]>(initialData);
  const [bcName, setBcName] = useState(initialName);
  const [hasChanges, setHasChanges] = useState(false);
  const workbookRef = useRef<any>(null);
  const autoSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Auto-save every 30 seconds when there are changes
  useEffect(() => {
    if (hasChanges) {
      autoSaveTimeoutRef.current = setTimeout(() => {
        handleSave(true);
      }, 30000);
    }
    
    return () => {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }
    };
  }, [hasChanges, sheetData]);

  const handleSheetChange = useCallback((data: any[]) => {
    setSheetData(data);
    setHasChanges(true);
  }, []);

  const handleSave = async (isAutoSave = false) => {
    try {
      await onSave(sheetData, bcName);
      setHasChanges(false);
      if (!isAutoSave) {
        toast.success("Business Case guardado exitosamente");
      }
    } catch (error) {
      console.error("Error saving business case:", error);
      toast.error("Error al guardar el Business Case");
    }
  };

  const handleExportExcel = () => {
    try {
      // Convert FortuneSheet data to XLSX format
      const wb = XLSX.utils.book_new();
      
      sheetData.forEach((sheet) => {
        // Create a 2D array from celldata
        const maxRow = Math.max(...sheet.celldata.map((c: any) => c.r)) + 1;
        const maxCol = Math.max(...sheet.celldata.map((c: any) => c.c)) + 1;
        
        const wsData: any[][] = Array(maxRow).fill(null).map(() => Array(maxCol).fill(""));
        
        sheet.celldata.forEach((cell: any) => {
          if (cell.v) {
            wsData[cell.r][cell.c] = cell.v.v !== undefined ? cell.v.v : cell.v.m || "";
          }
        });
        
        const ws = XLSX.utils.aoa_to_sheet(wsData);
        XLSX.utils.book_append_sheet(wb, ws, sheet.name || "Business Case");
      });
      
      XLSX.writeFile(wb, `${bcName}.xlsx`);
      toast.success("Archivo Excel exportado");
    } catch (error) {
      console.error("Error exporting to Excel:", error);
      toast.error("Error al exportar el archivo");
    }
  };

  const handleInsertValue = (value: string | number, label: string) => {
    // This would insert the value into the currently selected cell
    // FortuneSheet doesn't expose a direct API for this, so we show a toast with instructions
    toast.info(`Valor de ${label}: ${value}. Copia y pega en la celda deseada.`);
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
      <div className="flex items-center justify-between p-4 border-b bg-card">
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
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportExcel}
          >
            <Download className="h-4 w-4 mr-2" />
            Exportar Excel
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={() => handleSave()}
            disabled={saving || !hasChanges}
          >
            <Save className="h-4 w-4 mr-2" />
            {saving ? "Guardando..." : "Guardar"}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleClose}
          >
            <X className="h-5 w-5" />
          </Button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Spreadsheet */}
        <div className="flex-1 overflow-hidden">
          <Workbook
            ref={workbookRef}
            data={sheetData}
            onChange={handleSheetChange}
            showToolbar={true}
            showFormulaBar={true}
            showSheetTabs={true}
            lang="es"
          />
        </div>

        {/* Side Panel */}
        <div className="w-72 border-l overflow-y-auto bg-muted/30">
          <ContractDataPanel
            contractData={contractData}
            onInsertValue={handleInsertValue}
          />
        </div>
      </div>
    </div>
  );
};
