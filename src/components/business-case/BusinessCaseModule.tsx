import React, { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Plus, Upload } from "lucide-react";
import { useBusinessCase, BusinessCase } from "@/hooks/useBusinessCase";
import { useEconomicIndicators } from "@/hooks/useEconomicIndicators";
import { supabase } from "@/integrations/supabase/client";
import { calculateTotalArriendoUF, calculateGastosComunesUF } from "@/lib/contractRent";
import { BusinessCaseList } from "./BusinessCaseList";
import { BusinessCaseEditor } from "./BusinessCaseEditor";
import { ContractDataForBC } from "./ContractDataPanel";
import { getBlankBusinessCaseTemplate, getAntofagastaBusinessCaseData } from "./businessCaseTemplate";
import { toast } from "sonner";
import * as XLSX from "xlsx";

interface BusinessCaseModuleProps {
  contractId: string;
}

export const BusinessCaseModule: React.FC<BusinessCaseModuleProps> = ({ contractId }) => {
  const { businessCases, loading, saving, createBusinessCase, updateBusinessCase, deleteBusinessCase } = useBusinessCase(contractId);
  const { ufValue } = useEconomicIndicators();
  
  const [contractData, setContractData] = useState<ContractDataForBC>({
    ufValue: 0,
    canonUF: 0,
    arriendoTotalUF: 0,
    superficieM2: 0,
    duracionAnios: 0,
    garantiaUF: 0,
    gastosComunesUF: 0,
    ubicacion: "",
    empresa: ""
  });
  
  const [editingBC, setEditingBC] = useState<BusinessCase | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [newBCData, setNewBCData] = useState<any[] | null>(null);

  // Fetch contract data for the panel
  const fetchContractData = useCallback(async () => {
    if (!contractId) return;
    
    try {
      // Get contract basic info
      const { data: contract, error: contractError } = await supabase
        .from("contracts")
        .select(`
          *,
          contract_addresses(*),
          contract_companies!contracts_tenant_company_id_fkey(name)
        `)
        .eq("id", contractId)
        .single();
      
      if (contractError) throw contractError;
      
      // Get latest version
      const { data: versions, error: versionsError } = await supabase
        .from("contract_versions")
        .select("*")
        .eq("contract_id", contractId)
        .order("version_number", { ascending: false })
        .limit(1);
      
      if (versionsError) throw versionsError;
      
      const latestVersion = versions?.[0];
      const address = contract?.contract_addresses?.[0];
      const superficie = contract?.superficie_edificada_local || 0;
      
      // Calculate rent values
      let canonUF = 0;
      let gastosComunesUF = 0;
      let arriendoTotalUF = 0;
      let garantiaUF = 0;
      
      if (latestVersion) {
        canonUF = latestVersion.regime_rent || 0;
        
        // Calculate gastos comunes
        gastosComunesUF = calculateGastosComunesUF({
          version: latestVersion as any,
          superficie,
          metrosLinealesFrente: contract?.metros_lineales_frente || 0,
          baseRegimeRent: canonUF
        });
        
        // Calculate total arriendo
        const totalBreakdown = calculateTotalArriendoUF({
          version: latestVersion as any,
          signedDate: contract?.signed_date,
          superficie,
          metrosLinealesFrente: contract?.metros_lineales_frente || 0
        });
        arriendoTotalUF = totalBreakdown.total;
        
        // Calculate garantia
        if (latestVersion.guarantee_type === 'multiplier') {
          garantiaUF = canonUF * (latestVersion.guarantee_multiplier || 0);
        } else {
          garantiaUF = latestVersion.guarantee_amount || 0;
        }
      }
      
      setContractData({
        ufValue: ufValue || 0,
        canonUF,
        arriendoTotalUF,
        superficieM2: superficie,
        duracionAnios: latestVersion ? Math.round((latestVersion.duration_months || 0) / 12) : 0,
        garantiaUF,
        gastosComunesUF,
        ubicacion: address ? `${address.street || ''} ${address.number || ''}, ${address.region || ''}`.trim() : "",
        empresa: (contract?.contract_companies as any)?.name || ""
      });
      
    } catch (error) {
      console.error("Error fetching contract data:", error);
    }
  }, [contractId, ufValue]);

  useEffect(() => {
    fetchContractData();
  }, [fetchContractData]);

  const handleCreateNew = () => {
    const template = getBlankBusinessCaseTemplate(contractData);
    setNewBCData(template);
    setIsCreating(true);
  };

  const handleImportExcel = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    try {
      const arrayBuffer = await file.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: "array" });
      
      // Convert to FortuneSheet format
      const sheets = workbook.SheetNames.map((sheetName, index) => {
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" });
        
        const celldata: any[] = [];
        (jsonData as any[][]).forEach((row, rowIndex) => {
          row.forEach((cellValue, colIndex) => {
            if (cellValue !== "") {
              celldata.push({
                r: rowIndex,
                c: colIndex,
                v: {
                  v: cellValue,
                  m: String(cellValue),
                  ct: { fa: "General", t: typeof cellValue === "number" ? "n" : "s" }
                }
              });
            }
          });
        });
        
        return {
          name: sheetName,
          color: "#ffffff",
          id: `sheet${index}`,
          status: index === 0 ? 1 : 0,
          order: index,
          celldata,
          config: {
            columnlen: {},
            rowlen: {}
          },
          row: Math.max(jsonData.length, 50),
          column: Math.max(...(jsonData as any[][]).map(r => r.length), 20),
          luckysheet_selection_range: []
        };
      });
      
      setNewBCData(sheets);
      setIsCreating(true);
      toast.success("Archivo importado correctamente");
    } catch (error) {
      console.error("Error importing Excel:", error);
      toast.error("Error al importar el archivo Excel");
    }
    
    // Reset file input
    event.target.value = "";
  };

  const handleSaveNew = async (data: any[], name: string) => {
    const result = await createBusinessCase(name, data);
    if (result) {
      setIsCreating(false);
      setNewBCData(null);
    }
  };

  const handleSaveEdit = async (data: any[], name: string) => {
    if (!editingBC) return;
    const result = await updateBusinessCase(editingBC.id, { spreadsheet_data: data, name });
    if (result) {
      setEditingBC(null);
    }
  };

  const handleExportBC = (bc: BusinessCase) => {
    try {
      const wb = XLSX.utils.book_new();
      
      bc.spreadsheet_data.forEach((sheet: any) => {
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
      
      XLSX.writeFile(wb, `${bc.name}.xlsx`);
      toast.success("Archivo Excel exportado");
    } catch (error) {
      console.error("Error exporting to Excel:", error);
      toast.error("Error al exportar el archivo");
    }
  };

  // Show editor if creating or editing
  if (isCreating && newBCData) {
    return (
      <BusinessCaseEditor
        initialData={newBCData}
        name="Nuevo Business Case"
        contractData={contractData}
        onSave={handleSaveNew}
        onClose={() => { setIsCreating(false); setNewBCData(null); }}
        saving={saving}
      />
    );
  }

  if (editingBC) {
    return (
      <BusinessCaseEditor
        initialData={editingBC.spreadsheet_data}
        name={editingBC.name}
        contractData={contractData}
        onSave={handleSaveEdit}
        onClose={() => setEditingBC(null)}
        saving={saving}
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* Actions */}
      <div className="flex flex-wrap gap-2">
        <Button onClick={handleCreateNew} size="sm">
          <Plus className="h-4 w-4 mr-2" />
          Nuevo Business Case
        </Button>
        
        <Button variant="outline" size="sm" asChild>
          <label className="cursor-pointer">
            <Upload className="h-4 w-4 mr-2" />
            Importar Excel
            <input
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={handleImportExcel}
            />
          </label>
        </Button>
      </div>

      {/* List of Business Cases */}
      <BusinessCaseList
        businessCases={businessCases}
        loading={loading}
        onEdit={setEditingBC}
        onDelete={deleteBusinessCase}
        onExport={handleExportBC}
      />
    </div>
  );
};
