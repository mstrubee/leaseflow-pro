import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AlertTriangle, ChevronDown, ChevronRight, ExternalLink } from "lucide-react";

interface SpecialContract {
  id: string;
  name: string;
  special_attention_reason: string | null;
}

export function SpecialAttentionSection() {
  const navigate = useNavigate();
  const [contracts, setContracts] = useState<SpecialContract[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedContract, setSelectedContract] = useState<SpecialContract | null>(null);

  useEffect(() => {
    supabase
      .from("contracts")
      .select("id, name, special_attention_reason")
      .eq("requires_special_attention", true)
      .is("deleted_at", null)
      .order("name")
      .then(({ data }) => {
        if (data) setContracts(data);
      });
  }, []);

  if (contracts.length === 0) return null;

  return (
    <>
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <Card className="border-amber-300 bg-amber-50/50 dark:border-amber-700 dark:bg-amber-950/20">
          <CollapsibleTrigger asChild>
            <CardContent className="p-4 cursor-pointer flex items-center gap-3 hover:bg-amber-100/50 dark:hover:bg-amber-900/20 transition-colors">
              <div className="rounded-lg p-2 text-amber-600 bg-amber-100 dark:text-amber-400 dark:bg-amber-900/40">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-foreground">
                  Atención Especial Contratos
                </p>
                <p className="text-sm text-muted-foreground">
                  {contracts.length} contrato{contracts.length !== 1 ? "s" : ""} requiere{contracts.length === 1 ? "" : "n"} atención
                </p>
              </div>
              {isOpen ? (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              )}
            </CardContent>
          </CollapsibleTrigger>

          <CollapsibleContent>
            <div className="px-4 pb-4 space-y-2">
              {contracts.map((c) => (
                <div
                  key={c.id}
                  className="flex items-start gap-3 p-3 rounded-lg bg-background border cursor-pointer hover:border-primary/40 transition-colors"
                  onClick={() => setSelectedContract(c)}
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm text-foreground truncate">
                      {c.name}
                    </p>
                    {c.special_attention_reason && (
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                        {c.special_attention_reason}
                      </p>
                    )}
                  </div>
                  <ExternalLink className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
                </div>
              ))}
            </div>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      <Dialog open={!!selectedContract} onOpenChange={(open) => !open && setSelectedContract(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              {selectedContract?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {selectedContract?.special_attention_reason ? (
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-1">Motivo de atención especial</p>
                <p className="text-sm whitespace-pre-wrap">{selectedContract.special_attention_reason}</p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground italic">Sin motivo registrado.</p>
            )}
            <Button
              className="w-full gap-2"
              onClick={() => {
                setSelectedContract(null);
                navigate(`/contracts/${selectedContract?.id}`);
              }}
            >
              <ExternalLink className="h-4 w-4" />
              Ver contrato completo
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
