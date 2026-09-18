import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getFunctionErrorMessage } from "@/lib/edgeFunctionError";
import { Loader2 } from "lucide-react";

// Enlace corto y propio compartido por WhatsApp/Email (`/activar?t=<token>`)
// en vez de exponer la URL técnica cruda de Supabase Auth
// (.../auth/v1/verify?token=...&type=recovery&redirect_to=...), que a un
// destinatario le parece sospechosa o rota. resolve-activation-link genera
// el enlace real de Supabase recién ahora y esta página redirige a él.
const ActivateAccount = () => {
  const location = useLocation();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = new URLSearchParams(location.search).get("t");
    if (!token) {
      setError("Este enlace no es válido.");
      return;
    }

    let cancelled = false;
    (async () => {
      const { data, error: invokeError } = await supabase.functions.invoke("resolve-activation-link", {
        body: { token },
      });
      if (cancelled) return;
      if (invokeError || !data?.action_link) {
        const message = await getFunctionErrorMessage(invokeError, "Este enlace no es válido o ya fue utilizado.");
        setError(message);
        return;
      }
      window.location.href = data.action_link;
    })();

    return () => { cancelled = true; };
  }, [location.search]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-semibold">
            {error ? "Enlace no disponible" : "Redirigiendo..."}
          </CardTitle>
          <CardDescription>
            {error || "Estamos verificando tu enlace, un momento."}
          </CardDescription>
        </CardHeader>
        {!error && (
          <CardContent className="flex justify-center pb-6">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </CardContent>
        )}
      </Card>
    </div>
  );
};

export default ActivateAccount;
