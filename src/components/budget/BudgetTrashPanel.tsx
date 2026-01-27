import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Trash2, RotateCcw, History, ChevronDown, ChevronRight, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { format } from "date-fns";
import { es } from "date-fns/locale";

interface DeletedLine {
  id: string;
  name: string;
  amount_uf: number;
  quantity: number | null;
  unit_price: number | null;
  unit_type: string | null;
  currency: string | null;
  status: string;
  deleted_at: string;
  deleted_by: string | null;
  parent_id: string | null;
  budget_id: string;
}

interface AuditEntry {
  id: string;
  budget_line_id: string;
  action: string;
  old_values: any;
  new_values: any;
  changed_at: string;
  changed_by: string | null;
}

interface BudgetTrashPanelProps {
  budgetId: string;
  onRestore: () => void;
}

export const BudgetTrashPanel = ({ budgetId, onRestore }: BudgetTrashPanelProps) => {
  const [deletedLines, setDeletedLines] = useState<DeletedLine[]>([]);
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [isTrashOpen, setIsTrashOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [showRestoreDialog, setShowRestoreDialog] = useState(false);
  const [lineToRestore, setLineToRestore] = useState<DeletedLine | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (budgetId) {
      loadDeletedLines();
      loadAuditEntries();
    }
  }, [budgetId]);

  const loadDeletedLines = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("budget_lines")
        .select("id, name, amount_uf, quantity, unit_price, unit_type, currency, status, deleted_at, deleted_by, parent_id, budget_id")
        .eq("budget_id", budgetId)
        .not("deleted_at", "is", null)
        .order("deleted_at", { ascending: false });

      if (error) throw error;
      setDeletedLines(data || []);
    } catch (error) {
      console.error("Error loading deleted lines:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadAuditEntries = async () => {
    try {
      const { data, error } = await supabase
        .from("budget_lines_audit")
        .select("*")
        .eq("budget_id", budgetId)
        .order("changed_at", { ascending: false })
        .limit(100);

      if (error) throw error;
      setAuditEntries(data || []);
    } catch (error) {
      console.error("Error loading audit entries:", error);
    }
  };

  const handleRestoreLine = async (line: DeletedLine) => {
    setRestoring(line.id);
    try {
      // Check if parent exists and is not deleted
      if (line.parent_id) {
        const { data: parent } = await supabase
          .from("budget_lines")
          .select("id, deleted_at")
          .eq("id", line.parent_id)
          .maybeSingle();

        if (!parent || parent.deleted_at) {
          toast({
            title: "No se puede restaurar",
            description: "La línea padre está eliminada o no existe. Restaure primero la línea padre.",
            variant: "destructive",
          });
          setRestoring(null);
          return;
        }
      }

      // Restore the line
      const { error } = await supabase
        .from("budget_lines")
        .update({ deleted_at: null, deleted_by: null })
        .eq("id", line.id);

      if (error) throw error;

      toast({
        title: "Línea restaurada",
        description: `"${line.name}" ha sido restaurada exitosamente.`,
      });

      await loadDeletedLines();
      onRestore();
    } catch (error: any) {
      console.error("Error restoring line:", error);
      toast({
        title: "Error al restaurar",
        description: error.message || "No se pudo restaurar la línea",
        variant: "destructive",
      });
    } finally {
      setRestoring(null);
      setShowRestoreDialog(false);
      setLineToRestore(null);
    }
  };

  const handleRestoreFromAudit = async (entry: AuditEntry) => {
    if (!entry.old_values) {
      toast({
        title: "Sin datos",
        description: "No hay valores anteriores para restaurar",
        variant: "destructive",
      });
      return;
    }

    try {
      const oldValues = entry.old_values;
      
      // Check if line still exists
      const { data: existingLine } = await supabase
        .from("budget_lines")
        .select("id")
        .eq("id", entry.budget_line_id)
        .maybeSingle();

      if (existingLine) {
        // Update existing line with old values
        const { error } = await supabase
          .from("budget_lines")
          .update({
            name: oldValues.name,
            amount_uf: oldValues.amount_uf,
            quantity: oldValues.quantity,
            unit_price: oldValues.unit_price,
            unit_type: oldValues.unit_type,
            currency: oldValues.currency,
            status: oldValues.status,
            deleted_at: null,
            deleted_by: null,
          })
          .eq("id", entry.budget_line_id);

        if (error) throw error;

        toast({
          title: "Valores restaurados",
          description: "Los valores anteriores han sido restaurados.",
        });
      } else {
        // Re-create the line (only if parent exists)
        if (oldValues.parent_id) {
          const { data: parent } = await supabase
            .from("budget_lines")
            .select("id, deleted_at")
            .eq("id", oldValues.parent_id)
            .maybeSingle();

          if (!parent || parent.deleted_at) {
            toast({
              title: "No se puede restaurar",
              description: "La línea padre no existe o está eliminada.",
              variant: "destructive",
            });
            return;
          }
        }

        // Insert with the original ID
        const { error } = await supabase
          .from("budget_lines")
          .insert({
            id: entry.budget_line_id,
            budget_id: oldValues.budget_id,
            parent_id: oldValues.parent_id,
            name: oldValues.name,
            amount_uf: oldValues.amount_uf,
            quantity: oldValues.quantity,
            unit_price: oldValues.unit_price,
            unit_type: oldValues.unit_type,
            currency: oldValues.currency,
            status: oldValues.status,
            template_line_id: oldValues.template_line_id,
            supplier_id: oldValues.supplier_id,
            supplier_name: oldValues.supplier_name,
            category_id: oldValues.category_id,
            display_order: oldValues.display_order,
          });

        if (error) throw error;

        toast({
          title: "Línea recreada",
          description: `"${oldValues.name}" ha sido recreada desde el historial.`,
        });
      }

      await loadDeletedLines();
      await loadAuditEntries();
      onRestore();
    } catch (error: any) {
      console.error("Error restoring from audit:", error);
      toast({
        title: "Error al restaurar",
        description: error.message || "No se pudo restaurar desde el historial",
        variant: "destructive",
      });
    }
  };

  const getActionLabel = (action: string) => {
    switch (action) {
      case "create": return "Creado";
      case "update": return "Modificado";
      case "delete": return "Eliminado";
      case "restore": return "Restaurado";
      default: return action;
    }
  };

  const getActionColor = (action: string) => {
    switch (action) {
      case "create": return "bg-green-100 text-green-800";
      case "update": return "bg-blue-100 text-blue-800";
      case "delete": return "bg-red-100 text-red-800";
      case "restore": return "bg-purple-100 text-purple-800";
      default: return "bg-gray-100 text-gray-800";
    }
  };

  const formatAmount = (amount: number) => {
    return `UF ${amount.toLocaleString("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  if (deletedLines.length === 0 && auditEntries.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3">
      {/* Trash Panel */}
      {deletedLines.length > 0 && (
        <Collapsible open={isTrashOpen} onOpenChange={setIsTrashOpen}>
          <Card className="border-destructive/30">
            <CollapsibleTrigger asChild>
              <CardHeader className="py-3 cursor-pointer hover:bg-muted/50">
                <CardTitle className="flex items-center gap-2 text-sm font-medium">
                  {isTrashOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  <Trash2 className="h-4 w-4 text-destructive" />
                  Papelera ({deletedLines.length} líneas eliminadas)
                </CardTitle>
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="pt-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nombre</TableHead>
                      <TableHead>Monto</TableHead>
                      <TableHead>Eliminado</TableHead>
                      <TableHead className="text-right">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {deletedLines.map((line) => (
                      <TableRow key={line.id}>
                        <TableCell className="font-medium">{line.name}</TableCell>
                        <TableCell>{formatAmount(line.amount_uf)}</TableCell>
                        <TableCell className="text-muted-foreground text-xs">
                          {format(new Date(line.deleted_at), "dd/MM/yyyy HH:mm", { locale: es })}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setLineToRestore(line);
                              setShowRestoreDialog(true);
                            }}
                            disabled={restoring === line.id}
                            className="h-7 px-2 text-xs"
                          >
                            <RotateCcw className="h-3 w-3 mr-1" />
                            Restaurar
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>
      )}

      {/* Audit History Panel */}
      {auditEntries.length > 0 && (
        <Collapsible open={isHistoryOpen} onOpenChange={setIsHistoryOpen}>
          <Card className="border-muted">
            <CollapsibleTrigger asChild>
              <CardHeader className="py-3 cursor-pointer hover:bg-muted/50">
                <CardTitle className="flex items-center gap-2 text-sm font-medium">
                  {isHistoryOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  <History className="h-4 w-4 text-muted-foreground" />
                  Historial de Cambios ({auditEntries.length} registros)
                </CardTitle>
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="pt-0 max-h-[400px] overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Acción</TableHead>
                      <TableHead>Línea</TableHead>
                      <TableHead>Valor Anterior</TableHead>
                      <TableHead>Fecha</TableHead>
                      <TableHead className="text-right">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {auditEntries.map((entry) => (
                      <TableRow key={entry.id}>
                        <TableCell>
                          <Badge className={getActionColor(entry.action)} variant="secondary">
                            {getActionLabel(entry.action)}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-medium">
                          {entry.old_values?.name || entry.new_values?.name || "—"}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {entry.old_values?.amount_uf !== undefined 
                            ? formatAmount(entry.old_values.amount_uf)
                            : "—"}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-xs">
                          {format(new Date(entry.changed_at), "dd/MM/yyyy HH:mm", { locale: es })}
                        </TableCell>
                        <TableCell className="text-right">
                          {entry.old_values && (entry.action === "update" || entry.action === "delete") && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleRestoreFromAudit(entry)}
                              className="h-7 px-2 text-xs"
                            >
                              <RotateCcw className="h-3 w-3 mr-1" />
                              Restaurar
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>
      )}

      {/* Restore Confirmation Dialog */}
      <Dialog open={showRestoreDialog} onOpenChange={setShowRestoreDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar Restauración</DialogTitle>
            <DialogDescription>
              ¿Deseas restaurar la línea "{lineToRestore?.name}"?
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <div className="flex items-center gap-2 p-3 bg-muted rounded-md">
              <AlertTriangle className="h-4 w-4 text-yellow-600" />
              <p className="text-sm text-muted-foreground">
                La línea será restaurada con sus valores al momento de la eliminación.
                {lineToRestore?.parent_id && " Si la línea padre no existe, no se podrá restaurar."}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRestoreDialog(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => lineToRestore && handleRestoreLine(lineToRestore)}
              disabled={restoring !== null}
            >
              <RotateCcw className="h-4 w-4 mr-2" />
              Restaurar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
