import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Bell, BellRing, Clock, CheckCircle, AlertTriangle, Plus, RefreshCw, Archive, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { AlertForm } from "@/components/alerts/AlertForm";
import { AlertsList } from "@/components/alerts/AlertsList";
import { FinalizedAlertsList } from "@/components/alerts/FinalizedAlertsList";
import { UpcomingAlertsPanel } from "@/components/alerts/UpcomingAlertsPanel";
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

interface AlertStats {
  total: number;
  active: number;
  expired: number;
  upcoming7Days: number;
  upcoming30Days: number;
}

interface AlertHistoryItem {
  id: string;
  sent_at: string;
  channel: string;
  recipient_email: string | null;
  status: string;
  days_before_due: number | null;
  alerts: {
    title: string;
    contracts: {
      name: string;
    } | null;
  } | null;
}

export default function AlertsDashboard() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [stats, setStats] = useState<AlertStats>({
    total: 0,
    active: 0,
    expired: 0,
    upcoming7Days: 0,
    upcoming30Days: 0,
  });
  const [history, setHistory] = useState<AlertHistoryItem[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  
  // History bulk delete state
  const [selectedHistory, setSelectedHistory] = useState<Set<string>>(new Set());
  const [showBulkDeleteHistoryDialog, setShowBulkDeleteHistoryDialog] = useState(false);
  const [bulkDeleteHistoryConfirmation, setBulkDeleteHistoryConfirmation] = useState("");

  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/auth");
    }
  }, [user, authLoading, navigate]);

  useEffect(() => {
    loadStats();
    loadHistory();
  }, [refreshKey]);

  const loadStats = async () => {
    try {
      const { data: alerts, error } = await supabase
        .from("alerts")
        .select("id, is_active, due_date");

      if (error) throw error;

      const today = new Date();
      const stats: AlertStats = {
        total: alerts?.length || 0,
        active: 0,
        expired: 0,
        upcoming7Days: 0,
        upcoming30Days: 0,
      };

      alerts?.forEach((alert) => {
        const dueDate = new Date(alert.due_date);
        const days = differenceInDays(dueDate, today);

        if (alert.is_active) stats.active++;
        if (days < 0) stats.expired++;
        if (days >= 0 && days <= 7) stats.upcoming7Days++;
        if (days >= 0 && days <= 30) stats.upcoming30Days++;
      });

      setStats(stats);
    } catch (error) {
      console.error("Error loading stats:", error);
    }
  };

  const loadHistory = async () => {
    setLoadingHistory(true);
    try {
      const { data, error } = await supabase
        .from("alert_history")
        .select(`
          id,
          sent_at,
          channel,
          recipient_email,
          status,
          days_before_due,
          alerts (
            title,
            contracts (name)
          )
        `)
        .order("sent_at", { ascending: false })
        .limit(50);

      if (error) throw error;
      setHistory(data || []);
      setSelectedHistory(new Set());
    } catch (error) {
      console.error("Error loading history:", error);
    } finally {
      setLoadingHistory(false);
    }
  };

  const handleProcessAlerts = async () => {
    setProcessing(true);
    try {
      const { data, error } = await supabase.functions.invoke("process-alerts", {
        body: { action: "process" },
      });

      if (error) throw error;

      toast({
        title: "Alertas procesadas",
        description: `Procesadas: ${data.processed}, Fallidas: ${data.failed}`,
      });

      setRefreshKey((k) => k + 1);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "No se pudieron procesar las alertas",
        variant: "destructive",
      });
    } finally {
      setProcessing(false);
    }
  };

  const toggleSelectHistoryItem = (id: string) => {
    setSelectedHistory(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  const toggleSelectAllHistory = () => {
    if (selectedHistory.size === history.length) {
      setSelectedHistory(new Set());
    } else {
      setSelectedHistory(new Set(history.map(h => h.id)));
    }
  };

  const handleBulkDeleteHistory = async () => {
    if (bulkDeleteHistoryConfirmation !== "ELIMINAR" || selectedHistory.size === 0) return;

    try {
      const { error } = await supabase
        .from("alert_history")
        .delete()
        .in("id", Array.from(selectedHistory));

      if (error) throw error;

      setHistory(prev => prev.filter(h => !selectedHistory.has(h.id)));
      toast({ title: `${selectedHistory.size} registros de historial eliminados` });
      setSelectedHistory(new Set());
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setShowBulkDeleteHistoryDialog(false);
      setBulkDeleteHistoryConfirmation("");
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-card border-b px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate("/dashboard")}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <Bell className="h-6 w-6" />
                Dashboard de Alertas
              </h1>
              <p className="text-sm text-muted-foreground">
                Gestiona los recordatorios y vencimientos
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleProcessAlerts} disabled={processing}>
              <RefreshCw className={`h-4 w-4 mr-2 ${processing ? "animate-spin" : ""}`} />
              Procesar ahora
            </Button>
            <Button onClick={() => setShowForm(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Nueva alerta
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-6 py-8 space-y-8">
        {/* Upcoming Alerts Panel */}
        <UpcomingAlertsPanel />

        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Alertas</CardTitle>
              <Bell className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.total}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Activas</CardTitle>
              <BellRing className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{stats.active}</div>
            </CardContent>
          </Card>

          <Card className={stats.upcoming7Days > 0 ? "border-destructive" : ""}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Próximos 7 días</CardTitle>
              <AlertTriangle className="h-4 w-4 text-destructive" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-destructive">{stats.upcoming7Days}</div>
            </CardContent>
          </Card>

          <Card className={stats.upcoming30Days > 0 ? "border-amber-500" : ""}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Próximos 30 días</CardTitle>
              <Clock className="h-4 w-4 text-amber-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-amber-600">{stats.upcoming30Days}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Vencidos</CardTitle>
              <CheckCircle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.expired}</div>
            </CardContent>
          </Card>
        </div>

        {/* Form Modal */}
        {showForm && (
          <AlertForm
            onSuccess={() => {
              setShowForm(false);
              setRefreshKey((k) => k + 1);
            }}
            onCancel={() => setShowForm(false)}
          />
        )}

        {/* Tabs */}
        <Tabs defaultValue="all" className="space-y-4">
          <TabsList>
            <TabsTrigger value="all">Alertas activas</TabsTrigger>
            <TabsTrigger value="finalized">Alertas finalizadas</TabsTrigger>
            <TabsTrigger value="history">Historial de envíos</TabsTrigger>
          </TabsList>

          <TabsContent value="all">
            <AlertsList
              key={refreshKey}
              showAll
              showOnlyActive={true}
              onRefresh={() => setRefreshKey((k) => k + 1)}
            />
          </TabsContent>

          <TabsContent value="finalized">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Archive className="h-5 w-5" />
                  Alertas cumplidas y eliminadas
                </CardTitle>
              </CardHeader>
              <CardContent>
                <FinalizedAlertsList 
                  key={`finalized-${refreshKey}`} 
                  showAll 
                  defaultOpen={true} 
                  onRefresh={() => setRefreshKey((k) => k + 1)}
                />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="history">
            <Card>
              <CardHeader>
                <CardTitle>Historial de alertas enviadas</CardTitle>
              </CardHeader>
              <CardContent>
                {loadingHistory ? (
                  <p className="text-center text-muted-foreground py-8">Cargando...</p>
                ) : history.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">
                    No hay alertas enviadas aún
                  </p>
                ) : (
                  <>
                    {/* Bulk Actions Bar */}
                    <div className="flex items-center justify-between mb-4 p-3 bg-muted/50 rounded-lg">
                      <div className="flex items-center gap-3">
                        <Checkbox
                          checked={selectedHistory.size === history.length && history.length > 0}
                          onCheckedChange={toggleSelectAllHistory}
                        />
                        <span className="text-sm text-muted-foreground">
                          {selectedHistory.size > 0 
                            ? `${selectedHistory.size} seleccionados` 
                            : "Seleccionar todos"}
                        </span>
                      </div>
                      {selectedHistory.size > 0 && (
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => setShowBulkDeleteHistoryDialog(true)}
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Eliminar seleccionados ({selectedHistory.size})
                        </Button>
                      )}
                    </div>

                    <div className="space-y-3">
                      {history.map((item) => (
                        <div
                          key={item.id}
                          className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
                        >
                          <div className="flex items-center gap-3">
                            <Checkbox
                              checked={selectedHistory.has(item.id)}
                              onCheckedChange={() => toggleSelectHistoryItem(item.id)}
                            />
                            <div className="space-y-1">
                              <p className="font-medium">{item.alerts?.title || "Alerta eliminada"}</p>
                              <p className="text-sm text-muted-foreground">
                                {item.alerts?.contracts?.name}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {item.recipient_email}
                              </p>
                            </div>
                          </div>
                          <div className="text-right space-y-1">
                            <Badge
                              variant={item.status === "sent" ? "default" : "destructive"}
                            >
                              {item.status === "sent" ? "Enviado" : "Fallido"}
                            </Badge>
                            <p className="text-xs text-muted-foreground">
                              {format(new Date(item.sent_at), "dd/MM/yyyy HH:mm", { locale: es })}
                            </p>
                            {item.days_before_due !== null && (
                              <p className="text-xs text-muted-foreground">
                                {item.days_before_due === 0
                                  ? "El mismo día"
                                  : `${item.days_before_due} días antes`}
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>

      {/* Bulk Delete History Dialog */}
      <AlertDialog open={showBulkDeleteHistoryDialog} onOpenChange={() => { setShowBulkDeleteHistoryDialog(false); setBulkDeleteHistoryConfirmation(""); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar {selectedHistory.size} registros del historial?</AlertDialogTitle>
            <AlertDialogDescription className="space-y-4">
              <p>Esta acción eliminará permanentemente los registros seleccionados del historial de envíos. Para confirmar, escribe <strong>ELIMINAR</strong> en el campo de abajo.</p>
              <Input
                value={bulkDeleteHistoryConfirmation}
                onChange={(e) => setBulkDeleteHistoryConfirmation(e.target.value)}
                placeholder="Escribe ELIMINAR para confirmar"
              />
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleBulkDeleteHistory} 
              className="bg-destructive text-destructive-foreground"
              disabled={bulkDeleteHistoryConfirmation !== "ELIMINAR"}
            >
              Eliminar {selectedHistory.size} registros
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
