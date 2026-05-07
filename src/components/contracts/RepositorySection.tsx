import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
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
  AlertTriangle,
  FolderInput,
  FolderX
} from "lucide-react";
import { MultiFileUploadDialog } from "./MultiFileUploadDialog";
import { MoveFilesDialog } from "./MoveFilesDialog";
import { useToast } from "@/hooks/use-toast";
import { useSecureFileAccess } from "@/hooks/useSecureFileAccess";
import { deleteFileFromStorage, isStorageUrl } from "@/lib/storageUtils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
  const { openFile } = useSecureFileAccess();
  
  const [folders, setFolders] = useState<RepositoryFolder[]>([]);
  const [files, setFiles] = useState<RepositoryFile[]>([]);
  const [driveFiles, setDriveFiles] = useState<DriveFile[]>([]);
  const [currentFolder, setCurrentFolder] = useState<RepositoryFolder | null>(null);
  const [folderPath, setFolderPath] = useState<RepositoryFolder[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [folderTemplates, setFolderTemplates] = useState<FolderTemplate[]>([]);
  const [driveLinked, setDriveLinked] = useState(false);
  const [contractDriveFolderId, setContractDriveFolderId] = useState<string | null>(null);
  
  // Dialog states
  const [newFolderName, setNewFolderName] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [multiUploadDialogOpen, setMultiUploadDialogOpen] = useState(false);
  const [pendingDroppedFiles, setPendingDroppedFiles] = useState<File[] | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [moveFilesDialogOpen, setMoveFilesDialogOpen] = useState(false);
  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  const [driveWarning, setDriveWarning] = useState<string | null>(null);
  
  // Delete folder state
  const [deleteFolderDialogOpen, setDeleteFolderDialogOpen] = useState(false);
  const [folderToDelete, setFolderToDelete] = useState<RepositoryFolder | null>(null);
  const [deleteFolderStats, setDeleteFolderStats] = useState<{ subfolders: number; files: number } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  
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

      // Auto-import: register Drive files not yet tracked in repository_files
      if (filesOnly.length > 0 && currentFolder) {
        await importDriveFilesToDB(filesOnly, currentFolder.id);
      }
    } catch (error: any) {
      console.error("Error loading drive files:", error);
    }
  };

  /**
   * Import Drive files into repository_files if they don't already exist (matched by drive_file_id).
   * This ensures files added manually in Google Drive appear in the system.
   */
  const importDriveFilesToDB = async (driveFilesList: DriveFile[], folderId: string) => {
    try {
      // Get existing DB files for this folder that have drive_file_id
      const { data: existingFiles } = await supabase
        .from("repository_files")
        .select("drive_file_id")
        .eq("folder_id", folderId)
        .not("drive_file_id", "is", null);

      const existingDriveIds = new Set((existingFiles || []).map(f => f.drive_file_id));

      // Find Drive files not yet in DB
      const newFiles = driveFilesList.filter(f => !existingDriveIds.has(f.id));

      if (newFiles.length === 0) return;

      // Insert new records
      const records = newFiles.map(f => ({
        folder_id: folderId,
        name: f.name,
        url: f.webViewLink || f.webContentLink || `https://drive.google.com/file/d/${f.id}/view`,
        file_type: f.name.split('.').pop() || null,
        drive_file_id: f.id,
      }));

      const { error: insertError } = await supabase
        .from("repository_files")
        .insert(records);

      if (insertError) {
        console.error("Error importing Drive files to DB:", insertError);
        return;
      }

      console.log(`Imported ${newFiles.length} Drive file(s) into repository_files`);
      
      // Reload DB files to show the newly imported ones
      const { data: fileData } = await supabase
        .from("repository_files")
        .select("*")
        .eq("folder_id", folderId)
        .order("uploaded_at", { ascending: false });

      if (fileData) setFiles(fileData);
    } catch (error) {
      console.error("Error in importDriveFilesToDB:", error);
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
      // Get all base folders (root level)
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

        // Update base folders with their drive IDs
        const baseFolderDriveMap: Record<string, string> = {};
        for (const subfolder of data.subfolders || []) {
          await supabase
            .from("repository_folders")
            .update({ drive_folder_id: subfolder.driveFolderId })
            .eq("id", subfolder.localId);
          baseFolderDriveMap[subfolder.localId] = subfolder.driveFolderId;
        }

        // Now sync child folders (e.g. OOCC, Facturas under OC y FACTURAS)
        const { data: childFolders } = await supabase
          .from("repository_folders")
          .select("id, name, parent_id, drive_folder_id")
          .eq("contract_id", contractId)
          .not("parent_id", "is", null);

        if (childFolders && childFolders.length > 0) {
          for (const child of childFolders) {
            if (child.drive_folder_id) continue; // already synced
            const parentDriveId = baseFolderDriveMap[child.parent_id!];
            if (!parentDriveId) continue; // parent not synced yet

            try {
              const { data: childDriveData, error: childDriveError } = await supabase.functions.invoke('google-drive', {
                body: {
                  action: 'ensureSubfolderExists',
                  parentDriveFolderId: parentDriveId,
                  folderName: child.name,
                }
              });

              if (!childDriveError && childDriveData?.id) {
                await supabase
                  .from("repository_folders")
                  .update({ drive_folder_id: childDriveData.id })
                  .eq("id", child.id);
                // Track for potential grandchildren
                baseFolderDriveMap[child.id] = childDriveData.id;
              }
            } catch (e) {
              console.warn(`Failed to sync child folder ${child.name}:`, e);
            }
          }
        }

        setDriveLinked(true);
        setContractDriveFolderId(data.projectFolderId);

        // After creating all folders, sync any pending files to Drive
        try {
          let hasMore = true;
          let totalUploaded = 0;
          while (hasMore) {
            const { data: syncData } = await supabase.functions.invoke('google-drive', {
              body: { action: 'syncPendingFiles', contractId, batchSize: 20 }
            });
            totalUploaded += syncData?.uploaded || 0;
            hasMore = syncData?.hasMore === true;
          }
          if (totalUploaded > 0) {
            console.log(`Synced ${totalUploaded} pending files to Drive for contract ${contractId}`);
          }
        } catch (syncErr) {
          console.warn("File sync warning:", syncErr);
        }
        
        toast({
          title: "Sincronizado con Google Drive",
          description: `Carpetas y archivos sincronizados en: ${data.statusFolder || 'Google Drive'}`,
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

  /**
   * Resolve the Drive folder ID for a parent repository folder by walking
   * up the hierarchy. Returns the contract root drive folder if the folder
   * has no parent.
   */
  const resolveParentDriveFolderId = async (folder: RepositoryFolder): Promise<string | null> => {
    if (!folder.parent_id) return contractDriveFolderId;

    // Check if parent already has a drive_folder_id
    const { data: parent } = await supabase
      .from("repository_folders")
      .select("id, name, parent_id, drive_folder_id")
      .eq("id", folder.parent_id)
      .single();

    if (!parent) return contractDriveFolderId;
    if (parent.drive_folder_id) return parent.drive_folder_id;

    // Parent doesn't have drive_folder_id — resolve its parent first, then create it
    const grandparentDriveId = parent.parent_id
      ? await (async () => {
          const { data: gp } = await supabase
            .from("repository_folders")
            .select("id, name, parent_id, drive_folder_id")
            .eq("id", parent.parent_id)
            .single();
          if (gp?.drive_folder_id) return gp.drive_folder_id;
          return contractDriveFolderId; // fallback to contract root
        })()
      : contractDriveFolderId;

    if (!grandparentDriveId) return null;

    // Create/find the parent folder in Drive
    const { data: parentDriveData, error: parentDriveError } = await supabase.functions.invoke('google-drive', {
      body: {
        action: 'ensureSubfolderExists',
        parentDriveFolderId: grandparentDriveId,
        folderName: parent.name,
      }
    });

    if (!parentDriveError && parentDriveData?.id) {
      await supabase
        .from("repository_folders")
        .update({ drive_folder_id: parentDriveData.id })
        .eq("id", parent.id);
      return parentDriveData.id;
    }

    return contractDriveFolderId;
  };

  const handleForceSyncFolder = async () => {
    if (!currentFolder || !contractDriveFolderId) return;
    
    setSyncing(true);
    try {
      // Resolve the correct parent Drive folder (not always the contract root)
      const parentDriveId = await resolveParentDriveFolderId(currentFolder);
      if (!parentDriveId) throw new Error("No se pudo resolver la carpeta padre en Drive");

      const { data, error } = await supabase.functions.invoke('google-drive', {
        body: { 
          action: 'ensureSubfolderExists',
          parentDriveFolderId: parentDriveId,
          folderName: currentFolder.name,
        }
      });

      if (error) throw error;

      // Update folder with drive ID
      await supabase
        .from("repository_folders")
        .update({ drive_folder_id: data.id })
        .eq("id", currentFolder.id);

      setCurrentFolder({ ...currentFolder, drive_folder_id: data.id });

      // Sync pending files in this folder to Drive
      try {
        await supabase.functions.invoke('google-drive', {
          body: { action: 'syncPendingFiles', contractId, batchSize: 50 }
        });
      } catch (syncErr) {
        console.warn("File sync warning:", syncErr);
      }
      
      // Reload drive files
      await loadDriveFiles(data.id);

      toast({
        title: "Carpeta sincronizada",
        description: "La carpeta y sus archivos han sido sincronizados con Google Drive",
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

  const handleUploadComplete = () => {
    loadFolderContents(currentFolder?.id || null);
    if (currentFolder?.drive_folder_id) {
      loadDriveFiles(currentFolder.drive_folder_id);
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
      } else if (isStorageUrl(fileUrl)) {
        // Delete from Supabase Storage using utility
        await deleteFileFromStorage(fileUrl);
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

  // Recursive function to get all subfolder IDs
  const getAllSubfolderIds = async (folderId: string): Promise<string[]> => {
    const { data: subfolders } = await supabase
      .from("repository_folders")
      .select("id")
      .eq("contract_id", contractId)
      .eq("parent_id", folderId);
    
    if (!subfolders || subfolders.length === 0) return [];
    
    const ids = subfolders.map(f => f.id);
    for (const subfolder of subfolders) {
      const nestedIds = await getAllSubfolderIds(subfolder.id);
      ids.push(...nestedIds);
    }
    return ids;
  };

  const handlePrepareDeleteFolder = async (folder: RepositoryFolder) => {
    setFolderToDelete(folder);
    setDeleteFolderStats(null);
    setDeleteFolderDialogOpen(true);
    
    try {
      // Get all subfolder IDs recursively
      const subfolderIds = await getAllSubfolderIds(folder.id);
      
      // Count files in this folder and all subfolders
      const allFolderIds = [folder.id, ...subfolderIds];
      const { count: fileCount } = await supabase
        .from("repository_files")
        .select("*", { count: "exact", head: true })
        .in("folder_id", allFolderIds);
      
      setDeleteFolderStats({
        subfolders: subfolderIds.length,
        files: fileCount || 0
      });
    } catch (error) {
      console.error("Error counting folder contents:", error);
      setDeleteFolderStats({ subfolders: 0, files: 0 });
    }
  };

  const handleDeleteFolder = async () => {
    if (!folderToDelete) return;
    
    setIsDeleting(true);
    try {
      // Get all subfolder IDs recursively
      const subfolderIds = await getAllSubfolderIds(folderToDelete.id);
      const allFolderIds = [folderToDelete.id, ...subfolderIds];
      
      // Get all files in these folders
      const { data: allFiles } = await supabase
        .from("repository_files")
        .select("id, url, drive_file_id")
        .in("folder_id", allFolderIds);
      
      // Delete files from storage
      for (const file of allFiles || []) {
        try {
          if (file.drive_file_id) {
            await supabase.functions.invoke('google-drive', {
              body: { action: 'deleteFile', driveFileId: file.drive_file_id }
            });
          } else if (isStorageUrl(file.url)) {
            await deleteFileFromStorage(file.url);
          }
        } catch (error) {
          console.error("Error deleting file from storage:", error);
        }
      }
      
      // Delete file records
      if (allFiles && allFiles.length > 0) {
        await supabase
          .from("repository_files")
          .delete()
          .in("folder_id", allFolderIds);
      }
      
      // Delete folder statuses
      await supabase
        .from("folder_statuses")
        .delete()
        .in("folder_id", allFolderIds);
      
      // Delete from Google Drive if has drive ID
      if (folderToDelete.drive_folder_id) {
        try {
          await supabase.functions.invoke('google-drive', {
            body: { action: 'deleteFile', driveFileId: folderToDelete.drive_folder_id }
          });
        } catch (error) {
          console.error("Error deleting folder from Drive:", error);
        }
      }
      
      // Delete subfolders first (in reverse order to respect foreign keys)
      for (const subfolderId of subfolderIds.reverse()) {
        await supabase
          .from("repository_folders")
          .delete()
          .eq("id", subfolderId);
      }
      
      // Delete the main folder
      const { error } = await supabase
        .from("repository_folders")
        .delete()
        .eq("id", folderToDelete.id);
      
      if (error) throw error;
      
      toast({
        title: "Carpeta eliminada",
        description: `La carpeta "${folderToDelete.name}" ha sido eliminada`,
      });
      
      setDeleteFolderDialogOpen(false);
      setFolderToDelete(null);
      loadFolderContents(currentFolder?.id || null);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "No se pudo eliminar la carpeta",
      });
    } finally {
      setIsDeleting(false);
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
      <CardContent className="space-y-4 relative">
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

        {/* Multi File Upload Dialog */}
        {currentFolder && (
          <MultiFileUploadDialog
            open={multiUploadDialogOpen}
            onOpenChange={(o) => {
              setMultiUploadDialogOpen(o);
              if (!o) setPendingDroppedFiles(null);
            }}
            contractId={contractId}
            folderId={currentFolder.id}
            driveFolderId={currentFolder.drive_folder_id}
            folderStatuses={getAvailableStatuses()}
            onUploadComplete={handleUploadComplete}
            initialFiles={pendingDroppedFiles}
          />
        )}

        {/* Move Files Dialog */}
        {currentFolder && (
          <MoveFilesDialog
            open={moveFilesDialogOpen}
            onOpenChange={setMoveFilesDialogOpen}
            contractId={contractId}
            currentFolderId={currentFolder.id}
            files={files.map(f => ({ id: f.id, name: f.name, folder_id: currentFolder.id }))}
            onMoveComplete={() => loadFolderContents(currentFolder.id)}
          />
        )}

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
                onClick={() => {
                  if (!driveLinked) {
                    toast({
                      variant: "destructive",
                      title: "Drive no configurado",
                      description: "Sincroniza este contrato con Google Drive primero usando el botón 'Sincronizar con Drive'",
                    });
                    return;
                  }
                  if (!currentFolder?.drive_folder_id) {
                    toast({
                      variant: "destructive",
                      title: "Carpeta no sincronizada",
                      description: "Sincroniza esta carpeta con Drive usando el botón 'Sincronizar Carpeta'",
                    });
                    return;
                  }
                  setMultiUploadDialogOpen(true);
                }}
              >
                <Upload className="h-4 w-4" />
                Subir Archivos
              </Button>

              {/* Move Files Button - only show if there are files */}
              {files.length > 0 && (
                <Button 
                  variant="outline"
                  size="sm" 
                  className="gap-1"
                  onClick={() => setMoveFilesDialogOpen(true)}
                >
                  <FolderInput className="h-4 w-4" />
                  Mover Archivos
                </Button>
              )}

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

        {/* Delete Folder Confirmation Dialog */}
        <AlertDialog open={deleteFolderDialogOpen} onOpenChange={setDeleteFolderDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <FolderX className="h-5 w-5 text-destructive" />
                Eliminar Carpeta
              </AlertDialogTitle>
              <AlertDialogDescription className="space-y-3">
                <p>
                  ¿Estás seguro de eliminar la carpeta <strong>"{folderToDelete?.name}"</strong>?
                </p>
                {deleteFolderStats && (deleteFolderStats.subfolders > 0 || deleteFolderStats.files > 0) && (
                  <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-3 text-sm">
                    <p className="font-medium text-destructive mb-1">Esta acción eliminará:</p>
                    <ul className="list-disc list-inside text-muted-foreground">
                      {deleteFolderStats.subfolders > 0 && (
                        <li>{deleteFolderStats.subfolders} subcarpeta(s)</li>
                      )}
                      {deleteFolderStats.files > 0 && (
                        <li>{deleteFolderStats.files} archivo(s)</li>
                      )}
                    </ul>
                  </div>
                )}
                <p className="text-sm text-muted-foreground">
                  Esta acción no se puede deshacer.
                </p>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDeleteFolder}
                disabled={isDeleting}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {isDeleting ? "Eliminando..." : "Eliminar Carpeta"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Folders */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          {folders.map((folder) => {
            const isEliminados = folder.folder_type === '_eliminados';
            return (
            <div
              key={folder.id}
              className={cn(
                "flex items-center gap-3 p-3 rounded-lg border transition-colors group",
                isEliminados 
                  ? "border-amber-300 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-700 hover:bg-amber-100 dark:hover:bg-amber-950/30" 
                  : "border-border bg-card hover:bg-muted/50"
              )}
            >
              <button
                onClick={() => navigateToFolder(folder)}
                className="flex items-center gap-3 flex-1 min-w-0 text-left"
              >
                <div className="relative flex-shrink-0">
                  {isEliminados ? (
                    <Trash2 className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                  ) : (
                    <Folder className="h-5 w-5 text-primary" />
                  )}
                  {folder.drive_folder_id && !isEliminados && (
                    <Cloud className="h-3 w-3 text-blue-500 absolute -top-1 -right-1" />
                  )}
                </div>
                <span className={cn("font-medium text-sm truncate", isEliminados && "text-amber-700 dark:text-amber-300")}>
                  {folder.name}
                  {isEliminados && " (reasignar archivos)"}
                </span>
              </button>
              <div className="flex items-center gap-1 flex-shrink-0">
                {/* Delete button - only for non-base folders and non-eliminados */}
                {!folder.is_base_folder && !isEliminados && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                    onClick={(e) => {
                      e.stopPropagation();
                      handlePrepareDeleteFolder(folder);
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </div>
            </div>
            );
          })}

        </div>

        {/* Files from Google Drive (only show those NOT already tracked in DB) */}
        {currentFolder && (() => {
          const trackedDriveIds = new Set(files.filter(f => f.drive_file_id).map(f => f.drive_file_id));
          const untrackedDriveFiles = driveFiles.filter(f => !trackedDriveIds.has(f.id));
          if (untrackedDriveFiles.length === 0) return null;
          return (
            <div className="space-y-2 pt-4 border-t border-border">
              <p className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Cloud className="h-4 w-4" />
                Archivos en Google Drive (sin registrar)
              </p>
              <div className="space-y-2">
                {untrackedDriveFiles.map((file) => (
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
          );
        })()}

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
                      onClick={() => openFile(file.url)}
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

        {/* Always-visible drop zone (below files) */}
        <div
          className={cn(
            "border-2 border-dashed rounded-lg py-6 px-4 text-center transition-colors cursor-pointer",
            isDragOver
              ? "border-primary bg-primary/10 text-primary"
              : "border-muted-foreground/30 text-muted-foreground hover:border-primary/50 hover:bg-muted/30"
          )}
          onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setIsDragOver(true); }}
          onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDragOver(false); }}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setIsDragOver(false);
            const dropped = Array.from(e.dataTransfer.files || []);
            if (dropped.length === 0) return;
            setPendingDroppedFiles(dropped);
            setMultiUploadDialogOpen(true);
          }}
          onClick={() => setMultiUploadDialogOpen(true)}
        >
          <Upload className="h-8 w-8 mx-auto mb-2 opacity-60" />
          <p className="text-sm font-medium">
            {isDragOver ? "Suelta los archivos aquí" : "Arrastra archivos aquí o haz clic para subir"}
          </p>
          <p className="text-xs opacity-75">​</p>
        </div>

        {/* Empty states */}
        {currentFolder && folders.length === 0 && files.length === 0 && driveFiles.length === 0 && (
          <div className="text-center py-8 text-muted-foreground border-2 border-dashed rounded-lg">
            <FileText className="h-12 w-12 mx-auto mb-2 opacity-50" />
            <p>Esta carpeta está vacía</p>
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
