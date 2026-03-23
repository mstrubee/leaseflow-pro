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

        {currentUrl && (
          <div className="space-y-2 flex-1 min-h-0">
            <Label className="text-sm text-muted-foreground">Archivos existentes:</Label>
            <div className="space-y-2 max-h-[40vh] overflow-y-auto">
              {currentUrl.split('|||').filter(Boolean).map((url, index) => (
                <div key={index} className="p-2 bg-muted rounded-lg flex items-center justify-between">
                  <div className="flex items-center gap-2 overflow-hidden flex-1">
                    <File className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    <span className="text-sm truncate">{url.split('/').pop()}</span>
                  </div>
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
                        const urls = currentUrl.split('|||').filter(Boolean);
                        urls.splice(index, 1);
                        onSave(urls.join('|||'));
                        if (urls.length === 0) {
                          toast.success("Documento eliminado");
                        }
                      }}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
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
