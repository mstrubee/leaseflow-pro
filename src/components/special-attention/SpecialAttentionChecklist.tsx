import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, ChevronRight, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

interface ChecklistItem {
  id: string;
  text: string;
  is_completed: boolean;
  created_at: string;
}

interface Props {
  contractId: string;
  reason: string | null;
}

export function SpecialAttentionChecklist({ contractId, reason }: Props) {
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [newItemText, setNewItemText] = useState("");
  const [notes, setNotes] = useState(reason || "");
  const [checklistOpen, setChecklistOpen] = useState(true);
  const notesTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load checklist items
  useEffect(() => {
    supabase
      .from("special_attention_checklist")
      .select("id, text, is_completed, created_at")
      .eq("contract_id", contractId)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        if (data) setItems(data);
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

  // Add checklist item
  const addItem = async () => {
    const trimmed = newItemText.trim();
    if (!trimmed) return;

    const { data, error } = await supabase
      .from("special_attention_checklist")
      .insert({ contract_id: contractId, text: trimmed })
      .select("id, text, is_completed, created_at")
      .single();

    if (error) {
      toast.error("Error al agregar ítem");
      return;
    }
    // New items go to the top (newest first)
    setItems(prev => [data, ...prev]);
    setNewItemText("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      addItem();
    }
  };

  // Toggle completion
  const toggleItem = async (id: string, completed: boolean) => {
    const { error } = await supabase
      .from("special_attention_checklist")
      .update({
        is_completed: completed,
        completed_at: completed ? new Date().toISOString() : null,
      })
      .eq("id", id);

    if (error) {
      toast.error("Error al actualizar");
      return;
    }
    setItems(prev => prev.map(i => i.id === id ? { ...i, is_completed: completed } : i));
  };

  // Delete item
  const deleteItem = async (id: string) => {
    const { error } = await supabase
      .from("special_attention_checklist")
      .delete()
      .eq("id", id);

    if (!error) setItems(prev => prev.filter(i => i.id !== id));
  };

  const completedCount = items.filter(i => i.is_completed).length;

  return (
    <div className="space-y-2">
      {/* Split textareas: left = new checklist item, right = notes */}
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Nuevo ítem checklist</label>
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
            <div className="space-y-1 max-h-[200px] overflow-y-auto">
              {items.map((item) => (
                <div
                  key={item.id}
                  className="flex items-start gap-2 px-2 py-1.5 rounded hover:bg-muted/50 group"
                >
                  <Checkbox
                    checked={item.is_completed}
                    onCheckedChange={(checked) => toggleItem(item.id, !!checked)}
                    className="mt-0.5"
                  />
                  <span className={`text-sm flex-1 ${item.is_completed ? "line-through text-muted-foreground" : "text-foreground"}`}>
                    {item.text}
                  </span>
                  <button
                    onClick={() => deleteItem(item.id)}
                    className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity p-0.5"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
}
