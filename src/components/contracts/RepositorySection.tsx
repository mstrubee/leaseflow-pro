import { useState, useEffect, useRef } from "react";
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
  ExternalLink,
  Settings,
  Plus
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";

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
  status: string | null;
}

interface FolderStatus {
  id: string;
  name: string;
  color: string;
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

// Contract document statuses (for "borradores" folder type)
const CONTRACT_STATUSES = [
  { name: "En negociación", color: "#f59e0b" },
  { name: "Final", color: "#22c55e" },
  { name: "Vencido", color: "#ef4444" },
];

export const RepositorySection = ({ contractId, contractName }: RepositorySectionProps) => {
  const { toast } = useToast();
  const { isAdmin } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [folders, setFolders] = useState<RepositoryFolder[]>([]);
  const [files, setFiles] = useState<RepositoryFile[]>([]);
  const [currentFolder, setCurrentFolder] = useState<RepositoryFolder | null>(null);
  const [folderPath, setFolderPath] = useState<RepositoryFolder[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  
  // Dialog states
  const [newFolderName, setNewFolderName] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [fileDialogOpen, setFileDialogOpen] = useState(false);
  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  
  // File upload states
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [suggestedFileName, setSuggestedFileName] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("pendiente");
  
  // Custom status states
  const [folderStatuses, setFolderStatuses] = useState<FolderStatus[]>([]);
  const [newStatusName, setNewStatusName] = useState("");
  const [newStatusColor, setNewStatusColor] = useState("#6b7280");

  useEffect(() => {
    initializeRepository();
  }, [contractId]);

  useEffect(() => {
    if (currentFolder) {
      loadFolderStatuses(currentFolder.id);
    }
  }, [currentFolder]);

  const initializeRepository = async () => {
    setLoading(true);
    try {
      const { data: existingFolders, error: fetchError } = await supabase
        .from("repository_folders")
        .select("*")
        .eq("contract_id", contractId)
        .is("parent_id", null)
        .eq("is_base_folder", true);

      if (fetchError) throw fetchError;

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
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "No se pudieron cargar los contenidos",
      });
    }
  };

  const loadFolderStatuses = async (folderId: string) => {
    try {
      const { data, error } = await supabase
        .from("folder_statuses")
        .select("*")
        .eq("folder_id", folderId);

      if (error) throw error;
      setFolderStatuses(data || []);
    } catch (error) {
      console.error("Error loading folder statuses:", error);
    }
  };

  const getAvailableStatuses = (): { name: string; color: string }[] => {
    // Check if current folder is "borradores" type (contract documents)
    const isContractFolder = currentFolder?.folder_type === "borradores" || 
      folderPath.some(f => f.folder_type === "borradores");

    if (isContractFolder) {
      return CONTRACT_STATUSES;
    }

    // Return custom statuses for this folder
    if (folderStatuses.length > 0) {
      return folderStatuses;
    }

    // Default status
    return [{ name: "pendiente", color: "#6b7280" }];
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

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      // Suggest filename without extension
      const nameWithoutExt = file.name.replace(/\.[^/.]+$/, "");
      setSuggestedFileName(nameWithoutExt);
      setSelectedStatus("pendiente");
      setFileDialogOpen(true);
    }
    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleUploadFile = async () => {
    if (!selectedFile || !currentFolder || !suggestedFileName.trim()) return;

    setUploading(true);
    try {
      // Get file extension
      const ext = selectedFile.name.split('.').pop() || '';
      const filePath = `${contractId}/${currentFolder.id}/${Date.now()}_${suggestedFileName.trim()}.${ext}`;

      // Upload to Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from("repository-files")
        .upload(filePath, selectedFile);

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: urlData } = supabase.storage
        .from("repository-files")
        .getPublicUrl(filePath);

      // Save file record to database
      const { error: dbError } = await supabase
        .from("repository_files")
        .insert({
          folder_id: currentFolder.id,
          name: `${suggestedFileName.trim()}.${ext}`,
          url: urlData.publicUrl,
          file_type: ext,
          status: selectedStatus,
        });

      if (dbError) throw dbError;

      toast({
        title: "Archivo subido",
        description: `El archivo "${suggestedFileName}" ha sido subido exitosamente`,
      });

      setSelectedFile(null);
      setSuggestedFileName("");
      setSelectedStatus("pendiente");
      setFileDialogOpen(false);
      loadFolderContents(currentFolder.id);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "No se pudo subir el archivo: " + error.message,
      });
    } finally {
      setUploading(false);
    }
  };

  const handleUpdateFileStatus = async (fileId: string, newStatus: string) => {
    try {
      const { error } = await supabase
        .from("repository_files")
        .update({ status: newStatus })
        .eq("id", fileId);

      if (error) throw error;

      toast({
        title: "Estado actualizado",
        description: "El estado del archivo ha sido actualizado",
      });

      loadFolderContents(currentFolder?.id || null);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "No se pudo actualizar el estado",
      });
    }
  };

  const handleDeleteFile = async (fileId: string, fileName: string, fileUrl: string) => {
    if (!confirm(`¿Estás seguro de eliminar "${fileName}"?`)) return;
    if (!confirm(`Esta acción no se puede deshacer. ¿Confirmar eliminación de "${fileName}"?`)) return;

    try {
      // Extract path from URL to delete from storage
      const urlParts = fileUrl.split('/repository-files/');
      if (urlParts.length > 1) {
        const storagePath = decodeURIComponent(urlParts[1]);
        await supabase.storage.from("repository-files").remove([storagePath]);
      }

      // Delete from database
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

  const handleCreateStatus = async () => {
    if (!newStatusName.trim() || !currentFolder) return;

    try {
      const { error } = await supabase
        .from("folder_statuses")
        .insert({
          folder_id: currentFolder.id,
          name: newStatusName.trim(),
          color: newStatusColor,
        });

      if (error) throw error;

      toast({
        title: "Estado creado",
        description: `El estado "${newStatusName}" ha sido creado`,
      });

      setNewStatusName("");
      setNewStatusColor("#6b7280");
      loadFolderStatuses(currentFolder.id);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "No se pudo crear el estado",
      });
    }
  };

  const handleDeleteStatus = async (statusId: string, statusName: string) => {
    if (!confirm(`¿Eliminar el estado "${statusName}"?`)) return;

    try {
      const { error } = await supabase
        .from("folder_statuses")
        .delete()
        .eq("id", statusId);

      if (error) throw error;

      toast({
        title: "Estado eliminado",
      });

      loadFolderStatuses(currentFolder?.id || "");
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "No se pudo eliminar el estado",
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

  const getStatusColor = (status: string | null) => {
    if (!status) return "#6b7280";
    const allStatuses = [...CONTRACT_STATUSES, ...folderStatuses];
    const found = allStatuses.find(s => s.name === status);
    return found?.color || "#6b7280";
  };

  const isContractFolder = currentFolder?.folder_type === "borradores" || 
    folderPath.some(f => f.folder_type === "borradores");

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
        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={handleFileSelect}
        />

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
        <div className="flex items-center gap-2 flex-wrap">
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

              <Button 
                size="sm" 
                className="gap-1"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="h-4 w-4" />
                Subir Archivo
              </Button>

              {/* Status Management for Admin (only for non-contract folders) */}
              {isAdmin && !isContractFolder && (
                <Dialog open={statusDialogOpen} onOpenChange={setStatusDialogOpen}>
                  <DialogTrigger asChild>
                    <Button variant="outline" size="sm" className="gap-1">
                      <Settings className="h-4 w-4" />
                      Gestionar Estados
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Gestionar Estados de Archivos</DialogTitle>
                      <DialogDescription>
                        Crea estados personalizados para los archivos de esta carpeta
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      {/* Existing statuses */}
                      {folderStatuses.length > 0 && (
                        <div className="space-y-2">
                          <Label>Estados existentes</Label>
                          <div className="space-y-2">
                            {folderStatuses.map((status) => (
                              <div key={status.id} className="flex items-center justify-between p-2 rounded border border-border">
                                <div className="flex items-center gap-2">
                                  <div 
                                    className="w-4 h-4 rounded-full" 
                                    style={{ backgroundColor: status.color }}
                                  />
                                  <span className="text-sm">{status.name}</span>
                                </div>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleDeleteStatus(status.id, status.name)}
                                  className="h-8 w-8 text-destructive hover:text-destructive"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* New status form */}
                      <div className="space-y-2">
                        <Label>Nuevo estado</Label>
                        <div className="flex gap-2">
                          <Input
                            value={newStatusName}
                            onChange={(e) => setNewStatusName(e.target.value)}
                            placeholder="Nombre del estado"
                            className="flex-1"
                          />
                          <input
                            type="color"
                            value={newStatusColor}
                            onChange={(e) => setNewStatusColor(e.target.value)}
                            className="w-10 h-10 rounded border border-border cursor-pointer"
                          />
                          <Button 
                            onClick={handleCreateStatus} 
                            disabled={!newStatusName.trim()}
                            size="icon"
                          >
                            <Plus className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setStatusDialogOpen(false)}>
                        Cerrar
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              )}
            </>
          )}
        </div>

        {/* File Upload Dialog */}
        <Dialog open={fileDialogOpen} onOpenChange={(open) => {
          if (!open) {
            setSelectedFile(null);
            setSuggestedFileName("");
          }
          setFileDialogOpen(open);
        }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Subir Archivo</DialogTitle>
              <DialogDescription>
                Confirma el nombre y estado del archivo
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Archivo seleccionado</Label>
                <p className="text-sm text-muted-foreground">{selectedFile?.name}</p>
              </div>
              <div className="space-y-2">
                <Label>Nombre del archivo</Label>
                <Input
                  value={suggestedFileName}
                  onChange={(e) => setSuggestedFileName(e.target.value)}
                  placeholder="Nombre del archivo"
                />
              </div>
              <div className="space-y-2">
                <Label>Estado</Label>
                <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {getAvailableStatuses().map((status) => (
                      <SelectItem key={status.name} value={status.name}>
                        <div className="flex items-center gap-2">
                          <div 
                            className="w-3 h-3 rounded-full" 
                            style={{ backgroundColor: status.color }}
                          />
                          {status.name}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setFileDialogOpen(false)} disabled={uploading}>
                Cancelar
              </Button>
              <Button onClick={handleUploadFile} disabled={!suggestedFileName.trim() || uploading}>
                {uploading ? "Subiendo..." : "Subir"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

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
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-sm truncate">{file.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(file.uploaded_at)}
                      </p>
                    </div>
                    {/* Status badge */}
                    <Select
                      value={file.status || "pendiente"}
                      onValueChange={(value) => handleUpdateFileStatus(file.id, value)}
                    >
                      <SelectTrigger className="w-auto h-7 px-2">
                        <Badge 
                          variant="outline" 
                          style={{ 
                            backgroundColor: `${getStatusColor(file.status)}20`,
                            borderColor: getStatusColor(file.status),
                            color: getStatusColor(file.status)
                          }}
                        >
                          {file.status || "pendiente"}
                        </Badge>
                      </SelectTrigger>
                      <SelectContent>
                        {getAvailableStatuses().map((status) => (
                          <SelectItem key={status.name} value={status.name}>
                            <div className="flex items-center gap-2">
                              <div 
                                className="w-3 h-3 rounded-full" 
                                style={{ backgroundColor: status.color }}
                              />
                              {status.name}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center gap-2 ml-2">
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
                      onClick={() => handleDeleteFile(file.id, file.name, file.url)}
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

        {/* Empty states */}
        {currentFolder && folders.length === 0 && files.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            <FileText className="h-12 w-12 mx-auto mb-2 opacity-50" />
            <p>Esta carpeta está vacía</p>
            <p className="text-sm">Sube archivos o crea subcarpetas</p>
          </div>
        )}

        {!currentFolder && folders.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            <Folder className="h-12 w-12 mx-auto mb-2 opacity-50" />
            <p>Inicializando repositorio...</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
