import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
  Folder, 
  FolderPlus, 
  FileText, 
  ChevronRight, 
  ArrowLeft,
  Upload,
  Trash2,
  ExternalLink
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

interface RepositoryFolder {
  id: string;
  name: string;
  parent_id: string | null;
  is_base_folder: boolean;
  folder_type: string | null;
}

interface RepositoryFile {
  id: string;
  name: string;
  url: string;
  file_type: string | null;
  uploaded_at: string;
}

interface RepositorySectionProps {
  contractId: string;
  contractName: string;
}

const BASE_FOLDERS = [
  { name: "Caso de Negocio", type: "caso_negocio", subfolders: [] },
  { name: "Due Diligence Técnico-Inmobiliario", type: "due_diligence", subfolders: [] },
  { name: "Municipales", type: "municipales", subfolders: [] },
  { name: "Títulos", type: "titulos", subfolders: [] },
  { name: "Planos", type: "planos", subfolders: ["Originales", "Proyectos"] },
  { name: "Información Patentes", type: "patentes", subfolders: [] },
  { name: "Borradores de Contrato", type: "borradores", subfolders: [] },
  { name: "Anexos de Contrato", type: "anexos", subfolders: [] },
  { name: "Contratos Anteriores", type: "anteriores", subfolders: [] },
];

export const RepositorySection = ({ contractId, contractName }: RepositorySectionProps) => {
  const { toast } = useToast();
  const [folders, setFolders] = useState<RepositoryFolder[]>([]);
  const [files, setFiles] = useState<RepositoryFile[]>([]);
  const [currentFolder, setCurrentFolder] = useState<RepositoryFolder | null>(null);
  const [folderPath, setFolderPath] = useState<RepositoryFolder[]>([]);
  const [loading, setLoading] = useState(true);
  const [newFolderName, setNewFolderName] = useState("");
  const [newFileUrl, setNewFileUrl] = useState("");
  const [newFileName, setNewFileName] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [fileDialogOpen, setFileDialogOpen] = useState(false);

  useEffect(() => {
    initializeRepository();
  }, [contractId]);

  const initializeRepository = async () => {
    setLoading(true);
    try {
      // Check if base folders exist
      const { data: existingFolders, error: fetchError } = await supabase
        .from("repository_folders")
        .select("*")
        .eq("contract_id", contractId)
        .is("parent_id", null)
        .eq("is_base_folder", true);

      if (fetchError) throw fetchError;

      // Create base folders if they don't exist
      if (!existingFolders || existingFolders.length === 0) {
        for (const baseFolder of BASE_FOLDERS) {
          const { data: newFolder, error: createError } = await supabase
            .from("repository_folders")
            .insert({
              contract_id: contractId,
              name: baseFolder.name,
              is_base_folder: true,
              folder_type: baseFolder.type,
              parent_id: null,
            })
            .select()
            .single();

          if (createError) throw createError;

          // Create default subfolders
          if (baseFolder.subfolders.length > 0 && newFolder) {
            for (const subfolder of baseFolder.subfolders) {
              await supabase
                .from("repository_folders")
                .insert({
                  contract_id: contractId,
                  name: subfolder,
                  is_base_folder: false,
                  parent_id: newFolder.id,
                });
            }
          }
        }
      }

      loadFolderContents(null);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "No se pudo inicializar el repositorio",
      });
    } finally {
      setLoading(false);
    }
  };

  const loadFolderContents = async (folderId: string | null) => {
    try {
      // Load folders
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

      // Load files in current folder
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
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "No se pudieron cargar los contenidos",
      });
    }
  };

  const navigateToFolder = async (folder: RepositoryFolder) => {
    setCurrentFolder(folder);
    setFolderPath([...folderPath, folder]);
    await loadFolderContents(folder.id);
  };

  const navigateBack = async () => {
    const newPath = [...folderPath];
    newPath.pop();
    const parentFolder = newPath[newPath.length - 1] || null;
    setFolderPath(newPath);
    setCurrentFolder(parentFolder);
    await loadFolderContents(parentFolder?.id || null);
  };

  const navigateToRoot = async () => {
    setCurrentFolder(null);
    setFolderPath([]);
    await loadFolderContents(null);
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim() || !currentFolder) return;

    try {
      const { error } = await supabase
        .from("repository_folders")
        .insert({
          contract_id: contractId,
          name: newFolderName.trim(),
          parent_id: currentFolder.id,
          is_base_folder: false,
        });

      if (error) throw error;

      toast({
        title: "Carpeta creada",
        description: `La carpeta "${newFolderName}" ha sido creada`,
      });

      setNewFolderName("");
      setDialogOpen(false);
      loadFolderContents(currentFolder.id);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "No se pudo crear la carpeta",
      });
    }
  };

  const handleAddFile = async () => {
    if (!newFileUrl.trim() || !currentFolder) return;

    const fileName = newFileName.trim() || `Documento_${new Date().toISOString().split("T")[0]}`;

    try {
      const { error } = await supabase
        .from("repository_files")
        .insert({
          folder_id: currentFolder.id,
          name: fileName,
          url: newFileUrl.trim(),
        });

      if (error) throw error;

      toast({
        title: "Archivo agregado",
        description: `El archivo "${fileName}" ha sido agregado`,
      });

      setNewFileUrl("");
      setNewFileName("");
      setFileDialogOpen(false);
      loadFolderContents(currentFolder.id);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "No se pudo agregar el archivo",
      });
    }
  };

  const handleDeleteFile = async (fileId: string, fileName: string) => {
    if (!confirm(`¿Estás seguro de eliminar "${fileName}"?`)) return;

    try {
      const { error } = await supabase
        .from("repository_files")
        .delete()
        .eq("id", fileId);

      if (error) throw error;

      toast({
        title: "Archivo eliminado",
        description: `El archivo "${fileName}" ha sido eliminado`,
      });

      loadFolderContents(currentFolder?.id || null);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "No se pudo eliminar el archivo",
      });
    }
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString("es-CL", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="flex items-center justify-center">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Folder className="h-5 w-5" />
          Información Relacionada
        </CardTitle>
        <CardDescription>
          Repositorio de documentos del contrato
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Breadcrumb Navigation */}
        <div className="flex items-center gap-2 text-sm">
          <Button
            variant="link"
            size="sm"
            onClick={navigateToRoot}
            className="p-0 h-auto text-muted-foreground hover:text-foreground"
          >
            Raíz
          </Button>
          {folderPath.map((folder, index) => (
            <div key={folder.id} className="flex items-center gap-2">
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
              <Button
                variant="link"
                size="sm"
                onClick={() => {
                  const newPath = folderPath.slice(0, index + 1);
                  setFolderPath(newPath);
                  setCurrentFolder(folder);
                  loadFolderContents(folder.id);
                }}
                className="p-0 h-auto text-muted-foreground hover:text-foreground"
              >
                {folder.name}
              </Button>
            </div>
          ))}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          {currentFolder && (
            <Button variant="outline" size="sm" onClick={navigateBack} className="gap-1">
              <ArrowLeft className="h-4 w-4" />
              Volver
            </Button>
          )}
          
          {currentFolder && (
            <>
              <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-1">
                    <FolderPlus className="h-4 w-4" />
                    Nueva Carpeta
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Crear Nueva Carpeta</DialogTitle>
                    <DialogDescription>
                      Ingresa el nombre para la nueva subcarpeta
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label>Nombre de la carpeta</Label>
                      <Input
                        value={newFolderName}
                        onChange={(e) => setNewFolderName(e.target.value)}
                        placeholder="Ej: Documentación Legal"
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setDialogOpen(false)}>
                      Cancelar
                    </Button>
                    <Button onClick={handleCreateFolder} disabled={!newFolderName.trim()}>
                      Crear
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              <Dialog open={fileDialogOpen} onOpenChange={setFileDialogOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" className="gap-1">
                    <Upload className="h-4 w-4" />
                    Agregar Archivo
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Agregar Archivo</DialogTitle>
                    <DialogDescription>
                      Ingresa la URL del archivo (Google Drive, OneDrive, etc.)
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label>URL del archivo</Label>
                      <Input
                        value={newFileUrl}
                        onChange={(e) => setNewFileUrl(e.target.value)}
                        placeholder="https://..."
                        type="url"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Nombre del archivo (opcional)</Label>
                      <Input
                        value={newFileName}
                        onChange={(e) => setNewFileName(e.target.value)}
                        placeholder="Se generará automáticamente si está vacío"
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setFileDialogOpen(false)}>
                      Cancelar
                    </Button>
                    <Button onClick={handleAddFile} disabled={!newFileUrl.trim()}>
                      Agregar
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </>
          )}
        </div>

        {/* Folders */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          {folders.map((folder) => (
            <button
              key={folder.id}
              onClick={() => navigateToFolder(folder)}
              className="flex items-center gap-3 p-3 rounded-lg border border-border bg-card hover:bg-muted/50 transition-colors text-left"
            >
              <Folder className="h-5 w-5 text-primary" />
              <span className="font-medium text-sm truncate">{folder.name}</span>
              <ChevronRight className="h-4 w-4 text-muted-foreground ml-auto" />
            </button>
          ))}
        </div>

        {/* Files */}
        {currentFolder && files.length > 0 && (
          <div className="space-y-2 pt-4 border-t border-border">
            <p className="text-sm font-medium text-muted-foreground">Archivos</p>
            <div className="space-y-2">
              {files.map((file) => (
                <div
                  key={file.id}
                  className="flex items-center justify-between p-3 rounded-lg border border-border bg-muted/30"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">{file.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(file.uploaded_at)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => window.open(file.url, "_blank")}
                    >
                      <ExternalLink className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDeleteFile(file.id, file.name)}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Empty state for files */}
        {currentFolder && files.length === 0 && folders.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">Esta carpeta está vacía</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
