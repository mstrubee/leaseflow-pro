import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AlertTriangle, ExternalLink, ArrowLeft } from "lucide-react";

interface SpecialContract {
  id: string;
  name: string;
  special_attention_reason: string | null;
}

export function SpecialAttentionDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const navigate = useNavigate();
  const [contracts, setContracts] = useState<SpecialContract[]>([]);
  const [selected, setSelected] = useState<SpecialContract | null>(null);

  useEffect(() => {
    if (!open) return;
    supabase
      .from("contracts")
      .select("id, name, special_attention_reason")
      .eq("requires_special_attention", true)
      .is("deleted_at", null)
      .order("name")
      .then(({ data }) => {
        if (data) setContracts(data);
      });
  }, [open]);

  const handleClose = () => {
    setSelected(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            Atención Especial Contratos
          </DialogTitle>
        </DialogHeader>

        {selected ? (
          <div className="space-y-4 overflow-y-auto flex-1">
            <Button variant="ghost" size="sm" className="gap-1 -ml-2" onClick={() => setSelected(null)}>
              <ArrowLeft className="h-3.5 w-3.5" />
              Volver al listado
            </Button>
            <div>
              <p className="font-medium text-foreground">{selected.name}</p>
              {selected.special_attention_reason ? (
                <p className="text-sm text-muted-foreground mt-2 whitespace-pre-wrap">
                  {selected.special_attention_reason}
                </p>
              ) : (
                <p className="text-sm text-muted-foreground mt-2 italic">Sin motivo registrado.</p>
              )}
            </div>
            <Button
              className="w-full gap-2"
              onClick={() => {
                handleClose();
                navigate(`/contracts/${selected.id}`);
              }}
            >
              <ExternalLink className="h-4 w-4" />
              Ver contrato completo
            </Button>
          </div>
        ) : (
          <div className="space-y-2 overflow-y-auto flex-1">
            {contracts.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">No hay contratos con atención especial.</p>
            ) : (
              contracts.map((c) => (
                <div
                  key={c.id}
                  className="flex items-start gap-3 p-3 rounded-lg border cursor-pointer hover:border-primary/40 transition-colors"
                  onClick={() => setSelected(c)}
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm text-foreground truncate">{c.name}</p>
                    {c.special_attention_reason && (
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                        {c.special_attention_reason}
                      </p>
                    )}
                  </div>
                  <ExternalLink className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
                </div>
              ))
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
