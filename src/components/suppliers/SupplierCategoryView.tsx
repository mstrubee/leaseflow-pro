import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, ChevronRight, Wrench, Hammer, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface CategorySupplier {
  id: string;
  name: string;
  does_installations: boolean;
  does_maintenance: boolean;
}

interface SupplierCategoryViewProps {
  refreshKey?: number;
}

/**
 * Vista "Categoría": dos listas colapsables e independientes con los
 * proveedores según su categoría de servicio (Instalaciones / Mantenciones).
 * Un proveedor con ambas categorías aparece en ambas listas.
 *
 * Decisión sobre proveedores SIN categoría: se muestran en una tercera
 * sección "Sin categorizar" (colapsable, cerrada por defecto) en vez de
 * excluirlos — así quedan visibles para que el usuario los categorice, sin
 * mezclarlos con las dos listas principales. Es la opción menos disruptiva:
 * no esconde datos y no obliga a nada. Si en el futuro se prefiere ocultarlos,
 * basta con no renderizar esa sección (dejar `uncategorized` sin usar).
 */
export const SupplierCategoryView = ({ refreshKey }: SupplierCategoryViewProps) => {
  const [suppliers, setSuppliers] = useState<CategorySupplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [openInstallations, setOpenInstallations] = useState(true);
  const [openMaintenance, setOpenMaintenance] = useState(true);
  const [openUncategorized, setOpenUncategorized] = useState(false);

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

  const installations = suppliers.filter((s) => s.does_installations);
  const maintenance = suppliers.filter((s) => s.does_maintenance);
  const uncategorized = suppliers.filter((s) => !s.does_installations && !s.does_maintenance);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        Cargando proveedores...
      </div>
    );
  }

  const Section = ({
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
      <Section
        icon={Hammer}
        title="Instalaciones"
        items={installations}
        open={openInstallations}
        onOpenChange={setOpenInstallations}
      />
      <Section
        icon={Wrench}
        title="Mantenciones"
        items={maintenance}
        open={openMaintenance}
        onOpenChange={setOpenMaintenance}
      />
      {uncategorized.length > 0 && (
        <Section
          icon={ChevronRight}
          title="Sin categorizar"
          items={uncategorized}
          open={openUncategorized}
          onOpenChange={setOpenUncategorized}
        />
      )}
    </div>
  );
};
