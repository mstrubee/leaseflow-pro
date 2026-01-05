import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2, X, Check } from "lucide-react";
import { toast } from "sonner";
import { SupplierCategory } from "./types";

export const CategoryManager = () => {
  const [categories, setCategories] = useState<SupplierCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [newName, setNewName] = useState("");
  const [isAdding, setIsAdding] = useState(false);

  useEffect(() => {
    loadCategories();
  }, []);

  const loadCategories = async () => {
    try {
      const { data, error } = await supabase
        .from("supplier_categories")
        .select("*")
        .order("display_order");
      if (error) throw error;
      setCategories(data || []);
    } catch (error) {
      console.error("Error loading categories:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = async () => {
    if (!newName.trim()) return;
    try {
      const maxOrder = Math.max(...categories.map(c => c.display_order), 0);
      const { error } = await supabase
        .from("supplier_categories")
        .insert({ name: newName.trim(), display_order: maxOrder + 1 });
      if (error) throw error;
      toast.success("Rubro creado");
      setNewName("");
      setIsAdding(false);
      loadCategories();
    } catch (error: any) {
      if (error.code === "23505") {
        toast.error("Ya existe un rubro con ese nombre");
      } else {
        toast.error("Error al crear rubro");
      }
    }
  };

  const handleUpdate = async (id: string) => {
    if (!editName.trim()) return;
    try {
      const { error } = await supabase
        .from("supplier_categories")
        .update({ name: editName.trim() })
        .eq("id", id);
      if (error) throw error;
      toast.success("Rubro actualizado");
      setEditingId(null);
      loadCategories();
    } catch (error: any) {
      if (error.code === "23505") {
        toast.error("Ya existe un rubro con ese nombre");
      } else {
        toast.error("Error al actualizar rubro");
      }
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const { error } = await supabase
        .from("supplier_categories")
        .delete()
        .eq("id", id);
      if (error) throw error;
      toast.success("Rubro eliminado");
      loadCategories();
    } catch (error) {
      toast.error("No se puede eliminar, hay proveedores asociados");
    }
  };

  const handleToggleActive = async (category: SupplierCategory) => {
    try {
      const { error } = await supabase
        .from("supplier_categories")
        .update({ is_active: !category.is_active })
        .eq("id", category.id);
      if (error) throw error;
      loadCategories();
    } catch (error) {
      toast.error("Error al actualizar rubro");
    }
  };

  if (loading) {
    return <div className="animate-pulse h-20 bg-muted rounded" />;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="font-medium text-sm">Rubros de Proveedores</h4>
        {!isAdding && (
          <Button size="sm" variant="outline" onClick={() => setIsAdding(true)}>
            <Plus className="h-4 w-4 mr-1" />
            Agregar
          </Button>
        )}
      </div>

      {isAdding && (
        <div className="flex items-center gap-2 p-2 bg-muted/50 rounded-md">
          <Input
            value={newName}
            onChange={e => setNewName(e.target.value)}
            placeholder="Nombre del rubro"
            className="h-8"
            autoFocus
            onKeyDown={e => e.key === "Enter" && handleAdd()}
          />
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={handleAdd}>
            <Check className="h-4 w-4 text-green-600" />
          </Button>
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setIsAdding(false)}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {categories.map(cat => (
          <div key={cat.id} className="group">
            {editingId === cat.id ? (
              <div className="flex items-center gap-1 bg-muted rounded-md px-2 py-1">
                <Input
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  className="h-6 w-32 text-xs"
                  autoFocus
                  onKeyDown={e => e.key === "Enter" && handleUpdate(cat.id)}
                />
                <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => handleUpdate(cat.id)}>
                  <Check className="h-3 w-3 text-green-600" />
                </Button>
                <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setEditingId(null)}>
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ) : (
              <Badge
                variant={cat.is_active ? "secondary" : "outline"}
                className="cursor-pointer gap-1 pr-1"
                onClick={() => handleToggleActive(cat)}
              >
                {cat.name}
                <button
                  className="opacity-0 group-hover:opacity-100 ml-1"
                  onClick={e => { e.stopPropagation(); setEditingId(cat.id); setEditName(cat.name); }}
                >
                  <Pencil className="h-3 w-3" />
                </button>
                <button
                  className="opacity-0 group-hover:opacity-100"
                  onClick={e => { e.stopPropagation(); handleDelete(cat.id); }}
                >
                  <Trash2 className="h-3 w-3 text-destructive" />
                </button>
              </Badge>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
