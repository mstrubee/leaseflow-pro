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
import { getBlankBusinessCaseTemplate } from "./businessCaseTemplate";
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
  const [newBCData, setNewBCData] = useState<any | null>(null);

  // Fetch contract data for the panel
  const fetchContractData = useCallback(async () => {
    if (!contractId) return;
    
    try {
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
      
      let canonUF = 0;
      let gastosComunesUF = 0;
      let arriendoTotalUF = 0;
      let garantiaUF = 0;
      
      if (latestVersion) {
        canonUF = latestVersion.regime_rent || 0;
        
        gastosComunesUF = calculateGastosComunesUF({
          version: latestVersion as any,
          superficie,
          metrosLinealesFrente: contract?.metros_lineales_frente || 0,
          baseRegimeRent: canonUF
        });
        
        const totalBreakdown = calculateTotalArriendoUF({
          version: latestVersion as any,
          signedDate: contract?.signed_date,
          superficie,
          metrosLinealesFrente: contract?.metros_lineales_frente || 0
        });
        arriendoTotalUF = totalBreakdown.total;
        
        if (latestVersion.guarantee_type === 'multiplier') {
          garantiaUF = canonUF * (latestVersion.guarantee_multiplier || 0);
        } else {
          garantiaUF = (latestVersion as any).guarantee_amount || 0;
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
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      const data = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" });
      
      setNewBCData({ data });
      setIsCreating(true);
      toast.success("Archivo importado correctamente");
    } catch (error) {
      console.error("Error importing Excel:", error);
      toast.error("Error al importar el archivo Excel");
    }
    
    event.target.value = "";
  };

  const handleSaveNew = async (data: any, name: string) => {
    const result = await createBusinessCase(name, data);
    if (result) {
      setIsCreating(false);
      setNewBCData(null);
    }
  };

  const handleSaveEdit = async (data: any, name: string) => {
    if (!editingBC) return;
    const result = await updateBusinessCase(editingBC.id, { spreadsheet_data: data, name });
    if (result) {
      setEditingBC(null);
    }
  };

  const handleExportBC = (bc: BusinessCase) => {
    try {
      const wb = XLSX.utils.book_new();
      const data = bc.spreadsheet_data?.data || [[""]];
      const ws = XLSX.utils.aoa_to_sheet(data);
      XLSX.utils.book_append_sheet(wb, ws, "Business Case");
      XLSX.writeFile(wb, `${bc.name}.xlsx`);
      toast.success("Archivo Excel exportado");
    } catch (error) {
      console.error("Error exporting to Excel:", error);
      toast.error("Error al exportar el archivo");
    }
  };

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
