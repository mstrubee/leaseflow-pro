import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Trash2, Bell, Mail, MessageSquare, Calendar, RefreshCw, Send, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { format, differenceInDays } from "date-fns";
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
  contracts?: {
    name: string;
  } | null;
}

interface AlertsListProps {
  contractId?: string;
  showAll?: boolean;
  onRefresh?: () => void;
}

export function AlertsList({ contractId, showAll = false, onRefresh }: AlertsListProps) {
  const { toast } = useToast();
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteAlertId, setDeleteAlertId] = useState<string | null>(null);
  const [sendingTest, setSendingTest] = useState<string | null>(null);

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

      const { data, error } = await query;

      if (error) throw error;
      setAlerts(data || []);
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
  }, [contractId]);

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
    if (!deleteAlertId) return;

    try {
      const { error } = await supabase
        .from("alerts")
        .delete()
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

  const getDaysUntilDue = (dueDate: string) => {
    return differenceInDays(new Date(dueDate), new Date());
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
          <p>No hay alertas configuradas</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <div className="space-y-4">
        {alerts.map((alert) => (
          <Card key={alert.id} className={!alert.is_active ? "opacity-60" : ""}>
            <CardContent className="pt-6">
              <div className="flex items-start justify-between gap-4">
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
                      {format(new Date(alert.due_date), "PPP", { locale: es })}
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

                <div className="flex items-center gap-2">
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
            </CardContent>
          </Card>
        ))}
      </div>

      <AlertDialog open={!!deleteAlertId} onOpenChange={() => setDeleteAlertId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar alerta?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. Se eliminará permanentemente la alerta y su historial.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
