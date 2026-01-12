import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Folder, FileText, ArrowLeft, Upload, Check } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { validateFile, sanitizeFileName } from "@/lib/fileValidation";

interface RepositoryFolder {
  id: string;
  name: string;
  parent_id: string | null;
  folder_type: string | null;
}

interface RepositoryFile {
  id: string;
  name: string;
  url: string;
  file_type: string | null;
  folder_id: string;
}

interface RepositoryFilePickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contractId: string;
  onFileSelect: (file: RepositoryFile) => void;
  title?: string;
  targetFolder?: string; // e.g., "facturas" to filter or suggest a folder
  allowUpload?: boolean;
  onUploadComplete?: (file: RepositoryFile) => void;
}

export const RepositoryFilePicker = ({
  open,
  onOpenChange,
  contractId,
  onFileSelect,
  title = "Seleccionar Archivo",
  targetFolder,
  allowUpload = true,
  onUploadComplete,
}: RepositoryFilePickerProps) => {
  const [folders, setFolders] = useState<RepositoryFolder[]>([]);
  const [files, setFiles] = useState<RepositoryFile[]>([]);
  const [currentFolder, setCurrentFolder] = useState<RepositoryFolder | null>(null);
  const [folderPath, setFolderPath] = useState<RepositoryFolder[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<RepositoryFile | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (open) {
      loadFolderContents(null);
    }
  }, [open, contractId]);

  const loadFolderContents = async (folderId: string | null) => {
    setLoading(true);
    try {
      let query = supabase
        .from("repository_folders")
        .select("*")
        .eq("contract_id", contractId);

      if (folderId) {
        query = query.eq("parent_id", folderId);
      } else {
        query = query.is("parent_id", null);
      }

      const { data: folderData, error: folderError } = await query;
      if (folderError) throw folderError;
      setFolders(folderData || []);

      if (folderId) {
        const { data: fileData, error: fileError } = await supabase
          .from("repository_files")
          .select("*")
          .eq("folder_id", folderId)
          .order("uploaded_at", { ascending: false });

        if (fileError) throw fileError;
        setFiles(fileData || []);
      } else {
        setFiles([]);
      }
    } catch (error) {
      console.error("Error loading folder contents:", error);
    } finally {
      setLoading(false);
    }
  };

  const navigateToFolder = async (folder: RepositoryFolder) => {
    setCurrentFolder(folder);
    setFolderPath([...folderPath, folder]);
    setSelectedFile(null);
    await loadFolderContents(folder.id);
  };

  const navigateBack = async () => {
    const newPath = [...folderPath];
    newPath.pop();
    const parentFolder = newPath[newPath.length - 1] || null;
    setFolderPath(newPath);
    setCurrentFolder(parentFolder);
    setSelectedFile(null);
    await loadFolderContents(parentFolder?.id || null);
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !currentFolder) return;

    // Validate file before upload
    const validation = validateFile(file);
    if (!validation.isValid) {
      toast({
        variant: "destructive",
        title: "Archivo no válido",
        description: validation.error,
      });
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      return;
    }

    setUploading(true);
    try {
      const fileExt = file.name.split(".").pop();
      const sanitizedName = sanitizeFileName(file.name);
      const fileName = `${Date.now()}-${sanitizedName}`;
      const filePath = `${contractId}/${currentFolder.id}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from("repository-files")
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      // Store the storage path reference instead of public URL for security
      // The path will be converted to a signed URL when accessed
      const storagePath = `storage://repository-files/${filePath}`;

      const { data: newFile, error: dbError } = await supabase
        .from("repository_files")
        .insert({
          folder_id: currentFolder.id,
          name: file.name,
          url: storagePath,
          file_type: fileExt || null,
        })
        .select()
        .single();

      if (dbError) throw dbError;

      toast({ title: "Archivo subido", description: file.name });
      
      await loadFolderContents(currentFolder.id);
      
      if (onUploadComplete && newFile) {
        onUploadComplete(newFile);
      }
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleConfirmSelection = () => {
    if (selectedFile) {
      onFileSelect(selectedFile);
      onOpenChange(false);
      setSelectedFile(null);
      setCurrentFolder(null);
      setFolderPath([]);
    }
  };

  const isTargetFolder = currentFolder?.folder_type?.toLowerCase().includes(targetFolder?.toLowerCase() || "") ||
    currentFolder?.name.toLowerCase().includes(targetFolder?.toLowerCase() || "");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
          <button onClick={() => { setCurrentFolder(null); setFolderPath([]); loadFolderContents(null); }} className="hover:underline">
            Repositorio
          </button>
          {folderPath.map((folder, index) => (
            <span key={folder.id} className="flex items-center gap-2">
              <span>/</span>
              <button
                onClick={() => {
                  const newPath = folderPath.slice(0, index + 1);
                  setFolderPath(newPath);
                  setCurrentFolder(folder);
                  loadFolderContents(folder.id);
                }}
                className="hover:underline"
              >
                {folder.name}
              </button>
            </span>
          ))}
        </div>

        <ScrollArea className="h-[300px] border rounded-lg p-2">
          {loading ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              Cargando...
            </div>
          ) : (
            <div className="space-y-1">
              {currentFolder && (
                <button
                  onClick={navigateBack}
                  className="w-full flex items-center gap-2 p-2 rounded hover:bg-accent text-left"
                >
                  <ArrowLeft className="h-4 w-4" />
                  <span>Volver</span>
                </button>
              )}

              {folders.map((folder) => (
                <button
                  key={folder.id}
                  onClick={() => navigateToFolder(folder)}
                  className="w-full flex items-center gap-2 p-2 rounded hover:bg-accent text-left"
                >
                  <Folder className="h-4 w-4 text-amber-500" />
                  <span>{folder.name}</span>
                </button>
              ))}

              {files.map((file) => (
                <button
                  key={file.id}
                  onClick={() => setSelectedFile(file)}
                  className={cn(
                    "w-full flex items-center gap-2 p-2 rounded hover:bg-accent text-left",
                    selectedFile?.id === file.id && "bg-primary/10 ring-1 ring-primary"
                  )}
                >
                  <FileText className="h-4 w-4 text-blue-500" />
                  <span className="flex-1 truncate">{file.name}</span>
                  {selectedFile?.id === file.id && (
                    <Check className="h-4 w-4 text-primary" />
                  )}
                </button>
              ))}

              {!loading && folders.length === 0 && files.length === 0 && currentFolder && (
                <div className="py-8 text-center text-muted-foreground">
                  Esta carpeta está vacía
                </div>
              )}
            </div>
          )}
        </ScrollArea>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          {allowUpload && currentFolder && (
            <div className="flex-1">
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                onChange={handleFileUpload}
                accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png"
              />
              <Button
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="w-full sm:w-auto"
              >
                <Upload className="h-4 w-4 mr-2" />
                {uploading ? "Subiendo..." : "Subir Archivo"}
              </Button>
            </div>
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button onClick={handleConfirmSelection} disabled={!selectedFile}>
              Seleccionar
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
