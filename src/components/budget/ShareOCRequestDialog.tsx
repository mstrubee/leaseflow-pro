import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Mail, Download, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { fileToBase64 } from "@/lib/fileBase64";
import { buildOCRequestPdf, ocRequestPdfFileName, downloadOCRequestPdf, OCRequestShareData } from "@/lib/ocRequestShare";

const LAST_METHOD_KEY = "oc_request_share_last_method";
type ShareMethod = "email" | "download";

function getLastMethod(): ShareMethod {
  try {
    const v = localStorage.getItem(LAST_METHOD_KEY);
    return v === "email" || v === "download" ? v : "email";
  } catch {
    return "email";
  }
}

function rememberMethod(method: ShareMethod) {
  try {
    localStorage.setItem(LAST_METHOD_KEY, method);
  } catch {
    // localStorage puede fallar en modo privado — no es crítico, se pierde
    // solo la preferencia recordada, el resto del flujo sigue funcionando.
  }
}

interface ShareOCRequestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: OCRequestShareData | null;
  /** false = no pide elegir Con Migo/Sin Migo (uso en Ver/Editar Solicitud, ya se eligió al crearla). Default true. */
  requireMigoChoice?: boolean;
  /** id en oc_requests — con requireMigoChoice se usa para persistir la elección apenas se hace. */
  requestId?: string;
}

/**
 * Se abre justo después de crear una Solicitud de OC, desde cualquiera de
 * los 3 puntos donde se crean (OCRequestDialog, OCRequestsList,
 * CentralizedOrderCreator). Envía la Solicitud por correo con el PDF
 * adjunto (server-side, vía la edge function send-oc-request-email +
 * Resend) o, si el envío no está disponible o falla, permite descargarla
 * eligiendo dónde guardarla.
 *
 * "La vía debe ser mediante email": la única forma de ENVIAR es correo, no
 * WhatsApp ni otro canal. La Web Share API nativa del sistema operativo no
 * permite restringir qué apps aparecen (mostraría todo lo que acepte un
 * archivo, no solo correo), así que en vez de eso el envío lo hace el propio
 * servidor — funciona igual en cualquier dispositivo y garantiza que el
 * único canal sea el correo indicado acá.
 */
type MigoChoice = "con" | "sin" | null;

export function ShareOCRequestDialog({ open, onOpenChange, data, requireMigoChoice = true, requestId }: ShareOCRequestDialogProps) {
  const [recipientEmail, setRecipientEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [lastMethod] = useState<ShareMethod>(getLastMethod);
  const [migoChoice, setMigoChoice] = useState<MigoChoice>(null);

  const handleClose = (isOpen: boolean) => {
    if (sending || downloading) return;
    if (!isOpen) {
      setRecipientEmail("");
      setMigoChoice(null);
    }
    onOpenChange(isOpen);
  };

  const handleMigoChoice = (choice: "con" | "sin") => {
    setMigoChoice(choice);
    if (requestId) {
      supabase.from("oc_requests").update({ migo_choice: choice }).eq("id", requestId)
        .then(({ error }) => {
          if (error) console.error("Error al guardar Con Migo/Sin Migo:", error);
        });
    }
  };

  const shareData = (): OCRequestShareData => ({
    ...data!,
    migoChoice: requireMigoChoice ? migoChoice : data!.migoChoice,
  });

  const buildBlob = (): Blob => {
    const doc = buildOCRequestPdf(shareData());
    return doc.output("blob");
  };

  const handleDownload = async () => {
    if (!data) return;
    setDownloading(true);
    try {
      const blob = buildBlob();
      const fileName = ocRequestPdfFileName(data);
      const result = await downloadOCRequestPdf(blob, fileName);
      if (result === "cancelled") return;
      rememberMethod("download");
      toast.success(result === "saved" ? "PDF guardado" : "PDF descargado");
      onOpenChange(false);
    } catch (err: any) {
      console.error("Error al descargar la Solicitud de OC:", err);
      toast.error("No se pudo generar el PDF para descargar.");
    } finally {
      setDownloading(false);
    }
  };

  const handleSend = async () => {
    if (!data) return;
    if (!recipientEmail.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail.trim())) {
      toast.error("Ingresa un correo válido");
      return;
    }

    setSending(true);
    try {
      const blob = buildBlob();
      const fileName = ocRequestPdfFileName(data);
      const file = new File([blob], fileName, { type: "application/pdf" });
      const pdfBase64 = await fileToBase64(file);

      const { error } = await supabase.functions.invoke("send-oc-request-email", {
        body: {
          recipientEmail: recipientEmail.trim(),
          subject: "Solicitud de OC",
          bodyText: `Se comparte la Solicitud de OC por ${data.contractNames.join(", ") || "el contrato indicado"}.`,
          pdfBase64,
          fileName,
        },
      });

      if (error) throw error;

      rememberMethod("email");
      toast.success(`Solicitud enviada a ${recipientEmail.trim()}`);
      onOpenChange(false);
    } catch (err: any) {
      console.error("Error al enviar la Solicitud de OC por correo:", err);
      // No se pudo enviar (Resend sin configurar, caído, o cualquier otro
      // error) — se descarga el PDF igual para que se pueda mandar a mano,
      // en vez de dejar al usuario sin nada.
      toast.error("No se pudo enviar el correo. Se descargará el PDF para enviarlo manualmente.");
      try {
        const blob = buildBlob();
        const fileName = ocRequestPdfFileName(data);
        await downloadOCRequestPdf(blob, fileName);
      } catch (downloadErr) {
        console.error("Además falló la descarga de respaldo:", downloadErr);
      }
    } finally {
      setSending(false);
    }
  };

  const busy = sending || downloading;
  const actionsDisabled = busy || (requireMigoChoice && migoChoice === null);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Compartir Solicitud de OC</DialogTitle>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="oc-request-share-email">Correo del destinatario</Label>
          <Input
            id="oc-request-share-email"
            type="email"
            placeholder="nombre@empresa.cl"
            value={recipientEmail}
            onChange={(e) => setRecipientEmail(e.target.value)}
            disabled={busy}
            autoFocus
          />
          <p className="text-xs text-muted-foreground">
            Se envía con el PDF adjunto. Si el envío no está disponible, se descarga en su lugar.
          </p>
        </div>

        {requireMigoChoice && (
          <div className="space-y-2">
            <Label>Migo</Label>
            <div className="flex gap-2">
              <Button
                type="button"
                variant={migoChoice === "con" ? "default" : "outline"}
                onClick={() => handleMigoChoice("con")}
                disabled={busy}
                className="flex-1"
              >
                Con Migo
              </Button>
              <Button
                type="button"
                variant={migoChoice === "sin" ? "default" : "outline"}
                onClick={() => handleMigoChoice("sin")}
                disabled={busy}
                className="flex-1"
              >
                Sin Migo
              </Button>
            </div>
            {migoChoice === null && (
              <p className="text-xs text-muted-foreground">
                Elige una opción para habilitar la descarga o el envío.
              </p>
            )}
          </div>
        )}

        <DialogFooter className="flex-col sm:flex-row gap-2 sm:gap-2">
          <Button
            variant={lastMethod === "download" ? "default" : "outline"}
            onClick={handleDownload}
            disabled={actionsDisabled}
            className="w-full sm:w-auto"
          >
            {downloading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Download className="h-4 w-4 mr-1" />}
            Descargar PDF
          </Button>
          <Button
            variant={lastMethod === "email" ? "default" : "outline"}
            onClick={handleSend}
            disabled={actionsDisabled}
            className="w-full sm:w-auto"
          >
            {sending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Mail className="h-4 w-4 mr-1" />}
            Enviar por correo
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
