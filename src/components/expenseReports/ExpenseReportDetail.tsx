import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Loader2, Plus, Receipt, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useExpenseItems } from "@/hooks/useExpenseReports";
import { getMissingFields, getReportBlockers } from "./expenseItemCompleteness";
import { ExpenseItemForm } from "./ExpenseItemForm";
import { exportExpenseReportExcel } from "./expenseReportExcel";
import { expenseReportShareLinks, shareExpenseReport } from "./shareExpenseReport";
import type { ExpenseReport } from "./expenseReportsTypes";

interface Props {
  report: ExpenseReport;
  onBack: () => void;
  onReportUpdated: () => void;
}

export function ExpenseReportDetail({ report, onBack, onReportUpdated }: Props) {
  const { items, loading, saving, createItem, updateItem, deleteItem, uploadReceiptPhoto, deleteReceiptPhoto, sendReport, loadItems } =
    useExpenseItems(report.id);
  const [openItemId, setOpenItemId] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [shareFallback, setShareFallback] = useState<{ whatsapp: string; email: string } | null>(null);

  const readOnly = report.status === "enviado";
  const blockers = getReportBlockers(items);
  const canSend = !readOnly && blockers.length === 0;
  const openItem = items.find((i) => i.id === openItemId) || null;

  const handleAddItem = async () => {
    const item = await createItem();
    if (item) setOpenItemId(item.id);
    else toast.error("No se pudo crear el gasto");
  };

  const handleDeleteItem = async (e: React.MouseEvent, itemId: string) => {
    e.stopPropagation();
    if (!window.confirm("¿Eliminar este gasto?")) return;
    await deleteItem(itemId);
  };

  const handleSend = async () => {
    if (!canSend) return;
    if (!window.confirm(`¿Enviar el informe "${report.title}" con ${items.length} gasto(s)? No se podrá editar después.`)) return;
    setSending(true);
    const result = await sendReport();
    if (!result.ok) {
      toast.error(result.error || "No se pudo enviar el informe");
      setSending(false);
      return;
    }
    onReportUpdated();
    const sentReport = { ...report, status: "enviado" as const };
    const { shared, fileName } = await shareExpenseReport(sentReport, items);
    if (!shared) {
      toast.info(`Se descargó "${fileName}". Adjúntalo manualmente en WhatsApp o el correo que se abrirá.`, { duration: 10000 });
      setShareFallback(expenseReportShareLinks(sentReport, items));
    }
    setSending(false);
  };

  const handleDownloadOnly = () => {
    exportExpenseReportExcel(report, items);
    toast.success("Excel descargado");
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" className="h-8 px-2 gap-1" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" /> Informes
        </Button>
      </div>

      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="font-semibold text-base">{report.title}</h2>
          <Badge variant={readOnly ? "default" : "outline"} className="mt-1">
            {readOnly ? "Enviado" : "Borrador"}
          </Badge>
        </div>
        {!readOnly && (
          <Button size="sm" className="gap-1.5" onClick={handleAddItem} disabled={saving}>
            <Plus className="h-4 w-4" /> Agregar gasto
          </Button>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground italic py-6 text-center">
          Este informe todavía no tiene gastos.
        </p>
      ) : (
        <div className="space-y-2">
          {items.map((item) => {
            const missing = getMissingFields(item);
            const complete = missing.length === 0;
            return (
              <button
                key={item.id}
                onClick={() => setOpenItemId(item.id)}
                className="w-full text-left border rounded-lg p-3 hover:bg-muted/40 transition-colors flex items-center justify-between gap-2"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Receipt className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span className="text-sm font-medium truncate">
                      {item.business_purpose || item.provider_name || "Gasto sin propósito"}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {item.total_amount != null ? `${item.currency || ""} ${item.total_amount.toLocaleString("es-CL")}` : "Sin monto"}
                  </div>
                  {complete ? (
                    <Badge variant="outline" className="mt-1.5 text-[10px] text-green-700 border-green-300">Completo</Badge>
                  ) : (
                    <Badge variant="outline" className="mt-1.5 text-[10px] text-amber-700 border-amber-300" title={missing.join(", ")}>
                      Incompleto — falta {missing.length}
                    </Badge>
                  )}
                </div>
                {!readOnly && (
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive shrink-0"
                    onClick={(e) => handleDeleteItem(e, item.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </button>
            );
          })}
        </div>
      )}

      <div className="pt-2 space-y-1.5">
        {!readOnly && (
          <>
            <Button className="w-full gap-2" disabled={!canSend || sending} onClick={handleSend}>
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Enviar informe
            </Button>
            {blockers.length > 0 && (
              <p className="text-xs text-muted-foreground text-center">{blockers[0]}</p>
            )}
          </>
        )}
        {readOnly && (
          <Button variant="outline" className="w-full gap-2" onClick={handleDownloadOnly}>
            Descargar Excel de nuevo
          </Button>
        )}
        {shareFallback && (
          <div className="grid grid-cols-2 gap-2 pt-1">
            <Button variant="outline" size="sm" asChild>
              <a href={shareFallback.whatsapp} target="_blank" rel="noopener noreferrer">Abrir WhatsApp</a>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <a href={shareFallback.email}>Abrir Email</a>
            </Button>
          </div>
        )}
      </div>

      {openItem && (
        <ExpenseItemForm
          open={!!openItem}
          onOpenChange={(o) => !o && setOpenItemId(null)}
          item={openItem}
          readOnly={readOnly}
          saving={saving}
          onSave={(fields) => updateItem(openItem.id, fields)}
          onUploadPhoto={(file) => uploadReceiptPhoto(openItem.id, file)}
          onDeletePhoto={async () => {
            if (openItem.photo_path) await deleteReceiptPhoto(openItem.id, openItem.photo_path);
            await loadItems();
          }}
        />
      )}
    </div>
  );
}
