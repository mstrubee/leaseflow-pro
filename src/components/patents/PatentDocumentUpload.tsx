import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Upload, FolderOpen, Link, X, File, ExternalLink, Download, CheckSquare } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { validateFile, sanitizeFileName } from "@/lib/fileValidation";
import { getSignedUrl, isStorageUrl } from "@/lib/storageUtils";
import { backupPatentFileToDestinations } from "@/lib/patentBackup";

interface PatentDocumentUploadProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contractId: string;
  itemId: string;
  itemName: string;
  currentUrl?: string;
  onSave: (url: string, folderId?: string) => void;
  folders?: { id: string; name: string }[];
}

export function PatentDocumentUpload({
  open,
  onOpenChange,
  contractId,
  itemId,
  itemName,
  currentUrl,
  onSave,
  folders = [],
}: PatentDocumentUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [manualUrl, setManualUrl] = useState(currentUrl || "");
  const [activeTab, setActiveTab] = useState<'upload' | 'url'>('upload');
  const [selectedFolder, setSelectedFolder] = useState<string>("");
  const [dragging, setDragging] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [downloading, setDownloading] = useState(false);

  const urls = currentUrl ? currentUrl.split('|||').filter(Boolean) : [];

  const toggleSelection = (index: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const handleDownloadSelected = async () => {
    if (selectedIds.size === 0) return;
    setDownloading(true);
    try {
      for (const index of selectedIds) {
        const url = urls[index];
        if (!url) continue;
        let downloadUrl = url;
        if (isStorageUrl(url)) {
          const signed = await getSignedUrl(url);
          if (!signed) {
            toast.error(`No se pudo acceder al archivo ${url.split('/').pop()}`);
            continue;
          }
          downloadUrl = signed;
        }
        const link = document.createElement('a');
        link.href = downloadUrl;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.download = url.split('/').pop() || 'archivo';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        // Small delay between downloads to avoid browser blocking
        if (selectedIds.size > 1) await new Promise(r => setTimeout(r, 500));
      }
      toast.success(`${selectedIds.size} archivo(s) descargado(s)`);
    } catch (error) {
      console.error("Error downloading files:", error);
      toast.error("Error al descargar archivos");
    } finally {
      setDownloading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    try {
      const uploadedUrls: string[] = [];
      
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        
        // Validate file before upload
        const validation = validateFile(file);
        if (!validation.isValid) {
          toast.error(`${file.name}: ${validation.error}`);
          continue;
        }

        const sanitizedName = sanitizeFileName(file.name);
        const folderPath = selectedFolder || `${contractId}/${itemId}`;
        const fileName = `${folderPath}/${Date.now()}_${i}_${sanitizedName}`;

        const { data, error } = await supabase.storage
          .from('repository-files')
          .upload(fileName, file, { upsert: true });

        if (error) {
          console.error(`Error uploading ${file.name}:`, error);
          toast.error(`Error al subir ${file.name}`);
          continue;
        }

        // Store the storage path reference instead of public URL for security
        const storagePath = `storage://repository-files/${fileName}`;
        uploadedUrls.push(storagePath);
      }

      if (uploadedUrls.length > 0) {
        // Backup each uploaded file to configured patent destination folders
        for (const url of uploadedUrls) {
          const name = url.split('/').pop() || 'patent_file';
          await backupPatentFileToDestinations(contractId, url, name);
        }

        // If there's a currentUrl, append to it; otherwise use the new URLs
        const existingUrls = currentUrl ? currentUrl.split('|||').filter(Boolean) : [];
        const allUrls = [...existingUrls, ...uploadedUrls].join('|||');
        
        onSave(allUrls, selectedFolder || undefined);
        toast.success(`${uploadedUrls.length} archivo(s) subido(s) correctamente`);
        onOpenChange(false);
      }
    } catch (error) {
      console.error("Error uploading files:", error);
      toast.error("Error al subir archivos");
    } finally {
      setUploading(false);
      if (e.target) {
        e.target.value = "";
      }
    }
  };

  const handleUrlSave = () => {
    if (!manualUrl.trim()) {
      toast.error("Ingresa una URL válida");
      return;
    }
    onSave(manualUrl.trim());
    toast.success("URL guardada");
    onOpenChange(false);
  };

  const handleRemoveDocument = () => {
    onSave("");
    toast.success("Documento eliminado");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto min-h-[60vh]">
        <DialogHeader>
          <DialogTitle>Documento: {itemName}</DialogTitle>
        </DialogHeader>

        {currentUrl && urls.length > 0 && (
          <div className="space-y-2 flex-1 min-h-0">
            <div className="flex items-center justify-between">
              <Label className="text-sm text-muted-foreground">Archivos existentes:</Label>
              <div className="flex items-center gap-1">
                {selectionMode && (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      onClick={() => {
                        if (selectedIds.size === urls.length) setSelectedIds(new Set());
                        else setSelectedIds(new Set(urls.map((_, i) => i)));
                      }}
                    >
                      {selectedIds.size === urls.length ? "Deseleccionar" : "Seleccionar todo"}
                    </Button>
                    <Button
                      size="sm"
                      variant="default"
                      className="h-7 text-xs"
                      disabled={selectedIds.size === 0 || downloading}
                      onClick={handleDownloadSelected}
                    >
                      <Download className="h-3 w-3 mr-1" />
                      {downloading ? "Descargando..." : `Descargar (${selectedIds.size})`}
                    </Button>
                  </>
                )}
                <Button
                  size="sm"
                  variant={selectionMode ? "secondary" : "ghost"}
                  className="h-7 text-xs"
                  onClick={() => {
                    setSelectionMode(!selectionMode);
                    setSelectedIds(new Set());
                  }}
                >
                  <CheckSquare className="h-3 w-3 mr-1" />
                  {selectionMode ? "Cancelar" : "Seleccionar"}
                </Button>
              </div>
            </div>
            <div className="space-y-2 max-h-[40vh] overflow-y-auto">
              {urls.map((url, index) => (
                <div key={index} className={`p-2 bg-muted rounded-lg flex items-center justify-between ${selectionMode && selectedIds.has(index) ? 'ring-2 ring-primary' : ''}`}>
                  <div className="flex items-center gap-2 overflow-hidden flex-1">
                    {selectionMode && (
                      <Checkbox
                        checked={selectedIds.has(index)}
                        onCheckedChange={() => toggleSelection(index)}
                      />
                    )}
                    <File className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    <span className="text-sm truncate">{url.split('/').pop()}</span>
                  </div>
                  {!selectionMode && (
                    <div className="flex gap-1 flex-shrink-0">
                      <Button size="icon" variant="ghost" className="h-7 w-7" asChild>
                        <a href={url} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </Button>
                      <Button 
                        size="icon" 
                        variant="ghost" 
                        className="h-7 w-7 text-destructive" 
                        onClick={() => {
                          const newUrls = [...urls];
                          newUrls.splice(index, 1);
                          onSave(newUrls.join('|||'));
                          if (newUrls.length === 0) {
                            toast.success("Documento eliminado");
                          }
                        }}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="upload">Subir archivo</TabsTrigger>
            <TabsTrigger value="url">URL manual</TabsTrigger>
          </TabsList>

          <TabsContent value="upload" className="mt-4 space-y-4">
            {folders.length > 0 && (
              <div className="space-y-2">
                <Label>Carpeta destino</Label>
                <select
                  className="w-full h-10 px-3 rounded-md border border-input bg-background"
                  value={selectedFolder}
                  onChange={(e) => setSelectedFolder(e.target.value)}
                >
                  <option value="">Carpeta por defecto</option>
                  {folders.map(folder => (
                    <option key={folder.id} value={folder.id}>{folder.name}</option>
                  ))}
                </select>
              </div>
            )}
            <div
              className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${dragging ? 'border-primary bg-primary/5' : ''}`}
              onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setDragging(true); }}
              onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setDragging(false); }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setDragging(false);
                if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                  const input = document.getElementById('file-upload') as HTMLInputElement;
                  if (input) {
                    const dt = new DataTransfer();
                    for (let i = 0; i < e.dataTransfer.files.length; i++) {
                      dt.items.add(e.dataTransfer.files[i]);
                    }
                    input.files = dt.files;
                    input.dispatchEvent(new Event('change', { bubbles: true }));
                  }
                }
              }}
            >
              <Input
                type="file"
                id="file-upload"
                className="hidden"
                onChange={handleFileUpload}
                disabled={uploading}
                accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.dwg"
                multiple
              />
              <Label
                htmlFor="file-upload"
                className="cursor-pointer flex flex-col items-center gap-2"
              >
                <Upload className="h-8 w-8 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">
                  {uploading ? "Subiendo..." : dragging ? "Suelta los archivos aquí" : "Haz clic o arrastra archivos"}
                </span>
                <span className="text-xs text-muted-foreground">
                  PDF, Word, Excel, imágenes (múltiples archivos permitidos)
                </span>
              </Label>
            </div>
          </TabsContent>

          <TabsContent value="url" className="mt-4 space-y-4">
            <div className="space-y-2">
              <Label>URL del documento</Label>
              <Input
                placeholder="https://..."
                value={manualUrl}
                onChange={(e) => setManualUrl(e.target.value)}
              />
            </div>
            <Button onClick={handleUrlSave} className="w-full">
              <Link className="h-4 w-4 mr-2" />
              Guardar URL
            </Button>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
