import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
import { Clock, ChevronDown, ChevronUp, Pencil, Trash2, Bell, Check, X, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";

interface ClosingProcessBannerProps {
  contractId: string;
  contractName: string;
  refreshKey?: number;
  onNotesChange?: () => void;
}

export function ClosingProcessBanner({ contractId, contractName, refreshKey, onNotesChange }: ClosingProcessBannerProps) {
  const [notes, setNotes] = useState<Array<{ id: string; note: string; created_at: string }>>([]);
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");

  const [showAlertForm, setShowAlertForm] = useState<string | null>(null);
  const [alertTitle, setAlertTitle] = useState("");
  const [alertDueDate, setAlertDueDate] = useState("");

  useEffect(() => {
    loadNotes();
  }, [contractId, refreshKey]);

  const loadNotes = async () => {
    try {
      const { data, error } = await supabase
        .from("closing_process_notes")
        .select("id, note, created_at")
        .eq("contract_id", contractId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setNotes(data || []);
    } catch (error) {
      console.error("Error loading closing notes:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = async () => {
    if (!editingId || !editText.trim()) return;
    setActionLoading(true);
    try {
      const { error } = await supabase
        .from("closing_process_notes")
        .update({ note: editText.trim() })
        .eq("id", editingId);
      if (error) throw error;
      toast.success("Nota actualizada");
      setEditingId(null);
      setEditText("");
      loadNotes();
      onNotesChange?.();
    } catch (error: any) {
      toast.error("Error al actualizar nota", { description: error.message });
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async () => {
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
      onNotesChange?.();
    } catch (error: any) {
      toast.error("Error al eliminar nota", { description: error.message });
    }
  };

  const handleCreateAlert = async (noteText: string) => {
    if (!alertTitle.trim() || !alertDueDate) return;
    setActionLoading(true);
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
      toast.success("Alerta creada");
      setShowAlertForm(null);
      setAlertTitle("");
      setAlertDueDate("");
    } catch (error: any) {
      toast.error("Error al crear alerta", { description: error.message });
    } finally {
      setActionLoading(false);
    }
  };

  if (loading || notes.length === 0) return null;

  return (
    <>
      <div className="border-2 border-amber-400 rounded-lg bg-amber-50 dark:bg-amber-950/30 p-3">
        <button
          className="flex items-center justify-between w-full text-left"
          onClick={() => setExpanded(!expanded)}
        >
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-amber-600" />
            <span className="font-semibold text-amber-800 dark:text-amber-300 text-sm">
              Proceso de Cierre — {notes.length} nota{notes.length !== 1 ? "s" : ""}
            </span>
          </div>
          {expanded ? (
            <ChevronUp className="h-4 w-4 text-amber-600" />
          ) : (
            <ChevronDown className="h-4 w-4 text-amber-600" />
          )}
        </button>

        {expanded && (
          <div className="mt-2 space-y-2">
            {notes.map((note) => (
              <div key={note.id} className="text-sm border-l-2 border-amber-400 pl-3 py-1">
                {editingId === note.id ? (
                  <div className="space-y-2">
                    <Textarea
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      rows={3}
                    />
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setEditingId(null); setEditText(""); }}>
                        <X className="h-3 w-3 mr-1" /> Cancelar
                      </Button>
                      <Button size="sm" className="h-7 text-xs" disabled={actionLoading || !editText.trim()} onClick={handleEdit}>
                        {actionLoading && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
                        <Check className="h-3 w-3 mr-1" /> Guardar
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="text-foreground whitespace-pre-wrap">{note.note}</p>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(note.created_at), "dd MMM yyyy, HH:mm", { locale: es })}
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
                            <Button size="sm" className="h-8 text-xs" disabled={actionLoading || !alertTitle.trim() || !alertDueDate} onClick={() => handleCreateAlert(note.note)}>
                              {actionLoading && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
                              Crear
                            </Button>
                            <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => { setShowAlertForm(null); setAlertTitle(""); setAlertDueDate(""); }}>
                              Cancelar
                            </Button>
                          </div>
                        ) : (
                          <>
                            <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => { setShowAlertForm(note.id); setAlertTitle(`Cierre: ${contractName}`); }}>
                              <Bell className="h-3 w-3" /> Alerta
                            </Button>
                            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => { setEditingId(note.id); setEditText(note.note); }}>
                              <Pencil className="h-3 w-3" />
                            </Button>
                            <Button variant="ghost" size="sm" className="h-7 text-xs text-destructive hover:text-destructive" onClick={() => setDeleteId(note.id)}>
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar esta nota?</AlertDialogTitle>
            <AlertDialogDescription>Esta acción no se puede deshacer.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
