import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus } from "lucide-react";
import { SupplierForm } from "./SupplierForm";
import { Supplier } from "./types";

interface SupplierSelectProps {
  value: string | null;
  onChange: (supplierId: string | null, supplierName: string | null) => void;
  templateLineId?: string | null;
  categoryId?: string | null;
  disabled?: boolean;
  supplierName?: string | null;
}

export const SupplierSelect = ({ 
  value, 
  onChange, 
  templateLineId,
  categoryId,
  disabled = false,
  supplierName: externalSupplierName
}: SupplierSelectProps) => {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
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
        .select("id, name, is_generic, category_id")
        .order("name");
      
      setSuppliers((allSuppliers || []) as Supplier[]);
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
    
    const supplier = suppliers.find(s => s.id === val);
    onChange(val, supplier?.name || null);
  };

  const handleNewSupplierSaved = () => {
    setShowForm(false);
    loadSuppliers();
  };

  const selectedSupplier = suppliers.find(s => s.id === value);
  const displayName = selectedSupplier?.name || externalSupplierName || null;

  // If we have an external supplier name but no ID, try to find the matching supplier
  const resolvedValue = value || (externalSupplierName ? suppliers.find(s => s.name === externalSupplierName)?.id : null);

  return (
    <>
      <Select 
        value={resolvedValue || ""} 
        onValueChange={handleSupplierChange}
        disabled={disabled || loading}
      >
        <SelectTrigger className="h-6 w-36 text-xs">
          <SelectValue placeholder="Proveedor">
            {displayName || "Proveedor"}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="new" className="text-primary font-medium">
            <span className="flex items-center gap-1">
              <Plus className="h-3 w-3" />
              Nuevo Proveedor
            </span>
          </SelectItem>
          {suppliers.length > 0 && (
            <>
              {suppliers.map(supplier => (
                <SelectItem key={supplier.id} value={supplier.id}>
                  {supplier.name}
                  {supplier.is_generic && (
                    <span className="text-muted-foreground text-xs ml-1">(genérico)</span>
                  )}
                </SelectItem>
              ))}
            </>
          )}
        </SelectContent>
      </Select>

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
