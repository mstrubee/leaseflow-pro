import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useSpecialAttentionNavigation } from "@/components/special-attention/SpecialAttentionReturnButton";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CompanyLogo } from "@/components/contracts/CompanyLogo";
import { ContractSearchSelect, type ContractOption } from "@/components/contracts/ContractSearchSelect";
import { SpecialAttentionChecklist } from "@/components/special-attention/SpecialAttentionChecklist";
import { AlertTriangle, ArrowLeft, ExternalLink, Plus, Search, ChevronDown, ChevronRight, ChevronsUpDown, FileDown, Trash2, CalendarCheck } from "lucide-react";
import { MeetingsRegistryDialog } from "@/components/special-attention/MeetingsRegistryDialog";
import { SelectableElement } from "@/components/admin/SelectableElement";
import { exportSpecialAttentionPDF } from "@/components/special-attention/exportSpecialAttentionPDF";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

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

// InlineReason replaced by SpecialAttentionChecklist component

const SpecialAttentionPage = () => {
  const navigate = useNavigate();
  const { navigateToContract } = useSpecialAttentionNavigation();
  const [contracts, setContracts] = useState<SpecialContract[]>([]);
  const [loading, setLoading] = useState(true);

  // For the "add contract" search select
  const [allContracts, setAllContracts] = useState<ContractOption[]>([]);
  const [selectedAddId, setSelectedAddId] = useState("");
  const [adding, setAdding] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [removeConfirmId, setRemoveConfirmId] = useState<string | null>(null);
  const [meetingsOpen, setMeetingsOpen] = useState(false);

  const toggleExpand = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

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
      await Promise.all([loadSpecialContracts(), loadAllContracts()]);
    }
    setAdding(false);
  };

  const handleRemoveContract = async () => {
    if (!removeConfirmId) return;
    const { error } = await supabase
      .from("contracts")
      .update({ requires_special_attention: false })
      .eq("id", removeConfirmId);
    if (error) {
      toast.error("Error al quitar contrato");
    } else {
      toast.success("Contrato quitado del listado");
      await Promise.all([loadSpecialContracts(), loadAllContracts()]);
    }
    setRemoveConfirmId(null);
  };

  return (
    <SelectableElement elementId="special_attention" label="Atención Especial">
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
          <div className="relative w-64">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar en listado…"
              className="pl-9 h-9"
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 shrink-0"
            onClick={() => {
              if (expandedIds.size === contracts.length) {
                setExpandedIds(new Set());
              } else {
                setExpandedIds(new Set(contracts.map(c => c.id)));
              }
            }}
          >
            <ChevronsUpDown className="h-4 w-4" />
            {expandedIds.size === contracts.length ? "Contraer" : "Expandir"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 shrink-0"
            disabled={loading || contracts.length === 0}
            onClick={() => exportSpecialAttentionPDF(contracts)}
          >
            <FileDown className="h-4 w-4" />
            PDF
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 shrink-0"
            onClick={() => setMeetingsOpen(true)}
          >
            <CalendarCheck className="h-4 w-4" />
            Registro Reuniones
          </Button>
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
        ) : (() => {
          const term = searchTerm.toLowerCase();
          const filtered = term
            ? contracts.filter(c =>
                c.name.toLowerCase().includes(term) ||
                (c.cebe && c.cebe.toLowerCase().includes(term)) ||
                (c.codigo && c.codigo.toLowerCase().includes(term))
              )
            : contracts;
          return filtered.length === 0 ? (
            <p className="text-center text-muted-foreground py-12">
              No se encontraron contratos con "{searchTerm}".
            </p>
          ) : filtered.map((c) => (
            <Collapsible key={c.id} open={expandedIds.has(c.id)} onOpenChange={() => toggleExpand(c.id)}>
              <Card>
                <CardContent className="p-0">
                  <div className="flex items-center gap-3 px-5 py-3">
                    <CollapsibleTrigger asChild>
                      <button className="shrink-0 p-0.5 text-muted-foreground hover:text-foreground transition-colors">
                        {expandedIds.has(c.id) ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      </button>
                    </CollapsibleTrigger>
                    <CompanyLogo companyNames={c.companyNames} size="sm" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-foreground truncate">{c.name}</p>
                      {(c.cebe || c.codigo) && (
                        <p className="text-xs text-muted-foreground font-mono">
                          {[c.cebe, c.codigo].filter(Boolean).join(" • ")}
                        </p>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="gap-1.5 shrink-0 text-muted-foreground hover:text-foreground"
                      onClick={() => navigateToContract(c.id)}
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      Ver contrato
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="shrink-0 h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={() => setRemoveConfirmId(c.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  <CollapsibleContent>
                    <div className="px-5 pb-4 pt-1">
                      <SpecialAttentionChecklist contractId={c.id} reason={c.special_attention_reason} />
                    </div>
                  </CollapsibleContent>
                </CardContent>
              </Card>
            </Collapsible>
          ));
        })()}
      </main>

      {/* Remove confirmation */}
      <AlertDialog open={!!removeConfirmId} onOpenChange={(open) => { if (!open) setRemoveConfirmId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Quitar contrato del listado?</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <span className="block">Se quitará del listado de contratos con Atención Especial.</span>
              <span className="block">Esta acción <strong className="text-foreground">NO</strong> elimina el contrato de la base de datos. El historial de la atención especial se mantiene en archivo histórico dentro del contrato.</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleRemoveContract}>Quitar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <MeetingsRegistryDialog
        open={meetingsOpen}
        onOpenChange={setMeetingsOpen}
        contracts={contracts}
      />
    </div>
    </SelectableElement>
  );
};

export default SpecialAttentionPage;
