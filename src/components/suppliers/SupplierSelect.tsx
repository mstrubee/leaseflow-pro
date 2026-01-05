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
  disabled?: boolean;
}

export const SupplierSelect = ({ 
  value, 
  onChange, 
  templateLineId,
  disabled = false 
}: SupplierSelectProps) => {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    loadSuppliers();
  }, [templateLineId]);

  const loadSuppliers = async () => {
    setLoading(true);
    try {
      // Get generic suppliers
      const { data: genericSuppliers } = await supabase
        .from("suppliers")
        .select("id, name, is_generic")
        .eq("is_generic", true)
        .order("name");

      // Get suppliers associated with the template line
      let associatedSuppliers: any[] = [];
      if (templateLineId) {
        const { data: supplierProducts } = await supabase
          .from("supplier_products")
          .select(`
            supplier:suppliers(id, name, is_generic)
          `)
          .eq("template_line_id", templateLineId);
        
        if (supplierProducts) {
          associatedSuppliers = supplierProducts
            .map((sp: any) => sp.supplier)
            .filter(Boolean);
        }
      }

      // Merge and deduplicate
      const allSuppliers = [...(genericSuppliers || []), ...associatedSuppliers];
      const uniqueSuppliers = allSuppliers.reduce((acc: Supplier[], curr) => {
        if (!acc.find(s => s.id === curr.id)) {
          acc.push(curr as Supplier);
        }
        return acc;
      }, []);

      setSuppliers(uniqueSuppliers);
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

  return (
    <>
      <Select 
        value={value || ""} 
        onValueChange={handleSupplierChange}
        disabled={disabled || loading}
      >
        <SelectTrigger className="h-6 w-36 text-xs">
          <SelectValue placeholder="Proveedor">
            {selectedSupplier?.name || "Proveedor"}
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
