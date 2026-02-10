import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Bell, BellRing, Clock, CheckCircle, AlertTriangle, Plus, RefreshCw, Archive, Trash2, Filter, Tag, Search, ArrowUpDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useAlertCategories } from "@/hooks/useAlertCategories";
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
  byCategory: Record<string, number>;
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
    category_id: string | null;
    contracts: {
      name: string;
    } | null;
  } | null;
}

export default function AlertsDashboard() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const { categories, getCategoryById } = useAlertCategories();
  const [showForm, setShowForm] = useState(false);
  const [stats, setStats] = useState<AlertStats>({
    total: 0,
    active: 0,
    expired: 0,
    upcoming7Days: 0,
    upcoming30Days: 0,
    byCategory: {},
  });
  const [history, setHistory] = useState<AlertHistoryItem[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  
  // Filtering state
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  
  // Search & sort state
  const [activeSearch, setActiveSearch] = useState("");
  const [activeSortBy, setActiveSortBy] = useState<"due_date" | "created_at">("due_date");
  const [finalizedSearch, setFinalizedSearch] = useState("");
  const [finalizedSortBy, setFinalizedSortBy] = useState<"due_date" | "completed_at">("due_date");
  const [historySearch, setHistorySearch] = useState("");
  
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
        .select("id, is_active, due_date, category_id");

      if (error) throw error;

      const today = new Date();
      const stats: AlertStats = {
        total: alerts?.length || 0,
        active: 0,
        expired: 0,
        upcoming7Days: 0,
        upcoming30Days: 0,
        byCategory: {},
      };

      alerts?.forEach((alert) => {
        const dueDate = new Date(alert.due_date);
        const days = differenceInDays(dueDate, today);

        if (alert.is_active) stats.active++;
        if (days < 0) stats.expired++;
        if (days >= 0 && days <= 7) stats.upcoming7Days++;
        if (days >= 0 && days <= 30) stats.upcoming30Days++;
        
        // Count by category
        const catId = alert.category_id || 'uncategorized';
        stats.byCategory[catId] = (stats.byCategory[catId] || 0) + 1;
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
            category_id,
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
    if (selectedHistory.size === filteredHistory.length) {
      setSelectedHistory(new Set());
    } else {
      setSelectedHistory(new Set(filteredHistory.map(h => h.id)));
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

  const filteredHistory = useMemo(() => {
    if (!historySearch.trim()) return history;
    const search = historySearch.toLowerCase().trim();
    return history.filter(item => item.alerts?.contracts?.name?.toLowerCase().includes(search));
  }, [history, historySearch]);

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
            {/* Filters Row */}
            <div className="flex items-center gap-3 mb-4 flex-wrap">
              <Tag className="h-4 w-4 text-muted-foreground" />
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="w-[220px]">
                  <SelectValue placeholder="Filtrar por categoría" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas las categorías</SelectItem>
                  {categories.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id}>
                      {cat.name} ({stats.byCategory[cat.id] || 0})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por contrato..."
                  value={activeSearch}
                  onChange={(e) => setActiveSearch(e.target.value)}
                  className="pl-9 w-[220px]"
                />
              </div>
              <Select value={activeSortBy} onValueChange={(v) => setActiveSortBy(v as "due_date" | "created_at")}>
                <SelectTrigger className="w-[200px]">
                  <ArrowUpDown className="h-4 w-4 mr-2" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="due_date">Ordenar por vencimiento</SelectItem>
                  <SelectItem value="created_at">Ordenar por creación</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <AlertsList
              key={`${refreshKey}-${categoryFilter}`}
              showAll
              showOnlyActive={true}
              categoryFilter={categoryFilter !== "all" ? categoryFilter : undefined}
              contractSearch={activeSearch}
              sortBy={activeSortBy}
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
                <div className="flex items-center gap-3 mb-4 flex-wrap">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Buscar por contrato..."
                      value={finalizedSearch}
                      onChange={(e) => setFinalizedSearch(e.target.value)}
                      className="pl-9 w-[220px]"
                    />
                  </div>
                  <Select value={finalizedSortBy} onValueChange={(v) => setFinalizedSortBy(v as "due_date" | "completed_at")}>
                    <SelectTrigger className="w-[220px]">
                      <ArrowUpDown className="h-4 w-4 mr-2" />
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="due_date">Ordenar por vencimiento</SelectItem>
                      <SelectItem value="completed_at">Ordenar por finalización</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <FinalizedAlertsList 
                  key={`finalized-${refreshKey}`} 
                  showAll 
                  defaultOpen={true} 
                  contractSearch={finalizedSearch}
                  sortBy={finalizedSortBy}
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
                <div className="flex items-center gap-3 mb-4">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Buscar por contrato..."
                      value={historySearch}
                      onChange={(e) => setHistorySearch(e.target.value)}
                      className="pl-9 w-[220px]"
                    />
                  </div>
                </div>
                {loadingHistory ? (
                  <p className="text-center text-muted-foreground py-8">Cargando...</p>
                ) : filteredHistory.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">
                    {historySearch ? "No se encontraron resultados" : "No hay alertas enviadas aún"}
                  </p>
                ) : (
                  <>
                    {/* Bulk Actions Bar */}
                    <div className="flex items-center justify-between mb-4 p-3 bg-muted/50 rounded-lg">
                      <div className="flex items-center gap-3">
                        <Checkbox
                          checked={selectedHistory.size === filteredHistory.length && filteredHistory.length > 0}
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
                      {filteredHistory.map((item) => (
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
