import { useState, useEffect, useCallback, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ImagePlus, Loader2, Trash2, FileSpreadsheet, ClipboardPaste, CheckSquare, Square, X } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
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
  const [pastedFile, setPastedFile] = useState<File | null>(null);
  const [pastedPreview, setPastedPreview] = useState<string | null>(null);
  const [pasteName, setPasteName] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectionMode, setSelectionMode] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const exitSelectionMode = () => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  };

  const handleDeleteSelected = async () => {
    if (selectedIds.size === 0) return;
    const toDelete = images.filter((img) => selectedIds.has(img.id));
    try {
      for (const image of toDelete) {
        if (isStorageUrl(image.url)) {
          const { extractStoragePath } = await import("@/lib/storageUtils");
          const path = extractStoragePath(image.url);
          if (path) await supabase.storage.from("repository-files").remove([path]);
        }
        await supabase.from("repository_files").delete().eq("id", image.id);
      }
      toast.success(`${toDelete.length} archivo(s) eliminado(s)`);
      exitSelectionMode();
      loadImages();
    } catch {
      toast.error("Error al eliminar archivos");
    }
  };


  const handleClipboardImage = useCallback((file: File) => {
    setPastedFile(file);
    setPastedPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(file);
    });
    setPasteName("");
  }, []);

  const ensureFolder = useCallback(async (): Promise<string> => {
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

      if (!folder) { setImages([]); return; }

      const { data: files } = await supabase
        .from("repository_files")
        .select("id, name, url")
        .eq("folder_id", folder.id)
        .order("uploaded_at", { ascending: false });

      if (!files) { setImages([]); return; }

      const resolved = await Promise.all(
        files.map(async (f) => {
          const signedUrl = isStorageUrl(f.url) ? await getSignedUrl(f.url) : f.url;
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

  // Ensure dialog can receive keyboard focus for paste shortcut handling
  useEffect(() => {
    if (!open) return;
    const timeout = window.setTimeout(() => {
      contentRef.current?.focus();
    }, 0);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [open]);

  // Listen for paste events globally while dialog is open
  useEffect(() => {
    if (!open) return;

    const extractImageFromItems = (items?: DataTransferItemList | null) => {
      if (!items) return false;

      for (const item of Array.from(items)) {
        if (!item.type.startsWith("image/")) continue;
        const file = item.getAsFile();
        if (!file) continue;
        handleClipboardImage(file);
        return true;
      }

      return false;
    };

    const pasteHandler = (event: Event) => {
      const clipboardEvent = event as ClipboardEvent;
      const hasImage = extractImageFromItems(clipboardEvent.clipboardData?.items);
      if (hasImage) {
        clipboardEvent.preventDefault();
        clipboardEvent.stopPropagation();
      }
    };

    const keydownHandler = async (event: KeyboardEvent) => {
      const isPasteShortcut = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "v";
      if (!isPasteShortcut || !navigator.clipboard?.read) return;

      try {
        const clipboardItems = await navigator.clipboard.read();
        for (const clipboardItem of clipboardItems) {
          const imageType = clipboardItem.types.find((type) => type.startsWith("image/"));
          if (!imageType) continue;

          const blob = await clipboardItem.getType(imageType);
          const extension = imageType.split("/")[1] || "png";
          handleClipboardImage(new File([blob], `clipboard.${extension}`, { type: imageType }));
          event.preventDefault();
          return;
        }
      } catch {
        // If clipboard API is not available/authorized, regular paste event remains as fallback.
      }
    };

    document.addEventListener("paste", pasteHandler, true);
    window.addEventListener("paste", pasteHandler, true);
    document.addEventListener("keydown", keydownHandler, true);

    return () => {
      document.removeEventListener("paste", pasteHandler, true);
      window.removeEventListener("paste", pasteHandler, true);
      document.removeEventListener("keydown", keydownHandler, true);
    };
  }, [open, handleClipboardImage]);

  // Cleanup preview URL
  useEffect(() => {
    return () => { if (pastedPreview) URL.revokeObjectURL(pastedPreview); };
  }, [pastedPreview]);

  const handleUpload = async (files: FileList | File[], overrideName?: string) => {
    if (!files || files.length === 0) return;

    setUploading(true);
    try {
      const folderId = await ensureFolder();
      let count = 0;

      for (const file of Array.from(files)) {
        const isImage = file.type.startsWith("image/");
        const isExcel = /\.(xls|xlsx)$/i.test(file.name) ||
          file.type === "application/vnd.ms-excel" ||
          file.type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

        if (!isImage && !isExcel) {
          toast.error(`${file.name}: Solo se permiten imágenes y archivos Excel`);
          continue;
        }
        const finalName = overrideName || file.name;
        const ext = file.type.startsWith("image/png") ? ".png" : file.type.startsWith("image/webp") ? ".webp" : ".jpg";
        const displayName = overrideName
          ? (overrideName.includes(".") ? overrideName : overrideName + ext)
          : finalName;

        // Check if a file with this name already exists → replace it
        const existing = images.find((img) => img.name === displayName);
        if (existing) {
          // Delete old storage file
          if (isStorageUrl(existing.url)) {
            const { extractStoragePath } = await import("@/lib/storageUtils");
            const oldPath = extractStoragePath(existing.url);
            if (oldPath) await supabase.storage.from("repository-files").remove([oldPath]);
          }
          await supabase.from("repository_files").delete().eq("id", existing.id);
        }

        const sanitized = sanitizeFileName(displayName);
        const path = `${contractId}/business_case/${Date.now()}_${sanitized}`;

        const { error: uploadError } = await supabase.storage
          .from("repository-files")
          .upload(path, file, { upsert: true });

        if (uploadError) {
          toast.error(`Error al subir ${displayName}`);
          continue;
        }

        const storagePath = `storage://repository-files/${path}`;
        await supabase.from("repository_files").insert({
          folder_id: folderId,
          name: displayName,
          url: storagePath,
          file_type: file.type,
        });

        count++;
      }

      if (count > 0) {
        toast.success(count === 1 && overrideName
          ? `"${overrideName}" guardada`
          : `${count} archivo(s) subido(s)`);
        loadImages();
      }
    } catch (error) {
      console.error("Error uploading:", error);
      toast.error("Error al subir archivos");
    } finally {
      setUploading(false);
    }
  };

  const handlePasteSave = async () => {
    if (!pastedFile || !pasteName.trim()) {
      toast.error("Ingresa un nombre para la imagen");
      return;
    }
    await handleUpload([pastedFile], pasteName.trim());
    setPastedFile(null);
    setPastedPreview(null);
    setPasteName("");
  };

  const cancelPaste = () => {
    setPastedFile(null);
    setPastedPreview(null);
    setPasteName("");
  };

  const handleDelete = async (image: BusinessCaseImage) => {
    try {
      if (isStorageUrl(image.url)) {
        const { extractStoragePath } = await import("@/lib/storageUtils");
        const path = extractStoragePath(image.url);
        if (path) await supabase.storage.from("repository-files").remove([path]);
      }
      await supabase.from("repository_files").delete().eq("id", image.id);
      toast.success("Imagen eliminada");
      loadImages();
    } catch (error) {
      toast.error("Error al eliminar imagen");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col" ref={contentRef} tabIndex={-1}>
        <DialogHeader className="flex-shrink-0">
          <DialogTitle>Business Case — Imágenes</DialogTitle>
          {images.length > 0 && (
            <div className="flex items-center gap-2 pt-1">
              {selectionMode ? (
                <>
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={selectedIds.size === 0}
                    onClick={handleDeleteSelected}
                  >
                    <Trash2 className="h-3.5 w-3.5 mr-1" />
                    Eliminar ({selectedIds.size})
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => {
                    if (selectedIds.size === images.length) {
                      setSelectedIds(new Set());
                    } else {
                      setSelectedIds(new Set(images.map((i) => i.id)));
                    }
                  }}>
                    {selectedIds.size === images.length ? "Deseleccionar todo" : "Seleccionar todo"}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={exitSelectionMode}>
                    <X className="h-3.5 w-3.5 mr-1" />
                    Cancelar
                  </Button>
                </>
              ) : (
                <Button size="sm" variant="outline" onClick={() => setSelectionMode(true)}>
                  <CheckSquare className="h-3.5 w-3.5 mr-1" />
                  Seleccionar
                </Button>
              )}
            </div>
          )}
        </DialogHeader>

        {/* Paste preview panel */}
        {pastedFile && pastedPreview && (
          <div className="border rounded-lg p-4 bg-muted/30 flex-shrink-0 space-y-3">
            <p className="text-sm font-medium">Imagen pegada desde portapapeles</p>
            <div className="flex gap-4 items-start">
              <img src={pastedPreview} alt="Pasted" className="h-24 w-auto rounded border object-contain" />
              <div className="flex-1 space-y-2">
                <Input
                  placeholder="Nombre de la imagen (ej: Plano Local)"
                  value={pasteName}
                  onChange={(e) => setPasteName(e.target.value)}
                  autoFocus
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handlePasteSave(); } }}
                />
                <p className="text-xs text-muted-foreground">
                  Si ya existe una imagen con este nombre, será reemplazada.
                </p>
                <div className="flex gap-2">
                  <Button size="sm" onClick={handlePasteSave} disabled={uploading || !pasteName.trim()}>
                    {uploading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                    Guardar
                  </Button>
                  <Button size="sm" variant="outline" onClick={cancelPaste} disabled={uploading}>
                    Cancelar
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

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
          {uploading && !pastedFile ? (
            <div className="flex items-center justify-center gap-2 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span className="text-sm">Subiendo...</span>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-1 text-muted-foreground">
              <ImagePlus className="h-6 w-6" />
              <span className="text-sm">Haz clic o arrastra imágenes o archivos Excel aquí</span>
              <span className="text-xs flex items-center gap-1 mt-1">
                <ClipboardPaste className="h-3 w-3" /> También puedes pegar (Ctrl+V) una imagen
              </span>
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
                <div
                  key={img.id}
                  className={`group relative rounded-lg overflow-hidden border bg-muted aspect-video ${
                    selectionMode && selectedIds.has(img.id) ? "ring-2 ring-primary" : ""
                  }`}
                  onClick={selectionMode ? (e) => { e.stopPropagation(); toggleSelect(img.id); } : undefined}
                >
                  {selectionMode && (
                    <div className="absolute top-1 left-1 z-10">
                      <Checkbox
                        checked={selectedIds.has(img.id)}
                        onCheckedChange={() => toggleSelect(img.id)}
                        className="h-5 w-5 bg-background/80 border-muted-foreground/50"
                      />
                    </div>
                  )}
                  {img.signedUrl && /\.(xls|xlsx)$/i.test(img.name) ? (
                    <div
                      className={`w-full h-full flex flex-col items-center justify-center gap-1 ${selectionMode ? "cursor-pointer" : "cursor-pointer"}`}
                      onClick={selectionMode ? undefined : () => window.open(img.signedUrl!, "_blank")}
                    >
                      <FileSpreadsheet className="h-8 w-8 text-emerald-600 dark:text-emerald-400" />
                      <span className="text-xs text-muted-foreground">Excel</span>
                    </div>
                  ) : img.signedUrl ? (
                    <img
                      src={img.signedUrl}
                      alt={img.name}
                      className={`w-full h-full object-cover ${selectionMode ? "cursor-pointer" : "cursor-pointer"}`}
                      onClick={selectionMode ? undefined : () => window.open(img.signedUrl!, "_blank")}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-xs text-muted-foreground">
                      Sin vista previa
                    </div>
                  )}
                  {!selectionMode && (
                    <Button
                      variant="destructive"
                      size="icon"
                      className="absolute top-1 right-1 h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => handleDelete(img)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  )}
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
