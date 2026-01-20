import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Trash2, Bell, Mail, MessageSquare, Calendar, RefreshCw, Send, Clock, Pencil, FileText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { format, differenceInDays, parseISO } from "date-fns";
import { es } from "date-fns/locale";
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
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import { AlertForm, AlertData } from "./AlertForm";
import { useAlertsNavigation } from "./AlertsReturnButton";

interface Alert {
  id: string;
  title: string;
  message: string | null;
  due_date: string;
  channels: string[];
  days_before: number[];
  repeat_every_days: number | null;
  is_active: boolean;
  next_send_at: string | null;
  last_sent_at: string | null;
  alert_type: string;
  contract_id: string | null;
  completed_at: string | null;
  completed_by: string | null;
  deleted_at: string | null;
  deleted_by: string | null;
  category_id?: string | null;
  contracts?: {
    name: string;
  } | null;
}

interface AlertsListProps {
  contractId?: string;
  showAll?: boolean;
  onRefresh?: () => void;
  showOnlyActive?: boolean;
  categoryFilter?: string;
}

export function AlertsList({ contractId, showAll = false, onRefresh, showOnlyActive = true, categoryFilter }: AlertsListProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const { navigateToContractFromAlerts } = useAlertsNavigation();
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteAlertId, setDeleteAlertId] = useState<string | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [sendingTest, setSendingTest] = useState<string | null>(null);
  const [editingAlert, setEditingAlert] = useState<AlertData | null>(null);
  const [selectedAlerts, setSelectedAlerts] = useState<Set<string>>(new Set());
  const [showBulkDeleteDialog, setShowBulkDeleteDialog] = useState(false);
  const [bulkDeleteConfirmation, setBulkDeleteConfirmation] = useState("");

  const loadAlerts = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from("alerts")
        .select(`
          *,
          contracts (name)
        `)
        .order("due_date", { ascending: true });

      if (contractId) {
        query = query.eq("contract_id", contractId);
      }

      if (categoryFilter) {
        query = query.eq("category_id", categoryFilter);
      }

      if (showOnlyActive) {
        query = query.is("completed_at", null).is("deleted_at", null);
      }

      const { data, error } = await query;

      if (error) throw error;
      setAlerts(data || []);
      setSelectedAlerts(new Set());
    } catch (error: any) {
      console.error("Error loading alerts:", error);
      toast({
        title: "Error",
        description: "No se pudieron cargar las alertas",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAlerts();
  }, [contractId, showOnlyActive]);

  const handleToggleActive = async (alertId: string, isActive: boolean) => {
    try {
      const { error } = await supabase
        .from("alerts")
        .update({ is_active: isActive })
        .eq("id", alertId);

      if (error) throw error;

      setAlerts(prev =>
        prev.map(alert =>
          alert.id === alertId ? { ...alert, is_active: isActive } : alert
        )
      );

      toast({
        title: isActive ? "Alerta activada" : "Alerta desactivada",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleDelete = async () => {
    if (!deleteAlertId || deleteConfirmation !== "ELIMINAR") return;

    try {
      const { error } = await supabase
        .from("alerts")
        .update({
          deleted_at: new Date().toISOString(),
          deleted_by: user?.id,
          is_active: false,
        })
        .eq("id", deleteAlertId);

      if (error) throw error;

      setAlerts(prev => prev.filter(alert => alert.id !== deleteAlertId));
      toast({ title: "Alerta eliminada" });
      onRefresh?.();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setDeleteAlertId(null);
      setDeleteConfirmation("");
    }
  };

  const handleBulkDelete = async () => {
    if (bulkDeleteConfirmation !== "ELIMINAR" || selectedAlerts.size === 0) return;

    try {
      const { error } = await supabase
        .from("alerts")
        .update({
          deleted_at: new Date().toISOString(),
          deleted_by: user?.id,
          is_active: false,
        })
        .in("id", Array.from(selectedAlerts));

      if (error) throw error;

      setAlerts(prev => prev.filter(alert => !selectedAlerts.has(alert.id)));
      toast({ title: `${selectedAlerts.size} alertas eliminadas` });
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

  const handleTestSend = async (alertId: string) => {
    setSendingTest(alertId);
    try {
      const { error } = await supabase.functions.invoke("process-alerts", {
        body: { action: "test", alertId },
      });

      if (error) throw error;

      toast({
        title: "Email de prueba enviado",
        description: "Revisa tu bandeja de entrada",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "No se pudo enviar el email de prueba",
        variant: "destructive",
      });
    } finally {
      setSendingTest(null);
    }
  };

  const handleEditClick = (alert: Alert) => {
    setEditingAlert({
      id: alert.id,
      title: alert.title,
      message: alert.message,
      alert_type: alert.alert_type,
      due_date: alert.due_date,
      channels: alert.channels,
      days_before: alert.days_before,
      repeat_every_days: alert.repeat_every_days,
      contract_id: alert.contract_id,
    });
  };

  const handleEditSuccess = () => {
    setEditingAlert(null);
    loadAlerts();
    onRefresh?.();
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

  const getDaysUntilDue = (dueDate: string) => {
    return differenceInDays(parseISO(dueDate), new Date());
  };

  const getUrgencyBadge = (dueDate: string) => {
    const days = getDaysUntilDue(dueDate);
    
    if (days < 0) {
      return <Badge variant="destructive">Vencido hace {Math.abs(days)} días</Badge>;
    } else if (days === 0) {
      return <Badge variant="destructive">Vence hoy</Badge>;
    } else if (days <= 7) {
      return <Badge variant="destructive">Vence en {days} días</Badge>;
    } else if (days <= 30) {
      return <Badge className="bg-amber-500">Vence en {days} días</Badge>;
    } else {
      return <Badge variant="secondary">Vence en {days} días</Badge>;
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
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          Cargando alertas...
        </CardContent>
      </Card>
    );
  }

  if (alerts.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          <Bell className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>No hay alertas {showOnlyActive ? "activas" : ""}</p>
        </CardContent>
      </Card>
    );
  }

  return (
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
              Eliminar seleccionadas ({selectedAlerts.size})
            </Button>
          )}
        </div>
      )}

      <div className="space-y-4">
        {alerts.map((alert) => (
          <Card key={alert.id} className={!alert.is_active ? "opacity-60" : ""}>
            <CardContent className="pt-6">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <Checkbox
                    checked={selectedAlerts.has(alert.id)}
                    onCheckedChange={() => toggleSelectAlert(alert.id)}
                    className="mt-1"
                  />
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold">{alert.title}</h3>
                      <Badge variant="outline">{getAlertTypeLabel(alert.alert_type)}</Badge>
                      {getUrgencyBadge(alert.due_date)}
                    </div>

                    {showAll && alert.contracts?.name && (
                      <p className="text-sm text-muted-foreground">
                        Contrato: {alert.contracts.name}
                      </p>
                    )}

                    {alert.message && (
                      <p className="text-sm text-muted-foreground">{alert.message}</p>
                    )}

                    <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Calendar className="h-4 w-4" />
                        {format(parseISO(alert.due_date), "PPP", { locale: es })}
                      </span>

                      <span className="flex items-center gap-1">
                        {alert.channels.includes("email") && <Mail className="h-4 w-4" />}
                        {alert.channels.includes("whatsapp") && <MessageSquare className="h-4 w-4" />}
                      </span>

                      {alert.repeat_every_days && (
                        <span className="flex items-center gap-1">
                          <RefreshCw className="h-4 w-4" />
                          Cada {alert.repeat_every_days} días
                        </span>
                      )}

                      {alert.next_send_at && (
                        <span className="flex items-center gap-1">
                          <Clock className="h-4 w-4" />
                          Próximo: {format(new Date(alert.next_send_at), "dd/MM/yyyy")}
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-1">
                      {alert.days_before.map((days) => (
                        <Badge key={days} variant="secondary" className="text-xs">
                          {days === 0 ? "Mismo día" : `${days}d antes`}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="flex flex-col items-end gap-2">
                  <div className="flex items-center gap-2">
                    {alert.contract_id && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => navigateToContractFromAlerts(alert.contract_id!)}
                        title="Ver condiciones del contrato"
                      >
                        <FileText className="h-4 w-4 mr-1" />
                        Ver contrato
                      </Button>
                    )}

                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleEditClick(alert)}
                      title="Editar alerta"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>

                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleTestSend(alert.id)}
                      disabled={sendingTest === alert.id || !alert.is_active}
                      title="Enviar email de prueba"
                    >
                      <Send className={`h-4 w-4 ${sendingTest === alert.id ? "animate-pulse" : ""}`} />
                    </Button>

                    <Switch
                      checked={alert.is_active}
                      onCheckedChange={(checked) => handleToggleActive(alert.id, checked)}
                    />

                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setDeleteAlertId(alert.id)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Edit Alert Dialog */}
      <Dialog open={!!editingAlert} onOpenChange={(open) => !open && setEditingAlert(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <AlertForm
            editingAlert={editingAlert}
            onSuccess={handleEditSuccess}
            onCancel={() => setEditingAlert(null)}
          />
        </DialogContent>
      </Dialog>

      {/* Single Delete Dialog */}
      <AlertDialog open={!!deleteAlertId} onOpenChange={() => { setDeleteAlertId(null); setDeleteConfirmation(""); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar alerta?</AlertDialogTitle>
            <AlertDialogDescription className="space-y-4">
              <p>Esta acción marcará la alerta como eliminada. Para confirmar, escribe <strong>ELIMINAR</strong> en el campo de abajo.</p>
              <Input
                value={deleteConfirmation}
                onChange={(e) => setDeleteConfirmation(e.target.value)}
                placeholder="Escribe ELIMINAR para confirmar"
              />
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDelete} 
              className="bg-destructive text-destructive-foreground"
              disabled={deleteConfirmation !== "ELIMINAR"}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Delete Dialog */}
      <AlertDialog open={showBulkDeleteDialog} onOpenChange={() => { setShowBulkDeleteDialog(false); setBulkDeleteConfirmation(""); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar {selectedAlerts.size} alertas?</AlertDialogTitle>
            <AlertDialogDescription className="space-y-4">
              <p>Esta acción marcará las alertas seleccionadas como eliminadas. Para confirmar, escribe <strong>ELIMINAR</strong> en el campo de abajo.</p>
              <Input
                value={bulkDeleteConfirmation}
                onChange={(e) => setBulkDeleteConfirmation(e.target.value)}
                placeholder="Escribe ELIMINAR para confirmar"
              />
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleBulkDelete} 
              className="bg-destructive text-destructive-foreground"
              disabled={bulkDeleteConfirmation !== "ELIMINAR"}
            >
              Eliminar {selectedAlerts.size} alertas
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}