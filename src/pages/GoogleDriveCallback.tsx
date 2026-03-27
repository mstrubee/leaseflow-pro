import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getGoogleDriveRedirectUri } from "@/lib/googleDriveOAuth";

export default function GoogleDriveCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const code = searchParams.get("code");
    const error = searchParams.get("error");

    if (error) {
      setStatus("error");
      setMessage(`Google rechazó la autorización: ${error}`);
      return;
    }

    if (!code) {
      setStatus("error");
      setMessage("No se recibió código de autorización");
      return;
    }

    const exchangeCode = async () => {
      try {
        const redirectUri = getGoogleDriveRedirectUri();

        const { data, error: fnError } = await supabase.functions.invoke("google-drive", {
          body: { action: "oauthCallback", code, redirectUri },
        });

        if (fnError) throw fnError;

        setStatus("success");
        setMessage(data?.message || "Google Drive conectado exitosamente");
      } catch (err: any) {
        setStatus("error");
        setMessage(err?.message || "Error al conectar con Google Drive");
      }
    };

    exchangeCode();
  }, [searchParams]);

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="text-center space-y-4 max-w-md">
        {status === "loading" && (
          <>
            <Loader2 className="h-12 w-12 animate-spin mx-auto text-primary" />
            <h2 className="text-xl font-semibold">Conectando con Google Drive...</h2>
            <p className="text-muted-foreground">Intercambiando código de autorización</p>
          </>
        )}
        {status === "success" && (
          <>
            <CheckCircle2 className="h-12 w-12 mx-auto text-green-500" />
            <h2 className="text-xl font-semibold">¡Conexión exitosa!</h2>
            <p className="text-muted-foreground">{message}</p>
            <Button onClick={() => navigate("/admin")}>Volver al Panel</Button>
          </>
        )}
        {status === "error" && (
          <>
            <XCircle className="h-12 w-12 mx-auto text-destructive" />
            <h2 className="text-xl font-semibold">Error de conexión</h2>
            <p className="text-muted-foreground">{message}</p>
            <Button onClick={() => navigate("/admin")} variant="outline">Volver al Panel</Button>
          </>
        )}
      </div>
    </div>
  );
}
