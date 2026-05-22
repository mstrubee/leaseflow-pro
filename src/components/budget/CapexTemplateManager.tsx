import { useState, useEffect, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Upload, Trash2, FileDown, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const BUCKET = "repository-files";
const TEMPLATE_PATH = "capex_templates/single_contract_template.pptx";

interface CapexTemplateManagerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CapexTemplateManager({ open, onOpenChange }: CapexTemplateManagerProps) {
  const [hasTemplate, setHasTemplate] = useState(false);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);

  const checkTemplate = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await supabase.storage.from(BUCKET).list("capex_templates", { limit: 10 });
      const exists = (data || []).some(f => f.name === "single_contract_template.pptx");
      setHasTemplate(exists);
    } catch {
      setHasTemplate(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) checkTemplate();
  }, [open, checkTemplate]);

  const handleUpload = async (file: File) => {
    if (!file.name.endsWith(".pptx")) {
      toast.error("Solo se permiten archivos .pptx");
      return;
    }
    setUploading(true);
    try {
      const { error } = await supabase.storage.from(BUCKET).upload(TEMPLATE_PATH, file, { upsert: true });
      if (error) throw error;
      toast.success("Template subido correctamente");
      setHasTemplate(true);
    } catch (err) {
      console.error(err);
      toast.error("Error al subir template");
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async () => {
    try {
      await supabase.storage.from(BUCKET).remove([TEMPLATE_PATH]);
      toast.success("Template eliminado");
      setHasTemplate(false);
    } catch {
      toast.error("Error al eliminar template");
    }
  };

  const handleDownload = async () => {
    const { data } = await supabase.storage.from(BUCKET).createSignedUrl(TEMPLATE_PATH, 60);
    if (!data?.signedUrl) {
      toast.error("No se pudo descargar el template");
      return;
    }
    try {
      const response = await fetch(data.signedUrl);
      if (!response.ok) throw new Error("fetch failed");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "single_contract_template.pptx";
      a.style.display = "none";
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 1000);
    } catch {
      toast.error("No se pudo descargar el template");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Template PPT Single</DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : hasTemplate ? (
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-4 rounded-lg border bg-muted/50">
              <FileDown className="h-8 w-8 text-primary shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">single_contract_template.pptx</p>
                <p className="text-xs text-muted-foreground">Template activo</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleDownload} className="flex-1 gap-2">
                <FileDown className="h-4 w-4" />
                Descargar
              </Button>
              <Button variant="destructive" size="sm" onClick={handleDelete} className="gap-2">
                <Trash2 className="h-4 w-4" />
                Eliminar
              </Button>
            </div>
            <div className="text-center">
              <p className="text-xs text-muted-foreground mb-2">O reemplazar con uno nuevo:</p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const input = document.createElement("input");
                  input.type = "file";
                  input.accept = ".pptx";
                  input.onchange = () => { if (input.files?.[0]) handleUpload(input.files[0]); };
                  input.click();
                }}
                disabled={uploading}
                className="gap-2"
              >
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                Reemplazar Template
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground text-center py-4">
              No hay template cargado. Sube un archivo .pptx para usar como base.
            </p>
            <Button
              className="w-full gap-2"
              onClick={() => {
                const input = document.createElement("input");
                input.type = "file";
                input.accept = ".pptx";
                input.onchange = () => { if (input.files?.[0]) handleUpload(input.files[0]); };
                input.click();
              }}
              disabled={uploading}
            >
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              Subir Template PPT
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
