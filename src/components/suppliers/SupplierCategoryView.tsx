import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronRight, Wrench, Hammer, ListChecks, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface CategorySupplier {
  id: string;
  name: string;
  does_installations: boolean;
  does_maintenance: boolean;
}

type CategoryKey = "instalaciones" | "mantenciones" | "ambas" | "sin";

interface SupplierCategoryViewProps {
  refreshKey?: number;
}

const keyOf = (s: CategorySupplier): CategoryKey =>
  s.does_installations && s.does_maintenance
    ? "ambas"
    : s.does_installations
    ? "instalaciones"
    : s.does_maintenance
    ? "mantenciones"
    : "sin";

// Estado (does_installations, does_maintenance) que aplica cada botón.
const FLAGS: Record<CategoryKey, { inst: boolean; maint: boolean }> = {
  instalaciones: { inst: true, maint: false },
  mantenciones: { inst: false, maint: true },
  ambas: { inst: true, maint: true },
  sin: { inst: false, maint: false },
};

// Colores por categoría: activo = relleno; inactivo = solo borde/tinte.
const BTN: Record<CategoryKey, { label: string; active: string; idle: string }> = {
  instalaciones: {
    label: "Compras",
    active: "bg-green-700 text-white hover:bg-green-800 border-green-700",
    idle: "text-green-700 border-green-700/40 hover:bg-green-700/10",
  },
  mantenciones: {
    label: "Mantenciones",
    active: "bg-sky-400 text-white hover:bg-sky-500 border-sky-400",
    idle: "text-sky-600 border-sky-400/50 hover:bg-sky-400/10",
  },
  ambas: {
    label: "Ambas",
    active: "bg-orange-500 text-white hover:bg-orange-600 border-orange-500",
    idle: "text-orange-600 border-orange-500/40 hover:bg-orange-500/10",
  },
  sin: {
    label: "Sin Categorizar",
    active: "bg-red-600 text-white hover:bg-red-700 border-red-600",
    idle: "text-red-600 border-red-600/40 hover:bg-red-600/10",
  },
};

const CATEGORY_ORDER: CategoryKey[] = ["instalaciones", "mantenciones", "ambas", "sin"];

/**
 * Vista "Categoría":
 * - "Instalaciones" y "Mantenciones": listas de solo lectura con los
 *   proveedores de cada categoría (un proveedor con ambas aparece en las dos).
 * - "Categorización": lista con TODOS los proveedores y 4 botones por fila
 *   para asignar su categoría al instante. Al cambiar, las listas de arriba
 *   se actualizan automáticamente.
 */
export const SupplierCategoryView = ({ refreshKey }: SupplierCategoryViewProps) => {
  const [suppliers, setSuppliers] = useState<CategorySupplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [openInstallations, setOpenInstallations] = useState(true);
  const [openMaintenance, setOpenMaintenance] = useState(true);
  const [openCategorize, setOpenCategorize] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from("suppliers")
          .select("id, name, does_installations, does_maintenance")
          .order("name");
        if (error) throw error;
        setSuppliers((data || []) as CategorySupplier[]);
      } catch (error) {
        console.error("Error loading suppliers:", error);
        toast.error("Error al cargar proveedores");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [refreshKey]);

  const applyCategory = async (supplier: CategorySupplier, key: CategoryKey) => {
    const { inst, maint } = FLAGS[key];
    if (supplier.does_installations === inst && supplier.does_maintenance === maint) return;
    setSavingId(supplier.id);
    // Optimista: refleja el cambio (y re-filtra las listas de arriba) al instante.
    const prev = suppliers;
    setSuppliers((list) =>
      list.map((s) => (s.id === supplier.id ? { ...s, does_installations: inst, does_maintenance: maint } : s)),
    );
    try {
      const { error } = await supabase
        .from("suppliers")
        .update({ does_installations: inst, does_maintenance: maint })
        .eq("id", supplier.id);
      if (error) throw error;
    } catch (error) {
      console.error("Error updating supplier category:", error);
      toast.error("Error al categorizar proveedor");
      setSuppliers(prev); // revertir si falla
    } finally {
      setSavingId(null);
    }
  };

  const installations = suppliers.filter((s) => s.does_installations);
  const maintenance = suppliers.filter((s) => s.does_maintenance);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        Cargando proveedores...
      </div>
    );
  }

  const ListSection = ({
    icon: Icon,
    title,
    items,
    open,
    onOpenChange,
  }: {
    icon: typeof Wrench;
    title: string;
    items: CategorySupplier[];
    open: boolean;
    onOpenChange: (v: boolean) => void;
  }) => (
    <Collapsible open={open} onOpenChange={onOpenChange} className="border rounded-md">
      <CollapsibleTrigger className="flex items-center gap-2 w-full px-3 py-2.5 text-sm font-medium hover:bg-muted/50 rounded-md text-left">
        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        <Icon className="h-4 w-4 text-muted-foreground" />
        <span>{title}</span>
        <span className="text-muted-foreground font-normal">({items.length})</span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="border-t divide-y">
          {items.length === 0 ? (
            <p className="px-4 py-3 text-sm text-muted-foreground italic">
              No hay proveedores en esta categoría.
            </p>
          ) : (
            items.map((s) => (
              <div key={s.id} className="px-4 py-2 text-sm hover:bg-muted/30">
                {s.name}
              </div>
            ))
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );

  return (
    <div className="space-y-3">
      <ListSection
        icon={Hammer}
        title="Compras"
        items={installations}
        open={openInstallations}
        onOpenChange={setOpenInstallations}
      />
      <ListSection
        icon={Wrench}
        title="Mantenciones"
        items={maintenance}
        open={openMaintenance}
        onOpenChange={setOpenMaintenance}
      />

      {/* Categorización: todos los proveedores con botones de acción por fila */}
      <Collapsible open={openCategorize} onOpenChange={setOpenCategorize} className="border rounded-md">
        <CollapsibleTrigger className="flex items-center gap-2 w-full px-3 py-2.5 text-sm font-medium hover:bg-muted/50 rounded-md text-left">
          {openCategorize ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          <ListChecks className="h-4 w-4 text-muted-foreground" />
          <span>Categorización</span>
          <span className="text-muted-foreground font-normal">({suppliers.length})</span>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="border-t divide-y">
            {suppliers.length === 0 ? (
              <p className="px-4 py-3 text-sm text-muted-foreground italic">No hay proveedores.</p>
            ) : (
              suppliers.map((s) => {
                const current = keyOf(s);
                return (
                  <div
                    key={s.id}
                    className="flex items-center justify-between gap-3 px-4 py-2 hover:bg-muted/30"
                  >
                    <span className="text-sm truncate">{s.name}</span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {savingId === s.id && (
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                      )}
                      {CATEGORY_ORDER.map((key) => {
                        const isActive = current === key;
                        return (
                          <Button
                            key={key}
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={savingId === s.id}
                            onClick={() => applyCategory(s, key)}
                            className={cn(
                              "h-7 px-2 text-xs",
                              isActive ? BTN[key].active : BTN[key].idle,
                            )}
                          >
                            {BTN[key].label}
                          </Button>
                        );
                      })}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
};
