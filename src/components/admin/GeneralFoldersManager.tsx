import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Folder, FolderPlus, Trash2, Pencil, ChevronRight, Loader2, Upload, FileText, ExternalLink } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { validateFile, sanitizeFileName } from "@/lib/fileValidation";
import { useRef } from "react";

interface GeneralFolder {
  id: string;
  name: string;
  parent_id: string | null;
  display_order: number;
  drive_folder_id: string | null;
}

interface GeneralFile {
  id: string;
  folder_id: string;
  name: string;
  url: string;
  file_type: string | null;
  drive_file_id: string | null;
}

// Recursive folder item
const GeneralFolderItem = ({
  folder,
  level,
  getSubfolders,
  onAddSubfolder,
  onDelete,
  onRename,
  onSelect,
  selectedFolderId,
}: {
  folder: GeneralFolder;
  level: number;
  getSubfolders: (parentId: string) => GeneralFolder[];
  onAddSubfolder: (parentId: string) => void;
  onDelete: (id: string, name: string) => void;
  onRename: (id: string, newName: string) => void;
  onSelect: (folder: GeneralFolder) => void;
  selectedFolderId: string | null;
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(folder.name);
  const subfolders = getSubfolders(folder.id);
  const isRoot = level === 0;
  const paddingLeft = level * 16;
  const isSelected = selectedFolderId === folder.id;

  const handleSave = () => {
    const trimmed = editName.trim();
    if (trimmed && trimmed !== folder.name) {
      onRename(folder.id, trimmed);
    } else {
      setEditName(folder.name);
    }
    setIsEditing(false);
  };

  return (
    <div className="space-y-1">
      <div
        className={`flex items-center justify-between p-2 ${isRoot ? 'p-3 bg-muted/50' : 'bg-muted/30'} rounded-lg cursor-pointer ${isSelected ? 'ring-1 ring-primary bg-primary/10' : ''}`}
        style={{ marginLeft: `${paddingLeft}px` }}
        onClick={() => onSelect(folder)}
      >
        <div className="flex items-center gap-2">
          {!isRoot && <ChevronRight className="h-3 w-3 text-muted-foreground" />}
          <Folder className={`${isRoot ? 'h-4 w-4' : 'h-3 w-3'} text-amber-500`} />
          {isEditing ? (
            <Input
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onBlur={handleSave}
              onKeyDown={(e) => {
                if (e.key === "Escape") { setEditName(folder.name); setIsEditing(false); }
              }}
              className="h-7 text-sm w-40"
              autoFocus
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <span
              className={`${isRoot ? 'font-medium' : 'text-sm'} cursor-pointer hover:underline`}
              onDoubleClick={(e) => { e.stopPropagation(); setIsEditing(true); }}
            >
              {folder.name}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          <Button variant="ghost" size="sm" onClick={() => setIsEditing(true)} title="Renombrar">
            <Pencil className={`${isRoot ? 'h-4 w-4' : 'h-3 w-3'} text-muted-foreground`} />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => onAddSubfolder(folder.id)} title="Agregar subcarpeta">
            <FolderPlus className={`${isRoot ? 'h-4 w-4' : 'h-3 w-3'} text-primary`} />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => onDelete(folder.id, folder.name)}>
            <Trash2 className={`${isRoot ? 'h-4 w-4' : 'h-3 w-3'} text-destructive`} />
          </Button>
        </div>
      </div>
      {subfolders.map((sub) => (
        <GeneralFolderItem
          key={sub.id}
          folder={sub}
          level={level + 1}
          getSubfolders={getSubfolders}
          onAddSubfolder={onAddSubfolder}
          onDelete={onDelete}
          onRename={onRename}
          onSelect={onSelect}
          selectedFolderId={selectedFolderId}
        />
      ))}
    </div>
  );
};

export const GeneralFoldersManager = () => {
  const { toast } = useToast();
  const [folders, setFolders] = useState<GeneralFolder[]>([]);
  const [files, setFiles] = useState<GeneralFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedFolder, setSelectedFolder] = useState<GeneralFolder | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Dialog state
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [parentForNew, setParentForNew] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => { loadFolders(); }, []);

  useEffect(() => {
    if (selectedFolder) loadFiles(selectedFolder.id);
    else setFiles([]);
  }, [selectedFolder?.id]);

  const loadFolders = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("general_folders")
      .select("*")
      .order("display_order", { ascending: true });
    if (!error) setFolders(data || []);
    setLoading(false);
  };

  const loadFiles = async (folderId: string) => {
    const { data } = await supabase
      .from("general_folder_files")
      .select("*")
      .eq("folder_id", folderId)
      .order("uploaded_at", { ascending: false });
    setFiles(data || []);
  };

  const getSubfolders = (parentId: string): GeneralFolder[] =>
    folders.filter((f) => f.parent_id === parentId);

  const getRootFolders = (): GeneralFolder[] =>
    folders.filter((f) => f.parent_id === null);

  const handleCreate = async () => {
    if (!newFolderName.trim()) return;
    setCreating(true);
    try {
      const siblings = folders.filter((f) => f.parent_id === parentForNew);
      const maxOrder = siblings.length > 0 ? Math.max(...siblings.map((f) => f.display_order)) + 1 : 1;

      const { error } = await supabase.from("general_folders").insert({
        name: newFolderName.trim(),
        parent_id: parentForNew,
        display_order: maxOrder,
      });
      if (error) throw error;

      toast({ title: "Carpeta creada", description: newFolderName.trim() });
      setNewFolderName("");
      setCreateDialogOpen(false);
      setParentForNew(null);
      loadFolders();
    } catch (err: any) {
      toast({ variant: "destructive", title: "Error", description: err.message });
    } finally {
      setCreating(false);
    }
  };

  const handleRename = async (id: string, newName: string) => {
    const { error } = await supabase.from("general_folders").update({ name: newName }).eq("id", id);
    if (error) toast({ variant: "destructive", title: "Error", description: error.message });
    else { toast({ title: "Carpeta renombrada" }); loadFolders(); }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`¿Eliminar la carpeta "${name}" y todo su contenido?`)) return;
    const { error } = await supabase.from("general_folders").delete().eq("id", id);
    if (error) toast({ variant: "destructive", title: "Error", description: error.message });
    else {
      toast({ title: "Carpeta eliminada" });
      if (selectedFolder?.id === id) setSelectedFolder(null);
      loadFolders();
    }
  };

  const handleAddSubfolder = (parentId: string) => {
    setParentForNew(parentId);
    setCreateDialogOpen(true);
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !selectedFolder) return;

    const validation = validateFile(file);
    if (!validation.isValid) {
      toast({ variant: "destructive", title: "Archivo no válido", description: validation.error });
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    setUploading(true);
    try {
      const fileExt = file.name.split(".").pop();
      const sanitizedName = sanitizeFileName(file.name);
      const fileName = `${Date.now()}-${sanitizedName}`;
      const filePath = `general/${selectedFolder.id}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from("repository-files")
        .upload(filePath, file);
      if (uploadError) throw uploadError;

      const storagePath = `storage://repository-files/${filePath}`;

      const { error: dbError } = await supabase.from("general_folder_files").insert({
        folder_id: selectedFolder.id,
        name: file.name,
        url: storagePath,
        file_type: fileExt || null,
      });
      if (dbError) throw dbError;

      toast({ title: "Archivo subido", description: file.name });
      loadFiles(selectedFolder.id);
    } catch (err: any) {
      toast({ variant: "destructive", title: "Error", description: err.message });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDeleteFile = async (fileId: string, fileName: string) => {
    if (!confirm(`¿Eliminar "${fileName}"?`)) return;
    const { error } = await supabase.from("general_folder_files").delete().eq("id", fileId);
    if (error) toast({ variant: "destructive", title: "Error", description: error.message });
    else { toast({ title: "Archivo eliminado" }); if (selectedFolder) loadFiles(selectedFolder.id); }
  };

  const parentName = parentForNew ? folders.find((f) => f.id === parentForNew)?.name : null;

  if (loading) return <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Carpetas generales independientes de contratos. Se sincronizan en Drive bajo "Carpeta General".
        </p>
        <Dialog open={createDialogOpen} onOpenChange={(o) => { setCreateDialogOpen(o); if (!o) setParentForNew(null); }}>
          <DialogTrigger asChild>
            <Button size="sm" onClick={() => setParentForNew(null)}>
              <FolderPlus className="mr-2 h-4 w-4" />
              Nueva Carpeta
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{parentName ? `Subcarpeta de "${parentName}"` : "Nueva Carpeta General"}</DialogTitle>
              <DialogDescription>
                {parentName ? "Se creará dentro de la carpeta seleccionada." : "Se creará como carpeta raíz en Carpetas Generales."}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2 py-4">
              <Label>Nombre *</Label>
              <Input
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                placeholder="Ej: Documentos Corporativos"
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>Cancelar</Button>
              <Button onClick={handleCreate} disabled={creating || !newFolderName.trim()}>
                {creating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Crear
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Folder tree */}
        <div className="border rounded-lg p-3 space-y-2">
          <h4 className="text-sm font-medium text-muted-foreground mb-2">Estructura de Carpetas</h4>
          <ScrollArea className="max-h-[400px]">
            {getRootFolders().length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No hay carpetas generales</p>
            ) : (
              <div className="space-y-1">
                {getRootFolders().map((f) => (
                  <GeneralFolderItem
                    key={f.id}
                    folder={f}
                    level={0}
                    getSubfolders={getSubfolders}
                    onAddSubfolder={handleAddSubfolder}
                    onDelete={handleDelete}
                    onRename={handleRename}
                    onSelect={setSelectedFolder}
                    selectedFolderId={selectedFolder?.id || null}
                  />
                ))}
              </div>
            )}
          </ScrollArea>
        </div>

        {/* Files panel */}
        <div className="border rounded-lg p-3 space-y-2">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-medium text-muted-foreground">
              {selectedFolder ? `Archivos en "${selectedFolder.name}"` : "Selecciona una carpeta"}
            </h4>
            {selectedFolder && (
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  onChange={handleFileUpload}
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png"
                />
                <Button size="sm" variant="outline" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                  <Upload className="mr-2 h-3 w-3" />
                  {uploading ? "Subiendo..." : "Subir"}
                </Button>
              </>
            )}
          </div>
          <ScrollArea className="max-h-[350px]">
            {!selectedFolder ? (
              <p className="text-sm text-muted-foreground text-center py-8">Haz clic en una carpeta para ver sus archivos</p>
            ) : files.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">Carpeta vacía</p>
            ) : (
              <div className="space-y-1">
                {files.map((file) => (
                  <div key={file.id} className="flex items-center justify-between p-2 rounded hover:bg-muted/50">
                    <div className="flex items-center gap-2 min-w-0">
                      <FileText className="h-4 w-4 text-blue-500 shrink-0" />
                      <span className="text-sm truncate">{file.name}</span>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => handleDeleteFile(file.id, file.name)}>
                      <Trash2 className="h-3 w-3 text-destructive" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </div>
      </div>
    </div>
  );
};
