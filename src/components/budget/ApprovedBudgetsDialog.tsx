import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Plus, Trash2, Pencil, FileText, Download, X, Check } from "lucide-react";
import { formatCLP } from "@/lib/utils";
import { sanitizeFileName, validateFile } from "@/lib/fileValidation";

const BUCKET = "repository-files";
const STORAGE_PREFIX = "capex-approved-budgets";

interface ApprovedBudgetFile {
  id: string;
  file_name: string;
  file_path: string;
}

interface ApprovedBudget {
  id: string;
  year: number;
  amount_clp: number;
  files: ApprovedBudgetFile[];
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ApprovedBudgetsDialog({ open, onOpenChange }: Props) {
  const [budgets, setBudgets] = useState<ApprovedBudget[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Fila en edición/alta -- null = ninguna. "new" = alta de un año nuevo.
  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [editYear, setEditYear] = useState("");
  const [editAmountMM, setEditAmountMM] = useState("");
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadBudgets = async () => {
    setLoading(true);
    try {
      const { data: rows, error } = await (supabase as any)
        .from("capex_approved_budgets")
        .select("id, year, amount_clp")
        .order("year", { ascending: false });
      if (error) throw error;

      const ids = (rows || []).map((r: any) => r.id);
      let filesByBudget: Record<string, ApprovedBudgetFile[]> = {};
      if (ids.length > 0) {
        const { data: files } = await (supabase as any)
          .from("capex_approved_budget_files")
          .select("id, budget_id, file_name, file_path")
          .in("budget_id", ids);
        (files || []).forEach((f: any) => {
          if (!filesByBudget[f.budget_id]) filesByBudget[f.budget_id] = [];
          filesByBudget[f.budget_id].push({ id: f.id, file_name: f.file_name, file_path: f.file_path });
        });
      }

      setBudgets((rows || []).map((r: any) => ({
        id: r.id,
        year: r.year,
        amount_clp: r.amount_clp,
        files: filesByBudget[r.id] || [],
      })));
    } catch (err) {
      console.error(err);
      toast.error("Error al cargar los presupuestos aprobados");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) loadBudgets();
  }, [open]);

  const startNew = () => {
    setEditingId("new");
    setEditYear(String(new Date().getFullYear()));
    setEditAmountMM("");
    setPendingFiles([]);
  };

  const startEdit = (b: ApprovedBudget) => {
    setEditingId(b.id);
    setEditYear(String(b.year));
    setEditAmountMM(b.amount_clp > 0 ? String(Math.round(b.amount_clp / 1_000_000)) : "");
    setPendingFiles([]);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setPendingFiles([]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleFilesSelected = (fileList: FileList | null) => {
    if (!fileList) return;
    const valid: File[] = [];
    Array.from(fileList).forEach((file) => {
      const check = validateFile(file);
      if (!check.isValid) {
        toast.error(check.error || `Archivo no permitido: ${file.name}`);
        return;
      }
      valid.push(file);
    });
    setPendingFiles((prev) => [...prev, ...valid]);
  };

  const uploadFiles = async (budgetId: string, files: File[]) => {
    for (const file of files) {
      const safeName = sanitizeFileName(file.name);
      const path = `${STORAGE_PREFIX}/${budgetId}/${Date.now()}-${safeName}`;
      const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, file);
      if (uploadError) throw uploadError;
      const { error: insertError } = await (supabase as any)
        .from("capex_approved_budget_files")
        .insert({ budget_id: budgetId, file_name: file.name, file_path: path });
      if (insertError) throw insertError;
    }
  };

  const handleSave = async () => {
    const year = parseInt(editYear);
    if (!Number.isFinite(year)) {
      toast.error("Ingresá un año válido");
      return;
    }
    const amountMM = editAmountMM ? parseFloat(editAmountMM) : 0;
    if (!Number.isFinite(amountMM) || amountMM < 0) {
      toast.error("Ingresá un monto válido (en millones de $)");
      return;
    }
    const amountClp = Math.round(amountMM * 1_000_000);

    setSaving(true);
    try {
      let budgetId: string;
      if (editingId === "new") {
        const { data, error } = await (supabase as any)
          .from("capex_approved_budgets")
          .insert({ year, amount_clp: amountClp })
          .select("id")
          .single();
        if (error) throw error;
        budgetId = data.id;
      } else {
        budgetId = editingId!;
        const { error } = await (supabase as any)
          .from("capex_approved_budgets")
          .update({ year, amount_clp: amountClp, updated_at: new Date().toISOString() })
          .eq("id", budgetId);
        if (error) throw error;
      }

      if (pendingFiles.length > 0) {
        await uploadFiles(budgetId, pendingFiles);
      }

      toast.success("Presupuesto aprobado guardado");
      cancelEdit();
      await loadBudgets();
    } catch (err: any) {
      console.error(err);
      if (err?.code === "23505") {
        toast.error(`Ya existe un presupuesto aprobado para el año ${year}`);
      } else {
        toast.error("Error al guardar el presupuesto aprobado");
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteBudget = async (b: ApprovedBudget) => {
    if (!confirm(`¿Eliminar el presupuesto aprobado ${b.year}? Se eliminan también sus archivos adjuntos.`)) return;
    try {
      if (b.files.length > 0) {
        await supabase.storage.from(BUCKET).remove(b.files.map((f) => f.file_path));
      }
      const { error } = await (supabase as any).from("capex_approved_budgets").delete().eq("id", b.id);
      if (error) throw error;
      toast.success("Presupuesto aprobado eliminado");
      setBudgets((prev) => prev.filter((x) => x.id !== b.id));
    } catch (err) {
      console.error(err);
      toast.error("Error al eliminar el presupuesto aprobado");
    }
  };

  const handleDeleteFile = async (file: ApprovedBudgetFile) => {
    try {
      await supabase.storage.from(BUCKET).remove([file.file_path]);
      const { error } = await (supabase as any).from("capex_approved_budget_files").delete().eq("id", file.id);
      if (error) throw error;
      setBudgets((prev) => prev.map((b) => ({ ...b, files: b.files.filter((f) => f.id !== file.id) })));
    } catch (err) {
      console.error(err);
      toast.error("Error al eliminar el archivo");
    }
  };

  const handleDownloadFile = async (file: ApprovedBudgetFile) => {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(file.file_path, 60);
    if (error || !data?.signedUrl) {
      toast.error("Error al generar el link de descarga");
      return;
    }
    window.open(data.signedUrl, "_blank");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Presupuestos Aprobados</DialogTitle>
          <DialogDescription>
            Presupuesto CAPEX aprobado por año (en millones de pesos), con sus respaldos adjuntos. No requiere conversión a UF.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-3">
            {budgets.map((b) => (
              <div key={b.id} className="border rounded-md p-3">
                {editingId === b.id ? (
                  <EditRow
                    year={editYear} setYear={setEditYear}
                    amountMM={editAmountMM} setAmountMM={setEditAmountMM}
                    pendingFiles={pendingFiles} setPendingFiles={setPendingFiles}
                    fileInputRef={fileInputRef}
                    onFilesSelected={handleFilesSelected}
                    existingFiles={b.files}
                    onDeleteExistingFile={handleDeleteFile}
                    onSave={handleSave} onCancel={cancelEdit} saving={saving}
                  />
                ) : (
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-medium">{b.year}</div>
                      <div className="text-sm text-muted-foreground">
                        mm$ {Math.round(b.amount_clp / 1_000_000).toLocaleString("es-CL")} ({formatCLP(b.amount_clp)})
                      </div>
                      {b.files.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-2">
                          {b.files.map((f) => (
                            <button
                              key={f.id}
                              onClick={() => handleDownloadFile(f)}
                              className="flex items-center gap-1 text-xs border rounded px-2 py-1 hover:bg-muted"
                              title={`Descargar ${f.file_name}`}
                            >
                              <FileText className="h-3 w-3" />
                              <span className="max-w-[160px] truncate">{f.file_name}</span>
                              <Download className="h-3 w-3" />
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button variant="ghost" size="icon" className="h-7 w-7" title="Editar" onClick={() => startEdit(b)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" title="Eliminar" onClick={() => handleDeleteBudget(b)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ))}

            {editingId === "new" ? (
              <div className="border rounded-md p-3 border-dashed">
                <EditRow
                  year={editYear} setYear={setEditYear}
                  amountMM={editAmountMM} setAmountMM={setEditAmountMM}
                  pendingFiles={pendingFiles} setPendingFiles={setPendingFiles}
                  fileInputRef={fileInputRef}
                  onFilesSelected={handleFilesSelected}
                  existingFiles={[]}
                  onDeleteExistingFile={() => {}}
                  onSave={handleSave} onCancel={cancelEdit} saving={saving}
                  isNew
                />
              </div>
            ) : (
              <Button variant="outline" className="w-full gap-2" onClick={startNew} disabled={editingId !== null}>
                <Plus className="h-4 w-4" />
                Agregar Año
              </Button>
            )}

            {budgets.length === 0 && editingId !== "new" && (
              <p className="text-sm text-muted-foreground text-center py-4">
                Todavía no hay presupuestos aprobados cargados.
              </p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function EditRow({
  year, setYear, amountMM, setAmountMM, pendingFiles, setPendingFiles,
  fileInputRef, onFilesSelected, existingFiles, onDeleteExistingFile,
  onSave, onCancel, saving, isNew,
}: {
  year: string; setYear: (v: string) => void;
  amountMM: string; setAmountMM: (v: string) => void;
  pendingFiles: File[]; setPendingFiles: (v: File[]) => void;
  fileInputRef: React.RefObject<HTMLInputElement>;
  onFilesSelected: (files: FileList | null) => void;
  existingFiles: ApprovedBudgetFile[];
  onDeleteExistingFile: (f: ApprovedBudgetFile) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
  isNew?: boolean;
}) {
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs text-muted-foreground">Año</label>
          <Input type="number" value={year} onChange={(e) => setYear(e.target.value)} disabled={!isNew} />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Monto (millones de $)</label>
          <Input type="number" placeholder="Ej: 2500" value={amountMM} onChange={(e) => setAmountMM(e.target.value)} />
        </div>
      </div>

      {existingFiles.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {existingFiles.map((f) => (
            <span key={f.id} className="flex items-center gap-1 text-xs border rounded px-2 py-1">
              <FileText className="h-3 w-3" />
              <span className="max-w-[140px] truncate">{f.file_name}</span>
              <button onClick={() => onDeleteExistingFile(f)} title="Eliminar archivo">
                <X className="h-3 w-3 text-destructive" />
              </button>
            </span>
          ))}
        </div>
      )}

      <div>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => onFilesSelected(e.target.files)}
        />
        <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
          Adjuntar archivos (Excel, PDF, Word, etc.)
        </Button>
        {pendingFiles.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-2">
            {pendingFiles.map((f, i) => (
              <span key={i} className="flex items-center gap-1 text-xs border rounded px-2 py-1">
                <FileText className="h-3 w-3" />
                <span className="max-w-[140px] truncate">{f.name}</span>
                <button onClick={() => setPendingFiles(pendingFiles.filter((_, idx) => idx !== i))} title="Quitar">
                  <X className="h-3 w-3 text-destructive" />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <Button variant="outline" size="sm" onClick={onCancel} disabled={saving}>
          Cancelar
        </Button>
        <Button size="sm" onClick={onSave} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Check className="h-4 w-4 mr-1" />}
          Guardar
        </Button>
      </div>
    </div>
  );
}
