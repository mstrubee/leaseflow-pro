import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Settings } from "lucide-react";
import { toast } from "sonner";

interface Category {
  id: string;
  name: string;
}

interface CategorySelectProps {
  value: string | null | undefined;
  onChange: (categoryId: string | null) => void;
  placeholder?: string;
  disabled?: boolean;
  showManageButton?: boolean;
  size?: "sm" | "default";
}

export const CategorySelect = ({ 
  value, 
  onChange, 
  placeholder = "Seleccionar rubro",
  disabled = false,
  showManageButton = false,
  size = "default"
}: CategorySelectProps) => {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadCategories();
  }, []);

  const loadCategories = async () => {
    try {
      const { data, error } = await supabase
        .from("supplier_categories")
        .select("id, name")
        .eq("is_active", true)
        .order("display_order");
      if (error) throw error;
      setCategories(data || []);
    } catch (error) {
      console.error("Error loading categories:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateCategory = async () => {
    if (!newCategoryName.trim()) return;
    setSaving(true);
    try {
      const maxOrder = Math.max(...categories.map(c => 0), 0);
      const { data, error } = await supabase
        .from("supplier_categories")
        .insert({ name: newCategoryName.trim(), display_order: maxOrder + 1 })
        .select()
        .single();
      
      if (error) {
        if (error.code === "23505") {
          toast.error("Ya existe un rubro con ese nombre");
        } else {
          throw error;
        }
        return;
      }
      
      toast.success("Rubro creado");
      setCategories(prev => [...prev, { id: data.id, name: data.name }]);
      onChange(data.id);
      setShowNewDialog(false);
      setNewCategoryName("");
    } catch (error) {
      toast.error("Error al crear rubro");
    } finally {
      setSaving(false);
    }
  };

  const handleChange = (val: string) => {
    if (val === "new") {
      setShowNewDialog(true);
      return;
    }
    if (val === "none") {
      onChange(null);
      return;
    }
    onChange(val);
  };

  const selectedCategory = categories.find(c => c.id === value);
  const sizeClasses = size === "sm" ? "h-6 text-xs" : "";

  return (
    <>
      <Select 
        value={value || ""} 
        onValueChange={handleChange}
        disabled={disabled || loading}
      >
        <SelectTrigger className={sizeClasses}>
          <SelectValue placeholder={placeholder}>
            {selectedCategory?.name || placeholder}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="new" className="text-primary font-medium">
            <span className="flex items-center gap-1">
              <Plus className="h-3 w-3" />
              Nuevo Rubro
            </span>
          </SelectItem>
          <SelectItem value="none" className="text-muted-foreground">
            Sin rubro
          </SelectItem>
          {categories.map(cat => (
            <SelectItem key={cat.id} value={cat.id}>
              {cat.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Dialog open={showNewDialog} onOpenChange={setShowNewDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nuevo Rubro</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Input
              value={newCategoryName}
              onChange={e => setNewCategoryName(e.target.value)}
              placeholder="Nombre del rubro"
              onKeyDown={e => e.key === "Enter" && handleCreateCategory()}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={handleCreateCategory} disabled={saving || !newCategoryName.trim()}>
              Crear
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
