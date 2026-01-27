import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Folder, ArrowLeft, ChevronRight, FileText, Loader2, FolderInput } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface RepositoryFolder {
  id: string;
  name: string;
  parent_id: string | null;
}

interface RepositoryFile {
  id: string;
  name: string;
  folder_id: string;
}

interface MoveFilesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contractId: string;
  currentFolderId: string;
  files: RepositoryFile[];
  onMoveComplete: () => void;
}

export function MoveFilesDialog({
  open,
  onOpenChange,
  contractId,
  currentFolderId,
  files,
  onMoveComplete,
}: MoveFilesDialogProps) {
  const { toast } = useToast();
  
  const [selectedFileIds, setSelectedFileIds] = useState<Set<string>>(new Set());
  const [step, setStep] = useState<"select" | "destination">("select");
  const [folders, setFolders] = useState<RepositoryFolder[]>([]);
  const [targetFolder, setTargetFolder] = useState<RepositoryFolder | null>(null);
  const [folderPath, setFolderPath] = useState<RepositoryFolder[]>([]);
  const [loading, setLoading] = useState(false);
  const [moving, setMoving] = useState(false);

  useEffect(() => {
    if (open) {
      setSelectedFileIds(new Set());
      setStep("select");
      setTargetFolder(null);
      setFolderPath([]);
    }
  }, [open]);

  useEffect(() => {
    if (step === "destination") {
      loadFolders(targetFolder?.id || null);
    }
  }, [step, targetFolder]);

  const loadFolders = async (parentId: string | null) => {
    setLoading(true);
    try {
      let query = supabase
        .from("repository_folders")
        .select("id, name, parent_id")
        .eq("contract_id", contractId);

      if (parentId) {
        query = query.eq("parent_id", parentId);
      } else {
        query = query.is("parent_id", null);
      }

      const { data, error } = await query.order("name");
      if (error) throw error;
      setFolders(data || []);
    } catch (error) {
      console.error("Error loading folders:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleFile = (fileId: string) => {
    setSelectedFileIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(fileId)) {
        newSet.delete(fileId);
      } else {
        newSet.add(fileId);
      }
      return newSet;
    });
  };

  const handleSelectAll = () => {
    if (selectedFileIds.size === files.length) {
      setSelectedFileIds(new Set());
    } else {
      setSelectedFileIds(new Set(files.map(f => f.id)));
    }
  };

  const handleNavigateToFolder = (folder: RepositoryFolder) => {
    setTargetFolder(folder);
    setFolderPath(prev => [...prev, folder]);
  };

  const handleNavigateBack = () => {
    const newPath = [...folderPath];
    newPath.pop();
    const parentFolder = newPath[newPath.length - 1] || null;
    setFolderPath(newPath);
    setTargetFolder(parentFolder);
  };

  const handleNavigateToRoot = () => {
    setFolderPath([]);
    setTargetFolder(null);
  };

  const handleMoveFiles = async () => {
    const destinationFolderId = targetFolder?.id;
    
    if (!destinationFolderId) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Seleccione una carpeta de destino",
      });
      return;
    }

    if (destinationFolderId === currentFolderId) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "La carpeta de destino es la misma que la actual",
      });
      return;
    }

    setMoving(true);
    try {
      const { error } = await supabase
        .from("repository_files")
        .update({ folder_id: destinationFolderId })
        .in("id", Array.from(selectedFileIds));

      if (error) throw error;

      toast({
        title: "Archivos movidos",
        description: `${selectedFileIds.size} archivo(s) movido(s) a "${targetFolder?.name}"`,
      });

      onMoveComplete();
      onOpenChange(false);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "No se pudieron mover los archivos",
      });
    } finally {
      setMoving(false);
    }
  };

  const handleClose = () => {
    if (!moving) {
      onOpenChange(false);
    }
  };

  const isCurrentFolder = targetFolder?.id === currentFolderId;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderInput className="h-5 w-5" />
            {step === "select" ? "Seleccionar Archivos" : "Seleccionar Destino"}
          </DialogTitle>
          <DialogDescription>
            {step === "select" 
              ? "Selecciona los archivos que deseas mover"
              : "Navega y selecciona la carpeta de destino"
            }
          </DialogDescription>
        </DialogHeader>

        {step === "select" && (
          <>
            <div className="flex items-center justify-between py-2 border-b">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleSelectAll}
                className="text-xs"
              >
                {selectedFileIds.size === files.length ? "Deseleccionar todos" : "Seleccionar todos"}
              </Button>
              <span className="text-sm text-muted-foreground">
                {selectedFileIds.size} de {files.length} seleccionados
              </span>
            </div>

            <ScrollArea className="flex-1 max-h-[300px]">
              <div className="space-y-1 p-1">
                {files.map((file) => (
                  <label
                    key={file.id}
                    className={cn(
                      "flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors",
                      "hover:bg-muted/50",
                      selectedFileIds.has(file.id) && "bg-primary/10"
                    )}
                  >
                    <Checkbox
                      checked={selectedFileIds.has(file.id)}
                      onCheckedChange={() => handleToggleFile(file.id)}
                    />
                    <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    <span className="text-sm truncate flex-1">{file.name}</span>
                  </label>
                ))}
                
                {files.length === 0 && (
                  <p className="text-center text-muted-foreground py-8">
                    No hay archivos en esta carpeta
                  </p>
                )}
              </div>
            </ScrollArea>

            <DialogFooter>
              <Button variant="outline" onClick={handleClose}>
                Cancelar
              </Button>
              <Button 
                onClick={() => setStep("destination")}
                disabled={selectedFileIds.size === 0}
              >
                Siguiente ({selectedFileIds.size})
              </Button>
            </DialogFooter>
          </>
        )}

        {step === "destination" && (
          <>
            {/* Breadcrumb */}
            <div className="flex items-center gap-1 text-sm py-2 border-b overflow-x-auto">
              <Button
                variant="link"
                size="sm"
                onClick={handleNavigateToRoot}
                className="p-0 h-auto text-muted-foreground hover:text-foreground flex-shrink-0"
              >
                Raíz
              </Button>
              {folderPath.map((folder, index) => (
                <div key={folder.id} className="flex items-center gap-1 flex-shrink-0">
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  <Button
                    variant="link"
                    size="sm"
                    onClick={() => {
                      const newPath = folderPath.slice(0, index + 1);
                      setFolderPath(newPath);
                      setTargetFolder(folder);
                    }}
                    className="p-0 h-auto text-muted-foreground hover:text-foreground"
                  >
                    {folder.name}
                  </Button>
                </div>
              ))}
            </div>

            {/* Navigation actions */}
            <div className="flex items-center gap-2 py-2">
              {targetFolder && (
                <Button variant="outline" size="sm" onClick={handleNavigateBack} className="gap-1">
                  <ArrowLeft className="h-4 w-4" />
                  Volver
                </Button>
              )}
              
              {targetFolder && (
                <div className={cn(
                  "flex-1 px-3 py-2 rounded-lg border-2",
                  isCurrentFolder ? "border-destructive bg-destructive/10" : "border-primary bg-primary/10"
                )}>
                  <p className="text-sm font-medium">
                    {isCurrentFolder ? "⚠️ Carpeta actual" : `📁 Destino: ${targetFolder.name}`}
                  </p>
                </div>
              )}
            </div>

            <ScrollArea className="flex-1 max-h-[250px]">
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <div className="space-y-1 p-1">
                  {folders.map((folder) => (
                    <button
                      key={folder.id}
                      onClick={() => handleNavigateToFolder(folder)}
                      className={cn(
                        "w-full flex items-center gap-3 p-3 rounded-lg text-left transition-colors",
                        "hover:bg-muted/50 border border-transparent",
                        folder.id === currentFolderId && "border-destructive/50 bg-destructive/5"
                      )}
                    >
                      <Folder className="h-5 w-5 text-primary flex-shrink-0" />
                      <span className="font-medium text-sm truncate flex-1">{folder.name}</span>
                      {folder.id === currentFolderId && (
                        <span className="text-xs text-destructive">(actual)</span>
                      )}
                      <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    </button>
                  ))}
                  
                  {folders.length === 0 && (
                    <p className="text-center text-muted-foreground py-8">
                      No hay subcarpetas
                    </p>
                  )}
                </div>
              )}
            </ScrollArea>

            <DialogFooter>
              <Button variant="outline" onClick={() => setStep("select")} disabled={moving}>
                Atrás
              </Button>
              <Button 
                onClick={handleMoveFiles}
                disabled={!targetFolder || isCurrentFolder || moving}
                className="gap-2"
              >
                {moving ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Moviendo...
                  </>
                ) : (
                  <>
                    <FolderInput className="h-4 w-4" />
                    Mover aquí
                  </>
                )}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
