import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Upload, FolderOpen, Link, X, File, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

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

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const folderPath = selectedFolder || `${contractId}/${itemId}`;
      const fileName = `${folderPath}/${Date.now()}.${fileExt}`;

      const { data, error } = await supabase.storage
        .from('repository-files')
        .upload(fileName, file, { upsert: true });

      if (error) throw error;

      const { data: urlData } = supabase.storage
        .from('repository-files')
        .getPublicUrl(fileName);

      onSave(urlData.publicUrl, selectedFolder || undefined);
      toast.success("Archivo subido correctamente");
      onOpenChange(false);
    } catch (error) {
      console.error("Error uploading file:", error);
      toast.error("Error al subir archivo");
    } finally {
      setUploading(false);
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
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Documento: {itemName}</DialogTitle>
        </DialogHeader>

        {currentUrl && (
          <div className="p-3 bg-muted rounded-lg flex items-center justify-between">
            <div className="flex items-center gap-2 overflow-hidden">
              <File className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <span className="text-sm truncate">{currentUrl.split('/').pop()}</span>
            </div>
            <div className="flex gap-1">
              <Button size="icon" variant="ghost" asChild>
                <a href={currentUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-4 w-4" />
                </a>
              </Button>
              <Button size="icon" variant="ghost" className="text-destructive" onClick={handleRemoveDocument}>
                <X className="h-4 w-4" />
              </Button>
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
            <div className="border-2 border-dashed rounded-lg p-8 text-center">
              <Input
                type="file"
                id="file-upload"
                className="hidden"
                onChange={handleFileUpload}
                disabled={uploading}
                accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png"
              />
              <Label
                htmlFor="file-upload"
                className="cursor-pointer flex flex-col items-center gap-2"
              >
                <Upload className="h-8 w-8 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">
                  {uploading ? "Subiendo..." : "Haz clic o arrastra un archivo"}
                </span>
                <span className="text-xs text-muted-foreground">
                  PDF, Word, Excel, imágenes
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
