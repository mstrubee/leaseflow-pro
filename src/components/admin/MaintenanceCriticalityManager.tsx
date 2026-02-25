import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface CriticalityCategory {
  id: string;
  name: string;
  code: string;
  description: string | null;
  color: string | null;
  display_order: number;
  is_active: boolean;
}

export function MaintenanceCriticalityManager() {
  const [categories, setCategories] = useState<CriticalityCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<CriticalityCategory | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<CriticalityCategory | null>(null);

  const [formName, setFormName] = useState("");
  const [formCode, setFormCode] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formColor, setFormColor] = useState("#6b7280");
  const [saving, setSaving] = useState(false);

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from("maintenance_criticality_categories")
      .select("*")
      .eq("is_active", true)
      .order("display_order");
    if (error) { console.error(error); toast.error("Error al cargar criticidades"); }
    else setCategories(data || []);
    setLoading(false);
  };

  const openCreate = () => {
    setEditing(null);
    setFormName(""); setFormCode(""); setFormDescription(""); setFormColor("#6b7280");
    setDialogOpen(true);
  };

  const openEdit = (c: CriticalityCategory) => {
    setEditing(c);
    setFormName(c.name); setFormCode(c.code); setFormDescription(c.description || ""); setFormColor(c.color || "#6b7280");
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formName.trim() || !formCode.trim()) { toast.error("Nombre y código son requeridos"); return; }
    setSaving(true);
    try {
      const code = formCode.trim().toLowerCase().replace(/\s+/g, "_");
      if (editing) {
        const { error } = await (supabase as any)
          .from("maintenance_criticality_categories")
          .update({ name: formName.trim(), code, description: formDescription.trim() || null, color: formColor, updated_at: new Date().toISOString() })
          .eq("id", editing.id);
        if (error) throw error;
        toast.success("Criticidad actualizada");
      } else {
        const maxOrder = Math.max(0, ...categories.map(c => c.display_order));
        const { error } = await (supabase as any)
          .from("maintenance_criticality_categories")
          .insert({ name: formName.trim(), code, description: formDescription.trim() || null, color: formColor, display_order: maxOrder + 1 });
        if (error) throw error;
        toast.success("Criticidad creada");
      }
      setDialogOpen(false);
      load();
    } catch (e: any) { toast.error(e.message || "Error al guardar"); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    try {
      const { error } = await (supabase as any)
        .from("maintenance_criticality_categories")
        .update({ is_active: false })
        .eq("id", deleteConfirm.id);
      if (error) throw error;
      toast.success("Criticidad eliminada");
      setDeleteConfirm(null);
      load();
    } catch (e: any) { toast.error(e.message || "Error al eliminar"); }
  };

  return (
    <div>
      <div className="flex justify-end mb-4">
        <Button onClick={openCreate} size="sm"><Plus className="h-4 w-4 mr-2" />Nueva criticidad</Button>
      </div>

      {loading ? (
        <div className="text-center py-8 text-muted-foreground">Cargando...</div>
      ) : categories.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">No hay criticidades configuradas</div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Código</TableHead>
              <TableHead>Descripción</TableHead>
              <TableHead>Color</TableHead>
              <TableHead className="w-[100px]">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {categories.map(c => (
              <TableRow key={c.id}>
                <TableCell className="font-medium">{c.name}</TableCell>
                <TableCell><code className="text-xs bg-muted px-1 py-0.5 rounded">{c.code}</code></TableCell>
                <TableCell className="text-muted-foreground text-sm">{c.description || "-"}</TableCell>
                <TableCell>
                  <Badge style={{ backgroundColor: c.color || "#6b7280", color: "#fff" }}>{c.name}</Badge>
                </TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(c)}><Pencil className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => setDeleteConfirm(c)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? "Editar Criticidad" : "Nueva Criticidad"}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Nombre *</Label>
              <Input value={formName} onChange={e => setFormName(e.target.value)} placeholder="Ej: Alta" />
            </div>
            <div className="space-y-2">
              <Label>Código *</Label>
              <Input value={formCode} onChange={e => setFormCode(e.target.value)} placeholder="Ej: alta" />
            </div>
            <div className="space-y-2">
              <Label>Descripción</Label>
              <Input value={formDescription} onChange={e => setFormDescription(e.target.value)} placeholder="Descripción opcional" />
            </div>
            <div className="space-y-2">
              <Label>Color</Label>
              <div className="flex items-center gap-3">
                <input type="color" value={formColor} onChange={e => setFormColor(e.target.value)} className="w-10 h-10 rounded cursor-pointer border-0" />
                <Badge style={{ backgroundColor: formColor, color: "#fff" }}>{formName || "Preview"}</Badge>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? "Guardando..." : "Guardar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar criticidad?</AlertDialogTitle>
            <AlertDialogDescription>Se desactivará "{deleteConfirm?.name}". Los formularios existentes conservarán su criticidad.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
