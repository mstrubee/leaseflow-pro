import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ChevronDown, ChevronRight, Plus, Trash2, Pencil, Check, X } from "lucide-react";
import { toast } from "sonner";

interface ChecklistItem {
  id: string;
  text: string;
  is_completed: boolean;
  completed_at: string | null;
  created_at: string;
  parent_id: string | null;
}

interface Props {
  contractId: string;
  reason: string | null;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
}

function formatCompletedDate(iso: string): string {
  const d = new Date(iso);
  const months = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  return `${d.getFullYear()}.${months[d.getMonth()]}.${String(d.getDate()).padStart(2, "0")}`;
}

const MONTH_NAMES: Record<string, number> = {
  enero: 0, febrero: 1, marzo: 2, abril: 3, mayo: 4, junio: 5,
  julio: 6, agosto: 7, septiembre: 8, octubre: 9, noviembre: 10, diciembre: 11,
  ene: 0, feb: 1, mar: 2, abr: 3, may: 4, jun: 5,
  jul: 6, ago: 7, sep: 8, oct: 9, nov: 10, dic: 11,
};

/** Detects a leading date in the text and returns { date, cleanText }. */
function extractLeadingDate(raw: string): { date: Date | null; cleanText: string } {
  const text = raw.trim();

  // yyyy.mm.dd or yyyy-mm-dd or yyyy/mm/dd
  const m1 = text.match(/^(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})\s*(.*)/s);
  if (m1) {
    const d = new Date(+m1[1], +m1[2] - 1, +m1[3]);
    if (!isNaN(d.getTime())) return { date: d, cleanText: m1[4].trim() };
  }

  // dd.mm.yyyy or dd-mm-yyyy or dd/mm/yyyy
  const m2 = text.match(/^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})\s*(.*)/s);
  if (m2) {
    const d = new Date(+m2[3], +m2[2] - 1, +m2[1]);
    if (!isNaN(d.getTime())) return { date: d, cleanText: m2[4].trim() };
  }

  // dd.mm.yy or dd-mm-yy or dd/mm/yy
  const m3 = text.match(/^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{2})\s*(.*)/s);
  if (m3) {
    const year = +m3[3] + 2000;
    const d = new Date(year, +m3[2] - 1, +m3[1]);
    if (!isNaN(d.getTime())) return { date: d, cleanText: m3[4].trim() };
  }

  // dd de <month_name>  (uses current year)
  const m4 = text.match(/^(\d{1,2})\s+de\s+([a-záéíóúñ]+)\s*(.*)/si);
  if (m4) {
    const monthIdx = MONTH_NAMES[m4[2].toLowerCase()];
    if (monthIdx !== undefined) {
      const d = new Date(new Date().getFullYear(), monthIdx, +m4[1]);
      if (!isNaN(d.getTime())) return { date: d, cleanText: m4[3].trim() };
    }
  }

  return { date: null, cleanText: text };
}

export function SpecialAttentionChecklist({ contractId, reason }: Props) {
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [newItemText, setNewItemText] = useState("");
  const [notes, setNotes] = useState(reason || "");
  const [checklistOpen, setChecklistOpen] = useState(true);
  const notesTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Child creation dialog state
  const [childDialogOpen, setChildDialogOpen] = useState(false);
  const [childParentId, setChildParentId] = useState<string | null>(null);
  const [childText, setChildText] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deleteWithChildren, setDeleteWithChildren] = useState(false);

  // Load checklist items
  useEffect(() => {
    supabase
      .from("special_attention_checklist")
      .select("id, text, is_completed, completed_at, created_at, parent_id")
      .eq("contract_id", contractId)
      .order("created_at", { ascending: true })
      .then(({ data }) => {
        if (data) setItems(data as ChecklistItem[]);
      });
  }, [contractId]);

  // Save notes with debounce
  const saveNotes = useCallback((text: string) => {
    supabase
      .from("contracts")
      .update({ special_attention_reason: text || null })
      .eq("id", contractId)
      .then(({ error }) => {
        if (error) toast.error("Error al guardar notas");
      });
  }, [contractId]);

  const handleNotesChange = (text: string) => {
    setNotes(text);
    if (notesTimer.current) clearTimeout(notesTimer.current);
    notesTimer.current = setTimeout(() => saveNotes(text), 600);
  };

  useEffect(() => {
    return () => { if (notesTimer.current) clearTimeout(notesTimer.current); };
  }, []);

  // Add checklist item (top-level)
  const addItem = async () => {
    const trimmed = newItemText.trim();
    if (!trimmed) return;

    const { date, cleanText } = extractLeadingDate(trimmed);
    if (!cleanText) return;

    const insertPayload: any = { contract_id: contractId, text: cleanText };
    if (date) insertPayload.created_at = date.toISOString();

    const { data, error } = await supabase
      .from("special_attention_checklist")
      .insert(insertPayload)
      .select("id, text, is_completed, completed_at, created_at, parent_id")
      .single();

    if (error) {
      toast.error("Error al agregar ítem");
      return;
    }
    setItems(prev => [...prev, data as ChecklistItem]);
    setNewItemText("");
  };

  // Add child item
  const addChildItem = async () => {
    const trimmed = childText.trim();
    if (!trimmed || !childParentId) return;

    const { date, cleanText } = extractLeadingDate(trimmed);
    if (!cleanText) return;

    const insertPayload: any = { contract_id: contractId, text: cleanText, parent_id: childParentId };
    if (date) insertPayload.created_at = date.toISOString();

    const { data, error } = await supabase
      .from("special_attention_checklist")
      .insert(insertPayload)
      .select("id, text, is_completed, completed_at, created_at, parent_id")
      .single();

    if (error) {
      toast.error("Error al agregar ítem");
      return;
    }
    setItems(prev => [...prev, data as ChecklistItem]);
    setChildText("");
    setChildDialogOpen(false);
    setChildParentId(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      addItem();
    }
  };

  // Toggle completion — offer child creation
  const toggleItem = async (id: string, completed: boolean) => {
    const now = completed ? new Date().toISOString() : null;
    const { error } = await supabase
      .from("special_attention_checklist")
      .update({
        is_completed: completed,
        completed_at: now,
      })
      .eq("id", id);

    if (error) {
      toast.error("Error al actualizar");
      return;
    }
    setItems(prev => prev.map(i => i.id === id ? { ...i, is_completed: completed, completed_at: now } : i));

    // If marking as completed, offer to create child
    if (completed) {
      setChildParentId(id);
      setChildText("");
      setChildDialogOpen(true);
    }
  };

  // Delete only the item (re-parent children to null)
  const deleteItemOnly = async (id: string) => {
    // Move children to top-level
    const children = items.filter(i => i.parent_id === id);
    if (children.length > 0) {
      await supabase
        .from("special_attention_checklist")
        .update({ parent_id: null })
        .in("id", children.map(c => c.id));
    }
    const { error } = await supabase
      .from("special_attention_checklist")
      .delete()
      .eq("id", id);
    if (!error) setItems(prev => prev.filter(i => i.id !== id).map(i => i.parent_id === id ? { ...i, parent_id: null } : i));
  };

  // Delete item and all its descendants
  const deleteItemWithChildren = async (id: string) => {
    const getDescendantIds = (parentId: string): string[] => {
      const directChildren = items.filter(i => i.parent_id === parentId);
      return directChildren.flatMap(c => [c.id, ...getDescendantIds(c.id)]);
    };
    const allIds = [id, ...getDescendantIds(id)];
    const { error } = await supabase
      .from("special_attention_checklist")
      .delete()
      .in("id", allIds);
    if (!error) setItems(prev => prev.filter(i => !allIds.includes(i.id)));
  };

  // Edit item text
  const saveEdit = async (id: string) => {
    const trimmed = editingText.trim();
    if (!trimmed) return;
    const { error } = await supabase
      .from("special_attention_checklist")
      .update({ text: trimmed })
      .eq("id", id);
    if (error) {
      toast.error("Error al editar ítem");
      return;
    }
    setItems(prev => prev.map(i => i.id === id ? { ...i, text: trimmed } : i));
    setEditingId(null);
  };

  // Build tree structure
  const rootItems = items.filter(i => !i.parent_id).sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  const childrenOf = (parentId: string): ChecklistItem[] =>
    items.filter(i => i.parent_id === parentId).sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  const completedCount = items.filter(i => i.is_completed).length;

  const renderItem = (item: ChecklistItem, depth: number) => {
    const isEditing = editingId === item.id;
    return (
      <div key={item.id}>
        <div
          className="flex items-start gap-2 px-2 py-1.5 rounded hover:bg-muted/50 group"
          style={{ paddingLeft: `${8 + depth * 20}px` }}
        >
          <Checkbox
            checked={item.is_completed}
            onCheckedChange={(checked) => toggleItem(item.id, !!checked)}
            className="mt-0.5"
          />
          {isEditing ? (
            <div className="flex-1 flex items-center gap-1">
              <input
                value={editingText}
                onChange={(e) => setEditingText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveEdit(item.id);
                  if (e.key === "Escape") setEditingId(null);
                }}
                className="flex-1 text-sm bg-background border border-input rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-ring"
                autoFocus
              />
              <button onClick={() => saveEdit(item.id)} className="text-primary hover:text-primary/80 p-0.5">
                <Check className="h-3 w-3" />
              </button>
              <button onClick={() => setEditingId(null)} className="text-muted-foreground hover:text-foreground p-0.5">
                <X className="h-3 w-3" />
              </button>
            </div>
          ) : (
            <span className={`text-sm flex-1 ${item.is_completed ? "line-through text-muted-foreground" : "text-foreground"}`}>
              <span className="font-mono text-xs text-muted-foreground mr-1.5">{formatDate(item.created_at)}</span>
              {item.text}
              {item.is_completed && item.completed_at && (
                <span className="text-xs text-muted-foreground ml-1">
                  (completado el {formatCompletedDate(item.completed_at)})
                </span>
              )}
            </span>
          )}
          {!isEditing && (
            <>
              <button
                onClick={() => { setEditingId(item.id); setEditingText(item.text); }}
                className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground transition-opacity p-0.5"
              >
                <Pencil className="h-3 w-3" />
              </button>
              <button
                onClick={() => setDeleteConfirmId(item.id)}
                className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity p-0.5"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </>
          )}
        </div>
        {childrenOf(item.id).map(child => renderItem(child, depth + 1))}
      </div>
    );
  };

  const parentItemText = childParentId ? items.find(i => i.id === childParentId)?.text : "";

  return (
    <div className="space-y-2">
      {/* Split textareas: left = new checklist item, right = notes */}
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Nuevo ítem checklist (inicia con fecha yyyy.mm.dd para asignar fecha personalizada)</label>
          <div className="flex gap-1">
            <Textarea
              value={newItemText}
              onChange={(e) => setNewItemText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Escribe y presiona Enter…"
              className="text-sm min-h-[60px] max-h-[60px] resize-none flex-1"
            />
            <Button
              size="icon"
              variant="ghost"
              className="shrink-0 h-[60px] w-8"
              onClick={addItem}
              disabled={!newItemText.trim()}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Notas</label>
          <Textarea
            value={notes}
            onChange={(e) => handleNotesChange(e.target.value)}
            placeholder="Notas de atención especial…"
            className="text-sm min-h-[60px] max-h-[60px] resize-none"
          />
        </div>
      </div>

      {/* Collapsible checklist */}
      {items.length > 0 && (
        <Collapsible open={checklistOpen} onOpenChange={setChecklistOpen}>
          <CollapsibleTrigger asChild>
            <button className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors py-1">
              {checklistOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              <span>Checklist ({completedCount}/{items.length})</span>
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="space-y-0.5 max-h-[300px] overflow-y-auto">
              {rootItems.map((item) => renderItem(item, 0))}
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* Dialog for creating child item after completing */}
      <Dialog open={childDialogOpen} onOpenChange={(open) => {
        if (!open) { setChildDialogOpen(false); setChildParentId(null); }
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm">Crear ítem de seguimiento</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              A partir de: <span className="font-medium text-foreground">{parentItemText}</span>
            </p>
            <Textarea
              value={childText}
              onChange={(e) => setChildText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); addChildItem(); }
              }}
              placeholder="Nuevo ítem de seguimiento…"
              className="text-sm min-h-[80px]"
              autoFocus
            />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="ghost" size="sm" onClick={() => { setChildDialogOpen(false); setChildParentId(null); }}>
              Omitir
            </Button>
            <Button size="sm" disabled={!childText.trim()} onClick={addChildItem}>
              <Plus className="h-4 w-4 mr-1" /> Agregar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteConfirmId} onOpenChange={(open) => { if (!open) { setDeleteConfirmId(null); setDeleteWithChildren(false); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar ítem?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteConfirmId && childrenOf(deleteConfirmId).length > 0
                ? "Este ítem tiene sub-líneas. ¿Qué deseas hacer?"
                : "Esta acción no se puede deshacer."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2">
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            {deleteConfirmId && childrenOf(deleteConfirmId).length > 0 ? (
              <>
                <AlertDialogAction
                  onClick={() => { if (deleteConfirmId) { deleteItemOnly(deleteConfirmId); setDeleteConfirmId(null); } }}
                >
                  Borrar solo la línea
                </AlertDialogAction>
                {!deleteWithChildren ? (
                  <AlertDialogAction
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    onClick={(e) => { e.preventDefault(); setDeleteWithChildren(true); }}
                  >
                    Borrar línea y dependientes
                  </AlertDialogAction>
                ) : (
                  <AlertDialogAction
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    onClick={() => { if (deleteConfirmId) { deleteItemWithChildren(deleteConfirmId); setDeleteConfirmId(null); setDeleteWithChildren(false); } }}
                  >
                    ⚠ Confirmar eliminación total
                  </AlertDialogAction>
                )}
              </>
            ) : (
              <AlertDialogAction onClick={() => { if (deleteConfirmId) { deleteItemOnly(deleteConfirmId); setDeleteConfirmId(null); } }}>
                Eliminar
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
