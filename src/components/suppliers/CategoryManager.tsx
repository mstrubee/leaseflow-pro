import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2, X, Check, ChevronRight, ChevronDown, FolderTree } from "lucide-react";
import { toast } from "sonner";
import { SupplierCategory } from "./types";
import { cn } from "@/lib/utils";

interface CategoryWithChildren extends SupplierCategory {
  children: CategoryWithChildren[];
}

export const CategoryManager = () => {
  const [categories, setCategories] = useState<CategoryWithChildren[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [newName, setNewName] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [addingParentId, setAddingParentId] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadCategories();
  }, []);

  const buildTree = (flatCategories: SupplierCategory[]): CategoryWithChildren[] => {
    const map = new Map<string, CategoryWithChildren>();
    const roots: CategoryWithChildren[] = [];

    // First pass: create all nodes
    flatCategories.forEach(cat => {
      map.set(cat.id, { ...cat, children: [] });
    });

    // Second pass: build tree
    flatCategories.forEach(cat => {
      const node = map.get(cat.id)!;
      if (cat.parent_id && map.has(cat.parent_id)) {
        map.get(cat.parent_id)!.children.push(node);
      } else {
        roots.push(node);
      }
    });

    // Sort children by display_order
    const sortChildren = (nodes: CategoryWithChildren[]) => {
      nodes.sort((a, b) => a.display_order - b.display_order);
      nodes.forEach(n => sortChildren(n.children));
    };
    sortChildren(roots);

    return roots;
  };

  const loadCategories = async () => {
    try {
      const { data, error } = await supabase
        .from("supplier_categories")
        .select("*")
        .order("display_order");
      if (error) throw error;
      setCategories(buildTree(data || []));
      // Expand all by default
      setExpandedIds(new Set((data || []).map(c => c.id)));
    } catch (error) {
      console.error("Error loading categories:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = async (parentId: string | null = null) => {
    if (!newName.trim()) return;
    try {
      const { data: existing } = await supabase
        .from("supplier_categories")
        .select("display_order")
        .eq("parent_id", parentId ?? null)
        .order("display_order", { ascending: false })
        .limit(1);
      
      const maxOrder = existing && existing.length > 0 ? existing[0].display_order : 0;
      
      const { error } = await supabase
        .from("supplier_categories")
        .insert({ 
          name: newName.trim(), 
          display_order: maxOrder + 1,
          parent_id: parentId 
        });
      if (error) throw error;
      toast.success(parentId ? "Sub-rubro creado" : "Rubro creado");
      setNewName("");
      setIsAdding(false);
      setAddingParentId(null);
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

  const handleDelete = async (id: string, hasChildren: boolean) => {
    if (hasChildren) {
      if (!confirm("Este rubro tiene sub-rubros. ¿Eliminar todos?")) {
        return;
      }
    }
    try {
      const { error } = await supabase
        .from("supplier_categories")
        .delete()
        .eq("id", id);
      if (error) throw error;
      toast.success("Rubro eliminado");
      loadCategories();
    } catch (error) {
      toast.error("No se puede eliminar, hay proveedores o líneas asociadas");
    }
  };

  const handleToggleActive = async (category: CategoryWithChildren) => {
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

  const toggleExpand = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const startAddingSubCategory = (parentId: string) => {
    setAddingParentId(parentId);
    setIsAdding(true);
    setNewName("");
    setExpandedIds(prev => new Set([...prev, parentId]));
  };

  const renderCategory = (cat: CategoryWithChildren, level: number = 0) => {
    const hasChildren = cat.children.length > 0;
    const isExpanded = expandedIds.has(cat.id);
    const isAddingHere = isAdding && addingParentId === cat.id;

    return (
      <div key={cat.id} className={cn("space-y-1", level > 0 && "ml-4 border-l border-border pl-2")}>
        <div className="group flex items-center gap-1">
          {/* Expand/collapse button */}
          <button
            onClick={() => toggleExpand(cat.id)}
            className="p-0.5 hover:bg-accent rounded transition-colors"
            disabled={!hasChildren}
          >
            {hasChildren ? (
              isExpanded ? (
                <ChevronDown className="h-3 w-3" />
              ) : (
                <ChevronRight className="h-3 w-3" />
              )
            ) : (
              <div className="h-3 w-3" />
            )}
          </button>

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
              className={cn(
                "cursor-pointer gap-1 pr-1",
                level === 0 && "font-semibold"
              )}
              onClick={() => handleToggleActive(cat)}
            >
              {level > 0 && <span className="text-muted-foreground">↳</span>}
              {cat.name}
              <span className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5 ml-1">
                <button
                  onClick={e => { e.stopPropagation(); startAddingSubCategory(cat.id); }}
                  title="Agregar sub-rubro"
                >
                  <Plus className="h-3 w-3 text-primary" />
                </button>
                <button
                  onClick={e => { e.stopPropagation(); setEditingId(cat.id); setEditName(cat.name); }}
                >
                  <Pencil className="h-3 w-3" />
                </button>
                <button
                  onClick={e => { e.stopPropagation(); handleDelete(cat.id, hasChildren); }}
                >
                  <Trash2 className="h-3 w-3 text-destructive" />
                </button>
              </span>
            </Badge>
          )}
        </div>

        {/* Add sub-category input */}
        {isAddingHere && (
          <div className="flex items-center gap-2 p-2 bg-muted/50 rounded-md ml-6">
            <Input
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="Nombre del sub-rubro"
              className="h-7 text-xs"
              autoFocus
              onKeyDown={e => {
                if (e.key === "Enter") handleAdd(cat.id);
                if (e.key === "Escape") { setIsAdding(false); setAddingParentId(null); }
              }}
            />
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleAdd(cat.id)}>
              <Check className="h-3 w-3 text-green-600" />
            </Button>
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setIsAdding(false); setAddingParentId(null); }}>
              <X className="h-3 w-3" />
            </Button>
          </div>
        )}

        {/* Children */}
        {hasChildren && isExpanded && (
          <div className="space-y-1">
            {cat.children.map(child => renderCategory(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  if (loading) {
    return <div className="animate-pulse h-20 bg-muted rounded" />;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FolderTree className="h-4 w-4 text-muted-foreground" />
          <h4 className="font-medium text-sm">Rubros y Sub-Rubros</h4>
        </div>
        {!isAdding && (
          <Button size="sm" variant="outline" onClick={() => { setIsAdding(true); setAddingParentId(null); }}>
            <Plus className="h-4 w-4 mr-1" />
            Nuevo Rubro
          </Button>
        )}
      </div>

      {/* Add root category input */}
      {isAdding && addingParentId === null && (
        <div className="flex items-center gap-2 p-2 bg-muted/50 rounded-md">
          <Input
            value={newName}
            onChange={e => setNewName(e.target.value)}
            placeholder="Nombre del rubro"
            className="h-8"
            autoFocus
            onKeyDown={e => {
              if (e.key === "Enter") handleAdd(null);
              if (e.key === "Escape") setIsAdding(false);
            }}
          />
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => handleAdd(null)}>
            <Check className="h-4 w-4 text-green-600" />
          </Button>
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setIsAdding(false)}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}

      <div className="space-y-1">
        {categories.map(cat => renderCategory(cat))}
      </div>

      {categories.length === 0 && !isAdding && (
        <p className="text-sm text-muted-foreground text-center py-4">
          No hay rubros creados. Crea uno para comenzar.
        </p>
      )}
    </div>
  );
};
