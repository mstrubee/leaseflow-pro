import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Category {
  id: string;
  name: string;
  parent_id: string | null;
}

interface CategoryWithChildren extends Category {
  children: CategoryWithChildren[];
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
  const [tree, setTree] = useState<CategoryWithChildren[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newParentId, setNewParentId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadCategories();
  }, []);

  const buildTree = (flatCategories: Category[]): CategoryWithChildren[] => {
    const map = new Map<string, CategoryWithChildren>();
    const roots: CategoryWithChildren[] = [];

    flatCategories.forEach(cat => {
      map.set(cat.id, { ...cat, children: [] });
    });

    flatCategories.forEach(cat => {
      const node = map.get(cat.id)!;
      if (cat.parent_id && map.has(cat.parent_id)) {
        map.get(cat.parent_id)!.children.push(node);
      } else {
        roots.push(node);
      }
    });

    return roots;
  };

  const loadCategories = async () => {
    try {
      const { data, error } = await supabase
        .from("supplier_categories")
        .select("id, name, parent_id")
        .eq("is_active", true)
        .order("display_order");
      if (error) throw error;
      setCategories(data || []);
      setTree(buildTree(data || []));
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
      const { data: existing } = await supabase
        .from("supplier_categories")
        .select("display_order")
        .eq("parent_id", newParentId)
        .order("display_order", { ascending: false })
        .limit(1);
      
      const maxOrder = existing && existing.length > 0 ? existing[0].display_order : 0;
      
      const { data, error } = await supabase
        .from("supplier_categories")
        .insert({ 
          name: newCategoryName.trim(), 
          display_order: maxOrder + 1,
          parent_id: newParentId 
        })
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
      
      toast.success(newParentId ? "Sub-rubro creado" : "Rubro creado");
      await loadCategories();
      onChange(data.id);
      setShowNewDialog(false);
      setNewCategoryName("");
      setNewParentId(null);
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

  const getDisplayName = (categoryId: string): string => {
    const category = categories.find(c => c.id === categoryId);
    if (!category) return "";
    
    if (category.parent_id) {
      const parent = categories.find(c => c.id === category.parent_id);
      if (parent) {
        return `${parent.name} → ${category.name}`;
      }
    }
    return category.name;
  };

  const selectedCategory = categories.find(c => c.id === value);
  const sizeClasses = size === "sm" ? "h-6 text-xs" : "";

  // Render flat list with hierarchy indicators
  const renderOptions = () => {
    const items: JSX.Element[] = [];
    
    const renderNode = (node: CategoryWithChildren, level: number) => {
      const prefix = level > 0 ? "↳ " : "";
      items.push(
        <SelectItem 
          key={node.id} 
          value={node.id}
          className={cn(level > 0 && "pl-6")}
        >
          {prefix}{node.name}
        </SelectItem>
      );
      node.children.forEach(child => renderNode(child, level + 1));
    };

    tree.forEach(node => renderNode(node, 0));
    return items;
  };

  // Get parent categories for the dialog
  const rootCategories = categories.filter(c => !c.parent_id);

  return (
    <>
      <Select 
        value={value || ""} 
        onValueChange={handleChange}
        disabled={disabled || loading}
      >
        <SelectTrigger className={sizeClasses}>
          <SelectValue placeholder={placeholder}>
            {selectedCategory ? getDisplayName(selectedCategory.id) : placeholder}
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
          {renderOptions()}
        </SelectContent>
      </Select>

      <Dialog open={showNewDialog} onOpenChange={setShowNewDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nuevo Rubro</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Rubro padre (opcional)</label>
              <Select 
                value={newParentId || "none"} 
                onValueChange={(v) => setNewParentId(v === "none" ? null : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Ninguno (rubro principal)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Ninguno (rubro principal)</SelectItem>
                  {rootCategories.map(cat => (
                    <SelectItem key={cat.id} value={cat.id}>
                      {cat.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">
                {newParentId ? "Nombre del sub-rubro" : "Nombre del rubro"}
              </label>
              <Input
                value={newCategoryName}
                onChange={e => setNewCategoryName(e.target.value)}
                placeholder={newParentId ? "Ej: Muebles Metálicos" : "Ej: Mobiliario"}
                onKeyDown={e => e.key === "Enter" && handleCreateCategory()}
                autoFocus
              />
            </div>
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
