import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2, Tag } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface AlertCategory {
  id: string;
  name: string;
  code: string;
  description: string | null;
  display_order: number;
  is_system: boolean;
  is_active: boolean;
}

export function AlertCategoryManager() {
  const [categories, setCategories] = useState<AlertCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<AlertCategory | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<AlertCategory | null>(null);
  
  // Form state
  const [formName, setFormName] = useState("");
  const [formCode, setFormCode] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadCategories();
  }, []);

  const loadCategories = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("alert_categories")
        .select("*")
        .eq("is_active", true)
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

  const openCreateDialog = () => {
    setEditingCategory(null);
    setFormName("");
    setFormCode("");
    setFormDescription("");
    setDialogOpen(true);
  };

  const openEditDialog = (category: AlertCategory) => {
    setEditingCategory(category);
    setFormName(category.name);
    setFormCode(category.code);
    setFormDescription(category.description || "");
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formName.trim() || !formCode.trim()) {
      toast.error("Nombre y código son requeridos");
      return;
    }

    setSaving(true);
    try {
      if (editingCategory) {
        const { error } = await supabase
          .from("alert_categories")
          .update({
            name: formName.trim(),
            code: formCode.trim().toLowerCase().replace(/\s+/g, '_'),
            description: formDescription.trim() || null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", editingCategory.id);

        if (error) throw error;
        toast.success("Categoría actualizada");
      } else {
        const maxOrder = Math.max(0, ...categories.map(c => c.display_order));
        const { error } = await supabase
          .from("alert_categories")
          .insert({
            name: formName.trim(),
            code: formCode.trim().toLowerCase().replace(/\s+/g, '_'),
            description: formDescription.trim() || null,
            display_order: maxOrder + 1,
            is_system: false,
          });

        if (error) throw error;
        toast.success("Categoría creada");
      }

      setDialogOpen(false);
      loadCategories();
    } catch (error: any) {
      console.error("Error saving category:", error);
      toast.error(error.message || "Error al guardar categoría");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;

    try {
      const { error } = await supabase
        .from("alert_categories")
        .update({ is_active: false })
        .eq("id", deleteConfirm.id);

      if (error) throw error;
      toast.success("Categoría eliminada");
      setDeleteConfirm(null);
      loadCategories();
    } catch (error: any) {
      console.error("Error deleting category:", error);
      toast.error(error.message || "Error al eliminar categoría");
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Tag className="h-5 w-5" />
            Categorías de Alertas
          </CardTitle>
          <Button onClick={openCreateDialog} size="sm">
            <Plus className="h-4 w-4 mr-2" />
            Nueva categoría
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="text-center py-8 text-muted-foreground">Cargando...</div>
        ) : categories.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No hay categorías configuradas
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Código</TableHead>
                <TableHead>Descripción</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead className="w-[100px]">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {categories.map((category) => (
                <TableRow key={category.id}>
                  <TableCell className="font-medium">{category.name}</TableCell>
                  <TableCell>
                    <code className="text-xs bg-muted px-1 py-0.5 rounded">
                      {category.code}
                    </code>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {category.description || "-"}
                  </TableCell>
                  <TableCell>
                    {category.is_system ? (
                      <Badge variant="secondary">Sistema</Badge>
                    ) : (
                      <Badge variant="outline">Personalizada</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openEditDialog(category)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      {!category.is_system && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setDeleteConfirm(category)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingCategory ? "Editar Categoría" : "Nueva Categoría"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Nombre *</Label>
              <Input
                id="name"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="Ej: Alertas de Mantenimiento"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="code">Código *</Label>
              <Input
                id="code"
                value={formCode}
                onChange={(e) => setFormCode(e.target.value)}
                placeholder="Ej: maintenance_alerts"
                disabled={editingCategory?.is_system}
              />
              {editingCategory?.is_system && (
                <p className="text-xs text-muted-foreground">
                  No se puede modificar el código de categorías del sistema
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Descripción</Label>
              <Input
                id="description"
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                placeholder="Descripción opcional"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Guardando..." : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar categoría?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción desactivará la categoría "{deleteConfirm?.name}". Las alertas existentes conservarán su categoría.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
