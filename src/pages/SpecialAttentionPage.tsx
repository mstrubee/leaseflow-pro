import { useEffect, useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { CompanyLogo } from "@/components/contracts/CompanyLogo";
import { ContractSearchSelect, type ContractOption } from "@/components/contracts/ContractSearchSelect";
import { AlertTriangle, ArrowLeft, ExternalLink, Plus } from "lucide-react";
import { toast } from "sonner";

interface SpecialContract {
  id: string;
  name: string;
  special_attention_reason: string | null;
  companyNames: string[];
  cebe?: string;
  codigo?: string;
}

// Shared helper to fetch CEBE/Codigo for a set of contract IDs
async function fetchCebeCodigo(contractIds: string[]): Promise<Record<string, { cebe?: string; codigo?: string }>> {
  if (contractIds.length === 0) return {};

  const { data: fields } = await supabase
    .from("contract_custom_fields")
    .select("id, field_name")
    .in("field_name", ["cebe", "codigo", "CEBE", "Codigo", "Código"])
    .eq("is_active", true);

  const cebeField = fields?.find(f => f.field_name.toLowerCase() === "cebe");
  const codigoField = fields?.find(f =>
    f.field_name.toLowerCase() === "codigo" || f.field_name.toLowerCase() === "código"
  );
  const fieldIds = [cebeField?.id, codigoField?.id].filter(Boolean) as string[];
  if (fieldIds.length === 0) return {};

  const { data: vals } = await supabase
    .from("contract_custom_field_values")
    .select("contract_id, field_id, field_value")
    .in("contract_id", contractIds)
    .in("field_id", fieldIds);

  const map: Record<string, { cebe?: string; codigo?: string }> = {};
  if (vals) {
    for (const v of vals) {
      if (!v.field_value) continue;
      if (!map[v.contract_id]) map[v.contract_id] = {};
      if (cebeField && v.field_id === cebeField.id) map[v.contract_id].cebe = v.field_value;
      if (codigoField && v.field_id === codigoField.id) map[v.contract_id].codigo = v.field_value;
    }
  }
  return map;
}

function InlineReason({ contract }: { contract: SpecialContract }) {
  const [value, setValue] = useState(contract.special_attention_reason || "");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const save = useCallback((text: string) => {
    supabase
      .from("contracts")
      .update({ special_attention_reason: text || null })
      .eq("id", contract.id)
      .then(({ error }) => {
        if (error) toast.error("Error al guardar");
      });
  }, [contract.id]);

  const handleChange = (text: string) => {
    setValue(text);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => save(text), 600);
  };

  useEffect(() => {
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, []);

  return (
    <Textarea
      value={value}
      onChange={(e) => handleChange(e.target.value)}
      placeholder="Escribe el motivo de atención especial…"
      className="text-sm min-h-[60px]"
    />
  );
}

const SpecialAttentionPage = () => {
  const navigate = useNavigate();
  const [contracts, setContracts] = useState<SpecialContract[]>([]);
  const [loading, setLoading] = useState(true);

  // For the "add contract" search select
  const [allContracts, setAllContracts] = useState<ContractOption[]>([]);
  const [selectedAddId, setSelectedAddId] = useState("");
  const [adding, setAdding] = useState(false);

  const loadSpecialContracts = useCallback(async () => {
    const { data: rawContracts } = await supabase
      .from("contracts")
      .select("id, name, special_attention_reason, contract_companies(companies(name))")
      .eq("requires_special_attention", true)
      .is("deleted_at", null)
      .order("name");

    if (!rawContracts || rawContracts.length === 0) {
      setContracts([]);
      setLoading(false);
      return;
    }

    const fieldValuesMap = await fetchCebeCodigo(rawContracts.map(c => c.id));

    setContracts(rawContracts.map((c: any) => ({
      id: c.id,
      name: c.name,
      special_attention_reason: c.special_attention_reason,
      companyNames: (c.contract_companies || [])
        .map((cc: any) => cc.companies?.name)
        .filter(Boolean),
      cebe: fieldValuesMap[c.id]?.cebe,
      codigo: fieldValuesMap[c.id]?.codigo,
    })));
    setLoading(false);
  }, []);

  const loadAllContracts = useCallback(async () => {
    const { data } = await supabase
      .from("contracts")
      .select("id, name, contract_companies(companies(name))")
      .is("deleted_at", null)
      .order("name");

    if (!data) return;

    const cebeMap = await fetchCebeCodigo(data.map(c => c.id));

    setAllContracts(data.map((c: any) => ({
      id: c.id,
      name: c.name,
      cebe: cebeMap[c.id]?.cebe,
      company_names: (c.contract_companies || [])
        .map((cc: any) => cc.companies?.name)
        .filter(Boolean),
    })));
  }, []);

  useEffect(() => {
    loadSpecialContracts();
    loadAllContracts();
  }, [loadSpecialContracts, loadAllContracts]);

  // Filter out contracts already in the special attention list
  const availableContracts = allContracts.filter(
    c => !contracts.some(sc => sc.id === c.id)
  );

  const handleAddContract = async () => {
    if (!selectedAddId) return;
    setAdding(true);
    const { error } = await supabase
      .from("contracts")
      .update({ requires_special_attention: true })
      .eq("id", selectedAddId);

    if (error) {
      toast.error("Error al agregar contrato");
    } else {
      toast.success("Contrato agregado a atención especial");
      setSelectedAddId("");
      await loadSpecialContracts();
    }
    setAdding(false);
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-[90rem] mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            <h1 className="text-lg font-semibold text-foreground">Atención Especial Contratos</h1>
          </div>
          <div className="flex-1" />
          <div className="flex items-center gap-2 w-80">
            <ContractSearchSelect
              value={selectedAddId}
              onValueChange={setSelectedAddId}
              contracts={availableContracts}
              placeholder="Agregar contrato…"
              className="w-[400px]"
            />
            <Button
              size="sm"
              disabled={!selectedAddId || adding}
              onClick={handleAddContract}
              className="gap-1 shrink-0"
            >
              <Plus className="h-4 w-4" />
              Agregar
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-[90rem] mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-4">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        ) : contracts.length === 0 ? (
          <p className="text-center text-muted-foreground py-12">
            No hay contratos marcados con atención especial.
          </p>
        ) : (
          contracts.map((c) => (
            <Card key={c.id}>
              <CardContent className="p-5 space-y-3">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <CompanyLogo companyNames={c.companyNames} size="sm" />
                    <div className="min-w-0">
                      <p className="font-medium text-foreground truncate">{c.name}</p>
                      {(c.cebe || c.codigo) && (
                        <p className="text-xs text-muted-foreground font-mono">
                          {[c.cebe, c.codigo].filter(Boolean).join(" • ")}
                        </p>
                      )}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-1.5 shrink-0 text-muted-foreground hover:text-foreground"
                    onClick={() => navigate(`/contracts/${c.id}`)}
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    Ver contrato
                  </Button>
                </div>
                <InlineReason contract={c} />
              </CardContent>
            </Card>
          ))
        )}
      </main>
    </div>
  );
};

export default SpecialAttentionPage;
