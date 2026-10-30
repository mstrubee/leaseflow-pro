import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Pencil, Save, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatCLP } from "@/lib/utils";

interface OpexLineAssignmentProps {
  requestId: string;
  /** Fila actual de opex_master_budget a la que está imputada la solicitud. */
  currentOpexMasterId: string;
  currentLineName: string;
  /** Año presupuestario de la solicitud: solo se ofrecen categorías de ese año. */
  year: number;
  totalClp: number;
  isConverted: boolean;
  /** Se llama tras guardar, para que quien lo usa recargue la solicitud y la lista. */
  onSaved: () => void;
}

interface OpexCategoryOption {
  id: string;
  name: string;
}

const errorMessage = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : (error as { message?: string })?.message ?? fallback;

/**
 * Pestaña "Líneas" de una solicitud OPEX, para el admin: muestra la categoría a
 * la que se imputó y permite cambiarla, también con la solicitud ya convertida
 * en OC.
 *
 * La imputación OPEX vive en oc_requests.opex_master_id (fila de
 * opex_master_budget = categoría del año). No usa oc_budget_lines: esa tabla
 * referencia budget_lines (CAPEX), así que el editor CAPEX no aplica aquí.
 *
 * El cambio se hace con la función change_oc_request_opex_line: una sola
 * transacción que mueve la solicitud y su OC, y que valida rol ADMIN, año,
 * presupuesto abierto y vínculo con la OC.
 */
export const OpexLineAssignment = ({
  requestId,
  currentOpexMasterId,
  currentLineName,
  year,
  totalClp,
  isConverted,
  onSaved,
}: OpexLineAssignmentProps) => {
  const { toast } = useToast();
  const [isEditing, setIsEditing] = useState(false);
  const [categories, setCategories] = useState<OpexCategoryOption[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [loadingCategories, setLoadingCategories] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleStartEdit = async () => {
    setSelectedId(currentOpexMasterId);
    setIsEditing(true);
    setLoadingCategories(true);
    try {
      const { data, error } = await supabase
        .from("opex_master_budget")
        .select("id, category:opex_categories(name)")
        .eq("year", year)
        .eq("is_closed", false);
      if (error) throw error;

      const rows = (data || []) as unknown as { id: string; category: { name: string } | null }[];
      const options = rows.map((row) => ({ id: row.id, name: row.category?.name ?? "Sin categoría" }));
      // La línea actual puede estar en un presupuesto ya cerrado: se conserva
      // como opción para que el selector no quede vacío ni la pierda.
      if (!options.some((o) => o.id === currentOpexMasterId)) {
        options.push({ id: currentOpexMasterId, name: currentLineName });
      }
      options.sort((a, b) => a.name.localeCompare(b.name, "es"));
      setCategories(options);
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: errorMessage(error, "No se pudieron cargar las categorías OPEX"),
      });
      setIsEditing(false);
    } finally {
      setLoadingCategories(false);
    }
  };

  const handleSave = async () => {
    const target = categories.find((c) => c.id === selectedId);
    if (!target) {
      toast({ variant: "destructive", title: "Error", description: "Seleccione una categoría OPEX" });
      return;
    }
    if (target.id === currentOpexMasterId) {
      setIsEditing(false);
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase.rpc("change_oc_request_opex_line", {
        p_request_id: requestId,
        p_opex_master_id: target.id,
      });
      if (error) throw error;

      toast({ title: "Línea OPEX actualizada", description: `Imputada a ${target.name}` });
      setIsEditing(false);
      onSaved();
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: errorMessage(error, "No se pudo actualizar la línea OPEX"),
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-medium">Asignación a Línea(s) de Presupuesto</span>
        {isEditing ? (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setIsEditing(false)} disabled={saving} className="gap-1">
              <X className="h-3 w-3" />
              Cancelar
            </Button>
            <Button size="sm" onClick={handleSave} disabled={saving || loadingCategories || !selectedId} className="gap-1">
              {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
              Guardar
            </Button>
          </div>
        ) : (
          <Button variant="outline" size="sm" onClick={handleStartEdit} className="gap-1">
            <Pencil className="h-3 w-3" />
            Editar
          </Button>
        )}
      </div>

      {isEditing ? (
        <div className="space-y-2">
          <Label>Categoría OPEX</Label>
          {loadingCategories ? (
            <div className="flex justify-center py-3">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : (
            <Select value={selectedId} onValueChange={setSelectedId}>
              <SelectTrigger>
                <SelectValue placeholder="Seleccione una categoría" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <p className="text-xs text-muted-foreground">
            El monto total ({formatCLP(totalClp)}) se imputa completo a la categoría elegida.
            {isConverted && " También se actualiza la OC creada desde esta solicitud."}
          </p>
        </div>
      ) : (
        <div className="text-center py-4 text-muted-foreground text-sm">
          Asignación simple a línea: {currentLineName}
        </div>
      )}
    </>
  );
};
