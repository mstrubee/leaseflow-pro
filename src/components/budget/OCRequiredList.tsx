import { Fragment, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { ChevronDown, ChevronRight, Pencil, Trash2, ArrowRightCircle, Download, Loader2 } from "lucide-react";
import { format, parseISO } from "date-fns";
import { toast } from "sonner";
import { resolveFileUrl } from "@/lib/storageUtils";
import { EditOCRequiredDialog } from "./EditOCRequiredDialog";
import type { OCRequestPrefillDraft } from "./OCRequestsList";

export interface OCRequiredGroupLine {
  budgetLineId: string;
  lineName: string;
  amountUf: number;
  status: string;
}

export interface OCRequiredGroup {
  quotationNumber: string;
  quotationDate: string;
  amountClp: number;
  amountUf: number;
  filePath: string | null;
  fileName: string | null;
  projectName: string;
  ufValue: number;
  supplierId: string | null;
  supplierName: string | null;
  lines: OCRequiredGroupLine[];
  converted: boolean;
}

interface OCRequiredListProps {
  contractId: string;
  contractName: string;
  ufValue: number;
  formatCLP: (value: number) => string;
  onConvert: (draft: OCRequestPrefillDraft) => void;
  refreshKey?: number;
  onRefresh?: () => void;
}

/**
 * "OC Requeridas": un grupo por cada quotation_number en oc_quotations (una
 * cotización subida al marcar líneas CAPEX como "OC Requerida" -- ver
 * CapexOCRequiredDialog.tsx). Primer eslabón del flujo Requerimiento de OC →
 * Solicitud de OC → OC.
 */
export function OCRequiredList({ contractId, contractName, ufValue, formatCLP, onConvert, refreshKey, onRefresh }: OCRequiredListProps) {
  const [groups, setGroups] = useState<OCRequiredGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [editingGroup, setEditingGroup] = useState<OCRequiredGroup | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<OCRequiredGroup | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contractId, refreshKey]);

  const loadData = async () => {
    setLoading(true);
    try {
      const { data: quotations, error } = await supabase
        .from("oc_quotations")
        .select("*")
        .eq("contract_id", contractId)
        .order("quotation_date", { ascending: false });
      if (error) throw error;

      const rows = (quotations || []) as any[];
      if (rows.length === 0) { setGroups([]); return; }

      const lineIds = [...new Set(rows.map((r) => r.budget_line_id))];
      const { data: lines } = await supabase
        .from("budget_lines")
        .select("id, status")
        .in("id", lineIds);
      const statusByLine = new Map((lines || []).map((l: any) => [l.id, l.status as string]));

      const quotationNumbers = [...new Set(rows.map((r) => r.quotation_number))];
      const { data: convertedReqs } = await supabase
        .from("oc_requests")
        .select("source_quotation_number")
        .in("source_quotation_number", quotationNumbers);
      const convertedSet = new Set((convertedReqs || []).map((r: any) => r.source_quotation_number).filter(Boolean));

      const byNumber = new Map<string, OCRequiredGroup>();
      for (const r of rows) {
        let group = byNumber.get(r.quotation_number);
        if (!group) {
          group = {
            quotationNumber: r.quotation_number,
            quotationDate: r.quotation_date,
            amountClp: r.amount_clp || 0,
            amountUf: r.amount_uf || 0,
            filePath: r.file_path,
            fileName: r.file_name,
            projectName: r.project_name,
            ufValue,
            supplierId: r.supplier_id ?? null,
            supplierName: r.supplier_name ?? null,
            lines: [],
            converted: convertedSet.has(r.quotation_number),
          };
          byNumber.set(r.quotation_number, group);
        }
        group.lines.push({
          budgetLineId: r.budget_line_id,
          lineName: r.line_name,
          amountUf: Number(r.amount_uf) || 0,
          status: statusByLine.get(r.budget_line_id) || "no_autorizado",
        });
      }

      setGroups(Array.from(byNumber.values()));
    } catch (error) {
      console.error("Error cargando OC Requeridas:", error);
      toast.error("No se pudieron cargar las OC Requeridas");
    } finally {
      setLoading(false);
    }
  };

  const toggleExpand = (quotationNumber: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(quotationNumber)) next.delete(quotationNumber);
      else next.add(quotationNumber);
      return next;
    });

  const openFile = async (filePath: string | null) => {
    if (!filePath) return;
    const url = await resolveFileUrl(filePath);
    if (url) window.open(url, "_blank", "noopener,noreferrer");
    else toast.error("No se pudo abrir el archivo");
  };

  const handleConvert = async (group: OCRequiredGroup) => {
    const { data: plans } = await supabase
      .from("oc_payment_plans")
      .select("description, amount_clp, due_date")
      .eq("quotation_number", group.quotationNumber)
      .order("payment_number");

    onConvert({
      quotationNumber: group.quotationNumber,
      lines: group.lines.map((l) => ({ lineId: l.budgetLineId, lineName: l.lineName, amountUf: l.amountUf })),
      totalAmountClp: group.amountClp,
      fileUrl: group.filePath,
      fileName: group.fileName,
      supplierId: group.supplierId,
      supplierName: group.supplierName,
      paymentPlan: (plans || []).map((p: any) => ({
        description: p.description || "",
        amount: String(Math.round(p.amount_clp || 0)),
        due_date: p.due_date || "",
      })),
    });
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const lineIds = deleteTarget.lines.map((l) => l.budgetLineId);
      const { error } = await supabase
        .from("oc_quotations")
        .delete()
        .eq("quotation_number", deleteTarget.quotationNumber);
      if (error) throw error;
      await supabase.from("budget_lines").update({ progress_status_id: null }).in("id", lineIds);
      toast.success("Requerimiento eliminado");
      setDeleteTarget(null);
      loadData();
      onRefresh?.();
    } catch (error: any) {
      console.error("Error al eliminar OC Requerida:", error);
      toast.error(error.message || "No se pudo eliminar");
    } finally {
      setDeleting(false);
    }
  };

  const pending = groups.filter((g) => !g.converted);
  const converted = groups.filter((g) => g.converted);

  const renderTable = (items: OCRequiredGroup[], isConverted: boolean) => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead></TableHead>
          <TableHead>Requerimiento</TableHead>
          <TableHead>Fecha</TableHead>
          <TableHead>Monto</TableHead>
          <TableHead>Líneas</TableHead>
          <TableHead className="w-[160px]">Acciones</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((group) => {
          const isOpen = expanded.has(group.quotationNumber);
          return (
            <Fragment key={group.quotationNumber}>
              <TableRow
                className={isConverted ? "opacity-60 cursor-pointer" : "cursor-pointer"}
                onClick={() => toggleExpand(group.quotationNumber)}
              >
                <TableCell className="w-8">
                  {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                </TableCell>
                <TableCell className="font-mono text-xs">{group.quotationNumber}</TableCell>
                <TableCell className="text-xs">{format(parseISO(group.quotationDate), "dd/MM/yyyy")}</TableCell>
                <TableCell className="text-sm">{formatCLP(group.amountClp)}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{group.lines.length}</TableCell>
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center gap-1">
                    {!isConverted && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        title="Convertir a Solicitud de OC"
                        onClick={() => handleConvert(group)}
                      >
                        <ArrowRightCircle className="h-4 w-4 text-primary" />
                      </Button>
                    )}
                    {!isConverted && (
                      <Button variant="ghost" size="icon" className="h-7 w-7" title="Editar" onClick={() => setEditingGroup(group)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                    )}
                    {!isConverted && (
                      <Button variant="ghost" size="icon" className="h-7 w-7" title="Eliminar" onClick={() => setDeleteTarget(group)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                    {isConverted && <Badge variant="secondary" className="text-[10px]">Convertida</Badge>}
                  </div>
                </TableCell>
              </TableRow>
              {isOpen && (
                <TableRow key={`${group.quotationNumber}-detail`}>
                  <TableCell colSpan={6} className="bg-muted/30">
                    <div className="py-2 px-2 space-y-2">
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>Proyecto: {group.projectName}</span>
                        {group.filePath && (
                          <Button variant="outline" size="sm" className="h-6 px-2 gap-1" onClick={() => openFile(group.filePath)}>
                            <Download className="h-3 w-3" />
                            {group.fileName || "Ver archivo"}
                          </Button>
                        )}
                      </div>
                      <div className="rounded-md border divide-y bg-background">
                        {group.lines.map((line) => (
                          <div key={line.budgetLineId} className="flex items-center justify-between px-3 py-1.5 text-sm">
                            <span className="truncate">{line.lineName}</span>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className="text-xs text-muted-foreground">
                                UF {line.amountUf.toLocaleString("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </span>
                              <span className="text-[10px] uppercase text-muted-foreground">
                                {line.status === "autorizado" ? "Autorizado" : "No autorizado"}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </Fragment>
          );
        })}
      </TableBody>
    </Table>
  );

  if (loading) {
    return <div className="flex items-center justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  }

  if (groups.length === 0) {
    return <div className="text-center py-6 text-sm text-muted-foreground">No hay OC Requeridas</div>;
  }

  return (
    <div className="space-y-4">
      {pending.length > 0 && (
        <div className="space-y-1.5">
          <h4 className="text-sm font-medium text-muted-foreground">Pendientes ({pending.length})</h4>
          {renderTable(pending, false)}
        </div>
      )}
      {converted.length > 0 && (
        <div className="space-y-1.5">
          <h4 className="text-sm font-medium text-muted-foreground">Convertidas ({converted.length})</h4>
          {renderTable(converted, true)}
        </div>
      )}

      {editingGroup && (
        <EditOCRequiredDialog
          open={!!editingGroup}
          onOpenChange={(open) => { if (!open) setEditingGroup(null); }}
          contractId={contractId}
          projectName={contractName}
          group={editingGroup}
          onSaved={() => { setEditingGroup(null); loadData(); onRefresh?.(); }}
        />
      )}

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar requerimiento?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará "{deleteTarget?.quotationNumber}" y sus {deleteTarget?.lines.length} línea(s) asociada(s) volverán a
              "Sin estado". Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleting} className="bg-destructive text-destructive-foreground">
              {deleting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
