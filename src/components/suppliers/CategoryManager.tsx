import { useState, useEffect, useMemo } from "react";
import { useCollapsibleState } from "@/hooks/useCollapsibleState";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Pencil, Trash2, X, Check, ChevronRight, ChevronDown, FolderTree, GripVertical, ChevronsUpDown, ChevronsDownUp, MoveRight, CornerDownRight, Home } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { SupplierCategory } from "./types";
import { cn } from "@/lib/utils";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragStartEvent,
  closestCenter,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";


interface CategoryWithChildren extends SupplierCategory {
  children: CategoryWithChildren[];
}

interface FlatVisibleItem {
  id: string;
  cat: SupplierCategory;
  level: number;
  hasChildren: boolean;
  isExpanded: boolean;
}

const EditableNameInput = ({ 
  initialValue, 
  onSave, 
  onCancel 
}: { 
  initialValue: string; 
  onSave: (value: string) => void; 
  onCancel: () => void; 
}) => {
  const [value, setValue] = useState(initialValue);
  
  return (
    <div className="flex items-center gap-1 flex-1">
      <input
        type="text"
        value={value}
        onChange={e => setValue(e.target.value)}
        className="h-7 flex-1 text-sm px-2 rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring"
        autoFocus
        onKeyDown={e => {
          if (e.key === "Enter") onSave(value);
          if (e.key === "Escape") onCancel();
        }}
      />
      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => onSave(value)}>
        <Check className="h-4 w-4 text-primary" />
      </Button>
      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onCancel}>
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
};

const LEVEL_COLORS = [
  { bg: "bg-primary/20", border: "border-primary/40", text: "text-primary" },
  { bg: "bg-primary/12", border: "border-primary/25", text: "text-primary/90" },
  { bg: "bg-primary/8", border: "border-primary/15", text: "text-primary/80" },
  { bg: "bg-primary/5", border: "border-primary/10", text: "text-primary/70" },
];

// Sortable row component - defined outside to avoid re-creation
const SortableCategoryRow = ({
  item,
  editingId,
  isAdding,
  addingParentId,
  newName,
  onSetNewName,
  onAdd,
  onUpdate,
  onDelete,
  onToggleActive,
  onStartAddSub,
  onToggleExpand,
  onSetEditingId,
  onCancelAdd,
  onMove,
  getMoveTargets,
  dragDisabled,
}: {
  item: FlatVisibleItem;
  editingId: string | null;
  isAdding: boolean;
  addingParentId: string | null;
  newName: string;
  onSetNewName: (v: string) => void;
  onAdd: (parentId: string) => void;
  onUpdate: (id: string, name: string) => void;
  onDelete: (id: string, hasChildren: boolean) => void;
  onToggleActive: (cat: SupplierCategory) => void;
  onStartAddSub: (parentId: string) => void;
  onToggleExpand: (id: string) => void;
  onSetEditingId: (id: string | null) => void;
  onCancelAdd: () => void;
  onMove: (draggedId: string, targetId: string | null) => void;
  getMoveTargets: (catId: string) => { id: string | null; name: string; level: number }[];
  dragDisabled: boolean;
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ 
    id: item.id,
    disabled: dragDisabled,
  });

  const style = {
    transform: CSS.Transform.toString(transform ? { ...transform, x: 0 } : null),
    transition,
  };

  const { cat, level, hasChildren, isExpanded } = item;
  const colors = LEVEL_COLORS[Math.min(level, LEVEL_COLORS.length - 1)];
  const isAddingHere = isAdding && addingParentId === cat.id;
  const targets = getMoveTargets(cat.id);

  return (
    <div ref={setNodeRef} style={style} className={cn(isDragging && "z-50 relative")}>
      <div 
        className={cn(
          "group flex items-center gap-2 p-2 rounded-lg border transition-all",
          colors.bg, colors.border,
          !cat.is_active && "opacity-50",
          isDragging && "shadow-lg opacity-80 ring-2 ring-primary/30",
        )}
        style={{ marginLeft: level * 24 }}
      >
        {/* Drag handle */}
        <button
          {...attributes}
          {...listeners}
          className={cn(
            "p-1 rounded hover:bg-accent/50 touch-none",
            dragDisabled ? "cursor-not-allowed opacity-30" : "cursor-grab active:cursor-grabbing"
          )}
          title="Arrastrar para reordenar entre hermanos"
        >
          <GripVertical className="h-4 w-4 text-muted-foreground" />
        </button>

        {/* Expand/collapse */}
        <button
          onClick={() => onToggleExpand(cat.id)}
          className="p-0.5 hover:bg-accent rounded transition-colors"
          disabled={!hasChildren}
        >
          {hasChildren ? (
            isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />
          ) : (
            <div className="h-4 w-4" />
          )}
        </button>

        {/* Name */}
        {editingId === cat.id ? (
          <EditableNameInput
            initialValue={cat.name}
            onSave={(name) => onUpdate(cat.id, name)}
            onCancel={() => onSetEditingId(null)}
          />
        ) : (
          <>
            <span 
              className={cn(
                "flex-1 text-sm font-medium cursor-pointer hover:underline",
                colors.text,
                level === 0 && "font-semibold"
              )}
              onClick={() => onToggleActive(cat)}
              title={cat.is_active ? "Clic para desactivar" : "Clic para activar"}
            >
              {cat.name}
            </span>
            
            <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 transition-opacity">
              <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => onStartAddSub(cat.id)} title="Agregar sub-rubro">
                <Plus className="h-3 w-3" />
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="icon" variant="ghost" className="h-6 w-6" title="Mover a otro rubro">
                    <MoveRight className="h-3 w-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="max-h-64 overflow-y-auto min-w-[200px]">
                  {targets.length === 0 ? (
                    <DropdownMenuItem disabled>No hay destinos disponibles</DropdownMenuItem>
                  ) : (
                    targets.map(target => (
                      <DropdownMenuItem
                        key={target.id ?? "root"}
                        onClick={() => onMove(cat.id, target.id)}
                        className="cursor-pointer"
                      >
                        <span className="flex items-center gap-1.5">
                          {target.id === null ? (
                            <Home className="h-3 w-3 text-muted-foreground" />
                          ) : (
                            <CornerDownRight className="h-3 w-3 text-muted-foreground" style={{ marginLeft: target.level * 8 }} />
                          )}
                          <span className="text-sm">{target.name}</span>
                        </span>
                      </DropdownMenuItem>
                    ))
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
              <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => onSetEditingId(cat.id)} title="Editar">
                <Pencil className="h-3 w-3" />
              </Button>
              <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive" onClick={() => onDelete(cat.id, hasChildren)} title="Eliminar">
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          </>
        )}
      </div>

      {/* Add sub-category input */}
      {isAddingHere && (
        <div className="flex items-center gap-2 p-2 bg-muted/50 rounded-md mt-1" style={{ marginLeft: (level + 1) * 24 }}>
          <Input
            value={newName}
            onChange={e => onSetNewName(e.target.value)}
            placeholder="Nombre del sub-rubro"
            className="h-7 text-sm"
            autoFocus
            onKeyDown={e => {
              if (e.key === "Enter") onAdd(cat.id);
              if (e.key === "Escape") onCancelAdd();
            }}
          />
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => onAdd(cat.id)}>
            <Check className="h-4 w-4 text-primary" />
          </Button>
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onCancelAdd}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
};

export const CategoryManager = () => {
  const [categories, setCategories] = useState<CategoryWithChildren[]>([]);
  const [flatCategories, setFlatCategories] = useState<SupplierCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [addingParentId, setAddingParentId] = useState<string | null>(null);
  const { expandedIds, toggle: toggleExpand, expandAll, collapseAll, expand } = useCollapsibleState("category-manager-expanded");
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 10 } }),
  );

  useEffect(() => {
    loadCategories();
  }, []);

  const buildTree = (flatCats: SupplierCategory[]): CategoryWithChildren[] => {
    const map = new Map<string, CategoryWithChildren>();
    const roots: CategoryWithChildren[] = [];

    flatCats.forEach(cat => map.set(cat.id, { ...cat, children: [] }));
    flatCats.forEach(cat => {
      const node = map.get(cat.id)!;
      if (cat.parent_id && map.has(cat.parent_id)) {
        map.get(cat.parent_id)!.children.push(node);
      } else {
        roots.push(node);
      }
    });

    const sortChildren = (nodes: CategoryWithChildren[]) => {
      nodes.sort((a, b) => a.display_order - b.display_order);
      nodes.forEach(n => sortChildren(n.children));
    };
    sortChildren(roots);
    return roots;
  };

  // Flatten the tree into a single visible list (respecting expanded state)
  const flatVisibleItems = useMemo((): FlatVisibleItem[] => {
    const result: FlatVisibleItem[] = [];
    const walk = (nodes: CategoryWithChildren[], level: number) => {
      for (const node of nodes) {
        const isExpanded = expandedIds.has(node.id);
        const hasChildren = node.children.length > 0;
        result.push({ id: node.id, cat: node, level, hasChildren, isExpanded });
        if (hasChildren && isExpanded) {
          walk(node.children, level + 1);
        }
      }
    };
    walk(categories, 0);
    return result;
  }, [categories, expandedIds]);

  const loadCategories = async () => {
    try {
      const { data, error } = await supabase
        .from("supplier_categories")
        .select("*")
        .order("display_order");
      if (error) throw error;
      const cats = data || [];
      setFlatCategories(cats);
      setCategories(buildTree(cats));
    } catch (error) {
      console.error("Error loading categories:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = async (parentId: string | null = null) => {
    if (!newName.trim()) return;
    
    const siblings = flatCategories.filter(c => c.parent_id === parentId);
    const maxOrder = siblings.length > 0 ? Math.max(...siblings.map(s => s.display_order)) : 0;
    const tempId = `temp-${Date.now()}`;
    
    const newCat: SupplierCategory = {
      id: tempId,
      name: newName.trim(),
      display_order: maxOrder + 1,
      parent_id: parentId,
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      description: null,
    };
    
    const updatedFlat = [...flatCategories, newCat];
    setFlatCategories(updatedFlat);
    setCategories(buildTree(updatedFlat));
    setNewName("");
    setIsAdding(false);
    setAddingParentId(null);
    
    try {
      const { data, error } = await supabase
        .from("supplier_categories")
        .insert({ name: newCat.name, display_order: newCat.display_order, parent_id: parentId })
        .select()
        .single();
      if (error) throw error;
      const finalFlat = updatedFlat.map(c => c.id === tempId ? { ...c, id: data.id } : c);
      setFlatCategories(finalFlat);
      setCategories(buildTree(finalFlat));
      toast.success(parentId ? "Sub-rubro creado" : "Rubro creado");
    } catch (error: any) {
      setFlatCategories(flatCategories);
      setCategories(buildTree(flatCategories));
      if (error.code === "23505") toast.error("Ya existe un rubro con ese nombre");
      else toast.error("Error al crear rubro");
    }
  };

  const handleUpdate = async (id: string, updatedName: string) => {
    if (!updatedName.trim()) return;
    const updatedFlat = flatCategories.map(c => c.id === id ? { ...c, name: updatedName.trim() } : c);
    setFlatCategories(updatedFlat);
    setCategories(buildTree(updatedFlat));
    setEditingId(null);
    try {
      const { error } = await supabase.from("supplier_categories").update({ name: updatedName.trim() }).eq("id", id);
      if (error) throw error;
      toast.success("Rubro actualizado");
    } catch (error: any) {
      setFlatCategories(flatCategories);
      setCategories(buildTree(flatCategories));
      setEditingId(id);
      if (error.code === "23505") toast.error("Ya existe un rubro con ese nombre");
      else toast.error("Error al actualizar rubro");
    }
  };

  const getDescendants = (parentId: string): string[] => {
    const children = flatCategories.filter(c => c.parent_id === parentId);
    return children.flatMap(c => [c.id, ...getDescendants(c.id)]);
  };

  const handleDelete = async (id: string, hasChildren: boolean) => {
    if (hasChildren && !confirm("Este rubro tiene sub-rubros. ¿Eliminar todos?")) return;
    const idsToRemove = [id, ...getDescendants(id)];
    const oldFlat = [...flatCategories];
    const updatedFlat = flatCategories.filter(c => !idsToRemove.includes(c.id));
    setFlatCategories(updatedFlat);
    setCategories(buildTree(updatedFlat));
    try {
      const { error } = await supabase.from("supplier_categories").delete().eq("id", id);
      if (error) throw error;
      toast.success("Rubro eliminado");
    } catch {
      setFlatCategories(oldFlat);
      setCategories(buildTree(oldFlat));
      toast.error("No se puede eliminar, hay proveedores o líneas asociadas");
    }
  };

  const handleToggleActive = async (category: SupplierCategory) => {
    const updatedFlat = flatCategories.map(c => c.id === category.id ? { ...c, is_active: !c.is_active } : c);
    setFlatCategories(updatedFlat);
    setCategories(buildTree(updatedFlat));
    try {
      const { error } = await supabase.from("supplier_categories").update({ is_active: !category.is_active }).eq("id", category.id);
      if (error) throw error;
    } catch {
      setFlatCategories(flatCategories);
      setCategories(buildTree(flatCategories));
      toast.error("Error al actualizar rubro");
    }
  };

  const startAddingSubCategory = (parentId: string) => {
    setAddingParentId(parentId);
    setIsAdding(true);
    setNewName("");
    expand(parentId);
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);
    if (!over || active.id === over.id) return;

    const draggedId = active.id as string;
    const targetId = over.id as string;
    const draggedCat = flatCategories.find(c => c.id === draggedId);
    const targetCat = flatCategories.find(c => c.id === targetId);
    if (!draggedCat || !targetCat) return;

    // Only reorder among siblings
    if (draggedCat.parent_id !== targetCat.parent_id) {
      toast.info("Usa el botón '→' para mover entre niveles");
      return;
    }

    const siblings = flatCategories
      .filter(c => c.parent_id === draggedCat.parent_id)
      .sort((a, b) => a.display_order - b.display_order);

    const oldIndex = siblings.findIndex(s => s.id === draggedId);
    const newIndex = siblings.findIndex(s => s.id === targetId);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(siblings, oldIndex, newIndex);

    const updatedFlat = flatCategories.map(cat => {
      const idx = reordered.findIndex(r => r.id === cat.id);
      if (idx !== -1) return { ...cat, display_order: idx + 1 };
      return cat;
    });
    setFlatCategories(updatedFlat);
    setCategories(buildTree(updatedFlat));

    try {
      await Promise.all(
        reordered.map((cat, index) =>
          supabase.from("supplier_categories").update({ display_order: index + 1 }).eq("id", cat.id)
        )
      );
    } catch {
      toast.error("Error al reordenar");
      loadCategories();
    }
  };

  const handleDragCancel = () => {
    setActiveId(null);
  };

  const handleMove = async (draggedId: string, targetId: string | null) => {
    const draggedCat = flatCategories.find(c => c.id === draggedId);
    if (!draggedCat) return;
    if (draggedCat.parent_id === targetId) return;
    if (targetId && getDescendants(draggedId).includes(targetId)) {
      toast.error("No puedes mover un rubro dentro de sus propios sub-rubros");
      return;
    }
    const newSiblings = flatCategories.filter(c => c.parent_id === targetId);
    const maxOrder = newSiblings.length > 0 ? Math.max(...newSiblings.map(s => s.display_order)) : 0;
    const updatedFlat = flatCategories.map(cat =>
      cat.id === draggedId ? { ...cat, parent_id: targetId, display_order: maxOrder + 1 } : cat
    );
    setFlatCategories(updatedFlat);
    setCategories(buildTree(updatedFlat));
    if (targetId) expand(targetId);
    const targetName = targetId ? flatCategories.find(c => c.id === targetId)?.name ?? "" : "raíz";
    try {
      const { error } = await supabase.from("supplier_categories").update({ parent_id: targetId, display_order: maxOrder + 1 }).eq("id", draggedId);
      if (error) throw error;
      toast.success(`"${draggedCat.name}" movido a ${targetName}`);
    } catch {
      toast.error("Error al mover rubro");
      loadCategories();
    }
  };

  const getMoveTargets = (catId: string): { id: string | null; name: string; level: number }[] => {
    const descendants = new Set(getDescendants(catId));
    const currentCat = flatCategories.find(c => c.id === catId);
    const targets: { id: string | null; name: string; level: number }[] = [];
    if (currentCat?.parent_id !== null) {
      targets.push({ id: null, name: "Raíz (sin padre)", level: 0 });
    }
    const addTargets = (nodes: CategoryWithChildren[], level: number) => {
      for (const node of nodes) {
        if (node.id !== catId && !descendants.has(node.id) && node.id !== currentCat?.parent_id) {
          targets.push({ id: node.id, name: node.name, level });
        }
        if (node.children.length > 0) addTargets(node.children, level + 1);
      }
    };
    addTargets(categories, 0);
    return targets;
  };

  const activeCat = activeId ? flatCategories.find(c => c.id === activeId) : null;
  const activeLevel = activeId ? flatVisibleItems.find(i => i.id === activeId)?.level ?? 0 : 0;

  if (loading) return <div className="animate-pulse h-20 bg-muted rounded" />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FolderTree className="h-4 w-4 text-muted-foreground" />
          <h4 className="font-medium text-sm">Rubros y Sub-Rubros</h4>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={() => expandAll(flatCategories.map(c => c.id))}>
            <ChevronsUpDown className="h-4 w-4 mr-1" /> Expandir
          </Button>
          <Button size="sm" variant="ghost" onClick={collapseAll}>
            <ChevronsDownUp className="h-4 w-4 mr-1" /> Colapsar
          </Button>
          {!isAdding && (
            <Button size="sm" variant="outline" onClick={() => { setIsAdding(true); setAddingParentId(null); }}>
              <Plus className="h-4 w-4 mr-1" /> Nuevo Rubro
            </Button>
          )}
        </div>
      </div>

      {isAdding && addingParentId === null && (
        <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg border border-dashed">
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
            <Check className="h-4 w-4 text-primary" />
          </Button>
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setIsAdding(false)}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <SortableContext items={flatVisibleItems.map(i => i.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-1">
            {flatVisibleItems.map(item => (
              <SortableCategoryRow
                key={item.id}
                item={item}
                editingId={editingId}
                isAdding={isAdding}
                addingParentId={addingParentId}
                newName={newName}
                onSetNewName={setNewName}
                onAdd={handleAdd}
                onUpdate={handleUpdate}
                onDelete={handleDelete}
                onToggleActive={handleToggleActive}
                onStartAddSub={startAddingSubCategory}
                onToggleExpand={toggleExpand}
                onSetEditingId={setEditingId}
                onCancelAdd={() => { setIsAdding(false); setAddingParentId(null); }}
                onMove={handleMove}
                getMoveTargets={getMoveTargets}
                dragDisabled={editingId !== null}
              />
            ))}
          </div>
        </SortableContext>

        <DragOverlay dropAnimation={null}>
          {activeCat && (
            <div 
              className="p-2 rounded-lg border bg-card shadow-xl opacity-90"
              style={{ marginLeft: activeLevel * 24 }}
            >
              <div className="flex items-center gap-2">
                <GripVertical className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">{activeCat.name}</span>
              </div>
            </div>
          )}
        </DragOverlay>
      </DndContext>

      {categories.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-4">
          No hay rubros definidos. Crea uno para comenzar.
        </p>
      )}
    </div>
  );
};
