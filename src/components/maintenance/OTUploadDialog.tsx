import { useState, useRef, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Upload, FileText, X, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  formId: string | null;
  formNumber: string;
  onSuccess: () => void;
}

/** Comprime fotos (JPG/PNG) antes de subirlas: la mayoría de las OT firmadas
 *  llegan como foto de celular (varios MB a resolución completa), lo que hace
 *  la subida muy lenta en las sucursales con internet más débil. Los PDF no
 *  se tocan — recomprimir un PDF ya generado requiere librerías más pesadas. */
async function compressIfImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.type === "image/gif") return file;

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = URL.createObjectURL(file);
  });

  const MAX_DIMENSION = 2000;
  const scale = Math.min(1, MAX_DIMENSION / Math.max(img.width, img.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  URL.revokeObjectURL(img.src);

  const blob: Blob | null = await new Promise(resolve => canvas.toBlob(resolve, "image/jpeg", 0.75));
  if (!blob || blob.size >= file.size) return file;

  const newName = file.name.replace(/\.[^.]+$/, "") + ".jpg";
  return new File([blob], newName, { type: "image/jpeg" });
}

export function OTUploadDialog({ open, onOpenChange, formId, formNumber, onSuccess }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const dropped = e.dataTransfer.files?.[0];
    if (dropped) setFile(dropped);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => setDragOver(false), []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) setFile(selected);
  };

  const handleUpload = async () => {
    if (!file || !formId) return;
    setUploading(true);
    setProgress(0);
    try {
      const toUpload = await compressIfImage(file);
      const sanitized = toUpload.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `${new Date().toISOString().slice(0, 10)}/${formId}_OT_${sanitized}`;

      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) throw new Error("Sesión expirada, vuelva a iniciar sesión.");
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
      const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

      // Se usa XHR directo (en vez del upload() de supabase-js) para poder
      // mostrar el progreso real de la subida — sin esto la UI parece
      // "colgada" durante archivos grandes en conexiones lentas de sucursal.
      // El body se manda como multipart/form-data replicando exactamente lo
      // que hace el cliente oficial de Supabase (StorageFileApi.uploadOrUpdate),
      // que espera el archivo en un campo sin nombre junto a "cacheControl" —
      // mandar los bytes crudos con Content-Type del archivo lo rechaza.
      const formData = new FormData();
      formData.append("cacheControl", "3600");
      formData.append("", toUpload);

      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", `${supabaseUrl}/storage/v1/object/ot-files/${path}`);
        xhr.setRequestHeader("apikey", anonKey);
        xhr.setRequestHeader("Authorization", `Bearer ${accessToken}`);
        xhr.setRequestHeader("x-upsert", "true");
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100));
        };
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) resolve();
          else reject(new Error(`No se pudo subir el archivo (${xhr.status}): ${xhr.responseText}`));
        };
        xhr.onerror = () => reject(new Error("Error de red al subir el archivo"));
        xhr.send(formData);
      });

      const { data: urlData } = supabase.storage
        .from("ot-files")
        .getPublicUrl(path);

      const publicUrl = urlData?.publicUrl || "";

      const { error: updateError } = await (supabase as any)
        .from("maintenance_forms")
        .update({ ot_file_url: publicUrl, updated_at: new Date().toISOString() })
        .eq("id", formId);
      if (updateError) throw updateError;

      toast({ title: "OT subida correctamente" });
      setFile(null);
      onOpenChange(false);
      onSuccess();
    } catch (err: any) {
      console.error(err);
      toast({ title: "Error al subir OT", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
      setProgress(0);
    }
  };

  const handleClose = () => {
    setFile(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) handleClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Subir OT Firmada — FORM {formNumber}</DialogTitle>
          <DialogDescription>
            Suba la Orden de Trabajo firmada por el jefe de sucursal.
          </DialogDescription>
        </DialogHeader>

        <div
          className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer ${
            dragOver ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-primary/50"
          }`}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={() => inputRef.current?.click()}
        >
          <input
            ref={inputRef}
            type="file"
            className="hidden"
            accept=".pdf,.xlsx,.xls,.doc,.docx,.png,.jpg,.jpeg"
            onChange={handleFileSelect}
          />
          {file ? (
            <div className="flex items-center justify-center gap-3">
              <FileText className="h-8 w-8 text-primary shrink-0" />
              <div className="text-left min-w-0">
                <p className="text-sm font-medium truncate">{file.name}</p>
                <p className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(1)} KB</p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0"
                onClick={e => { e.stopPropagation(); setFile(null); }}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              <Upload className="h-10 w-10 mx-auto text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Arrastre el archivo aquí o haga clic para seleccionar
              </p>
              <p className="text-xs text-muted-foreground">PDF, Excel, Word o imagen</p>
            </div>
          )}
        </div>

        {uploading && (
          <div className="space-y-1">
            <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
              <div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} />
            </div>
            <p className="text-xs text-muted-foreground text-right">{progress}%</p>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={handleClose} disabled={uploading}>
            Cancelar
          </Button>
          <Button onClick={handleUpload} disabled={!file || uploading}>
            {uploading ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Subiendo... {progress}%</>
            ) : (
              <><Upload className="h-4 w-4 mr-2" /> Subir OT</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
