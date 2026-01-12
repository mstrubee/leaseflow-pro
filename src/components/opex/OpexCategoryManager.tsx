import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Pencil, Trash2, X, Check, GripVertical } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  closestCenter,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Settings } from "lucide-react";

interface OpexCategory {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  display_order: number;
}

interface OpexCategoryManagerProps {
  onCategoryChange?: () => void;
}

// Sortable Category Item
const SortableCategoryItem = ({
  category,
  isEditing,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onToggleActive,
  onDelete,
}: {
  category: OpexCategory;
  isEditing: boolean;
  onStartEdit: () => void;
  onSaveEdit: (name: string) => void;
  onCancelEdit: () => void;
  onToggleActive: () => void;
  onDelete: () => void;
}) => {
  const [editName, setEditName] = useState(category.name);
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: category.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  useEffect(() => {
    if (isEditing) {
      setEditName(category.name);
    }
  }, [isEditing, category.name]);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "group flex items-center gap-3 p-3 rounded-lg border bg-card transition-all",
        isDragging && "opacity-50 shadow-lg",
        !category.is_active && "opacity-60 bg-muted"
      )}
    >
      {/* Drag handle */}
      <button
        {...attributes}
        {...listeners}
        className="p-1 rounded cursor-grab active:cursor-grabbing hover:bg-accent/50"
        title="Arrastrar para reordenar"
      >
        <GripVertical className="h-4 w-4 text-muted-foreground" />
      </button>

      {/* Name / Edit */}
      {isEditing ? (
        <div className="flex items-center gap-2 flex-1">
          <Input
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            className="h-8"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") onSaveEdit(editName);
              if (e.key === "Escape") onCancelEdit();
            }}
          />
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => onSaveEdit(editName)}>
            <Check className="h-4 w-4 text-green-600" />
          </Button>
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={onCancelEdit}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        <>
          <span className={cn("flex-1 font-medium", !category.is_active && "line-through text-muted-foreground")}>
            {category.name}
          </span>
          
          {!category.is_active && (
            <Badge variant="secondary" className="text-xs">Inactiva</Badge>
          )}

          <div className="opacity-0 group-hover:opacity-100 flex items-center gap-2 transition-opacity">
            <Switch
              checked={category.is_active}
              onCheckedChange={onToggleActive}
              title={category.is_active ? "Desactivar" : "Activar"}
            />
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={onStartEdit}>
              <Pencil className="h-4 w-4" />
            </Button>
            <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:text-destructive" onClick={onDelete}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </>
      )}
    </div>
  );
};

export const OpexCategoryManager = ({ onCategoryChange }: OpexCategoryManagerProps) => {
  const [open, setOpen] = useState(false);
  const [categories, setCategories] = useState<OpexCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<OpexCategory | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  useEffect(() => {
    if (open) {
      loadCategories();
    }
  }, [open]);

  const loadCategories = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("opex_categories")
        .select("*")
        .order("display_order");
      if (error) throw error;
      setCategories(data || []);
    } catch (error) {
      console.error("Error loading categories:", error);
      toast.error("Error al cargar categorías");
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = async () => {
    if (!newName.trim()) return;

    const maxOrder = categories.length > 0 ? Math.max(...categories.map((c) => c.display_order || 0)) : 0;

    try {
      const { data, error } = await supabase
        .from("opex_categories")
        .insert({
          name: newName.trim(),
          display_order: maxOrder + 1,
        })
        .select()
        .single();

      if (error) throw error;

      setCategories([...categories, data]);
      setNewName("");
      setIsAdding(false);
      toast.success("Categoría creada");
      onCategoryChange?.();
    } catch (error: any) {
      if (error.code === "23505") {
        toast.error("Ya existe una categoría con ese nombre");
      } else {
        toast.error("Error al crear categoría");
      }
    }
  };

  const handleUpdate = async (id: string, newName: string) => {
    if (!newName.trim()) return;

    try {
      const { error } = await supabase
        .from("opex_categories")
        .update({ name: newName.trim() })
        .eq("id", id);

      if (error) throw error;

      setCategories(categories.map((c) => (c.id === id ? { ...c, name: newName.trim() } : c)));
      setEditingId(null);
      toast.success("Categoría actualizada");
      onCategoryChange?.();
    } catch (error: any) {
      if (error.code === "23505") {
        toast.error("Ya existe una categoría con ese nombre");
      } else {
        toast.error("Error al actualizar categoría");
      }
    }
  };

  const handleToggleActive = async (category: OpexCategory) => {
    try {
      const { error } = await supabase
        .from("opex_categories")
        .update({ is_active: !category.is_active })
        .eq("id", category.id);

      if (error) throw error;

      setCategories(categories.map((c) => (c.id === category.id ? { ...c, is_active: !c.is_active } : c)));
      onCategoryChange?.();
    } catch (error) {
      toast.error("Error al actualizar categoría");
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;

    try {
      // Instead of deleting, we'll just deactivate
      // This preserves historical data
      const { error } = await supabase
        .from("opex_categories")
        .update({ is_active: false })
        .eq("id", deleteConfirm.id);

      if (error) throw error;

      setCategories(categories.map((c) => (c.id === deleteConfirm.id ? { ...c, is_active: false } : c)));
      setDeleteConfirm(null);
      toast.success("Categoría desactivada (preservada en históricos)");
      onCategoryChange?.();
    } catch (error) {
      toast.error("Error al eliminar categoría");
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = categories.findIndex((c) => c.id === active.id);
    const newIndex = categories.findIndex((c) => c.id === over.id);

    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = [...categories];
    const [removed] = reordered.splice(oldIndex, 1);
    reordered.splice(newIndex, 0, removed);

    // Update display order
    const updated = reordered.map((cat, index) => ({
      ...cat,
      display_order: index + 1,
    }));

    setCategories(updated);

    try {
      await Promise.all(
        updated.map((cat) =>
          supabase
            .from("opex_categories")
            .update({ display_order: cat.display_order })
            .eq("id", cat.id)
        )
      );
    } catch (error) {
      toast.error("Error al reordenar");
      loadCategories();
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm">
            <Settings className="h-4 w-4 mr-2" />
            Categorías
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Gestionar Categorías OPEX</DialogTitle>
            <DialogDescription>
              Crear, editar o desactivar categorías. Los cambios aplican a todos los años.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Add new category */}
            {isAdding ? (
              <div className="flex items-center gap-2 p-3 border rounded-lg bg-muted/50">
                <Input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Nombre de la categoría"
                  className="h-8"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleAdd();
                    if (e.key === "Escape") {
                      setIsAdding(false);
                      setNewName("");
                    }
                  }}
                />
                <Button size="sm" onClick={handleAdd} disabled={!newName.trim()}>
                  Crear
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setIsAdding(false);
                    setNewName("");
                  }}
                >
                  Cancelar
                </Button>
              </div>
            ) : (
              <Button variant="outline" className="w-full" onClick={() => setIsAdding(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Nueva Categoría
              </Button>
            )}

            {/* Category list */}
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
              </div>
            ) : categories.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No hay categorías. Crea la primera.
              </div>
            ) : (
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={categories.map((c) => c.id)} strategy={verticalListSortingStrategy}>
                  <div className="space-y-2">
                    {categories.map((category) => (
                      <SortableCategoryItem
                        key={category.id}
                        category={category}
                        isEditing={editingId === category.id}
                        onStartEdit={() => setEditingId(category.id)}
                        onSaveEdit={(name) => handleUpdate(category.id, name)}
                        onCancelEdit={() => setEditingId(null)}
                        onToggleActive={() => handleToggleActive(category)}
                        onDelete={() => setDeleteConfirm(category)}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Desactivar categoría?</AlertDialogTitle>
            <AlertDialogDescription>
              La categoría "{deleteConfirm?.name}" será desactivada. Los datos históricos se mantendrán, 
              pero no estará disponible para nuevos presupuestos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Desactivar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
