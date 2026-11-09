import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, XCircle, Loader2, ShieldCheck } from "lucide-react";

interface VerifyResult {
  is_valid: boolean;
  request_number: string | null;
  sequence_number: number | null;
  request_date: string | null;
  amount_clp: number | null;
  project_name: string | null;
  line_name: string | null;
  supplier_name: string | null;
  status: string | null;
}

const fmtClp = (n: number | null) =>
  n == null ? "—" : `$${Math.round(n).toLocaleString("es-CL")}`;

const fmtDate = (iso: string | null) => {
  if (!iso) return "—";
  try {
    return new Date(`${iso}T00:00:00`).toLocaleDateString("es-CL", { year: "numeric", month: "2-digit", day: "2-digit" });
  } catch {
    return iso;
  }
};

const fmtSequence = (n: number | null) => (n == null ? "—" : String(n).padStart(6, "0"));

/**
 * Página pública (sin login) para que un tercero sin acceso a la
 * plataforma -- típicamente el proveedor que recibió una Solicitud de OC --
 * pueda confirmar que el documento no fue alterado. Se llega acá escaneando
 * el QR o el código impreso al pie del PDF (ver ocRequestShare.ts).
 *
 * La verificación llama a la función de Postgres verify_oc_request (RPC,
 * SECURITY DEFINER, con EXECUTE otorgado a "anon") en vez de leer la tabla
 * oc_requests directamente -- así nunca se expone la tabla completa ni el
 * secreto usado para firmar el código, solo el resultado puntual de esta
 * solicitud si el código calza.
 */
export default function VerifyOCRequest() {
  const { id, code } = useParams<{ id: string; code: string }>();
  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id || !code) {
      setError("Este enlace de verificación no es válido.");
      setLoading(false);
      return;
    }
    (async () => {
      const { data, error: rpcError } = await (supabase as any).rpc("verify_oc_request", {
        p_id: id,
        p_code: code,
      });
      if (rpcError) {
        setError("No se pudo verificar el documento en este momento. Intenta de nuevo más tarde.");
      } else {
        setResult((data?.[0] as VerifyResult) ?? null);
      }
      setLoading(false);
    })();
  }, [id, code]);

  return (
    <div className="min-h-screen bg-muted/30 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <ShieldCheck className="h-6 w-6 text-primary" />
          </div>
          <CardTitle>Verificación de Solicitud de OC</CardTitle>
          <CardDescription>
            Confirma si este documento corresponde a una solicitud real y sin alterar.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : error ? (
            <div className="text-center text-sm text-destructive py-4">{error}</div>
          ) : result?.is_valid ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2 rounded-md bg-green-50 border border-green-200 text-green-800 px-3 py-2">
                <CheckCircle2 className="h-5 w-5 shrink-0" />
                <span className="font-medium text-sm">Documento válido</span>
              </div>
              <dl className="text-sm space-y-1.5">
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">N° Solicitud</dt>
                  <dd className="font-medium">{fmtSequence(result.sequence_number)}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Fecha</dt>
                  <dd className="font-medium">{fmtDate(result.request_date)}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Monto</dt>
                  <dd className="font-medium">{fmtClp(result.amount_clp)}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Proyecto</dt>
                  <dd className="font-medium text-right">{result.project_name || "—"}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Línea</dt>
                  <dd className="font-medium text-right">{result.line_name || "—"}</dd>
                </div>
                {result.supplier_name && (
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">Proveedor</dt>
                    <dd className="font-medium text-right">{result.supplier_name}</dd>
                  </div>
                )}
              </dl>
              <p className="text-xs text-muted-foreground pt-2 border-t">
                Estos son los datos reales registrados en el sistema. Si no coinciden con lo impreso en el
                documento que recibiste, ese documento fue alterado.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-2 rounded-md bg-red-50 border border-red-200 text-red-800 px-3 py-2">
                <XCircle className="h-5 w-5 shrink-0" />
                <span className="font-medium text-sm">Código no válido</span>
              </div>
              <p className="text-sm text-muted-foreground">
                Este código no corresponde a ninguna Solicitud de OC registrada, o no coincide con el
                documento. No confíes en este documento sin confirmar directamente con la empresa emisora.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
