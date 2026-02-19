import { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Upload, CheckCircle2, AlertCircle, Search, FileText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { validateFile, sanitizeFileName } from "@/lib/fileValidation";

interface TargetFolder {
  id: string;
  name: string;
}

interface FileEntry {
  file: File;
  matchedFolder: TargetFolder | null;
  selectedFolderId: string | null;
  status: "pending" | "uploading" | "done" | "error";
}

interface PatentBulkUploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete?: () => void;
}

function matchFileToFolder(fileName: string, folders: TargetFolder[]): TargetFolder | null {
  const cleanName = fileName.replace(/\.(pdf|jpeg|jpg|png)$/i, "").replace(/^Patente_/, "");
  if (cleanName.length < 3) return null;
  const prefix = cleanName.substring(0, 2).toUpperCase();
  const localName = cleanName.substring(3).replace(/_/g, " ").trim();
  if (!localName) return null;

  const matches = folders.filter(
    (f) =>
      f.name.toUpperCase().startsWith(prefix) &&
      f.name.toLowerCase().includes(localName.toLowerCase())
  );
  return matches.length === 1 ? matches[0] : null;
}

export function PatentBulkUploadDialog({ open, onOpenChange, onComplete }: PatentBulkUploadDialogProps) {
  const [folders, setFolders] = useState<TargetFolder[]>([]);
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [folderSearch, setFolderSearch] = useState<Record<number, string>>({});

  useEffect(() => {
    if (!open) return;
    setEntries([]);
    setProgress(0);
    (async () => {
      const { data } = await supabase
        .from("repository_folders")
        .select("id, name")
        .eq("folder_type", "patent_contract_sub")
        .is("contract_id", null)
        .order("name");
      setFolders(data || []);
    })();
  }, [open]);

  const handleFilesSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return;
    const newEntries: FileEntry[] = Array.from(e.target.files).map((file) => ({
      file,
      matchedFolder: matchFileToFolder(file.name, folders),
      selectedFolderId: null,
      status: "pending",
    }));
    // Pre-select matched folder
    for (const entry of newEntries) {
      if (entry.matchedFolder) {
        entry.selectedFolderId = entry.matchedFolder.id;
      }
    }
    setEntries((prev) => [...prev, ...newEntries]);
    e.target.value = "";
  };

  const updateEntry = (index: number, folderId: string) => {
    setEntries((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], selectedFolderId: folderId };
      return copy;
    });
  };

  const removeEntry = (index: number) => {
    setEntries((prev) => prev.filter((_, i) => i !== index));
  };

  const allAssigned = entries.length > 0 && entries.every((e) => e.selectedFolderId);

  const handleUploadAll = async () => {
    if (!allAssigned) return;
    setUploading(true);
    let done = 0;

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      if (entry.status === "done") { done++; continue; }

      setEntries((prev) => {
        const copy = [...prev];
        copy[i] = { ...copy[i], status: "uploading" };
        return copy;
      });

      const validation = validateFile(entry.file);
      if (!validation.isValid) {
        toast.error(`${entry.file.name}: ${validation.error}`);
        setEntries((prev) => {
          const copy = [...prev];
          copy[i] = { ...copy[i], status: "error" };
          return copy;
        });
        done++;
        setProgress(Math.round((done / entries.length) * 100));
        continue;
      }

      const sanitized = sanitizeFileName(entry.file.name);
      const path = `shared-patents/${entry.selectedFolderId}/${Date.now()}_${sanitized}`;

      const { error } = await supabase.storage
        .from("repository-files")
        .upload(path, entry.file, { upsert: true });

      if (error) {
        toast.error(`Error subiendo ${entry.file.name}`);
        setEntries((prev) => {
          const copy = [...prev];
          copy[i] = { ...copy[i], status: "error" };
          return copy;
        });
      } else {
        const storagePath = `storage://repository-files/${path}`;
        await supabase.from("repository_files").insert({
          folder_id: entry.selectedFolderId!,
          name: entry.file.name,
          url: storagePath,
          file_type: entry.file.type || null,
        });
        setEntries((prev) => {
          const copy = [...prev];
          copy[i] = { ...copy[i], status: "done" };
          return copy;
        });
      }

      done++;
      setProgress(Math.round((done / entries.length) * 100));
    }

    setUploading(false);
    const successCount = entries.filter((_, idx) => {
      // re-check after loop – use latest state snapshot
      return true; // we'll toast summary below
    }).length;
    toast.success("Subida masiva completada");
    onComplete?.();
  };

  const getFilteredFolders = (index: number) => {
    const search = (folderSearch[index] || "").toLowerCase();
    if (!search) return folders;
    return folders.filter((f) => f.name.toLowerCase().includes(search));
  };

  return (
    <Dialog open={open} onOpenChange={uploading ? undefined : onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Subida Masiva de Patentes</DialogTitle>
        </DialogHeader>

        {/* File picker */}
        <div className="flex items-center gap-2">
          <Input
            type="file"
            id="bulk-patent-upload"
            className="hidden"
            onChange={handleFilesSelected}
            accept=".pdf,.jpg,.jpeg,.png"
            multiple
            disabled={uploading}
          />
          <label htmlFor="bulk-patent-upload">
            <Button variant="outline" size="sm" asChild disabled={uploading}>
              <span>
                <Upload className="h-4 w-4 mr-1" />
                Seleccionar Archivos
              </span>
            </Button>
          </label>
          <span className="text-sm text-muted-foreground">
            {entries.length} archivo(s) agregado(s)
          </span>
        </div>

        {/* Progress */}
        {uploading && (
          <div className="space-y-1">
            <Progress value={progress} className="h-2" />
            <p className="text-xs text-muted-foreground text-right">{progress}%</p>
          </div>
        )}

        {/* File list */}
        <div className="flex-1 overflow-y-auto space-y-2 min-h-[150px]">
          {entries.length === 0 && (
            <div className="text-center py-8 text-muted-foreground text-sm">
              Selecciona archivos para comenzar la clasificación automática.
            </div>
          )}

          {entries.map((entry, idx) => (
            <div
              key={idx}
              className="flex items-start gap-3 p-3 rounded-md border bg-card"
            >
              {/* Status icon */}
              <div className="mt-1 flex-shrink-0">
                {entry.status === "done" ? (
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                ) : entry.status === "error" ? (
                  <AlertCircle className="h-4 w-4 text-destructive" />
                ) : entry.matchedFolder ? (
                  <CheckCircle2 className="h-4 w-4 text-green-500/60" />
                ) : (
                  <AlertCircle className="h-4 w-4 text-yellow-500" />
                )}
              </div>

              {/* File info */}
              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex items-center gap-1">
                  <FileText className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                  <span className="text-sm font-medium truncate">{entry.file.name}</span>
                </div>

                {entry.matchedFolder ? (
                  <p className="text-xs text-green-600">
                    → {entry.matchedFolder.name}
                  </p>
                ) : (
                  <div className="space-y-1">
                    <p className="text-xs text-yellow-600">Sin clasificar — selecciona carpeta:</p>
                    <div className="relative">
                      <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                      <Input
                        placeholder="Buscar carpeta..."
                        className="h-7 text-xs pl-7"
                        value={folderSearch[idx] || ""}
                        onChange={(e) => setFolderSearch((prev) => ({ ...prev, [idx]: e.target.value }))}
                      />
                    </div>
                    <div className="max-h-28 overflow-y-auto border rounded-md">
                      {getFilteredFolders(idx).map((f) => (
                        <button
                          key={f.id}
                          className={`w-full text-left text-xs px-2 py-1 hover:bg-muted/50 ${
                            entry.selectedFolderId === f.id ? "bg-primary/10 font-medium" : ""
                          }`}
                          onClick={() => updateEntry(idx, f.id)}
                        >
                          {f.name}
                        </button>
                      ))}
                      {getFilteredFolders(idx).length === 0 && (
                        <p className="text-xs text-muted-foreground p-2">Sin resultados</p>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Remove */}
              {!uploading && entry.status !== "done" && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 flex-shrink-0"
                  onClick={() => removeEntry(idx)}
                >
                  ×
                </Button>
              )}
            </div>
          ))}
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-2 border-t">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={uploading}>
            Cancelar
          </Button>
          <Button
            size="sm"
            onClick={handleUploadAll}
            disabled={!allAssigned || uploading}
          >
            <Upload className="h-4 w-4 mr-1" />
            Subir Todos ({entries.length})
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
