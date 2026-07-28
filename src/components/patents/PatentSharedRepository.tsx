import { useState, useEffect, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  Folder, FolderPlus, FileText, ChevronRight, ArrowLeft, 
  Upload, Trash2, ExternalLink, Pencil, Check, X, Search, PackagePlus, Download
} from "lucide-react";
import * as XLSX from "xlsx";
import { PatentBulkUploadDialog } from "./PatentBulkUploadDialog";
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { validateFile, sanitizeFileName } from "@/lib/fileValidation";
import { getSignedUrl, deleteFileFromStorage, isStorageUrl } from "@/lib/storageUtils";
import { useSecureFileAccess } from "@/hooks/useSecureFileAccess";

interface RepoFolder {
  id: string;
  name: string;
  parent_id: string | null;
  is_base_folder: boolean;
  fileCount?: number;
}

interface RepoFile {
  id: string;
  name: string;
  url: string;
  file_type: string | null;
  uploaded_at: string;
}

interface PatentSharedRepositoryProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PatentSharedRepository({ open, onOpenChange }: PatentSharedRepositoryProps) {
  const { openFile } = useSecureFileAccess();
  const [folders, setFolders] = useState<RepoFolder[]>([]);
  const [files, setFiles] = useState<RepoFile[]>([]);
  const [currentFolder, setCurrentFolder] = useState<RepoFolder | null>(null);
  const [folderPath, setFolderPath] = useState<RepoFolder[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // New folder
  const [newFolderName, setNewFolderName] = useState("");
  const [showNewFolder, setShowNewFolder] = useState(false);

  // Rename folder
  const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  // Delete confirm
  const [deleteTarget, setDeleteTarget] = useState<{ type: 'folder' | 'file'; id: string; name: string } | null>(null);

  // Search & bulk upload
  const [folderSearchQuery, setFolderSearchQuery] = useState("");
  const [showBulkUpload, setShowBulkUpload] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const handleDownloadEmptyFolders = useCallback(() => {
    const emptyFolders = folders.filter((f) => (f.fileCount ?? 0) === 0);
    if (emptyFolders.length === 0) {
      toast.info("Todas las carpetas tienen archivos cargados");
      return;
    }
    const data = emptyFolders.map((f) => ({ "Carpeta": f.name, "Archivos": 0 }));
    const ws = XLSX.utils.json_to_sheet(data);
    ws["!cols"] = [{ wch: 50 }, { wch: 12 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Carpetas Vacías");
    XLSX.writeFile(wb, "carpetas-sin-archivos.xlsx");
    toast.success(`${emptyFolders.length} carpetas sin archivos exportadas`);
  }, [folders]);

  const loadContents = useCallback(async (parentId: string | null) => {
    setLoading(true);
    try {
      let folderQuery = supabase
        .from("repository_folders")
        .select("id, name, parent_id, is_base_folder")
        .is("contract_id", null);

      if (parentId) {
        folderQuery = folderQuery.eq("parent_id", parentId);
      } else {
        folderQuery = folderQuery.is("parent_id", null);
      }

      const { data: folderData } = await folderQuery;
      
      // Get file counts in a single RPC call
      const folderIds = (folderData || []).map((f: any) => f.id);
      const countMap: Record<string, number> = {};
      if (folderIds.length > 0) {
        const { data: counts } = await supabase.rpc("get_folder_file_counts", { p_folder_ids: folderIds });
        for (const row of counts || []) {
          countMap[row.folder_id] = Number(row.file_count);
        }
      }
      const foldersWithCounts = (folderData || []).map((f: any) => ({ ...f, fileCount: countMap[f.id] || 0 }));
      setFolders(foldersWithCounts);

      if (parentId) {
        const { data: fileData } = await supabase
          .from("repository_files")
          .select("id, name, url, file_type, uploaded_at")
          .eq("folder_id", parentId)
          .order("uploaded_at", { ascending: false });
        setFiles(fileData || []);
      } else {
        setFiles([]);
      }
    } catch (error) {
      console.error("Error loading shared repo:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      loadContents(null);
      setCurrentFolder(null);
      setFolderPath([]);
    }
  }, [open, loadContents]);

  const navigateToFolder = async (folder: RepoFolder) => {
    setCurrentFolder(folder);
    setFolderPath(prev => [...prev, folder]);
    setFolderSearchQuery("");
    await loadContents(folder.id);
  };

  const navigateBack = async () => {
    const newPath = [...folderPath];
    newPath.pop();
    const parent = newPath[newPath.length - 1] || null;
    setFolderPath(newPath);
    setCurrentFolder(parent);
    await loadContents(parent?.id || null);
  };

  const navigateToRoot = async () => {
    setCurrentFolder(null);
    setFolderPath([]);
    await loadContents(null);
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim() || !currentFolder) return;
    try {
      await supabase.from("repository_folders").insert({
        contract_id: null,
        parent_id: currentFolder.id,
        name: newFolderName.trim(),
        is_base_folder: false,
        folder_type: "patent_shared_sub",
      });
      setNewFolderName("");
      setShowNewFolder(false);
      toast.success("Carpeta creada");
      await loadContents(currentFolder.id);
    } catch {
      toast.error("Error al crear carpeta");
    }
  };

  const handleRenameFolder = async (folderId: string) => {
    if (!renameValue.trim()) return;
    try {
      await supabase.from("repository_folders").update({ name: renameValue.trim() }).eq("id", folderId);
      setRenamingFolderId(null);
      toast.success("Carpeta renombrada");
      await loadContents(currentFolder?.id || null);
    } catch {
      toast.error("Error al renombrar");
    }
  };

  const handleDeleteFolder = async (folderId: string) => {
    // Borrado del subárbol en el servidor (una sola llamada atómica y a prueba
    // de ciclos), en vez de N+1 llamadas recursivas desde el cliente — esto
    // último "congelaba" la UI al borrar carpetas con muchos descendientes.
    // La RPC devuelve las URLs de los archivos borrados para limpiar el storage.
    const { data: deletedUrls, error } = await supabase.rpc("delete_repository_folder_tree", {
      p_folder_id: folderId,
    });
    if (error) {
      console.error("Error deleting folder:", error);
      throw error;
    }
    // Limpieza de storage en segundo plano (no bloquea el refresco de la UI).
    const urls = (deletedUrls || []).map((r) => r.deleted_url).filter((u): u is string => !!u && isStorageUrl(u));
    if (urls.length > 0) {
      void Promise.allSettled(urls.map((u) => deleteFileFromStorage(u)));
    }
  };

  const handleDeleteFile = async (fileId: string, url: string) => {
    try {
      if (isStorageUrl(url)) {
        await deleteFileFromStorage(url);
      }
      await supabase.from("repository_files").delete().eq("id", fileId);
      toast.success("Archivo eliminado");
      await loadContents(currentFolder?.id || null);
    } catch {
      toast.error("Error al eliminar archivo");
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    try {
      if (deleteTarget.type === 'folder') {
        await handleDeleteFolder(deleteTarget.id);
        toast.success("Carpeta eliminada");
        await loadContents(currentFolder?.id || null);
      } else {
        const file = files.find(f => f.id === deleteTarget.id);
        if (file) await handleDeleteFile(file.id, file.url);
      }
      setDeleteTarget(null);
    } catch {
      toast.error("Error al eliminar");
    } finally {
      setDeleting(false);
    }
  };

  const uploadFiles = async (fileList: FileList | File[]) => {
    if (!currentFolder || !fileList || (fileList as FileList).length === 0) return;
    setUploading(true);
    try {
      for (const file of Array.from(fileList)) {
        const validation = validateFile(file);
        if (!validation.isValid) {
          toast.error(`${file.name}: ${validation.error}`);
          continue;
        }

        const sanitized = sanitizeFileName(file.name);
        const path = `shared-patents/${currentFolder.id}/${Date.now()}_${sanitized}`;

        const { error } = await supabase.storage
          .from("repository-files")
          .upload(path, file, { upsert: true });

        if (error) {
          toast.error(`Error al subir ${file.name}`);
          continue;
        }

        const storagePath = `storage://repository-files/${path}`;

        await supabase.from("repository_files").insert({
          folder_id: currentFolder.id,
          name: file.name,
          url: storagePath,
          file_type: file.type || null,
        });
      }

      toast.success("Archivo(s) subido(s)");
      await loadContents(currentFolder.id);
    } catch {
      toast.error("Error al subir archivos");
    } finally {
      setUploading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return;
    await uploadFiles(e.target.files);
    e.target.value = "";
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (!currentFolder) {
      toast.error("Entra a una carpeta para subir archivos");
      return;
    }
    if (e.dataTransfer.files?.length) {
      await uploadFiles(e.dataTransfer.files);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (currentFolder && !isDragging) setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.currentTarget === e.target) setIsDragging(false);
  };

  const handleOpenFile = async (url: string) => {
    if (isStorageUrl(url)) {
      const signedUrl = await getSignedUrl(url);
      if (signedUrl) {
        window.open(signedUrl, "_blank");
      } else {
        toast.error("No se pudo acceder al archivo");
      }
    } else {
      window.open(url, "_blank");
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Repositorio Común de Patentes</DialogTitle>
          </DialogHeader>

          {/* Breadcrumb */}
          <div className="flex items-center gap-1 text-sm text-muted-foreground flex-wrap">
            <Button variant="link" size="sm" className="p-0 h-auto" onClick={navigateToRoot}>
              Raíz
            </Button>
            {folderPath.map((f, i) => (
              <span key={f.id} className="flex items-center gap-1">
                <ChevronRight className="h-3 w-3" />
                <Button
                  variant="link"
                  size="sm"
                  className="p-0 h-auto"
                  onClick={() => {
                    const newPath = folderPath.slice(0, i + 1);
                    setFolderPath(newPath);
                    setCurrentFolder(f);
                    loadContents(f.id);
                  }}
                >
                  {f.name}
                </Button>
              </span>
            ))}
          </div>

          {/* Toolbar */}
          {currentFolder && (
            <div className="flex items-center gap-2 flex-wrap">
              <Button variant="outline" size="sm" onClick={navigateBack}>
                <ArrowLeft className="h-4 w-4 mr-1" />
                Atrás
              </Button>
              <Button variant="outline" size="sm" onClick={() => setShowNewFolder(true)}>
                <FolderPlus className="h-4 w-4 mr-1" />
                Nueva Carpeta
              </Button>
              <div className="relative">
                <Input
                  type="file"
                  id="shared-file-upload"
                  className="hidden"
                  onChange={handleFileUpload}
                  disabled={uploading}
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png"
                  multiple
                />
                <Label htmlFor="shared-file-upload">
                  <Button variant="outline" size="sm" asChild disabled={uploading}>
                    <span>
                      <Upload className="h-4 w-4 mr-1" />
                      {uploading ? "Subiendo..." : "Subir Archivos"}
                    </span>
                  </Button>
                </Label>
              </div>
              <Button variant="outline" size="sm" onClick={() => setShowBulkUpload(true)}>
                <PackagePlus className="h-4 w-4 mr-1" />
                Subida Masiva
              </Button>
              <Button variant="outline" size="sm" onClick={handleDownloadEmptyFolders}>
                <Download className="h-4 w-4 mr-1" />
                Excel Sin Docum
              </Button>
            </div>
          )}

          {/* New folder input */}
          {showNewFolder && (
            <div className="flex items-center gap-2">
              <Input
                placeholder="Nombre de carpeta"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreateFolder()}
                autoFocus
              />
              <Button size="sm" onClick={handleCreateFolder}>
                <Check className="h-4 w-4" />
              </Button>
              <Button size="sm" variant="ghost" onClick={() => { setShowNewFolder(false); setNewFolderName(""); }}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          )}

          {/* Folder search */}
          {folders.length > 0 && (
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar carpetas..."
                className="pl-8 h-8 text-sm"
                value={folderSearchQuery}
                onChange={(e) => setFolderSearchQuery(e.target.value)}
              />
            </div>
          )}

          {/* Content */}
          <div
            className={`flex-1 overflow-y-auto space-y-1 min-h-[200px] rounded-md transition-colors ${
              isDragging ? "ring-2 ring-primary bg-primary/5" : ""
            } ${currentFolder ? "relative" : ""}`}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
          >
            {loading ? (
              <div className="text-center py-8 text-muted-foreground">Cargando...</div>
            ) : (
              <>
                {folders.length === 0 && files.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    {currentFolder ? "Carpeta vacía" : "No hay carpetas"}
                  </div>
                )}

                {/* Folders - filtered */}
                {folders
                  .filter((folder) =>
                    !folderSearchQuery || folder.name.toLowerCase().includes(folderSearchQuery.toLowerCase())
                  )
                  .map((folder) => (
                  <div
                    key={folder.id}
                    className="flex items-center justify-between p-2 rounded-md hover:bg-muted/50 group"
                  >
                    {renamingFolderId === folder.id ? (
                      <div className="flex items-center gap-2 flex-1">
                        <Folder className="h-4 w-4 text-primary flex-shrink-0" />
                        <Input
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && handleRenameFolder(folder.id)}
                          className="h-7 text-sm"
                          autoFocus
                        />
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleRenameFolder(folder.id)}>
                          <Check className="h-3 w-3" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setRenamingFolderId(null)}>
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    ) : (
                      <>
                        <button
                          className="flex items-center gap-2 flex-1 text-left"
                          onClick={() => navigateToFolder(folder)}
                        >
                          <Folder className="h-4 w-4 text-primary flex-shrink-0" />
                          <span className="text-sm font-medium">{folder.name}</span>
                          {(folder.fileCount ?? 0) > 0 && (
                            <span className="text-xs text-muted-foreground bg-muted rounded-full px-1.5 py-0.5 min-w-[20px] text-center">
                              {folder.fileCount}
                            </span>
                          )}
                        </button>
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            onClick={() => { setRenamingFolderId(folder.id); setRenameValue(folder.name); }}
                          >
                            <Pencil className="h-3 w-3" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-destructive"
                            onClick={() => setDeleteTarget({ type: 'folder', id: folder.id, name: folder.name })}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </>
                    )}
                  </div>
                ))}

                {/* Files */}
                {files.map((file) => (
                  <div
                    key={file.id}
                    className="flex items-center justify-between p-2 rounded-md hover:bg-muted/50 group"
                  >
                    <button
                      className="flex items-center gap-2 flex-1 text-left"
                      onClick={() => handleOpenFile(file.url)}
                    >
                      <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      <div>
                        <span className="text-sm">{file.name}</span>
                        <span className="text-xs text-muted-foreground ml-2">
                          {new Date(file.uploaded_at).toLocaleDateString()}
                        </span>
                      </div>
                    </button>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        onClick={() => handleOpenFile(file.url)}
                      >
                        <ExternalLink className="h-3 w-3" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-destructive"
                        onClick={() => setDeleteTarget({ type: 'file', id: file.id, name: file.name })}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                ))}

                {currentFolder && (
                  <div className="flex flex-col items-center justify-center gap-2 text-xs text-muted-foreground italic pt-4 pb-2 border-2 border-dashed border-muted rounded-md mt-2">
                    <Upload className="h-6 w-6 opacity-60" />
                    <span>Arrastra y suelta archivos aquí para subirlos a esta carpeta</span>
                  </div>
                )}
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => { if (!o && !deleting) setDeleteTarget(null); }}>
        {/* z-index por encima del diálogo del repositorio (z-[1101]); si no, el
            confirm quedaba DETRÁS y solo se veía el fondo oscuro, sin poder
            confirmar el borrado. */}
        <AlertDialogContent className="z-[1300]">
          <AlertDialogHeader>
            <AlertDialogTitle>
              Eliminar {deleteTarget?.type === 'folder' ? 'carpeta' : 'archivo'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              ¿Está seguro de eliminar "{deleteTarget?.name}"?
              {deleteTarget?.type === 'folder' && " Se eliminarán todos los archivos y subcarpetas contenidos."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            {/* No usamos AlertDialogAction (que cierra el diálogo al instante):
                así el diálogo queda abierto mostrando "Eliminando..." hasta que
                la operación termina, y no se puede disparar dos veces. */}
            <Button variant="destructive" onClick={handleConfirmDelete} disabled={deleting}>
              {deleting ? "Eliminando..." : "Eliminar"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk upload dialog */}
      <PatentBulkUploadDialog
        open={showBulkUpload}
        onOpenChange={setShowBulkUpload}
        onComplete={() => loadContents(currentFolder?.id || null)}
      />
    </>
  );
}
