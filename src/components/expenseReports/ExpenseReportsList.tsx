import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Loader2, Plus, FileText, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useExpenseReports } from "@/hooks/useExpenseReports";
import type { ExpenseReport } from "./expenseReportsTypes";

interface Props {
  onSelectReport: (report: ExpenseReport) => void;
}

export function ExpenseReportsList({ onSelectReport }: Props) {
  const { reports, loading, createReport, deleteReport } = useExpenseReports();
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [saving, setSaving] = useState(false);

  const handleCreate = async () => {
    if (!newTitle.trim()) return;
    setSaving(true);
    const report = await createReport(newTitle.trim());
    setSaving(false);
    if (report) {
      setCreating(false);
      setNewTitle("");
      onSelectReport(report);
    } else {
      toast.error("No se pudo crear el informe");
    }
  };

  const handleDelete = async (e: React.MouseEvent, reportId: string) => {
    e.stopPropagation();
    if (!window.confirm("¿Eliminar este informe y todos sus gastos?")) return;
    await deleteReport(reportId);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-base">Mis informes de gasto</h2>
        <Button size="sm" className="gap-1.5" onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4" /> Nuevo informe
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : reports.length === 0 ? (
        <p className="text-sm text-muted-foreground italic py-6 text-center">
          Todavía no tienes informes de gasto.
        </p>
      ) : (
        <div className="space-y-2">
          {reports.map((report) => (
            <div
              key={report.id}
              role="button"
              tabIndex={0}
              onClick={() => onSelectReport(report)}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onSelectReport(report)}
              className="w-full text-left border rounded-lg p-3 hover:bg-muted/40 transition-colors flex items-center justify-between gap-2 cursor-pointer"
            >
              <div className="min-w-0 flex-1 flex items-center gap-2">
                <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{report.title}</div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(report.created_at).toLocaleDateString("es-CL")}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <Badge variant={report.status === "enviado" ? "default" : "outline"}>
                  {report.status === "enviado" ? "Enviado" : "Borrador"}
                </Badge>
                {report.status !== "enviado" && (
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    onClick={(e) => handleDelete(e, report.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Nuevo informe de gasto</DialogTitle>
          </DialogHeader>
          <Input
            placeholder="Ej: Viaje a Concepción, agosto 2026"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            autoFocus
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreating(false)}>Cancelar</Button>
            <Button onClick={handleCreate} disabled={!newTitle.trim() || saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Crear
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
