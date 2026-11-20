import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Mail, Download, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { fileToBase64 } from "@/lib/fileBase64";
import { buildOCRequestPdf, ocRequestPdfFileName, downloadOCRequestPdf, pickSaveLocation, type OCRequestShareData, type SaveTarget } from "@/lib/ocRequestShare";
import { fetchQuotationFile } from "@/lib/ocRequestQuotation";
import { buildOCRequestZip, ocRequestZipFileName, type QuotationFile } from "@/lib/ocRequestZip";

/** Tope de espera para bajar la cotización: pasado esto se ofrece solo el PDF (y se avisa). */
const QUOTATION_TIMEOUT_MS = 25_000;

const withTimeout = <T,>(promise: Promise<T>, ms: number): Promise<T | null> =>
  new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), ms);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      () => { clearTimeout(timer); resolve(null); },
    );
  });

type QuotationState =
  | { status: "none" }
  | { status: "loading" }
  | { status: "ready"; file: QuotationFile }
  | { status: "failed" };

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
  const [quotation, setQuotation] = useState<QuotationState>({ status: "none" });

  // La cotización se baja AL ABRIR el diálogo, no al hacer clic en Descargar: así,
  // al hacer clic, ya está lista y el selector "Guardar como" se abre dentro del
  // gesto del usuario (ver downloadOCRequestPdf). Bajarla al hacer clic tardaba más
  // que la ventana que permite abrir el selector y la descarga no salía.
  const quotationRef = data?.quotation ?? null;
  const quotationKey = quotationRef ? `${quotationRef.storagePath ?? ""}|${quotationRef.driveUrl ?? ""}` : "";
  useEffect(() => {
    if (!open || !quotationRef) {
      setQuotation({ status: "none" });
      return;
    }
    let cancelled = false;
    setQuotation({ status: "loading" });
    withTimeout(fetchQuotationFile(quotationRef), QUOTATION_TIMEOUT_MS).then((file) => {
      if (cancelled) return;
      if (file) {
        setQuotation({ status: "ready", file });
      } else {
        setQuotation({ status: "failed" });
        toast.warning("No se pudo obtener la cotización adjunta; se descargará solo la Solicitud de OC.");
      }
    });
    return () => { cancelled = true; };
    // quotationKey identifica la cotización; quotationRef cambia de identidad en cada render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, quotationKey]);

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

  const buildBlob = async (): Promise<Blob> => {
    const doc = await buildOCRequestPdf(shareData());
    return doc.output("blob");
  };

  /**
   * Lo que se descarga: si la solicitud trae cotización y se pudo obtener, un ZIP con
   * la Solicitud (PDF) + la cotización; si no, solo el PDF.
   */
  const buildDownload = async (quotationFile: QuotationFile | null): Promise<{ blob: Blob; fileName: string; zipped: boolean }> => {
    const pdfBlob = await buildBlob();
    const pdfFileName = ocRequestPdfFileName(data!);
    if (quotationFile) {
      const zip = await buildOCRequestZip({ blob: pdfBlob, fileName: pdfFileName }, quotationFile);
      return { blob: zip, fileName: ocRequestZipFileName(pdfFileName), zipped: true };
    }
    return { blob: pdfBlob, fileName: pdfFileName, zipped: false };
  };

  /**
   * @param mode "direct" = descarga normal del navegador (a su carpeta de descargas, con su
   *   barra de descargas); es lo que hace el botón principal porque siempre funciona.
   *   "picker" = abre el selector "Guardar como": en algunos Edge se cierra con "cancelado"
   *   aunque se elija carpeta y no guarda nada (reportado por el usuario), por eso es opcional.
   */
  const handleDownload = async (mode: "direct" | "picker") => {
    if (!data) return;
    const direct = mode === "direct";
    setDownloading(true);
    let target: SaveTarget | null = null;
    try {
      const quotationFile = quotation.status === "ready" ? quotation.file : null;
      const pdfFileName = ocRequestPdfFileName(data);
      const targetName = quotationFile ? ocRequestZipFileName(pdfFileName) : pdfFileName;

      // Lo PRIMERO del clic: abrir el selector "Guardar como". Solo se puede mientras
      // dura el gesto del usuario (~5 s); armar el archivo antes lo dejaba fuera de ese
      // plazo y la descarga no salía. El archivo se arma después y se escribe en el destino.
      target = direct ? { status: "unsupported" } : await pickSaveLocation(targetName);
      if (target.status === "cancelled") {
        // Antes volvía a esta pantalla en silencio y no se sabía si había pasado algo.
        toast.info("Guardado cancelado", {
          description: "Si no cancelaste tú, usa el botón «Descargar» (va directo a tu carpeta de descargas).",
        });
        return;
      }

      const { blob, fileName, zipped } = await buildDownload(quotationFile);
      const result = await downloadOCRequestPdf(blob, fileName, target);
      rememberMethod("download");
      const what = zipped ? "ZIP" : "PDF";
      if (result === "fallback") {
        toast.warning(`No se pudo guardar el ${what} en la carpeta elegida; se descargó con la descarga normal del navegador (revisa tu carpeta Descargas).`);
      } else {
        toast.success(result === "saved" ? `${what} guardado: ${fileName}` : `${what} descargado: ${fileName}`);
      }
      onOpenChange(false);
    } catch (err: any) {
      console.error("Error al descargar la Solicitud de OC:", err);
      // El selector ya creó un archivo vacío en la carpeta elegida: mejor esfuerzo por quitarlo.
      if (target?.status === "ready") {
        try { await target.handle.remove?.(); } catch { /* sin permiso o no soportado */ }
      }
      // Con el detalle del error: antes el mensaje genérico no permitía saber qué falló.
      toast.error(`No se pudo generar el archivo para descargar: ${err?.name ?? "Error"}${err?.message ? ` – ${err.message}` : ""}`);
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
      const blob = await buildBlob();
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
        const { blob, fileName } = await buildDownload(quotation.status === "ready" ? quotation.file : null);
        // Directo: aquí ya no hay un clic reciente del usuario, así que el selector "Guardar como" no puede abrirse.
        await downloadOCRequestPdf(blob, fileName, { status: "unsupported" });
      } catch (downloadErr) {
        console.error("Además falló la descarga de respaldo:", downloadErr);
      }
    } finally {
      setSending(false);
    }
  };

  const busy = sending || downloading;
  const preparingQuotation = quotation.status === "loading";
  const actionsDisabled = busy || (requireMigoChoice && migoChoice === null);
  // Descargar espera a que termine de bajar la cotización (enviar por correo no la usa).
  const downloadDisabled = actionsDisabled || preparingQuotation;
  const willZip = !!data?.quotation && quotation.status !== "failed";

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
            {willZip && " La descarga viene en un ZIP con la Solicitud de OC y la cotización adjunta."}
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
            onClick={() => handleDownload("direct")}
            disabled={downloadDisabled}
            className="w-full sm:w-auto"
          >
            {downloading || preparingQuotation ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Download className="h-4 w-4 mr-1" />}
            {preparingQuotation ? "Preparando cotización…" : willZip ? "Descargar ZIP" : "Descargar PDF"}
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

        <Button
          type="button"
          variant="link"
          size="sm"
          className="h-auto p-0 text-xs text-muted-foreground self-center"
          onClick={() => handleDownload("picker")}
          disabled={downloadDisabled}
        >
          Elegir carpeta para guardar…
        </Button>
      </DialogContent>
    </Dialog>
  );
}
