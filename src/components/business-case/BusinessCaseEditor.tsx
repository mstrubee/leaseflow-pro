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
        
        // Initialize jspreadsheet
        spreadsheetInstanceRef.current = jspreadsheet(jspreadsheetRef.current, {
          data,
          columns: initialData?.columns || [
            { type: "text", width: 40 },
            { type: "text", width: 200 },
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
          onchange: () => setHasChanges(true),
          oninsertrow: () => setHasChanges(true),
          ondeleterow: () => setHasChanges(true),
          oninsertcolumn: () => setHasChanges(true),
          ondeletecolumn: () => setHasChanges(true),
        });
        
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
        <div className="flex-1 overflow-auto p-4">
          {!isReady && (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full mx-auto mb-3" />
                <p className="text-muted-foreground">Cargando editor...</p>
              </div>
            </div>
          )}
          <div ref={jspreadsheetRef} className={isReady ? "" : "hidden"} />
        </div>

        {/* Side Panel */}
        <div className="w-72 border-l overflow-y-auto bg-muted/30 shrink-0">
          <ContractDataPanel contractData={contractData} />
        </div>
      </div>
    </div>
  );
};
