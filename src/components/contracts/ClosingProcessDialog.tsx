import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
import { toast } from "sonner";
import { Loader2, Trash2, Bell, Plus, Clock } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";

interface ClosingNote {
  id: string;
  note: string;
  created_at: string;
  created_by: string | null;
}

interface ClosingProcessDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contractId: string;
  contractName: string;
  onNotesChange: () => void;
}

export function ClosingProcessDialog({
  open,
  onOpenChange,
  contractId,
  contractName,
  onNotesChange,
}: ClosingProcessDialogProps) {
  const [notes, setNotes] = useState<ClosingNote[]>([]);
  const [newNote, setNewNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingNotes, setLoadingNotes] = useState(true);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // Alert creation state
  const [showAlertForm, setShowAlertForm] = useState<string | null>(null);
  const [alertTitle, setAlertTitle] = useState("");
  const [alertDueDate, setAlertDueDate] = useState("");

  useEffect(() => {
    if (open) {
      loadNotes();
    }
  }, [open, contractId]);

  const loadNotes = async () => {
    setLoadingNotes(true);
    try {
      const { data, error } = await supabase
        .from("closing_process_notes")
        .select("*")
        .eq("contract_id", contractId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setNotes(data || []);
    } catch (error: any) {
      console.error("Error loading closing notes:", error);
    } finally {
      setLoadingNotes(false);
    }
  };

  const handleAddNote = async () => {
    if (!newNote.trim()) return;
    setLoading(true);
    try {
      const { error } = await supabase
        .from("closing_process_notes")
        .insert({
          contract_id: contractId,
          note: newNote.trim(),
          created_by: (await supabase.auth.getUser()).data.user?.id || null,
        });

      if (error) throw error;

      toast.success("Nota agregada");
      setNewNote("");
      loadNotes();
      onNotesChange();
    } catch (error: any) {
      toast.error("Error al agregar nota", { description: error.message });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteNote = async () => {
    if (!deleteId) return;
    try {
      const { error } = await supabase
        .from("closing_process_notes")
        .delete()
        .eq("id", deleteId);

      if (error) throw error;

      toast.success("Nota eliminada");
      setDeleteId(null);
      loadNotes();
      onNotesChange();
    } catch (error: any) {
      toast.error("Error al eliminar nota", { description: error.message });
    }
  };

  const handleCreateAlert = async (noteText: string) => {
    if (!alertTitle.trim() || !alertDueDate) return;
    setLoading(true);
    try {
      const { error } = await supabase
        .from("alerts")
        .insert({
          contract_id: contractId,
          title: alertTitle.trim(),
          message: noteText,
          alert_type: "other",
          alert_subtype: "proceso_cierre",
          due_date: alertDueDate,
          days_before: [7, 3, 1, 0],
          channels: ["email"],
          is_active: true,
          priority: 80,
          created_by: (await supabase.auth.getUser()).data.user?.id || null,
        });

      if (error) throw error;

      toast.success("Alerta creada", {
        description: "La alerta se mostrará en la Central de Alertas",
      });
      setShowAlertForm(null);
      setAlertTitle("");
      setAlertDueDate("");
    } catch (error: any) {
      toast.error("Error al crear alerta", { description: error.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-amber-500" />
              Proceso de Cierre
            </DialogTitle>
            <DialogDescription>
              Notas del proceso de cierre para <strong>{contractName}</strong>
            </DialogDescription>
          </DialogHeader>

          {/* Add new note */}
          <div className="space-y-2">
            <Label>Nueva nota</Label>
            <Textarea
              placeholder="Escriba una nota sobre el proceso de cierre..."
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              rows={3}
            />
            <div className="flex justify-end">
              <Button
                size="sm"
                onClick={handleAddNote}
                disabled={loading || !newNote.trim()}
              >
                {loading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                <Plus className="h-4 w-4 mr-1" />
                Agregar Nota
              </Button>
            </div>
          </div>

          {/* Notes list */}
          <div className="space-y-3 mt-2">
            {loadingNotes ? (
              <div className="flex justify-center py-4">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : notes.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                No hay notas registradas aún.
              </p>
            ) : (
              notes.map((note) => (
                <div
                  key={note.id}
                  className="border rounded-lg p-3 space-y-2 bg-muted/30"
                >
                  <p className="text-sm whitespace-pre-wrap">{note.note}</p>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(note.created_at), "dd MMM yyyy, HH:mm", {
                        locale: es,
                      })}
                    </span>
                    <div className="flex items-center gap-1">
                      {showAlertForm === note.id ? (
                        <div className="flex items-center gap-2 bg-card border rounded-lg p-2">
                          <Input
                            placeholder="Título de la alerta"
                            value={alertTitle}
                            onChange={(e) => setAlertTitle(e.target.value)}
                            className="h-8 text-xs w-40"
                          />
                          <Input
                            type="date"
                            value={alertDueDate}
                            onChange={(e) => setAlertDueDate(e.target.value)}
                            className="h-8 text-xs w-36"
                          />
                          <Button
                            size="sm"
                            variant="default"
                            className="h-8 text-xs"
                            disabled={loading || !alertTitle.trim() || !alertDueDate}
                            onClick={() => handleCreateAlert(note.note)}
                          >
                            {loading && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
                            Crear
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 text-xs"
                            onClick={() => {
                              setShowAlertForm(null);
                              setAlertTitle("");
                              setAlertDueDate("");
                            }}
                          >
                            Cancelar
                          </Button>
                        </div>
                      ) : (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs gap-1"
                            onClick={() => {
                              setShowAlertForm(note.id);
                              setAlertTitle(`Cierre: ${contractName}`);
                            }}
                          >
                            <Bell className="h-3 w-3" />
                            Crear Alerta
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs text-destructive hover:text-destructive"
                            onClick={() => setDeleteId(note.id)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar esta nota?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteNote}>
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
