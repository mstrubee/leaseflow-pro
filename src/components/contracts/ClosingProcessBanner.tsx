import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Clock, ChevronDown, ChevronUp } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";

interface ClosingProcessBannerProps {
  contractId: string;
  refreshKey?: number;
}

export function ClosingProcessBanner({ contractId, refreshKey }: ClosingProcessBannerProps) {
  const [notes, setNotes] = useState<Array<{ id: string; note: string; created_at: string }>>([]);
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(true);

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

  if (loading || notes.length === 0) return null;

  return (
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
              <p className="text-foreground whitespace-pre-wrap">{note.note}</p>
              <span className="text-xs text-muted-foreground">
                {format(new Date(note.created_at), "dd MMM yyyy, HH:mm", { locale: es })}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
