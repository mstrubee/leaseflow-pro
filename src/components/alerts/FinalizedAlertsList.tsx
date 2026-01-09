import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { CheckCircle, Trash2, Calendar, User, FileText, ChevronDown, ChevronRight } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface FinalizedAlert {
  id: string;
  title: string;
  alert_type: string;
  due_date: string;
  completed_at: string | null;
  completed_by: string | null;
  deleted_at: string | null;
  deleted_by: string | null;
  contract_id: string | null;
  completed_by_profile?: { full_name: string | null; email: string } | null;
  deleted_by_profile?: { full_name: string | null; email: string } | null;
  contracts?: { name: string } | null;
}

interface FinalizedAlertsListProps {
  contractId?: string;
  showAll?: boolean;
  defaultOpen?: boolean;
  onRefresh?: () => void;
}

export function FinalizedAlertsList({ contractId, showAll = false, defaultOpen = false, onRefresh }: FinalizedAlertsListProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [alerts, setAlerts] = useState<FinalizedAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [selectedAlerts, setSelectedAlerts] = useState<Set<string>>(new Set());
  const [showBulkDeleteDialog, setShowBulkDeleteDialog] = useState(false);
  const [bulkDeleteConfirmation, setBulkDeleteConfirmation] = useState("");

  useEffect(() => {
    loadFinalizedAlerts();
  }, [contractId]);

  const loadFinalizedAlerts = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from("alerts")
        .select("id, title, alert_type, due_date, completed_at, completed_by, deleted_at, deleted_by, contract_id, contracts (name)")
        .or("completed_at.not.is.null,deleted_at.not.is.null")
        .order("completed_at", { ascending: false, nullsFirst: false });

      if (contractId) {
        query = query.eq("contract_id", contractId);
      }

      const { data, error } = await query;

      if (error) throw error;

      // Fetch profile info for completed_by and deleted_by
      const userIds = new Set<string>();
      data?.forEach(alert => {
        if (alert.completed_by) userIds.add(alert.completed_by);
        if (alert.deleted_by) userIds.add(alert.deleted_by);
      });

      let profiles: Record<string, { full_name: string | null; email: string }> = {};
      if (userIds.size > 0) {
        const { data: profileData } = await supabase
          .from("profiles")
          .select("id, full_name, email")
          .in("id", Array.from(userIds));

        profileData?.forEach(p => {
          profiles[p.id] = { full_name: p.full_name, email: p.email };
        });
      }

      const alertsWithProfiles = data?.map(alert => ({
        ...alert,
        completed_by_profile: alert.completed_by ? profiles[alert.completed_by] : null,
        deleted_by_profile: alert.deleted_by ? profiles[alert.deleted_by] : null,
      })) || [];

      setAlerts(alertsWithProfiles);
      setSelectedAlerts(new Set());
    } catch (error) {
      console.error("Error loading finalized alerts:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleBulkPermanentDelete = async () => {
    if (bulkDeleteConfirmation !== "ELIMINAR PERMANENTE" || selectedAlerts.size === 0) return;

    try {
      const { error } = await supabase
        .from("alerts")
        .delete()
        .in("id", Array.from(selectedAlerts));

      if (error) throw error;

      setAlerts(prev => prev.filter(alert => !selectedAlerts.has(alert.id)));
      toast({ title: `${selectedAlerts.size} alertas eliminadas permanentemente` });
      setSelectedAlerts(new Set());
      onRefresh?.();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setShowBulkDeleteDialog(false);
      setBulkDeleteConfirmation("");
    }
  };

  const toggleSelectAlert = (alertId: string) => {
    setSelectedAlerts(prev => {
      const newSet = new Set(prev);
      if (newSet.has(alertId)) {
        newSet.delete(alertId);
      } else {
        newSet.add(alertId);
      }
      return newSet;
    });
  };

  const toggleSelectAll = () => {
    if (selectedAlerts.size === alerts.length) {
      setSelectedAlerts(new Set());
    } else {
      setSelectedAlerts(new Set(alerts.map(a => a.id)));
    }
  };

  const getAlertTypeLabel = (type: string) => {
    const types: Record<string, string> = {
      contract_expiration: "Vencimiento",
      contract_renewal: "Renovación",
      early_termination_notice: "Término anticipado",
      inspection: "Inspección",
      maintenance: "Mantención",
      license: "Licencia",
      permit: "Permiso",
      certificate: "Certificado",
      other: "Otro",
    };
    return types[type] || type;
  };

  if (loading) {
    return <p className="text-sm text-muted-foreground py-2">Cargando alertas finalizadas...</p>;
  }

  if (alerts.length === 0) {
    if (showAll) {
      return <p className="text-center text-muted-foreground py-8">No hay alertas finalizadas</p>;
    }
    return null;
  }

  const alertItems = (
    <>
      {/* Bulk Actions Bar */}
      {alerts.length > 0 && (
        <div className="flex items-center justify-between mb-4 p-3 bg-muted/50 rounded-lg">
          <div className="flex items-center gap-3">
            <Checkbox
              checked={selectedAlerts.size === alerts.length && alerts.length > 0}
              onCheckedChange={toggleSelectAll}
            />
            <span className="text-sm text-muted-foreground">
              {selectedAlerts.size > 0 
                ? `${selectedAlerts.size} seleccionadas` 
                : "Seleccionar todas"}
            </span>
          </div>
          {selectedAlerts.size > 0 && (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setShowBulkDeleteDialog(true)}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Eliminar permanentemente ({selectedAlerts.size})
            </Button>
          )}
        </div>
      )}

      <div className="space-y-2">
        {alerts.map((alert) => {
          const isCompleted = !!alert.completed_at;
          const finalizedAt = isCompleted ? alert.completed_at : alert.deleted_at;
          const finalizedBy = isCompleted ? alert.completed_by_profile : alert.deleted_by_profile;

          return (
            <div
              key={alert.id}
              className="flex items-center justify-between p-3 bg-muted/30 rounded-lg border border-border/50"
            >
              <div className="flex items-center gap-3">
                <Checkbox
                  checked={selectedAlerts.has(alert.id)}
                  onCheckedChange={() => toggleSelectAlert(alert.id)}
                />
                {isCompleted ? (
                  <CheckCircle className="h-4 w-4 text-green-500" />
                ) : (
                  <Trash2 className="h-4 w-4 text-muted-foreground" />
                )}
                <div>
                  <p className="text-sm font-medium">{alert.title}</p>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                    <Badge variant="outline" className="text-xs">
                      {getAlertTypeLabel(alert.alert_type)}
                    </Badge>
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {format(parseISO(alert.due_date), "dd/MM/yyyy", { locale: es })}
                    </span>
                    {showAll && alert.contracts?.name && (
                      <span className="flex items-center gap-1">
                        <FileText className="h-3 w-3" />
                        {alert.contracts.name}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="text-right text-xs text-muted-foreground">
                <Badge variant={isCompleted ? "default" : "secondary"} className="mb-1">
                  {isCompleted ? "Cumplida" : "Eliminada"}
                </Badge>
                {finalizedAt && (
                  <p>{format(new Date(finalizedAt), "dd/MM/yyyy HH:mm", { locale: es })}</p>
                )}
                {finalizedBy && (
                  <p className="flex items-center gap-1 justify-end">
                    <User className="h-3 w-3" />
                    {finalizedBy.full_name || finalizedBy.email}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Bulk Delete Dialog */}
      <AlertDialog open={showBulkDeleteDialog} onOpenChange={() => { setShowBulkDeleteDialog(false); setBulkDeleteConfirmation(""); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar permanentemente {selectedAlerts.size} alertas?</AlertDialogTitle>
            <AlertDialogDescription className="space-y-4">
              <p className="text-destructive font-medium">⚠️ Esta acción es irreversible. Las alertas se eliminarán permanentemente de la base de datos.</p>
              <p>Para confirmar, escribe <strong>ELIMINAR PERMANENTE</strong> en el campo de abajo.</p>
              <Input
                value={bulkDeleteConfirmation}
                onChange={(e) => setBulkDeleteConfirmation(e.target.value)}
                placeholder="Escribe ELIMINAR PERMANENTE para confirmar"
              />
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleBulkPermanentDelete} 
              className="bg-destructive text-destructive-foreground"
              disabled={bulkDeleteConfirmation !== "ELIMINAR PERMANENTE"}
            >
              Eliminar permanentemente
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );

  // When showing all in dashboard, render without collapsible
  if (showAll && defaultOpen) {
    return alertItems;
  }

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className="mt-4">
      <CollapsibleTrigger asChild>
        <Button variant="ghost" className="w-full justify-between p-2 h-auto">
          <span className="text-sm font-medium text-muted-foreground">
            Alertas finalizadas ({alerts.length})
          </span>
          {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-2 mt-2">
        {alertItems}
      </CollapsibleContent>
    </Collapsible>
  );
}