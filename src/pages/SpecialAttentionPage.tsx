import { useEffect, useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { AlertTriangle, ArrowLeft, ExternalLink } from "lucide-react";
import { toast } from "sonner";

interface SpecialContract {
  id: string;
  name: string;
  special_attention_reason: string | null;
}

function InlineReason({ contract }: { contract: SpecialContract }) {
  const [value, setValue] = useState(contract.special_attention_reason || "");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const save = useCallback((text: string) => {
    supabase
      .from("contracts")
      .update({ special_attention_reason: text || null })
      .eq("id", contract.id)
      .then(({ error }) => {
        if (error) toast.error("Error al guardar");
      });
  }, [contract.id]);

  const handleChange = (text: string) => {
    setValue(text);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => save(text), 600);
  };

  useEffect(() => {
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, []);

  return (
    <Textarea
      value={value}
      onChange={(e) => handleChange(e.target.value)}
      placeholder="Escribe el motivo de atención especial…"
      className="text-sm min-h-[60px]"
    />
  );
}

const SpecialAttentionPage = () => {
  const navigate = useNavigate();
  const [contracts, setContracts] = useState<SpecialContract[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from("contracts")
      .select("id, name, special_attention_reason")
      .eq("requires_special_attention", true)
      .is("deleted_at", null)
      .order("name")
      .then(({ data }) => {
        setContracts(data || []);
        setLoading(false);
      });
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            <h1 className="text-lg font-semibold text-foreground">Atención Especial Contratos</h1>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-4">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        ) : contracts.length === 0 ? (
          <p className="text-center text-muted-foreground py-12">
            No hay contratos marcados con atención especial.
          </p>
        ) : (
          contracts.map((c) => (
            <Card key={c.id}>
              <CardContent className="p-5 space-y-3">
                <div className="flex items-center justify-between gap-4">
                  <p className="font-medium text-foreground">{c.name}</p>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-1.5 shrink-0 text-muted-foreground hover:text-foreground"
                    onClick={() => navigate(`/contracts/${c.id}`)}
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    Ver contrato
                  </Button>
                </div>
                <InlineReason contract={c} />
              </CardContent>
            </Card>
          ))
        )}
      </main>
    </div>
  );
};

export default SpecialAttentionPage;
