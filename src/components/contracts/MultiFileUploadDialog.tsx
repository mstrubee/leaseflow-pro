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
import { Upload, File, X, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { validateFile, sanitizeFileName } from "@/lib/fileValidation";
import { cn } from "@/lib/utils";

interface FileUploadItem {
  file: File;
  name: string;
  status: "pending" | "uploading" | "success" | "error";
  progress: number;
  error?: string;
}

interface FolderStatus {
  name: string;
  color: string;
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
  
  const [files, setFiles] = useState<FileUploadItem[]>([]);
  const [selectedStatus, setSelectedStatus] = useState("pendiente");
  const [isUploading, setIsUploading] = useState(false);
  const [overallProgress, setOverallProgress] = useState(0);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = e.target.files;
    if (!selectedFiles || selectedFiles.length === 0) return;

    const newFiles: FileUploadItem[] = [];
    
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
      newFiles.push({
        file,
        name: sanitizeFileName(nameWithoutExt),
        status: "pending",
        progress: 0,
      });
    }
    
    setFiles(prev => [...prev, ...newFiles]);
    
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleRemoveFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleUpdateFileName = (index: number, newName: string) => {
    setFiles(prev => prev.map((f, i) => 
      i === index ? { ...f, name: sanitizeFileName(newName) } : f
    ));
  };

  const uploadSingleFile = async (fileItem: FileUploadItem, index: number): Promise<boolean> => {
    const ext = fileItem.file.name.split('.').pop() || '';
    const finalFileName = `${fileItem.name.trim()}.${ext}`;
    
    try {
      setFiles(prev => prev.map((f, i) => 
        i === index ? { ...f, status: "uploading", progress: 10 } : f
      ));

      let driveFileId = null;
      let fileUrl = '';

      if (driveFolderId) {
        // Upload to Google Drive
        setFiles(prev => prev.map((f, i) => 
          i === index ? { ...f, progress: 30 } : f
        ));
        
        const arrayBuffer = await fileItem.file.arrayBuffer();
        const base64Content = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));

        setFiles(prev => prev.map((f, i) => 
          i === index ? { ...f, progress: 50 } : f
        ));

        const { data: driveData, error: driveError } = await supabase.functions.invoke('google-drive', {
          body: { 
            action: 'uploadFile',
            fileName: finalFileName,
            fileContent: base64Content,
            mimeType: fileItem.file.type || 'application/octet-stream',
            driveFolderId
          }
        });

        if (driveError) throw driveError;
        
        driveFileId = driveData.id;
        fileUrl = driveData.webViewLink || driveData.webContentLink || '';
        
        setFiles(prev => prev.map((f, i) => 
          i === index ? { ...f, progress: 80 } : f
        ));
      } else {
        // Upload to Supabase Storage
        setFiles(prev => prev.map((f, i) => 
          i === index ? { ...f, progress: 30 } : f
        ));
        
        const filePath = `contracts/${contractId}/${folderId}/${Date.now()}_${finalFileName}`;

        const { error: uploadError } = await supabase.storage
          .from("repository-files")
          .upload(filePath, fileItem.file);

        if (uploadError) throw uploadError;

        fileUrl = `storage://repository-files/${filePath}`;
        
        setFiles(prev => prev.map((f, i) => 
          i === index ? { ...f, progress: 70 } : f
        ));
      }

      // Save file record to database
      const { error: dbError } = await supabase
        .from("repository_files")
        .insert({
          folder_id: folderId,
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
        title: "Archivos subidos",
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
      setSelectedStatus("pendiente");
      setOverallProgress(0);
      onOpenChange(false);
    }
  };

  const pendingCount = files.filter(f => f.status === "pending").length;
  const successCount = files.filter(f => f.status === "success").length;
  const hasFiles = files.length > 0;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Subir Archivos</DialogTitle>
          <DialogDescription>
            {driveFolderId 
              ? "Los archivos se subirán a Google Drive"
              : "Selecciona uno o más archivos para subir"
            }
          </DialogDescription>
        </DialogHeader>
        
        <div className="flex-1 overflow-y-auto space-y-4 py-4">
          {/* File selector */}
          <div 
            className={cn(
              "border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors",
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
            <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Haz clic o arrastra archivos aquí
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Puedes seleccionar múltiples archivos
            </p>
          </div>

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
              <Label>Archivos ({files.length})</Label>
              <div className="space-y-2 max-h-[250px] overflow-y-auto pr-1">
                {files.map((fileItem, index) => (
                  <div 
                    key={index} 
                    className={cn(
                      "p-3 rounded-lg border",
                      fileItem.status === "success" && "bg-green-50 border-green-200 dark:bg-green-950/20 dark:border-green-800",
                      fileItem.status === "error" && "bg-red-50 border-red-200 dark:bg-red-950/20 dark:border-red-800",
                      fileItem.status === "uploading" && "bg-blue-50 border-blue-200 dark:bg-blue-950/20 dark:border-blue-800",
                      fileItem.status === "pending" && "bg-card"
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex-shrink-0 mt-1">
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
                      
                      <div className="flex-1 min-w-0 space-y-2">
                        <div className="flex items-center gap-2">
                          {fileItem.status === "pending" ? (
                            <Input
                              value={fileItem.name}
                              onChange={(e) => handleUpdateFileName(index, e.target.value)}
                              className="h-7 text-sm"
                              disabled={isUploading}
                            />
                          ) : (
                            <span className="text-sm font-medium truncate">
                              {fileItem.name}.{fileItem.file.name.split('.').pop()}
                            </span>
                          )}
                        </div>
                        
                        <p className="text-xs text-muted-foreground truncate">
                          {fileItem.file.name} ({(fileItem.file.size / 1024).toFixed(1)} KB)
                        </p>
                        
                        {fileItem.status === "uploading" && (
                          <Progress value={fileItem.progress} className="h-1" />
                        )}
                        
                        {fileItem.status === "error" && fileItem.error && (
                          <p className="text-xs text-red-500">{fileItem.error}</p>
                        )}
                      </div>
                      
                      {fileItem.status === "pending" && !isUploading && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 flex-shrink-0"
                          onClick={() => handleRemoveFile(index)}
                        >
                          <X className="h-4 w-4" />
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
