import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Plus, Trash2, Pencil, FileText, Download, X, Check, TrendingUp } from "lucide-react";
import { sanitizeFileName, validateFile } from "@/lib/fileValidation";

const BUCKET = "repository-files";
const STORAGE_PREFIX = "capex-approved-budgets";

interface ApprovedBudgetFile {
  id: string;
  file_name: string;
  file_path: string;
}

interface BudgetIncrease {
  id: string;
  amount_clp: number;
  note: string | null;
  created_at: string;
}

interface ApprovedBudget {
  id: string;
  year: number;
  amount_clp: number;
  files: ApprovedBudgetFile[];
  increases: BudgetIncrease[];
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

  // Id del presupuesto al que se le está por registrar un aumento -- null =
  // ninguno. El aumento queda registrado como fila propia (con fecha e
  // importe), pero en la card principal de /capex se ve solo el total
  // (original + aumentos), sin desglosar.
  const [addingIncreaseFor, setAddingIncreaseFor] = useState<string | null>(null);
  const [increaseAmount, setIncreaseAmount] = useState("");
  const [increaseNote, setIncreaseNote] = useState("");
  const [savingIncrease, setSavingIncrease] = useState(false);

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
      let increasesByBudget: Record<string, BudgetIncrease[]> = {};
      if (ids.length > 0) {
        const { data: files } = await (supabase as any)
          .from("capex_approved_budget_files")
          .select("id, budget_id, file_name, file_path")
          .in("budget_id", ids);
        (files || []).forEach((f: any) => {
          if (!filesByBudget[f.budget_id]) filesByBudget[f.budget_id] = [];
          filesByBudget[f.budget_id].push({ id: f.id, file_name: f.file_name, file_path: f.file_path });
        });

        const { data: increases } = await (supabase as any)
          .from("capex_approved_budget_increases")
          .select("id, budget_id, amount_clp, note, created_at")
          .in("budget_id", ids)
          .order("created_at", { ascending: true });
        (increases || []).forEach((inc: any) => {
          if (!increasesByBudget[inc.budget_id]) increasesByBudget[inc.budget_id] = [];
          increasesByBudget[inc.budget_id].push({ id: inc.id, amount_clp: inc.amount_clp, note: inc.note, created_at: inc.created_at });
        });
      }

      setBudgets((rows || []).map((r: any) => ({
        id: r.id,
        year: r.year,
        amount_clp: r.amount_clp,
        files: filesByBudget[r.id] || [],
        increases: increasesByBudget[r.id] || [],
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
    setEditAmountMM(b.amount_clp > 0 ? String(Math.round(b.amount_clp)) : "");
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
    // El campo pide el monto TOTAL en pesos (no en millones) -- se guarda tal
    // cual, y se divide por 1.000.000 recién al mostrarlo (acá y en la card
    // de /capex). Antes se pedía "en millones" y se multiplicaba por
    // 1.000.000 al guardar, lo que duplicaba la conversión si alguien
    // tipeaba sin querer el monto ya completo en vez de solo los millones.
    const amountClpRaw = editAmountMM ? parseFloat(editAmountMM) : 0;
    if (!Number.isFinite(amountClpRaw) || amountClpRaw < 0) {
      toast.error("Ingresá un monto válido (en pesos)");
      return;
    }
    const amountClp = Math.round(amountClpRaw);

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

  const startAddIncrease = (budgetId: string) => {
    setAddingIncreaseFor(budgetId);
    setIncreaseAmount("");
    setIncreaseNote("");
  };

  const cancelAddIncrease = () => setAddingIncreaseFor(null);

  const handleSaveIncrease = async (budgetId: string) => {
    const amountClp = increaseAmount ? Math.round(parseFloat(increaseAmount)) : NaN;
    if (!Number.isFinite(amountClp) || amountClp <= 0) {
      toast.error("Ingresá un monto de aumento válido (en pesos)");
      return;
    }
    setSavingIncrease(true);
    try {
      const { error } = await (supabase as any)
        .from("capex_approved_budget_increases")
        .insert({ budget_id: budgetId, amount_clp: amountClp, note: increaseNote || null });
      if (error) throw error;
      toast.success("Aumento de presupuesto registrado");
      setAddingIncreaseFor(null);
      await loadBudgets();
    } catch (err) {
      console.error(err);
      toast.error("Error al registrar el aumento");
    } finally {
      setSavingIncrease(false);
    }
  };

  const handleDeleteIncrease = async (increase: BudgetIncrease) => {
    if (!confirm("¿Eliminar este aumento de presupuesto?")) return;
    try {
      const { error } = await (supabase as any).from("capex_approved_budget_increases").delete().eq("id", increase.id);
      if (error) throw error;
      setBudgets((prev) => prev.map((b) => ({ ...b, increases: b.increases.filter((i) => i.id !== increase.id) })));
    } catch (err) {
      console.error(err);
      toast.error("Error al eliminar el aumento");
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
          <DialogTitle>Presupuestos Anuales</DialogTitle>
          <DialogDescription>
            Presupuesto CAPEX aprobado por año (monto total en pesos -- se muestra en millones), con sus respaldos adjuntos. No requiere conversión a UF.
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
                    <div className="min-w-0 flex-1">
                      <div className="font-medium">{b.year}</div>
                      <div className="text-sm text-muted-foreground">
                        Original: mm$ {Math.round(b.amount_clp / 1_000_000).toLocaleString("es-CL")}
                      </div>

                      {/* Historial de aumentos -- en /capex solo se ve el total
                          (original + aumentos), acá sí queda el detalle de cada
                          uno, con fecha y opción de eliminarlo (reversible). */}
                      {b.increases.length > 0 && (
                        <div className="mt-1 space-y-0.5">
                          {b.increases.map((inc) => (
                            <div key={inc.id} className="flex items-center gap-2 text-xs text-muted-foreground">
                              <TrendingUp className="h-3 w-3 text-green-600 shrink-0" />
                              <span>
                                + mm$ {Math.round(inc.amount_clp / 1_000_000).toLocaleString("es-CL")}
                                {" "}({new Date(inc.created_at).toLocaleDateString("es-CL")}){inc.note ? ` -- ${inc.note}` : ""}
                              </span>
                              <button onClick={() => handleDeleteIncrease(inc)} title="Eliminar aumento">
                                <X className="h-3 w-3 text-destructive" />
                              </button>
                            </div>
                          ))}
                          <div className="text-sm font-medium pt-0.5">
                            Total: mm$ {Math.round((b.amount_clp + b.increases.reduce((s, i) => s + i.amount_clp, 0)) / 1_000_000).toLocaleString("es-CL")}
                          </div>
                        </div>
                      )}

                      {addingIncreaseFor === b.id ? (
                        <div className="mt-2 flex items-center gap-2">
                          <Input
                            type="number"
                            placeholder="Monto del aumento ($)"
                            value={increaseAmount}
                            onChange={(e) => setIncreaseAmount(e.target.value)}
                            className="h-8 max-w-[180px]"
                          />
                          <Input
                            placeholder="Motivo (opcional)"
                            value={increaseNote}
                            onChange={(e) => setIncreaseNote(e.target.value)}
                            className="h-8"
                          />
                          <Button size="sm" className="h-8" onClick={() => handleSaveIncrease(b.id)} disabled={savingIncrease}>
                            {savingIncrease ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Guardar"}
                          </Button>
                          <Button size="sm" variant="outline" className="h-8" onClick={cancelAddIncrease} disabled={savingIncrease}>
                            Cancelar
                          </Button>
                        </div>
                      ) : (
                        <Button size="sm" variant="outline" className="h-7 mt-2 gap-1 text-xs" onClick={() => startAddIncrease(b.id)}>
                          <TrendingUp className="h-3.5 w-3.5" />
                          Registrar aumento
                        </Button>
                      )}

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
          <label className="text-xs text-muted-foreground">Monto total ($)</label>
          <Input type="number" placeholder="Ej: 2709000000" value={amountMM} onChange={(e) => setAmountMM(e.target.value)} />
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
