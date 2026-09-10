import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SearchableSelect, SearchableSelectOption } from "@/components/ui/searchable-select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, ArrowRightLeft } from "lucide-react";
import { SupplierForm } from "./SupplierForm";
import { Supplier } from "./types";

interface SupplierSelectProps {
  value: string | null;
  onChange: (supplierId: string | null, supplierName: string | null) => void;
  templateLineId?: string | null;
  categoryId?: string | null;
  disabled?: boolean;
  supplierName?: string | null;
  /** When true, internal-transfer suppliers (e.g. Grupo Planet) are hidden.
   *  Use in OC / OC-Request / Invoice flows where transfers don't apply. */
  excludeInternalTransfer?: boolean;
  /** Clase del trigger -- por defecto compacto (uso en celdas de tabla). Pasar
   *  algo como "w-full h-9 text-sm" en formularios/diálogos con más espacio. */
  triggerClassName?: string;
}

interface SupplierOption {
  id: string;
  name: string;
  is_generic: boolean;
  category_id: string | null;
  is_internal_transfer: boolean;
}

export const SupplierSelect = ({ 
  value, 
  onChange, 
  templateLineId,
  categoryId,
  disabled = false,
  supplierName: externalSupplierName,
  excludeInternalTransfer = false,
  triggerClassName = "h-6 w-36 text-xs",
}: SupplierSelectProps) => {
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    loadSuppliers();
  }, [templateLineId, categoryId, value]);

  const loadSuppliers = async () => {
    setLoading(true);
    try {
      // Always load ALL suppliers to ensure complete selection capability
      const { data: allSuppliers } = await supabase
        .from("suppliers")
        .select("id, name, is_generic, category_id, is_internal_transfer")
        .order("name");

      let list = (allSuppliers || []) as SupplierOption[];
      if (excludeInternalTransfer) {
        list = list.filter(s => !s.is_internal_transfer);
      }
      // Sort: internal transfer suppliers first, then alphabetical
      list.sort((a, b) => {
        if (a.is_internal_transfer && !b.is_internal_transfer) return -1;
        if (!a.is_internal_transfer && b.is_internal_transfer) return 1;
        return a.name.localeCompare(b.name);
      });

      setSuppliers(list);
    } catch (error) {
      console.error("Error loading suppliers:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSupplierChange = (val: string) => {
    if (val === "new") {
      setShowForm(true);
      return;
    }
    if (val === "none") {
      onChange(null, null);
      return;
    }

    const supplier = suppliers.find(s => s.id === val);
    onChange(val, supplier?.name || null);
  };

  const handleNewSupplierSaved = () => {
    setShowForm(false);
    loadSuppliers();
  };

  // If we have an external supplier name but no ID, try to find the matching supplier
  const resolvedValue = value || (externalSupplierName ? suppliers.find(s => s.name === externalSupplierName)?.id : null);

  const renderSupplierLabel = (supplier: SupplierOption) => (
    <span className="flex items-center gap-1">
      {supplier.is_internal_transfer && <ArrowRightLeft className="h-3 w-3 text-primary shrink-0" />}
      <span className="truncate">{supplier.name}</span>
      {supplier.is_internal_transfer && <span className="text-primary text-xs ml-1 shrink-0">(traslado)</span>}
      {!supplier.is_internal_transfer && supplier.is_generic && (
        <span className="text-muted-foreground text-xs ml-1 shrink-0">(genérico)</span>
      )}
    </span>
  );

  const options: SearchableSelectOption[] = [
    { value: "new", label: "Nuevo Proveedor", icon: <Plus className="h-3.5 w-3.5" /> },
    ...(resolvedValue ? [{ value: "none", label: "Sin proveedor" }] : []),
    ...suppliers.map((supplier) => ({
      value: supplier.id,
      label: supplier.name,
      icon: renderSupplierLabel(supplier),
    })),
  ];

  return (
    <>
      <SearchableSelect
        value={resolvedValue || ""}
        onValueChange={handleSupplierChange}
        options={options}
        placeholder="Proveedor"
        searchPlaceholder="Buscar proveedor..."
        emptyMessage="No se encontró ningún proveedor."
        disabled={disabled || loading}
        triggerClassName={triggerClassName}
        renderItem={(option) =>
          option.value === "new" ? (
            <span className="flex items-center gap-1 text-primary font-medium">
              <Plus className="h-3 w-3" />
              Nuevo Proveedor
            </span>
          ) : option.value === "none" ? (
            <span className="text-muted-foreground">Sin proveedor</span>
          ) : (
            option.icon
          )
        }
      />

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nuevo Proveedor</DialogTitle>
          </DialogHeader>
          <SupplierForm
            onSave={handleNewSupplierSaved}
            onCancel={() => setShowForm(false)}
          />
        </DialogContent>
      </Dialog>
    </>
  );
};
