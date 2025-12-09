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
  Plus,
  RefreshCw,
  Cloud,
  AlertTriangle
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
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";

interface RepositoryFolder {
  id: string;
  name: string;
  parent_id: string | null;
  is_base_folder: boolean;
  folder_type: string | null;
  drive_folder_id: string | null;
}

interface RepositoryFile {
  id: string;
  name: string;
  url: string;
  file_type: string | null;
  uploaded_at: string;
  status: string | null;
  drive_file_id: string | null;
}

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  webViewLink: string;
  webContentLink?: string;
  createdTime: string;
  size?: string;
}

interface FolderStatus {
  id: string;
  name: string;
  color: string;
}

interface FolderTemplate {
  id: string;
  name: string;
  folder_type: string | null;
  display_order: number;
  parent_id: string | null;
}

interface RepositorySectionProps {
  contractId: string;
  contractName: string;
  contractStatus?: string;
}

export const RepositorySection = ({ contractId, contractName, contractStatus = 'en_negociacion' }: RepositorySectionProps) => {
  const { toast } = useToast();
  const { isAdmin } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [folders, setFolders] = useState<RepositoryFolder[]>([]);
  const [files, setFiles] = useState<RepositoryFile[]>([]);
  const [driveFiles, setDriveFiles] = useState<DriveFile[]>([]);
  const [currentFolder, setCurrentFolder] = useState<RepositoryFolder | null>(null);
  const [folderPath, setFolderPath] = useState<RepositoryFolder[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [folderTemplates, setFolderTemplates] = useState<FolderTemplate[]>([]);
  const [driveLinked, setDriveLinked] = useState(false);
  const [contractDriveFolderId, setContractDriveFolderId] = useState<string | null>(null);
  
  // Dialog states
  const [newFolderName, setNewFolderName] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [fileDialogOpen, setFileDialogOpen] = useState(false);
  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  const [driveWarning, setDriveWarning] = useState<string | null>(null);
  
  // File upload states
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [suggestedFileName, setSuggestedFileName] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("pendiente");
  
  // Custom status states
  const [folderStatuses, setFolderStatuses] = useState<FolderStatus[]>([]);
  const [newStatusName, setNewStatusName] = useState("");
  const [newStatusColor, setNewStatusColor] = useState("#6b7280");

  useEffect(() => {
    loadFolderTemplates();
    checkDriveLink();
  }, []);

  useEffect(() => {
    if (folderTemplates.length > 0) {
      initializeRepository();
    }
  }, [contractId, folderTemplates]);

  useEffect(() => {
    if (currentFolder) {
      loadFolderStatuses(currentFolder.id);
      if (currentFolder.drive_folder_id) {
        loadDriveFiles(currentFolder.drive_folder_id);
      }
    }
  }, [currentFolder]);

  const checkDriveLink = async () => {
    try {
      const { data, error } = await supabase
        .from("contracts")
        .select("drive_folder_id")
        .eq("id", contractId)
        .single();
      
      if (!error && data?.drive_folder_id) {
        setDriveLinked(true);
        setContractDriveFolderId(data.drive_folder_id);
      }
    } catch (error) {
      console.error("Error checking drive link:", error);
    }
  };

  const loadFolderTemplates = async () => {
    try {
      const { data, error } = await supabase
        .from("folder_templates")
        .select("*")
        .order("display_order", { ascending: true });
      
      if (error) throw error;
      setFolderTemplates(data || []);
    } catch (error) {
      console.error("Error loading folder templates:", error);
      setFolderTemplates([]);
    }
  };

  const initializeRepository = async () => {
    setLoading(true);
    try {
      // Get existing base folders
      const { data: existingFolders, error: fetchError } = await supabase
        .from("repository_folders")
        .select("*")
        .eq("contract_id", contractId);

      if (fetchError) throw fetchError;

      const existingTypes = new Set(existingFolders?.map(f => f.folder_type) || []);
      const existingByType = new Map(existingFolders?.map(f => [f.folder_type, f]) || []);
      
      // Get root templates (parent_id is null)
      const rootTemplates = folderTemplates.filter(t => t.parent_id === null);
      
      // Create root folders that don't exist
      for (const template of rootTemplates) {
        if (!existingTypes.has(template.folder_type)) {
          const { data: newFolder, error: insertError } = await supabase
            .from("repository_folders")
            .insert({
              contract_id: contractId,
              name: template.name,
              is_base_folder: true,
              folder_type: template.folder_type,
              parent_id: null,
            })
            .select()
            .single();

          if (!insertError && newFolder) {
            existingByType.set(template.folder_type, newFolder);
          }
        }
      }

      // Now create subfolders for each root template
      for (const template of rootTemplates) {
        const parentFolder = existingByType.get(template.folder_type);
        if (!parentFolder) continue;

        // Get subfolders for this template
        const subfolderTemplates = folderTemplates.filter(t => t.parent_id === template.id);
        
        // Get existing subfolders for this parent
        const { data: existingSubfolders } = await supabase
          .from("repository_folders")
          .select("*")
          .eq("contract_id", contractId)
          .eq("parent_id", parentFolder.id);

        const existingSubfolderTypes = new Set(existingSubfolders?.map(f => f.folder_type) || []);

        // Create missing subfolders
        for (const subTemplate of subfolderTemplates) {
          if (!existingSubfolderTypes.has(subTemplate.folder_type)) {
            await supabase
              .from("repository_folders")
              .insert({
                contract_id: contractId,
                name: subTemplate.name,
                is_base_folder: false,
                folder_type: subTemplate.folder_type,
                parent_id: parentFolder.id,
              });
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
        setDriveFiles([]);
      }
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "No se pudieron cargar los contenidos",
      });
    }
  };

  const loadDriveFiles = async (driveFolderId: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('google-drive', {
        body: { action: 'listFiles', driveFolderId }
      });

      if (error) throw error;
      
      // Filter out folders, only show files
      const filesOnly = (data.files || []).filter(
        (f: DriveFile) => f.mimeType !== 'application/vnd.google-apps.folder'
      );
      setDriveFiles(filesOnly);
    } catch (error: any) {
      console.error("Error loading drive files:", error);
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
    if (folderStatuses.length > 0) {
      return folderStatuses;
    }
    return [];
  };

  const handleSyncWithDrive = async () => {
    setSyncing(true);
    setDriveWarning(null);
    
    try {
      // Get all base folders
      const { data: baseFolders, error } = await supabase
        .from("repository_folders")
        .select("*")
        .eq("contract_id", contractId)
        .is("parent_id", null)
        .eq("is_base_folder", true);

      if (error) throw error;

      const subfolders = (baseFolders || []).map(f => ({ id: f.id, name: f.name }));

      const { data, error: driveError } = await supabase.functions.invoke('google-drive', {
        body: { 
          action: 'ensureProjectStructure',
          contractId,
          contractName,
          subfolders,
          status: contractStatus
        }
      });

      if (driveError) throw driveError;

      if (data.exists) {
        setDriveWarning(data.message);
      } else {
        // Update contract with drive folder ID
        await supabase
          .from("contracts")
          .update({ drive_folder_id: data.projectFolderId })
          .eq("id", contractId);

        // Update folders with their drive IDs
        for (const subfolder of data.subfolders || []) {
          await supabase
            .from("repository_folders")
            .update({ drive_folder_id: subfolder.driveFolderId })
            .eq("id", subfolder.localId);
        }

        setDriveLinked(true);
        setContractDriveFolderId(data.projectFolderId);
        
        toast({
          title: "Sincronizado con Google Drive",
          description: `Carpetas creadas en: ${data.statusFolder || 'Google Drive'}`,
        });

        // Reload folders to get updated drive IDs
        loadFolderContents(currentFolder?.id || null);
      }
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error de sincronización",
        description: error.message || "No se pudo sincronizar con Google Drive",
      });
    } finally {
      setSyncing(false);
    }
  };

  const handleForceSyncFolder = async () => {
    if (!currentFolder || !contractDriveFolderId) return;
    
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke('google-drive', {
        body: { 
          action: 'syncFolder',
          name: currentFolder.name,
          parentDriveFolderId: contractDriveFolderId
        }
      });

      if (error) throw error;

      // Update folder with drive ID
      await supabase
        .from("repository_folders")
        .update({ drive_folder_id: data.id })
        .eq("id", currentFolder.id);

      setCurrentFolder({ ...currentFolder, drive_folder_id: data.id });
      
      // Reload drive files
      await loadDriveFiles(data.id);

      toast({
        title: "Carpeta sincronizada",
        description: "La carpeta ha sido sincronizada con Google Drive",
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "No se pudo sincronizar la carpeta",
      });
    } finally {
      setSyncing(false);
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
    setDriveFiles([]);
    await loadFolderContents(null);
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim() || !currentFolder) return;

    try {
      let driveFolderId = null;

      // Create in Google Drive if parent has drive ID
      if (currentFolder.drive_folder_id) {
        const { data: driveData, error: driveError } = await supabase.functions.invoke('google-drive', {
          body: { 
            action: 'createFolder',
            name: newFolderName.trim(),
            parentDriveFolderId: currentFolder.drive_folder_id
          }
        });

        if (driveError) throw driveError;
        
        if (driveData.exists) {
          toast({
            variant: "destructive",
            title: "Carpeta ya existe",
            description: `La carpeta "${newFolderName}" ya existe en Google Drive`,
          });
          return;
        }
        
        driveFolderId = driveData.id;
      }

      const { error } = await supabase
        .from("repository_folders")
        .insert({
          contract_id: contractId,
          name: newFolderName.trim(),
          parent_id: currentFolder.id,
          is_base_folder: false,
          drive_folder_id: driveFolderId,
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
      const nameWithoutExt = file.name.replace(/\.[^/.]+$/, "");
      setSuggestedFileName(nameWithoutExt);
      setSelectedStatus("pendiente");
      setFileDialogOpen(true);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleUploadFile = async () => {
    if (!selectedFile || !currentFolder || !suggestedFileName.trim()) return;

    setUploading(true);
    try {
      const ext = selectedFile.name.split('.').pop() || '';
      const finalFileName = `${suggestedFileName.trim()}.${ext}`;
      
      let driveFileId = null;
      let fileUrl = '';

      // Upload to Google Drive if folder has drive ID
      if (currentFolder.drive_folder_id) {
        // Convert file to base64
        const arrayBuffer = await selectedFile.arrayBuffer();
        const base64Content = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));

        const { data: driveData, error: driveError } = await supabase.functions.invoke('google-drive', {
          body: { 
            action: 'uploadFile',
            fileName: finalFileName,
            fileContent: base64Content,
            mimeType: selectedFile.type || 'application/octet-stream',
            driveFolderId: currentFolder.drive_folder_id
          }
        });

        if (driveError) throw driveError;
        
        driveFileId = driveData.id;
        fileUrl = driveData.webViewLink || driveData.webContentLink || '';
      } else {
        // Fallback to Supabase Storage
        const filePath = `${contractId}/${currentFolder.id}/${Date.now()}_${finalFileName}`;

        const { error: uploadError } = await supabase.storage
          .from("repository-files")
          .upload(filePath, selectedFile);

        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage
          .from("repository-files")
          .getPublicUrl(filePath);

        fileUrl = urlData.publicUrl;
      }

      // Save file record to database
      const { error: dbError } = await supabase
        .from("repository_files")
        .insert({
          folder_id: currentFolder.id,
          name: finalFileName,
          url: fileUrl,
          file_type: ext,
          status: selectedStatus,
          drive_file_id: driveFileId,
        });

      if (dbError) throw dbError;

      toast({
        title: "Archivo subido",
        description: driveFileId 
          ? `El archivo "${finalFileName}" ha sido subido a Google Drive`
          : `El archivo "${finalFileName}" ha sido subido`,
      });

      setSelectedFile(null);
      setSuggestedFileName("");
      setSelectedStatus("pendiente");
      setFileDialogOpen(false);
      loadFolderContents(currentFolder.id);
      
      if (currentFolder.drive_folder_id) {
        loadDriveFiles(currentFolder.drive_folder_id);
      }
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

  const handleDeleteFile = async (fileId: string, fileName: string, fileUrl: string, driveFileId: string | null) => {
    if (!confirm(`¿Estás seguro de eliminar "${fileName}"?`)) return;
    if (!confirm(`Esta acción no se puede deshacer. ¿Confirmar eliminación de "${fileName}"?`)) return;

    try {
      // Delete from Google Drive if has drive ID
      if (driveFileId) {
        await supabase.functions.invoke('google-drive', {
          body: { action: 'deleteFile', driveFileId }
        });
      } else {
        // Delete from Supabase Storage
        const urlParts = fileUrl.split('/repository-files/');
        if (urlParts.length > 1) {
          const storagePath = decodeURIComponent(urlParts[1]);
          await supabase.storage.from("repository-files").remove([storagePath]);
        }
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
      
      if (currentFolder?.drive_folder_id) {
        loadDriveFiles(currentFolder.drive_folder_id);
      }
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
    const found = folderStatuses.find(s => s.name === status);
    return found?.color || "#6b7280";
  };

  const isContractFolder = currentFolder?.folder_type === "borradores" || 
    folderPath.some(f => f.folder_type === "borradores");

  const openDriveFolder = () => {
    if (contractDriveFolderId) {
      window.open(`https://drive.google.com/drive/folders/${contractDriveFolderId}`, '_blank');
    }
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
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Folder className="h-5 w-5" />
              Información Relacionada
              {driveLinked && (
                <Badge variant="outline" className="gap-1 ml-2">
                  <Cloud className="h-3 w-3" />
                  Google Drive
                </Badge>
              )}
            </CardTitle>
            <CardDescription>
              Repositorio de documentos del contrato
            </CardDescription>
          </div>
          <div className="flex gap-2">
            {driveLinked && (
              <Button variant="outline" size="sm" onClick={openDriveFolder} className="gap-1">
                <ExternalLink className="h-4 w-4" />
                Abrir en Drive
              </Button>
            )}
            <Button 
              variant={driveLinked ? "outline" : "default"} 
              size="sm" 
              onClick={handleSyncWithDrive}
              disabled={syncing}
              className="gap-1"
            >
              <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
              {driveLinked ? 'Resincronizar' : 'Sincronizar con Drive'}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Drive Warning */}
        {driveWarning && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Advertencia</AlertTitle>
            <AlertDescription>
              {driveWarning}. Por favor, cambie el nombre del contrato o elimine la carpeta existente en Drive.
            </AlertDescription>
          </Alert>
        )}

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

              {/* Sync current folder with Drive */}
              {driveLinked && !currentFolder.drive_folder_id && (
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={handleForceSyncFolder}
                  disabled={syncing}
                  className="gap-1"
                >
                  <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
                  Sincronizar Carpeta
                </Button>
              )}

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
                {currentFolder?.drive_folder_id 
                  ? "El archivo se subirá directamente a Google Drive"
                  : "Confirma el nombre y estado del archivo"
                }
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
                {uploading ? "Subiendo..." : currentFolder?.drive_folder_id ? "Subir a Drive" : "Subir"}
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
              <div className="relative">
                <Folder className="h-5 w-5 text-primary" />
                {folder.drive_folder_id && (
                  <Cloud className="h-3 w-3 text-blue-500 absolute -top-1 -right-1" />
                )}
              </div>
              <span className="font-medium text-sm truncate">{folder.name}</span>
              <ChevronRight className="h-4 w-4 text-muted-foreground ml-auto" />
            </button>
          ))}
        </div>

        {/* Files from Google Drive */}
        {currentFolder && driveFiles.length > 0 && (
          <div className="space-y-2 pt-4 border-t border-border">
            <p className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Cloud className="h-4 w-4" />
              Archivos en Google Drive
            </p>
            <div className="space-y-2">
              {driveFiles.map((file) => (
                <div
                  key={file.id}
                  className="flex items-center justify-between p-3 rounded-lg border border-border bg-muted/30"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <FileText className="h-4 w-4 text-blue-500 flex-shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-sm truncate">{file.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(file.createdTime)}
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => window.open(file.webViewLink, "_blank")}
                  >
                    <ExternalLink className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Files from local DB (fallback display) */}
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
                    <FileText className={`h-4 w-4 flex-shrink-0 ${file.drive_file_id ? 'text-blue-500' : 'text-muted-foreground'}`} />
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-sm truncate">{file.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(file.uploaded_at)}
                        {file.drive_file_id && <span className="ml-2 text-blue-500">• Drive</span>}
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
                      onClick={() => handleDeleteFile(file.id, file.name, file.url, file.drive_file_id)}
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
        {currentFolder && folders.length === 0 && files.length === 0 && driveFiles.length === 0 && (
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
