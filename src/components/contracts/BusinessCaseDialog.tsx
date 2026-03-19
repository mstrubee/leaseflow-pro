import { useState, useEffect, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ImagePlus, Loader2, Trash2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { getSignedUrl, isStorageUrl } from "@/lib/storageUtils";
import { sanitizeFileName } from "@/lib/fileValidation";

interface BusinessCaseImage {
  id: string;
  name: string;
  url: string;
  signedUrl?: string | null;
}

interface BusinessCaseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contractId: string;
}

export function BusinessCaseDialog({ open, onOpenChange, contractId }: BusinessCaseDialogProps) {
  const [images, setImages] = useState<BusinessCaseImage[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);

  const ensureFolder = useCallback(async (): Promise<string> => {
    // Find or create the "Caso de Negocio" folder for this contract
    const { data: existing } = await supabase
      .from("repository_folders")
      .select("id")
      .eq("contract_id", contractId)
      .eq("name", "Caso de Negocio")
      .maybeSingle();

    if (existing) return existing.id;

    const { data: created, error } = await supabase
      .from("repository_folders")
      .insert({
        contract_id: contractId,
        name: "Caso de Negocio",
        is_base_folder: false,
        folder_type: "business_case",
      })
      .select("id")
      .single();

    if (error) throw error;
    return created.id;
  }, [contractId]);

  const loadImages = useCallback(async () => {
    setLoading(true);
    try {
      const { data: folder } = await supabase
        .from("repository_folders")
        .select("id")
        .eq("contract_id", contractId)
        .eq("name", "Caso de Negocio")
        .maybeSingle();

      if (!folder) {
        setImages([]);
        return;
      }

      const { data: files } = await supabase
        .from("repository_files")
        .select("id, name, url")
        .eq("folder_id", folder.id)
        .order("uploaded_at", { ascending: false });

      if (!files) {
        setImages([]);
        return;
      }

      // Resolve signed URLs for display
      const resolved = await Promise.all(
        files.map(async (f) => {
          let signedUrl: string | null = null;
          if (isStorageUrl(f.url)) {
            signedUrl = await getSignedUrl(f.url);
          } else {
            signedUrl = f.url;
          }
          return { ...f, signedUrl };
        })
      );

      setImages(resolved);
    } catch (error) {
      console.error("Error loading business case images:", error);
    } finally {
      setLoading(false);
    }
  }, [contractId]);

  useEffect(() => {
    if (open) loadImages();
  }, [open, loadImages]);

  const handleUpload = async (files: FileList | File[]) => {
    if (!files || files.length === 0) return;

    setUploading(true);
    try {
      const folderId = await ensureFolder();
      let count = 0;

      for (const file of Array.from(files)) {
        if (!file.type.startsWith("image/")) {
          toast.error(`${file.name}: Solo se permiten imágenes`);
          continue;
        }
        if (file.size > 20 * 1024 * 1024) {
          toast.error(`${file.name}: Tamaño máximo 20MB`);
          continue;
        }

        const sanitized = sanitizeFileName(file.name);
        const path = `${contractId}/business_case/${Date.now()}_${sanitized}`;

        const { error: uploadError } = await supabase.storage
          .from("repository-files")
          .upload(path, file, { upsert: true });

        if (uploadError) {
          toast.error(`Error al subir ${file.name}`);
          continue;
        }

        const storagePath = `storage://repository-files/${path}`;
        await supabase.from("repository_files").insert({
          folder_id: folderId,
          name: file.name,
          url: storagePath,
          file_type: file.type,
        });

        count++;
      }

      if (count > 0) {
        toast.success(`${count} imagen(es) subida(s)`);
        loadImages();
      }
    } catch (error) {
      console.error("Error uploading:", error);
      toast.error("Error al subir imágenes");
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (image: BusinessCaseImage) => {
    try {
      // Delete from storage
      if (isStorageUrl(image.url)) {
        const { extractStoragePath } = await import("@/lib/storageUtils");
        const path = extractStoragePath(image.url);
        if (path) {
          await supabase.storage.from("repository-files").remove([path]);
        }
      }
      // Delete from DB
      await supabase.from("repository_files").delete().eq("id", image.id);
      toast.success("Imagen eliminada");
      loadImages();
    } catch (error) {
      toast.error("Error al eliminar imagen");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle>Business Case — Imágenes</DialogTitle>
        </DialogHeader>

        {/* Upload area */}
        <div
          className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors cursor-pointer flex-shrink-0 ${
            dragging ? "border-primary bg-primary/5" : "border-muted-foreground/25"
          }`}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={(e) => { e.preventDefault(); setDragging(false); }}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            if (e.dataTransfer.files.length > 0) handleUpload(e.dataTransfer.files);
          }}
          onClick={() => {
            const input = document.createElement("input");
            input.type = "file";
            input.accept = "image/*";
            input.multiple = true;
            input.onchange = () => { if (input.files) handleUpload(input.files); };
            input.click();
          }}
        >
          {uploading ? (
            <div className="flex items-center justify-center gap-2 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span className="text-sm">Subiendo...</span>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-1 text-muted-foreground">
              <ImagePlus className="h-6 w-6" />
              <span className="text-sm">Haz clic o arrastra imágenes aquí</span>
            </div>
          )}
        </div>

        {/* Image gallery */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : images.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-8">
              No hay imágenes de Business Case
            </p>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 py-2">
              {images.map((img) => (
                <div key={img.id} className="group relative rounded-lg overflow-hidden border bg-muted aspect-video">
                  {img.signedUrl ? (
                    <img
                      src={img.signedUrl}
                      alt={img.name}
                      className="w-full h-full object-cover cursor-pointer"
                      onClick={() => window.open(img.signedUrl!, "_blank")}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-xs text-muted-foreground">
                      Sin vista previa
                    </div>
                  )}
                  <Button
                    variant="destructive"
                    size="icon"
                    className="absolute top-1 right-1 h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => handleDelete(img)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                  <div className="absolute bottom-0 inset-x-0 bg-background/80 px-2 py-1">
                    <span className="text-xs truncate block">{img.name}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
