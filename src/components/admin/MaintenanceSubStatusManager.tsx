import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Pencil, Trash2, ArrowUp, ArrowDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { invalidateSubStatusCache } from "@/hooks/useMaintenanceSubStatuses";

interface SubStatus {
  id: string;
  name: string;
  label: string;
  description: string | null;
  responsible: string | null;
  color: string | null;
  display_order: number;
  is_active: boolean;
}

const COLOR_OPTIONS = [
  { value: "blue", label: "Azul", className: "bg-blue-500" },
  { value: "green", label: "Verde", className: "bg-green-500" },
  { value: "yellow", label: "Amarillo", className: "bg-yellow-500" },
  { value: "red", label: "Rojo", className: "bg-red-500" },
  { value: "purple", label: "Morado", className: "bg-purple-500" },
  { value: "orange", label: "Naranja", className: "bg-orange-500" },
  { value: "gray", label: "Gris", className: "bg-gray-500" },
  { value: "teal", label: "Teal", className: "bg-teal-500" },
];

export function MaintenanceSubStatusManager() {
  const [statuses, setStatuses] = useState<SubStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<SubStatus | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<SubStatus | null>(null);
  const [saving, setSaving] = useState(false);

  const [formName, setFormName] = useState("");
  const [formLabel, setFormLabel] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formResponsible, setFormResponsible] = useState("");
  const [formColor, setFormColor] = useState("gray");

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from("maintenance_sub_statuses")
      .select("*")
      .eq("is_active", true)
      .order("display_order");
    if (!error) setStatuses(data || []);
    setLoading(false);
  };

  const openCreate = () => {
    setEditing(null);
    setFormName("");
    setFormLabel("");
    setFormDescription("");
    setFormResponsible("");
    setFormColor("gray");
    setDialogOpen(true);
  };

  const openEdit = (s: SubStatus) => {
    setEditing(s);
    setFormName(s.name);
    setFormLabel(s.label);
    setFormDescription(s.description || "");
    setFormResponsible(s.responsible || "");
    setFormColor(s.color || "gray");
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formLabel.trim()) { toast.error("El label es requerido"); return; }
    const name = formName.trim() || formLabel.trim().toLowerCase().replace(/\s+/g, "_").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    setSaving(true);
    try {
      if (editing) {
        const { error } = await (supabase as any)
          .from("maintenance_sub_statuses")
          .update({
            name,
            label: formLabel.trim(),
            description: formDescription.trim() || null,
            responsible: formResponsible.trim() || null,
            color: formColor,
          })
          .eq("id", editing.id);
        if (error) throw error;
        toast.success("Sub-estado actualizado");
      } else {
        const maxOrder = Math.max(0, ...statuses.map(s => s.display_order));
        const { error } = await (supabase as any)
          .from("maintenance_sub_statuses")
          .insert({
            name,
            label: formLabel.trim(),
            description: formDescription.trim() || null,
            responsible: formResponsible.trim() || null,
            color: formColor,
            display_order: maxOrder + 1,
          });
        if (error) throw error;
        toast.success("Sub-estado creado");
      }
      invalidateSubStatusCache();
      setDialogOpen(false);
      load();
    } catch (err: any) {
      toast.error(err.message || "Error al guardar");
    } finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    const { error } = await (supabase as any)
      .from("maintenance_sub_statuses")
      .update({ is_active: false })
      .eq("id", deleteConfirm.id);
    if (!error) {
      toast.success("Sub-estado eliminado");
      invalidateSubStatusCache();
      load();
    } else toast.error("Error al eliminar");
    setDeleteConfirm(null);
  };

  const moveOrder = async (s: SubStatus, direction: "up" | "down") => {
    const idx = statuses.findIndex(x => x.id === s.id);
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= statuses.length) return;
    const other = statuses[swapIdx];
    await Promise.all([
      (supabase as any).from("maintenance_sub_statuses").update({ display_order: other.display_order }).eq("id", s.id),
      (supabase as any).from("maintenance_sub_statuses").update({ display_order: s.display_order }).eq("id", other.id),
    ]);
    invalidateSubStatusCache();
    load();
  };

  const getColorDot = (color: string | null) => {
    const opt = COLOR_OPTIONS.find(c => c.value === color);
    return <span className={`inline-block w-3 h-3 rounded-full ${opt?.className || "bg-gray-500"}`} />;
  };

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-muted-foreground">
          Define los sub-estados del flujo de mantenciones. El orden determina la secuencia de avance.
        </p>
        <Button onClick={openCreate} size="sm">
          <Plus className="h-4 w-4 mr-2" />
          Nuevo sub-estado
        </Button>
      </div>

      {loading ? (
        <div className="text-center py-6 text-muted-foreground">Cargando...</div>
      ) : statuses.length === 0 ? (
        <div className="text-center py-6 text-muted-foreground">No hay sub-estados configurados</div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">Orden</TableHead>
              <TableHead className="w-10">Color</TableHead>
              <TableHead>Label</TableHead>
              <TableHead>Clave</TableHead>
              <TableHead>Responsable</TableHead>
              <TableHead>Descripción</TableHead>
              <TableHead className="w-[120px]">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {statuses.map((s, idx) => (
              <TableRow key={s.id}>
                <TableCell className="text-xs">
                  <div className="flex gap-0.5">
                    <Button variant="ghost" size="icon" className="h-6 w-6" disabled={idx === 0} onClick={() => moveOrder(s, "up")}>
                      <ArrowUp className="h-3 w-3" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-6 w-6" disabled={idx === statuses.length - 1} onClick={() => moveOrder(s, "down")}>
                      <ArrowDown className="h-3 w-3" />
                    </Button>
                  </div>
                </TableCell>
                <TableCell>{getColorDot(s.color)}</TableCell>
                <TableCell className="font-medium">{s.label}</TableCell>
                <TableCell className="text-xs text-muted-foreground font-mono">{s.name}</TableCell>
                <TableCell className="text-xs">{s.responsible || "—"}</TableCell>
                <TableCell className="text-xs max-w-48 truncate">{s.description || "—"}</TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(s)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => setDeleteConfirm(s)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Editar Sub-Estado" : "Nuevo Sub-Estado"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Label (nombre visible) *</Label>
              <Input value={formLabel} onChange={e => setFormLabel(e.target.value)} placeholder="Ej: Pre Aprobado" />
            </div>
            <div className="space-y-2">
              <Label>Clave interna</Label>
              <Input value={formName} onChange={e => setFormName(e.target.value)} placeholder="Se genera automáticamente si se deja vacío" className="font-mono text-sm" />
              <p className="text-xs text-muted-foreground">Identificador único (sin espacios). Si se deja vacío, se genera del label.</p>
            </div>
            <div className="space-y-2">
              <Label>Descripción</Label>
              <Textarea value={formDescription} onChange={e => setFormDescription(e.target.value)} placeholder="Descripción del paso..." rows={2} />
            </div>
            <div className="space-y-2">
              <Label>Responsable</Label>
              <Input value={formResponsible} onChange={e => setFormResponsible(e.target.value)} placeholder="Ej: Jefe Mantenciones" />
            </div>
            <div className="space-y-2">
              <Label>Color</Label>
              <Select value={formColor} onValueChange={setFormColor}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {COLOR_OPTIONS.map(c => (
                    <SelectItem key={c.value} value={c.value}>
                      <span className="flex items-center gap-2">
                        <span className={`w-3 h-3 rounded-full ${c.className}`} />
                        {c.label}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
            <AlertDialogTitle>¿Eliminar sub-estado?</AlertDialogTitle>
            <AlertDialogDescription>
              Se desactivará el sub-estado "{deleteConfirm?.label}". Los FORMs que ya lo tengan asignado lo conservarán.
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
