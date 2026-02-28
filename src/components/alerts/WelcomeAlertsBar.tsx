import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Bell, Calendar, CalendarDays, AlertTriangle, CheckCircle,
  ExternalLink, ChevronUp, ChevronDown, Plus, CalendarIcon,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { format, startOfWeek, endOfWeek, addDays } from "date-fns";
import { es } from "date-fns/locale";
import { useToast } from "@/hooks/use-toast";
import { Calendar as CalendarPicker } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { motion, AnimatePresence } from "framer-motion";

interface WelcomeAlert {
  id: string;
  title: string;
  due_date: string;
  alert_type: string;
  contract_id: string | null;
  assigned_to: string | null;
  category_id: string | null;
  contracts?: { name: string } | null;
  alert_categories?: { name: string } | null;
  profiles?: { full_name: string | null; email: string } | null;
}

type ViewMode = "today" | "week" | "overdue";

const QUICK_ALERT_TYPES = [
  { value: "other", label: "General" },
  { value: "contract_expiration", label: "Vencimiento de contrato" },
  { value: "contract_renewal", label: "Renovación" },
  { value: "inspection", label: "Inspección" },
  { value: "maintenance", label: "Mantención" },
  { value: "license", label: "Licencia" },
  { value: "permit", label: "Permiso" },
  { value: "certificate", label: "Certificado" },
];

export function WelcomeAlertsBar() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [todayAlerts, setTodayAlerts] = useState<WelcomeAlert[]>([]);
  const [weekAlerts, setWeekAlerts] = useState<WelcomeAlert[]>([]);
  const [overdueAlerts, setOverdueAlerts] = useState<WelcomeAlert[]>([]);
  const [loading, setLoading] = useState(true);

  const [expanded, setExpanded] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>("week");
  const [completingAlertId, setCompletingAlertId] = useState<string | null>(null);

  const [showFollowUpDialog, setShowFollowUpDialog] = useState(false);
  const [completedAlert, setCompletedAlert] = useState<WelcomeAlert | null>(null);
  const [followUpTitle, setFollowUpTitle] = useState("");
  const [followUpDate, setFollowUpDate] = useState<Date | undefined>(undefined);
  const [creatingFollowUp, setCreatingFollowUp] = useState(false);

  // Quick create alert state
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newAlertTitle, setNewAlertTitle] = useState("");
  const [newAlertDate, setNewAlertDate] = useState<Date | undefined>(undefined);
  const [newAlertType, setNewAlertType] = useState("other");
  const [newAlertMessage, setNewAlertMessage] = useState("");
  const [creatingAlert, setCreatingAlert] = useState(false);

  const alertSelectQuery = `
    id, title, due_date, alert_type, contract_id, assigned_to, category_id,
    contracts (name),
    alert_categories (name),
    profiles!alerts_assigned_to_fkey (full_name, email)
  `;

  const loadAlerts = useCallback(async () => {
    try {
      const today = new Date();
      const todayStr = format(today, "yyyy-MM-dd");
      const weekStart = format(startOfWeek(today, { weekStartsOn: 1 }), "yyyy-MM-dd");
      const weekEnd = format(endOfWeek(today, { weekStartsOn: 1 }), "yyyy-MM-dd");

      const [todayRes, weekRes, overdueRes] = await Promise.all([
        supabase.from("alerts").select(alertSelectQuery)
          .eq("due_date", todayStr).eq("is_active", true)
          .is("completed_at", null).is("deleted_at", null).order("title"),
        supabase.from("alerts").select(alertSelectQuery)
          .gte("due_date", weekStart).lte("due_date", weekEnd).eq("is_active", true)
          .is("completed_at", null).is("deleted_at", null).order("due_date").order("title"),
        supabase.from("alerts").select(alertSelectQuery)
          .lt("due_date", todayStr).eq("is_active", true)
          .is("completed_at", null).is("deleted_at", null).order("due_date").order("title"),
      ]);

      if (todayRes.error) throw todayRes.error;
      if (weekRes.error) throw weekRes.error;
      if (overdueRes.error) throw overdueRes.error;

      setTodayAlerts(todayRes.data || []);
      setWeekAlerts(weekRes.data || []);
      setOverdueAlerts(overdueRes.data || []);
    } catch (error) {
      console.error("Error loading alerts:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!authLoading && user) loadAlerts();
  }, [authLoading, user, loadAlerts]);

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel("welcome-alerts-bar")
      .on("postgres_changes", { event: "*", schema: "public", table: "alerts" }, () => loadAlerts())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, loadAlerts]);

  const handleCompleteAlert = async (alertId: string) => {
    try {
      const alert = [...todayAlerts, ...weekAlerts, ...overdueAlerts].find(a => a.id === alertId);
      const { error } = await supabase.from("alerts").update({
        completed_at: new Date().toISOString(), completed_by: user?.id, is_active: false,
      }).eq("id", alertId);
      if (error) throw error;
      setTodayAlerts(p => p.filter(a => a.id !== alertId));
      setWeekAlerts(p => p.filter(a => a.id !== alertId));
      setOverdueAlerts(p => p.filter(a => a.id !== alertId));
      toast({ title: "Alerta completada", description: "La alerta ha sido marcada como completada" });
      if (alert) {
        setCompletedAlert(alert);
        setFollowUpTitle(`Seguimiento: ${alert.title}`);
        setFollowUpDate(addDays(new Date(), 7));
        setShowFollowUpDialog(true);
      }
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "No se pudo completar la alerta", variant: "destructive" });
    } finally {
      setCompletingAlertId(null);
    }
  };

  const handleCreateFollowUp = async () => {
    if (!completedAlert || !followUpTitle.trim() || !followUpDate) return;
    setCreatingFollowUp(true);
    try {
      const { error } = await supabase.from("alerts").insert({
        title: followUpTitle.trim(),
        message: `Alerta dependiente de: ${completedAlert.title}`,
        alert_type: completedAlert.alert_type as any,
        due_date: format(followUpDate, "yyyy-MM-dd"),
        channels: ["email"] as any,
        days_before: [7, 1, 0],
        contract_id: completedAlert.contract_id,
        category_id: completedAlert.category_id,
        assigned_to: completedAlert.assigned_to || user?.id,
        is_active: true,
        created_by: user?.id,
      });
      if (error) throw error;
      toast({ title: "Alerta de seguimiento creada", description: `Nueva alerta para el ${format(followUpDate, "dd/MM/yyyy")}` });
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "No se pudo crear la alerta de seguimiento", variant: "destructive" });
    } finally {
      setCreatingFollowUp(false);
      setShowFollowUpDialog(false);
      setCompletedAlert(null);
      setFollowUpTitle("");
      setFollowUpDate(undefined);
    }
  };

  const handleQuickCreateAlert = async () => {
    if (!newAlertTitle.trim() || !newAlertDate || !user) return;
    setCreatingAlert(true);
    try {
      const { error } = await supabase.from("alerts").insert({
        title: newAlertTitle.trim(),
        message: newAlertMessage.trim() || null,
        alert_type: newAlertType as any,
        due_date: format(newAlertDate, "yyyy-MM-dd"),
        channels: ["email"] as any,
        days_before: [7, 1, 0],
        assigned_to: user.id,
        is_active: true,
        created_by: user.id,
      });
      if (error) throw error;
      toast({ title: "Alerta creada", description: `Alerta programada para el ${format(newAlertDate, "dd/MM/yyyy")}` });
      setShowCreateDialog(false);
      setNewAlertTitle("");
      setNewAlertDate(undefined);
      setNewAlertType("other");
      setNewAlertMessage("");
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "No se pudo crear la alerta", variant: "destructive" });
    } finally {
      setCreatingAlert(false);
    }
  };

  const formatAlertDate = (dateStr: string) => {
    const date = new Date(dateStr + "T00:00:00");
    return format(date, "EEE d", { locale: es });
  };

  const currentAlerts = viewMode === "today" ? todayAlerts : viewMode === "week" ? weekAlerts : overdueAlerts;
  const hasAnyAlerts = todayAlerts.length > 0 || weekAlerts.length > 0 || overdueAlerts.length > 0;

  if (loading || authLoading || !user) return null;

  const tabs: { mode: ViewMode; label: string; count: number; icon: typeof Calendar; danger?: boolean }[] = [
    { mode: "today", label: "Hoy", count: todayAlerts.length, icon: Calendar },
    { mode: "week", label: "Semana", count: weekAlerts.length, icon: CalendarDays },
    { mode: "overdue", label: "Vencidas", count: overdueAlerts.length, icon: AlertTriangle, danger: true },
  ];

  return (
    <>
      <div className="fixed bottom-0 left-0 right-0 z-40">
        {/* Collapsed bar */}
        <div
          className="bg-card/95 backdrop-blur-md border-t border-border shadow-lg cursor-pointer"
          onClick={() => setExpanded(!expanded)}
        >
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-2.5 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="relative">
                <Bell className="h-5 w-5 text-amber-500" />
                {hasAnyAlerts && (
                  <span className="absolute -top-1.5 -right-1.5 h-4 w-4 rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground flex items-center justify-center">
                    {todayAlerts.length + overdueAlerts.length}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3">
                {tabs.map((tab) => (
                  <button
                    key={tab.mode}
                    onClick={(e) => {
                      e.stopPropagation();
                      setViewMode(tab.mode);
                      if (!expanded) setExpanded(true);
                    }}
                    className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                      viewMode === tab.mode && expanded
                        ? "bg-primary text-primary-foreground"
                        : tab.danger && tab.count > 0
                        ? "bg-destructive/10 text-destructive hover:bg-destructive/20"
                        : "bg-muted text-muted-foreground hover:bg-accent"
                    }`}
                  >
                    <tab.icon className="h-3 w-3" />
                    {tab.label}
                    <Badge
                      variant={tab.danger && tab.count > 0 ? "destructive" : "secondary"}
                      className="h-4 px-1.5 text-[10px]"
                    >
                      {tab.count}
                    </Badge>
                  </button>
                ))}
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 rounded-full bg-primary text-primary-foreground hover:bg-primary/90"
                onClick={(e) => { e.stopPropagation(); setShowCreateDialog(true); }}
                title="Crear alerta"
              >
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </div>
            <div className="flex items-center gap-2">
              {expanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronUp className="h-4 w-4 text-muted-foreground" />}
            </div>
          </div>
        </div>

        {/* Expanded panel */}
        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25, ease: "easeInOut" }}
              className="bg-card/98 backdrop-blur-md border-t border-border overflow-hidden"
              style={{ position: "absolute", bottom: "100%", left: 0, right: 0 }}
            >
              <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
                {currentAlerts.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No hay alertas {viewMode === "today" ? "para hoy" : viewMode === "week" ? "esta semana" : "vencidas"}
                  </p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-[280px] overflow-y-auto">
                    {currentAlerts.map((alert) => (
                      <div
                        key={alert.id}
                        className="p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors border border-border/50"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-medium truncate">{alert.title}</p>
                              {(viewMode === "week" || viewMode === "overdue") && (
                                <Badge variant={viewMode === "overdue" ? "destructive" : "secondary"} className="text-[10px] h-4 shrink-0">
                                  {formatAlertDate(alert.due_date)}
                                </Badge>
                              )}
                            </div>
                            {alert.contracts?.name && (
                              <p className="text-xs text-muted-foreground truncate mt-0.5">{alert.contracts.name}</p>
                            )}
                            {alert.alert_categories?.name && (
                              <Badge variant="outline" className="text-[10px] mt-1 h-4">{alert.alert_categories.name}</Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <Button
                              variant="ghost" size="icon"
                              className="h-6 w-6 text-green-600 hover:text-green-700 hover:bg-green-100"
                              onClick={() => setCompletingAlertId(alert.id)}
                              title="Completar alerta"
                            >
                              <CheckCircle className="h-4 w-4" />
                            </Button>
                            {alert.contract_id && (
                              <Button
                                variant="ghost" size="icon" className="h-6 w-6"
                                onClick={() => navigate(`/contracts/${alert.contract_id}`)}
                                title="Ver contrato"
                              >
                                <ExternalLink className="h-3 w-3" />
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Complete Alert Confirmation */}
      <AlertDialog open={!!completingAlertId} onOpenChange={(open) => !open && setCompletingAlertId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Completar alerta?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción marcará la alerta como completada y la desactivará. Al confirmar, podrás crear una alerta de seguimiento si lo necesitas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => completingAlertId && handleCompleteAlert(completingAlertId)}>
              Completar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Follow-up Dialog */}
      <Dialog open={showFollowUpDialog} onOpenChange={(open) => { if (!open) { setShowFollowUpDialog(false); setCompletedAlert(null); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5" />
              Crear alerta de seguimiento
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">¿Deseas crear una alerta de seguimiento para esta tarea?</p>
            {completedAlert?.contracts?.name && (
              <p className="text-xs text-muted-foreground">Local: <span className="font-medium text-foreground">{completedAlert.contracts.name}</span></p>
            )}
            <div className="space-y-2">
              <Label>Título</Label>
              <Input value={followUpTitle} onChange={(e) => setFollowUpTitle(e.target.value)} placeholder="Título de la alerta de seguimiento" />
            </div>
            <div className="space-y-2">
              <Label>Fecha de vencimiento</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {followUpDate ? format(followUpDate, "dd/MM/yyyy") : "Seleccionar fecha"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <CalendarPicker mode="single" selected={followUpDate} onSelect={setFollowUpDate} locale={es} disabled={(date) => date < new Date()} />
                </PopoverContent>
              </Popover>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setShowFollowUpDialog(false); setCompletedAlert(null); }}>No, gracias</Button>
            <Button onClick={handleCreateFollowUp} disabled={creatingFollowUp || !followUpTitle.trim() || !followUpDate}>
              {creatingFollowUp ? "Creando..." : "Crear alerta"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Quick Create Alert Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5" />
              Crear nueva alerta
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Título *</Label>
              <Input value={newAlertTitle} onChange={(e) => setNewAlertTitle(e.target.value)} placeholder="Ej: Revisar vencimiento contrato..." />
            </div>
            <div className="space-y-2">
              <Label>Tipo</Label>
              <Select value={newAlertType} onValueChange={setNewAlertType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {QUICK_ALERT_TYPES.map(t => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Fecha de vencimiento *</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {newAlertDate ? format(newAlertDate, "dd/MM/yyyy") : "Seleccionar fecha"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <CalendarPicker mode="single" selected={newAlertDate} onSelect={setNewAlertDate} locale={es} disabled={(date) => date < new Date()} />
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-2">
              <Label>Descripción (opcional)</Label>
              <Textarea value={newAlertMessage} onChange={(e) => setNewAlertMessage(e.target.value)} placeholder="Detalles adicionales..." rows={2} />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>Cancelar</Button>
            <Button onClick={handleQuickCreateAlert} disabled={creatingAlert || !newAlertTitle.trim() || !newAlertDate}>
              {creatingAlert ? "Creando..." : "Crear alerta"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
