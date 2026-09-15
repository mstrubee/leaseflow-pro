import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Pencil, Trash2, ArrowUp, ArrowDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface CapexAvanceStatusType {
  id: string;
  name: string;
  color: string;
  display_order: number;
  is_active: boolean;
}

const COLOR_OPTIONS = [
  { value: "green", label: "Verde", className: "bg-green-500" },
  { value: "red", label: "Rojo", className: "bg-red-500" },
  { value: "blue", label: "Azul", className: "bg-blue-500" },
  { value: "yellow", label: "Amarillo", className: "bg-yellow-500" },
  { value: "purple", label: "Morado", className: "bg-purple-500" },
  { value: "orange", label: "Naranja", className: "bg-orange-500" },
  { value: "gray", label: "Gris", className: "bg-gray-500" },
];

/**
 * "Estado Avance CAPEX" (En Curso/Terminado/Programado, etc.) -- el "name"
 * de cada estado es el mismo texto que se guarda en
 * contracts.capex_avance_status, así que renombrar un estado cambia lo que
 * ven los contratos que ya lo tenían asignado (no hay una capa de id
 * intermedia, igual que comite_gp_status).
 */
export function CapexAvanceStatusManager() {
  const [types, setTypes] = useState<CapexAvanceStatusType[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<CapexAvanceStatusType | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<CapexAvanceStatusType | null>(null);
  const [formName, setFormName] = useState("");
  const [formColor, setFormColor] = useState("gray");
  const [saving, setSaving] = useState(false);

  useEffect(() => { loadTypes(); }, []);

  const loadTypes = async () => {
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from("capex_avance_status_types")
      .select("*")
      .eq("is_active", true)
      .order("display_order");
    if (!error) setTypes(data || []);
    setLoading(false);
  };

  const openCreate = () => {
    setEditing(null);
    setFormName("");
    setFormColor("gray");
    setDialogOpen(true);
  };

  const openEdit = (t: CapexAvanceStatusType) => {
    setEditing(t);
    setFormName(t.name);
    setFormColor(t.color);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formName.trim()) { toast.error("El nombre es requerido"); return; }
    setSaving(true);
    try {
      if (editing) {
        const { error } = await (supabase as any).from("capex_avance_status_types")
          .update({ name: formName.trim(), color: formColor, updated_at: new Date().toISOString() })
          .eq("id", editing.id);
        if (error) throw error;
        toast.success("Estado actualizado");
      } else {
        const maxOrder = Math.max(0, ...types.map(t => t.display_order));
        const { error } = await (supabase as any).from("capex_avance_status_types")
          .insert({ name: formName.trim(), color: formColor, display_order: maxOrder + 1 });
        if (error) throw error;
        toast.success("Estado creado");
      }
      setDialogOpen(false);
      loadTypes();
    } catch (err: any) {
      toast.error(err.message || "Error al guardar");
    } finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    const { error } = await (supabase as any).from("capex_avance_status_types")
      .update({ is_active: false })
      .eq("id", deleteConfirm.id);
    if (!error) { toast.success("Estado eliminado"); loadTypes(); }
    else toast.error("Error al eliminar");
    setDeleteConfirm(null);
  };

  const moveOrder = async (t: CapexAvanceStatusType, direction: "up" | "down") => {
    const idx = types.findIndex(x => x.id === t.id);
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= types.length) return;
    const other = types[swapIdx];
    await Promise.all([
      (supabase as any).from("capex_avance_status_types").update({ display_order: other.display_order }).eq("id", t.id),
      (supabase as any).from("capex_avance_status_types").update({ display_order: t.display_order }).eq("id", other.id),
    ]);
    loadTypes();
  };

  const getColorDot = (color: string) => {
    const opt = COLOR_OPTIONS.find(c => c.value === color);
    return <span className={`inline-block w-3 h-3 rounded-full ${opt?.className || 'bg-gray-500'}`} />;
  };

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-muted-foreground">
          Define los estados de avance disponibles para el CAPEX de cada contrato (En Curso, Terminado, Programado, etc.).
        </p>
        <Button onClick={openCreate} size="sm">
          <Plus className="h-4 w-4 mr-2" />
          Nuevo estado
        </Button>
      </div>

      {loading ? (
        <div className="text-center py-6 text-muted-foreground">Cargando...</div>
      ) : types.length === 0 ? (
        <div className="text-center py-6 text-muted-foreground">No hay estados configurados</div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-20">Orden</TableHead>
              <TableHead>Color</TableHead>
              <TableHead>Nombre</TableHead>
              <TableHead className="w-[100px]">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {types.map((t, idx) => (
              <TableRow key={t.id}>
                <TableCell>
                  <div className="flex gap-0.5">
                    <Button variant="ghost" size="icon" className="h-6 w-6" disabled={idx === 0} onClick={() => moveOrder(t, "up")}>
                      <ArrowUp className="h-3 w-3" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-6 w-6" disabled={idx === types.length - 1} onClick={() => moveOrder(t, "down")}>
                      <ArrowDown className="h-3 w-3" />
                    </Button>
                  </div>
                </TableCell>
                <TableCell>{getColorDot(t.color)}</TableCell>
                <TableCell className="font-medium">{t.name}</TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(t)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => setDeleteConfirm(t)}>
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
            <DialogTitle>{editing ? "Editar Estado de Avance" : "Nuevo Estado de Avance"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Nombre *</Label>
              <Input value={formName} onChange={e => setFormName(e.target.value)} placeholder="Ej: En Curso" />
            </div>
            <div className="space-y-2">
              <Label>Color</Label>
              <Select value={formColor} onValueChange={setFormColor}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
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
            <AlertDialogTitle>¿Eliminar estado?</AlertDialogTitle>
            <AlertDialogDescription>
              Se desactivará el estado "{deleteConfirm?.name}". Los contratos que ya lo tengan asignado lo conservarán.
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
