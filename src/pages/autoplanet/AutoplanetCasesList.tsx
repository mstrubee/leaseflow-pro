import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, Plus, Trash2, Briefcase } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useAuth } from "@/hooks/useAuth";
import { useAutoplanetCases, type AutoplanetCaseSummary } from "@/hooks/useAutoplanetCase";
import { fmtMM, fmtPct } from "@/lib/businessCase/format";

const AutoplanetCasesList = () => {
  const navigate = useNavigate();
  const { isAdmin, hasPermission } = useAuth();
  const canEdit = hasPermission("autoplanet_servicios", "edit");
  const { cases, loading, error, create, remove } = useAutoplanetCases();

  const [newOpen, setNewOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [toDelete, setToDelete] = useState<AutoplanetCaseSummary | null>(null);

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) return;
    setCreating(true);
    try {
      const id = await create(name);
      setNewOpen(false);
      setNewName("");
      if (id) navigate(`/autoplanet/casos-de-negocio/${id}`);
    } catch {
      toast.error("No se pudo crear el caso de negocio");
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async () => {
    if (!toDelete) return;
    try {
      await remove(toDelete.id);
      toast.success("Caso eliminado");
    } catch {
      toast.error("No se pudo eliminar el caso");
    } finally {
      setToDelete(null);
    }
  };

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Casos de negocio</h1>
          <p className="text-sm text-muted-foreground">Business Case Financiero de Autoplanet Servicios.</p>
        </div>
        {canEdit && (
          <Button onClick={() => setNewOpen(true)} className="gap-2"><Plus className="h-4 w-4" /> Nuevo caso</Button>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : error ? (
        <p className="text-sm text-destructive">No se pudieron cargar los casos: {error}</p>
      ) : cases.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center text-muted-foreground">
          <Briefcase className="h-8 w-8 mx-auto mb-2" />
          <p className="text-sm">Aún no hay casos de negocio.{canEdit ? " Crea el primero con «Nuevo caso»." : ""}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {cases.map((c) => (
            <div
              key={c.id}
              role="button"
              tabIndex={0}
              onClick={() => navigate(`/autoplanet/casos-de-negocio/${c.id}`)}
              onKeyDown={(e) => { if (e.key === "Enter") navigate(`/autoplanet/casos-de-negocio/${c.id}`); }}
              className="flex items-center gap-4 rounded-lg border p-4 cursor-pointer hover:border-primary/40 hover:shadow-sm transition"
            >
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{c.name}</p>
                <p className="text-xs text-muted-foreground">Actualizado {new Date(c.updated_at).toLocaleDateString("es-CL")}</p>
              </div>
              {c.computed?.totalCapex != null && (
                <div className="hidden sm:flex gap-6 text-xs text-right">
                  <div><p className="text-muted-foreground">Inversión</p><p className="font-semibold">${fmtMM(c.computed.totalCapex)} MM</p></div>
                  <div><p className="text-muted-foreground">VAN</p><p className="font-semibold">${fmtMM(c.computed.van ?? 0)} MM</p></div>
                  <div><p className="text-muted-foreground">TIR</p><p className="font-semibold">{c.computed.tir != null ? fmtPct(c.computed.tir) : "N/A"}</p></div>
                </div>
              )}
              {isAdmin && (
                <Button variant="ghost" size="icon" title="Eliminar caso" onClick={(e) => { e.stopPropagation(); setToDelete(c); }}>
                  <Trash2 className="h-4 w-4 text-muted-foreground" />
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Nuevo caso de negocio</DialogTitle></DialogHeader>
          <Input
            autoFocus
            placeholder="Nombre (ej: Taller Providencia)"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); }}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewOpen(false)} disabled={creating}>Cancelar</Button>
            <Button onClick={handleCreate} disabled={creating || !newName.trim()}>
              {creating && <Loader2 className="h-4 w-4 animate-spin mr-1" />} Crear
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!toDelete} onOpenChange={(o) => { if (!o) setToDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar «{toDelete?.name}»?</AlertDialogTitle>
            <AlertDialogDescription>Se elimina el caso de negocio completo. Esta acción no se puede deshacer.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default AutoplanetCasesList;
