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

export function OTUploadDialog({ open, onOpenChange, formId, formNumber, onSuccess }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
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
    try {
      const ext = file.name.split(".").pop() || "pdf";
      const sanitized = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `${new Date().toISOString().slice(0, 10)}/${formId}_OT_${sanitized}`;

      const { error: uploadError } = await supabase.storage
        .from("ot-files")
        .upload(path, file, { upsert: true });
      if (uploadError) throw uploadError;

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

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={handleClose} disabled={uploading}>
            Cancelar
          </Button>
          <Button onClick={handleUpload} disabled={!file || uploading}>
            {uploading ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Subiendo...</>
            ) : (
              <><Upload className="h-4 w-4 mr-2" /> Subir OT</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
