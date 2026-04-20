import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { PROGRESS_COLOR_OPTIONS, getProgressColorClass, type BudgetProgressStatus } from "@/hooks/useBudgetProgressStatuses";

export function BudgetProgressStatusManager() {
  const [statuses, setStatuses] = useState<BudgetProgressStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<BudgetProgressStatus | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<BudgetProgressStatus | null>(null);
  const [formName, setFormName] = useState("");
  const [formColor, setFormColor] = useState("gray");
  const [formSelectable, setFormSelectable] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from("budget_line_progress_statuses")
      .select("*")
      .eq("is_active", true)
      .order("display_order");
    if (!error) setStatuses((data as BudgetProgressStatus[]) || []);
    setLoading(false);
  };

  const openCreate = () => {
    setEditing(null);
    setFormName(""); setFormColor("gray"); setFormSelectable(true);
    setDialogOpen(true);
  };

  const openEdit = (s: BudgetProgressStatus) => {
    setEditing(s);
    setFormName(s.name); setFormColor(s.color); setFormSelectable(s.is_selectable);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formName.trim()) { toast.error("El nombre es requerido"); return; }
    setSaving(true);
    try {
      if (editing) {
        const { error } = await (supabase as any).from("budget_line_progress_statuses")
          .update({ name: formName.trim(), color: formColor, is_selectable: formSelectable, updated_at: new Date().toISOString() })
          .eq("id", editing.id);
        if (error) throw error;
        toast.success("Estado actualizado");
      } else {
        const maxOrder = Math.max(0, ...statuses.map(s => s.display_order));
        const { error } = await (supabase as any).from("budget_line_progress_statuses")
          .insert({ name: formName.trim(), color: formColor, is_selectable: formSelectable, display_order: maxOrder + 1 });
        if (error) throw error;
        toast.success("Estado creado");
      }
      setDialogOpen(false);
      load();
    } catch (err: any) {
      toast.error(err.message || "Error al guardar");
    } finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    const { error } = await (supabase as any).from("budget_line_progress_statuses")
      .update({ is_active: false }).eq("id", deleteConfirm.id);
    if (!error) { toast.success("Estado eliminado"); load(); }
    else toast.error("Error al eliminar");
    setDeleteConfirm(null);
  };

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-muted-foreground">
          Estados de avance para líneas de presupuesto. Los seleccionables se pueden cambiar manualmente desde el árbol; los dependientes los asigna el sistema.
        </p>
        <Button onClick={openCreate} size="sm"><Plus className="h-4 w-4 mr-2" />Nuevo estado</Button>
      </div>

      {loading ? (
        <div className="text-center py-6 text-muted-foreground">Cargando...</div>
      ) : statuses.length === 0 ? (
        <div className="text-center py-6 text-muted-foreground">No hay estados configurados</div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Vista previa</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead className="w-[100px]">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {statuses.map(s => (
              <TableRow key={s.id}>
                <TableCell>
                  <Badge className={getProgressColorClass(s.color)}>{s.name}</Badge>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {s.is_selectable ? "Seleccionable" : "Dependiente (auto)"}
                </TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(s)}><Pencil className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => setDeleteConfirm(s)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? "Editar Estado" : "Nuevo Estado"}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Nombre *</Label>
              <Input value={formName} onChange={e => setFormName(e.target.value)} placeholder="Ej: Sin Cotización" />
            </div>
            <div className="space-y-2">
              <Label>Color</Label>
              <Select value={formColor} onValueChange={setFormColor}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PROGRESS_COLOR_OPTIONS.map(c => (
                    <SelectItem key={c.value} value={c.value}>
                      <span className="flex items-center gap-2">
                        <span className={`w-3 h-3 rounded-full ${c.className.split(" ")[0]}`} />
                        {c.label}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div className="space-y-0.5">
                <Label>Seleccionable manualmente</Label>
                <p className="text-xs text-muted-foreground">Si está apagado, el estado solo se asigna automáticamente por el sistema.</p>
              </div>
              <Switch checked={formSelectable} onCheckedChange={setFormSelectable} />
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
            <AlertDialogTitle>¿Eliminar estado?</AlertDialogTitle>
            <AlertDialogDescription>
              Se desactivará "{deleteConfirm?.name}". Las líneas que ya lo tengan asignado lo conservarán.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
