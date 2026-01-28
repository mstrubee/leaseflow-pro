import { useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Upload, File, X, CheckCircle2, AlertCircle, Loader2, FolderUp } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { validateFile, sanitizeFileName } from "@/lib/fileValidation";
import { cn } from "@/lib/utils";

interface FileUploadItem {
  file: File;
  name: string;
  status: "pending" | "uploading" | "success" | "error";
  progress: number;
  error?: string;
  relativePath?: string; // For folder uploads
  rootFolder?: string; // Top-level folder name for grouping
}

interface FolderStatus {
  name: string;
  color: string;
}

interface AddedFolder {
  name: string;
  fileCount: number;
  subfolderCount: number;
}

interface MultiFileUploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contractId: string;
  folderId: string;
  driveFolderId: string | null;
  folderStatuses: FolderStatus[];
  onUploadComplete: () => void;
}

export function MultiFileUploadDialog({
  open,
  onOpenChange,
  contractId,
  folderId,
  driveFolderId,
  folderStatuses,
  onUploadComplete,
}: MultiFileUploadDialogProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  
  const [files, setFiles] = useState<FileUploadItem[]>([]);
  const [addedFolders, setAddedFolders] = useState<AddedFolder[]>([]);
  const [selectedStatus, setSelectedStatus] = useState("pendiente");
  const [isUploading, setIsUploading] = useState(false);
  const [overallProgress, setOverallProgress] = useState(0);
  const [createdFolders, setCreatedFolders] = useState<Map<string, string>>(new Map());

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = e.target.files;
    if (!selectedFiles || selectedFiles.length === 0) return;

    const newFiles: FileUploadItem[] = [];
    const folderStats = new Map<string, { fileCount: number; subfolders: Set<string> }>();
    
    // Get existing file paths to avoid duplicates
    const existingPaths = new Set(files.map(f => f.relativePath || f.file.name));
    const existingFolderNames = new Set(addedFolders.map(f => f.name));
    
    for (let i = 0; i < selectedFiles.length; i++) {
      const file = selectedFiles[i];
      const validation = validateFile(file);
      
      if (!validation.isValid) {
        toast({
          variant: "destructive",
          title: `Archivo no válido: ${file.name}`,
          description: validation.error,
        });
        continue;
      }
      
      const nameWithoutExt = file.name.replace(/\.[^/.]+$/, "");
      // Check for folder path from webkitRelativePath
      const relativePath = (file as any).webkitRelativePath || "";
      
      // Skip if this exact file path already exists
      if (existingPaths.has(relativePath || file.name)) {
        continue;
      }
      
      // Extract root folder name for grouping
      const pathParts = relativePath.split('/').filter((p: string) => p.length > 0);
      const rootFolder = pathParts.length > 0 ? pathParts[0] : undefined;
      
      // Track folder statistics (only for new folders)
      if (rootFolder && !existingFolderNames.has(rootFolder)) {
        if (!folderStats.has(rootFolder)) {
          folderStats.set(rootFolder, { fileCount: 0, subfolders: new Set() });
        }
        const stats = folderStats.get(rootFolder)!;
        stats.fileCount++;
        // Track subfolders (excluding root and filename)
        if (pathParts.length > 2) {
          const subfolderPath = pathParts.slice(1, -1).join('/');
          stats.subfolders.add(subfolderPath);
        }
      }
      
      newFiles.push({
        file,
        name: sanitizeFileName(nameWithoutExt),
        status: "pending",
        progress: 0,
        relativePath: relativePath || undefined,
        rootFolder,
      });
    }
    
    // Update added folders list (only truly new folders)
    const newAddedFolders: AddedFolder[] = [];
    folderStats.forEach((stats, folderName) => {
      newAddedFolders.push({
        name: folderName,
        fileCount: stats.fileCount,
        subfolderCount: stats.subfolders.size,
      });
    });
    
    if (newAddedFolders.length > 0) {
      setAddedFolders(prev => [...prev, ...newAddedFolders]);
    }
    
    if (newFiles.length > 0) {
      setFiles(prev => [...prev, ...newFiles]);
    }
    
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    if (folderInputRef.current) {
      folderInputRef.current.value = "";
    }
  };

  const handleRemoveFolder = (folderName: string) => {
    setFiles(prev => prev.filter(f => f.rootFolder !== folderName));
    setAddedFolders(prev => prev.filter(f => f.name !== folderName));
  };

  const handleRemoveFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleUpdateFileName = (index: number, newName: string) => {
    setFiles(prev => prev.map((f, i) => 
      i === index ? { ...f, name: sanitizeFileName(newName) } : f
    ));
  };

  // Get or create subfolder based on relative path (both in DB and Drive)
  const getOrCreateSubfolder = async (
    relativePath: string, 
    baseFolderId: string,
    baseDriveFolderId: string | null
  ): Promise<{ dbFolderId: string; driveFolderId: string | null }> => {
    if (!relativePath) return { dbFolderId: baseFolderId, driveFolderId: baseDriveFolderId };
    
    // Parse the path and remove the filename
    const pathParts = relativePath.split('/').filter(p => p.length > 0);
    pathParts.pop(); // Remove the filename
    
    if (pathParts.length === 0) return { dbFolderId: baseFolderId, driveFolderId: baseDriveFolderId };
    
    let currentDbParentId = baseFolderId;
    let currentDriveParentId = baseDriveFolderId;
    
    for (const folderName of pathParts) {
      const cacheKey = `${currentDbParentId}/${folderName}`;
      
      // Check cache first
      if (createdFolders.has(cacheKey)) {
        const cached = createdFolders.get(cacheKey)!;
        currentDbParentId = cached;
        // Get drive folder id from DB
        const { data: folderData } = await supabase
          .from("repository_folders")
          .select("drive_folder_id")
          .eq("id", cached)
          .single();
        currentDriveParentId = folderData?.drive_folder_id || currentDriveParentId;
        continue;
      }
      
      // Check if folder exists in DB
      const { data: existing } = await supabase
        .from("repository_folders")
        .select("id, drive_folder_id")
        .eq("contract_id", contractId)
        .eq("parent_id", currentDbParentId)
        .eq("name", folderName)
        .maybeSingle();
      
      if (existing) {
        createdFolders.set(cacheKey, existing.id);
        setCreatedFolders(new Map(createdFolders));
        currentDbParentId = existing.id;
        currentDriveParentId = existing.drive_folder_id || currentDriveParentId;
      } else {
        // Create folder in Drive first (if connected)
        let newDriveFolderId: string | null = null;
        if (currentDriveParentId) {
          const { data: driveData, error: driveError } = await supabase.functions.invoke('google-drive', {
            body: { 
              action: 'ensureSubfolderExists',
              parentDriveFolderId: currentDriveParentId,
              folderName
            }
          });
          if (!driveError && driveData?.id) {
            newDriveFolderId = driveData.id;
          }
        }
        
        // Create the folder in DB
        const { data: newFolder, error } = await supabase
          .from("repository_folders")
          .insert({
            contract_id: contractId,
            name: folderName,
            parent_id: currentDbParentId,
            is_base_folder: false,
            drive_folder_id: newDriveFolderId,
          })
          .select("id")
          .single();
        
        if (error) throw error;
        
        createdFolders.set(cacheKey, newFolder.id);
        setCreatedFolders(new Map(createdFolders));
        currentDbParentId = newFolder.id;
        currentDriveParentId = newDriveFolderId;
      }
    }
    
    return { dbFolderId: currentDbParentId, driveFolderId: currentDriveParentId };
  };

  const uploadSingleFile = async (fileItem: FileUploadItem, index: number): Promise<boolean> => {
    const ext = fileItem.file.name.split('.').pop() || '';
    const finalFileName = `${fileItem.name.trim()}.${ext}`;
    
    try {
      // REQUIRED: Drive must be configured for uploads
      if (!driveFolderId) {
        throw new Error("Este contrato debe sincronizarse con Google Drive antes de subir archivos");
      }

      setFiles(prev => prev.map((f, i) => 
        i === index ? { ...f, status: "uploading", progress: 10 } : f
      ));

      // Determine target folder (handle subfolder creation for folder uploads)
      let targetDbFolderId = folderId;
      let targetDriveFolderId: string | null = driveFolderId;
      
      if (fileItem.relativePath) {
        const result = await getOrCreateSubfolder(fileItem.relativePath, folderId, driveFolderId);
        targetDbFolderId = result.dbFolderId;
        targetDriveFolderId = result.driveFolderId;
      }

      // Ensure we have a drive folder for the target
      if (!targetDriveFolderId) {
        throw new Error("No se pudo determinar la carpeta de destino en Drive");
      }

      setFiles(prev => prev.map((f, i) => 
        i === index ? { ...f, progress: 30 } : f
      ));
      
      const arrayBuffer = await fileItem.file.arrayBuffer();
      const base64Content = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));

      setFiles(prev => prev.map((f, i) => 
        i === index ? { ...f, progress: 50 } : f
      ));

      // Upload directly to Google Drive
      const { data: driveData, error: driveError } = await supabase.functions.invoke('google-drive', {
        body: { 
          action: 'uploadFile',
          fileName: finalFileName,
          fileContent: base64Content,
          mimeType: fileItem.file.type || 'application/octet-stream',
          driveFolderId: targetDriveFolderId
        }
      });

      if (driveError) throw driveError;
      
      const driveFileId = driveData.id;
      const fileUrl = driveData.webViewLink || driveData.webContentLink || '';
      
      setFiles(prev => prev.map((f, i) => 
        i === index ? { ...f, progress: 80 } : f
      ));

      // Save file record to database (Drive URL only, no Storage backup)
      const { error: dbError } = await supabase
        .from("repository_files")
        .insert({
          folder_id: targetDbFolderId,
          name: finalFileName,
          url: fileUrl,
          file_type: ext,
          status: selectedStatus,
          drive_file_id: driveFileId,
        });

      if (dbError) throw dbError;

      setFiles(prev => prev.map((f, i) => 
        i === index ? { ...f, status: "success", progress: 100 } : f
      ));
      
      return true;
    } catch (error: any) {
      setFiles(prev => prev.map((f, i) => 
        i === index ? { ...f, status: "error", progress: 0, error: error.message } : f
      ));
      return false;
    }
  };

  const handleUploadAll = async () => {
    // Validate Drive connection before starting
    if (!driveFolderId) {
      toast({
        variant: "destructive",
        title: "Drive no configurado",
        description: "Este contrato debe sincronizarse con Google Drive antes de subir archivos",
      });
      return;
    }

    const pendingFiles = files.filter(f => f.status === "pending");
    if (pendingFiles.length === 0) return;

    setIsUploading(true);
    setOverallProgress(0);

    let successCount = 0;
    let errorCount = 0;
    
    for (let i = 0; i < files.length; i++) {
      if (files[i].status !== "pending") continue;
      
      const success = await uploadSingleFile(files[i], i);
      if (success) {
        successCount++;
      } else {
        errorCount++;
      }
      
      // Update overall progress
      const completed = successCount + errorCount;
      const total = pendingFiles.length;
      setOverallProgress(Math.round((completed / total) * 100));
    }

    setIsUploading(false);
    
    if (successCount > 0) {
      toast({
        title: "Archivos subidos a Drive",
        description: `${successCount} archivo(s) subido(s) correctamente${errorCount > 0 ? `, ${errorCount} con error` : ''}`,
      });
      onUploadComplete();
    }
    
    if (errorCount > 0 && successCount === 0) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "No se pudieron subir los archivos",
      });
    }

    // Close dialog if all successful
    if (errorCount === 0 && successCount > 0) {
      handleClose();
    }
  };

  const handleClose = () => {
    if (!isUploading) {
      setFiles([]);
      setAddedFolders([]);
      setSelectedStatus("pendiente");
      setOverallProgress(0);
      setCreatedFolders(new Map());
      onOpenChange(false);
    }
  };

  const pendingCount = files.filter(f => f.status === "pending").length;
  const successCount = files.filter(f => f.status === "success").length;
  const hasFiles = files.length > 0;
  const hasFolderUploads = files.some(f => f.relativePath);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Subir Archivos a Google Drive</DialogTitle>
          <DialogDescription>
            {driveFolderId 
              ? "Los archivos se almacenarán exclusivamente en Google Drive"
              : "⚠️ Este contrato debe sincronizarse con Google Drive primero"
            }
          </DialogDescription>
        </DialogHeader>
        
        <div className="flex-1 overflow-y-auto space-y-4 py-4">
          {/* File and Folder selectors */}
          <div className="grid grid-cols-2 gap-3">
            {/* File selector */}
            <div 
              className={cn(
                "border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors",
                "hover:border-primary hover:bg-muted/50",
                isUploading && "pointer-events-none opacity-50"
              )}
              onClick={() => !isUploading && fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                onChange={handleFileSelect}
                multiple
                accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.gif,.zip,.rar"
                disabled={isUploading}
              />
              <Upload className="h-6 w-6 mx-auto mb-2 text-muted-foreground" />
              <p className="text-sm font-medium">Archivos</p>
              <p className="text-xs text-muted-foreground mt-1">
                Selección múltiple
              </p>
            </div>
            
            {/* Folder selector */}
            <div 
              className={cn(
                "border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors",
                "hover:border-primary hover:bg-muted/50",
                isUploading && "pointer-events-none opacity-50"
              )}
              onClick={() => !isUploading && folderInputRef.current?.click()}
            >
              <input
                ref={folderInputRef}
                type="file"
                className="hidden"
                onChange={handleFileSelect}
                // @ts-ignore - webkitdirectory is not in the types
                webkitdirectory=""
                directory=""
                multiple
                disabled={isUploading}
              />
              <FolderUp className="h-6 w-6 mx-auto mb-2 text-muted-foreground" />
              <p className="text-sm font-medium">Carpetas</p>
              <p className="text-xs text-muted-foreground mt-1">
                Una a la vez
              </p>
            </div>
          </div>
          
          {/* Added folders summary */}
          {addedFolders.length > 0 && (
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <FolderUp className="h-4 w-4" />
                Carpetas agregadas ({addedFolders.length})
              </Label>
              <div className="space-y-1">
                {addedFolders.map((folder) => (
                  <div 
                    key={folder.name}
                    className="flex items-center justify-between p-2 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800"
                  >
                    <div className="flex items-center gap-2">
                      <FolderUp className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                      <div>
                        <p className="text-sm font-medium text-blue-700 dark:text-blue-300">{folder.name}</p>
                        <p className="text-xs text-blue-600/70 dark:text-blue-400/70">
                          {folder.fileCount} archivo(s)
                          {folder.subfolderCount > 0 && ` • ${folder.subfolderCount} subcarpeta(s)`}
                        </p>
                      </div>
                    </div>
                    {!isUploading && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-blue-600 hover:text-red-500 hover:bg-red-50"
                        onClick={() => handleRemoveFolder(folder.name)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
              <p className="text-xs text-blue-600 dark:text-blue-400">
                📁 Se crearán automáticamente todas las subcarpetas
              </p>
            </div>
          )}

          {/* Status selector */}
          {hasFiles && folderStatuses.length > 0 && (
            <div className="space-y-2">
              <Label>Estado para todos los archivos</Label>
              <Select value={selectedStatus} onValueChange={setSelectedStatus} disabled={isUploading}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {folderStatuses.map((status) => (
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
          )}

          {/* Files list */}
          {hasFiles && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Archivos ({files.length})</Label>
                {addedFolders.length > 0 && files.length > 10 && (
                  <span className="text-xs text-muted-foreground">
                    Vista compacta para {addedFolders.length} carpeta(s)
                  </span>
                )}
              </div>
              <div className={cn(
                "space-y-2 overflow-y-auto pr-1",
                addedFolders.length > 0 && files.length > 10 ? "max-h-[150px]" : "max-h-[250px]"
              )}>
                {files.map((fileItem, index) => (
                  <div 
                    key={index} 
                    className={cn(
                      "p-2 rounded-lg border",
                      fileItem.status === "success" && "bg-green-50 border-green-200 dark:bg-green-950/20 dark:border-green-800",
                      fileItem.status === "error" && "bg-red-50 border-red-200 dark:bg-red-950/20 dark:border-red-800",
                      fileItem.status === "uploading" && "bg-blue-50 border-blue-200 dark:bg-blue-950/20 dark:border-blue-800",
                      fileItem.status === "pending" && "bg-card"
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <div className="flex-shrink-0">
                        {fileItem.status === "pending" && (
                          <File className="h-4 w-4 text-muted-foreground" />
                        )}
                        {fileItem.status === "uploading" && (
                          <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />
                        )}
                        {fileItem.status === "success" && (
                          <CheckCircle2 className="h-4 w-4 text-green-500" />
                        )}
                        {fileItem.status === "error" && (
                          <AlertCircle className="h-4 w-4 text-red-500" />
                        )}
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          {fileItem.status === "pending" && !fileItem.rootFolder ? (
                            <Input
                              value={fileItem.name}
                              onChange={(e) => handleUpdateFileName(index, e.target.value)}
                              className="h-6 text-xs"
                              disabled={isUploading}
                            />
                          ) : (
                            <span className="text-xs font-medium truncate">
                              {fileItem.relativePath ? (
                                <span className="text-blue-600 dark:text-blue-400">{fileItem.relativePath.split('/').slice(0, -1).join('/')}/</span>
                              ) : null}
                              {fileItem.name}.{fileItem.file.name.split('.').pop()}
                            </span>
                          )}
                        </div>
                        
                        {fileItem.status === "uploading" && (
                          <Progress value={fileItem.progress} className="h-1 mt-1" />
                        )}
                        
                        {fileItem.status === "error" && fileItem.error && (
                          <p className="text-xs text-red-500 mt-1">{fileItem.error}</p>
                        )}
                      </div>
                      
                      <span className="text-xs text-muted-foreground flex-shrink-0">
                        {(fileItem.file.size / 1024).toFixed(0)} KB
                      </span>
                      
                      {fileItem.status === "pending" && !isUploading && !fileItem.rootFolder && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 flex-shrink-0"
                          onClick={() => handleRemoveFile(index)}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Overall progress */}
          {isUploading && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Progreso total</span>
                <span>{overallProgress}%</span>
              </div>
              <Progress value={overallProgress} className="h-2" />
            </div>
          )}
        </div>

        <DialogFooter className="flex-shrink-0">
          <Button 
            variant="outline" 
            onClick={handleClose} 
            disabled={isUploading}
          >
            {successCount > 0 ? "Cerrar" : "Cancelar"}
          </Button>
          <Button 
            onClick={handleUploadAll} 
            disabled={pendingCount === 0 || isUploading}
            className="gap-2"
          >
            {isUploading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Subiendo...
              </>
            ) : (
              <>
                <Upload className="h-4 w-4" />
                Subir {pendingCount > 0 ? `(${pendingCount})` : ""}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
