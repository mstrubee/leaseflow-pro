import { useState, useEffect } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { FileText, ExternalLink, Trash2, CloudOff, Cloud, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getSignedUrl, isStorageUrl } from "@/lib/storageUtils";
import { toast } from "sonner";

interface PatentFileListPopoverProps {
  urls: string[];
  contractId: string;
  itemId: string;
  onRemoveFile: (index: number) => void;
}

interface FileInfo {
  url: string;
  name: string;
  driveStatus: 'checking' | 'ok' | 'missing' | 'not_applicable';
  driveUrl?: string;
}

export function PatentFileListPopover({ urls, contractId, itemId, onRemoveFile }: PatentFileListPopoverProps) {
  const [open, setOpen] = useState(false);
  const [files, setFiles] = useState<FileInfo[]>([]);
  const [deleteIndex, setDeleteIndex] = useState<number | null>(null);

  // Check Drive status for each file when popover opens
  useEffect(() => {
    if (!open) return;

    const initialFiles: FileInfo[] = urls.map(url => ({
      url,
      name: cleanFileName(url.split('/').pop() || 'archivo'),
      driveStatus: isStorageUrl(url) ? 'checking' : (url.includes('drive.google.com') ? 'ok' : 'not_applicable'),
      driveUrl: url.includes('drive.google.com') ? url : undefined,
    }));
    setFiles(initialFiles);

    // For storage files, check if they have a Drive backup
    initialFiles.forEach(async (file, index) => {
      if (file.driveStatus !== 'checking') return;

      try {
        // Look for this file in repository_files by matching the storage path
        const fileName = file.url.split('/').pop() || '';
        const { data } = await supabase
          .from("repository_files")
          .select("drive_file_id, url")
          .or(`url.eq.${file.url},name.ilike.%${fileName}%`)
          .limit(5);

        const match = (data || []).find(r => r.drive_file_id);

        setFiles(prev => {
          const updated = [...prev];
          if (updated[index]) {
            updated[index] = {
              ...updated[index],
              driveStatus: match?.drive_file_id ? 'ok' : 'missing',
              driveUrl: match?.drive_file_id
                ? `https://drive.google.com/file/d/${match.drive_file_id}/view`
                : undefined,
            };
          }
          return updated;
        });
      } catch {
        setFiles(prev => {
          const updated = [...prev];
          if (updated[index]) {
            updated[index] = { ...updated[index], driveStatus: 'missing' };
          }
          return updated;
        });
      }
    });
  }, [open, urls, contractId, itemId]);

  const handleView = async (file: FileInfo) => {
    try {
      // Prefer Drive URL if available
      if (file.driveUrl) {
        window.open(file.driveUrl, '_blank');
        return;
      }
      if (isStorageUrl(file.url) || file.url.includes('/repository-files/')) {
        const signedUrl = await getSignedUrl(file.url);
        if (signedUrl) {
          window.open(signedUrl, '_blank');
        } else {
          toast.error("No se pudo acceder al archivo");
        }
      } else {
        window.open(file.url, '_blank');
      }
    } catch {
      toast.error("Error al abrir archivo");
    }
  };

  const confirmDelete = () => {
    if (deleteIndex !== null) {
      onRemoveFile(deleteIndex);
      setDeleteIndex(null);
      if (urls.length <= 1) {
        setOpen(false);
      }
    }
  };

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-primary hover:text-primary/80"
            onClick={(e) => e.stopPropagation()}
            title={`${urls.length} archivos - click para ver`}
          >
            <FileText className="h-3 w-3" />
            <span className="ml-1 text-xs">{urls.length}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-80 p-0"
          align="start"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-3 py-2 border-b border-border">
            <p className="text-sm font-medium">Archivos ({files.length})</p>
          </div>
          <div className="max-h-60 overflow-y-auto divide-y divide-border">
            {files.map((file, index) => (
              <div key={index} className="px-3 py-2 flex items-center gap-2 hover:bg-muted/50 transition-colors">
                {/* Drive status icon */}
                <div className="flex-shrink-0" title={
                  file.driveStatus === 'ok' ? 'En Google Drive' :
                  file.driveStatus === 'missing' ? 'No está en Google Drive' :
                  file.driveStatus === 'checking' ? 'Verificando...' : 'Enlace externo'
                }>
                  {file.driveStatus === 'checking' && <Loader2 className="h-3.5 w-3.5 text-muted-foreground animate-spin" />}
                  {file.driveStatus === 'ok' && <Cloud className="h-3.5 w-3.5 text-green-600" />}
                  {file.driveStatus === 'missing' && <CloudOff className="h-3.5 w-3.5 text-destructive" />}
                  {file.driveStatus === 'not_applicable' && <FileText className="h-3.5 w-3.5 text-muted-foreground" />}
                </div>

                {/* File name */}
                <span className="text-xs truncate flex-1 min-w-0">{file.name}</span>

                {/* Actions */}
                <div className="flex gap-0.5 flex-shrink-0">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6"
                    onClick={() => handleView(file)}
                    title="Ver archivo"
                  >
                    <ExternalLink className="h-3 w-3" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6 text-destructive hover:text-destructive"
                    onClick={() => setDeleteIndex(index)}
                    title="Eliminar archivo"
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </PopoverContent>
      </Popover>

      {/* Delete confirmation */}
      <AlertDialog open={deleteIndex !== null} onOpenChange={(o) => { if (!o) setDeleteIndex(null); }}>
        <AlertDialogContent onClick={(e) => e.stopPropagation()}>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar archivo?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteIndex !== null && files[deleteIndex] && (
                <>Se eliminará <strong>{files[deleteIndex].name}</strong>. Esta acción no se puede deshacer.</>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function cleanFileName(name: string): string {
  // Remove timestamp prefixes like "1773747487785_0_"
  return name.replace(/^\d{10,}_\d+_/, '');
}
