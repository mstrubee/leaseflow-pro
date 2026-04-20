import { useState, useEffect, useRef, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Bell, ChevronDown, ChevronUp, X, ExternalLink, Calendar, CalendarDays, CheckCircle, Plus, CalendarIcon, AlertTriangle, GripHorizontal } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { format, startOfWeek, endOfWeek, addDays } from "date-fns";
import { es } from "date-fns/locale";
import { useToast } from "@/hooks/use-toast";
import { Calendar as CalendarPicker } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

interface TodayAlert {
  id: string;
  title: string;
  due_date: string;
  alert_type: string;
  contract_id: string | null;
  assigned_to: string | null;
  category_id: string | null;
  contracts?: {
    name: string;
  } | null;
  alert_categories?: {
    name: string;
  } | null;
  profiles?: {
    full_name: string | null;
    email: string;
  } | null;
}

type ViewMode = "today" | "week" | "overdue";

export function TodayAlertsFloating() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [todayAlerts, setTodayAlerts] = useState<TodayAlert[]>([]);
  const [weekAlerts, setWeekAlerts] = useState<TodayAlert[]>([]);
  const [overdueAlerts, setOverdueAlerts] = useState<TodayAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [isOpen, setIsOpen] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("today");
  const [completingAlertId, setCompletingAlertId] = useState<string | null>(null);
  const [expandedAlertIds, setExpandedAlertIds] = useState<Set<string>>(new Set());

  // Dependent alert state
  const [showFollowUpDialog, setShowFollowUpDialog] = useState(false);
  const [completedAlert, setCompletedAlert] = useState<TodayAlert | null>(null);
  const [followUpTitle, setFollowUpTitle] = useState("");
  const [followUpDate, setFollowUpDate] = useState<Date | undefined>(undefined);
  const [creatingFollowUp, setCreatingFollowUp] = useState(false);

  // Resize state
  const [customHeight, setCustomHeight] = useState<number | null>(null);
  const [isResizing, setIsResizing] = useState(false);
  const resizeStartY = useRef(0);
  const resizeStartHeight = useRef(0);

  // Drag state
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartPos = useRef({ x: 0, y: 0 });
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Resize handlers
  const handleResizePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    setIsResizing(true);
    resizeStartY.current = e.clientY;
    resizeStartHeight.current = customHeight ?? 240;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }, [customHeight]);

  const handleResizePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!isResizing) return;
    const diff = resizeStartY.current - e.clientY;
    const newHeight = Math.max(150, Math.min(window.innerHeight * 0.7, resizeStartHeight.current + diff));
    setCustomHeight(newHeight);
  }, [isResizing]);

  const handleResizePointerUp = useCallback(() => {
    setIsResizing(false);
  }, []);

  // Reset customHeight when collapsed
  useEffect(() => {
    if (!isOpen) setCustomHeight(null);
  }, [isOpen]);

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    // Only drag from header area
    const target = e.target as HTMLElement;
    if (target.closest("button") || target.closest("a")) return;
    setIsDragging(true);
    dragStartPos.current = { x: e.clientX - dragOffset.x, y: e.clientY - dragOffset.y };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }, [dragOffset]);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    const newX = e.clientX - dragStartPos.current.x;
    const newY = e.clientY - dragStartPos.current.y;
    setDragOffset({ x: newX, y: newY });
  }, [isDragging]);

  const handlePointerUp = useCallback(() => {
    if (!isDragging) return;
    setIsDragging(false);
    // Reset to original position after 10 seconds
    if (dragOffset.x !== 0 || dragOffset.y !== 0) {
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
      resetTimerRef.current = setTimeout(() => {
        setDragOffset({ x: 0, y: 0 });
      }, 10000);
    }
  }, [isDragging, dragOffset]);

  useEffect(() => {
    return () => {
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!authLoading && user) {
      loadAlerts();
    }
  }, [authLoading, user]);

  // Realtime subscription for alerts
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel('floating-alerts-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'alerts',
        },
        () => {
          loadAlerts();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  const loadAlerts = async () => {
    try {
      const today = new Date();
      const todayStr = format(today, "yyyy-MM-dd");
      const weekStart = format(startOfWeek(today, { weekStartsOn: 1 }), "yyyy-MM-dd");
      const weekEnd = format(endOfWeek(today, { weekStartsOn: 1 }), "yyyy-MM-dd");
      
      const [todayResult, weekResult, overdueResult] = await Promise.all([
        supabase
          .from("alerts")
          .select(`
            id, title, due_date, alert_type, contract_id, assigned_to, category_id,
            contracts (name),
            alert_categories (name),
            profiles!alerts_assigned_to_fkey (full_name, email)
          `)
          .eq("due_date", todayStr)
          .eq("is_active", true)
          .is("completed_at", null)
          .is("deleted_at", null)
          .order("title"),
        supabase
          .from("alerts")
          .select(`
            id, title, due_date, alert_type, contract_id, assigned_to, category_id,
            contracts (name),
            alert_categories (name),
            profiles!alerts_assigned_to_fkey (full_name, email)
          `)
          .gte("due_date", weekStart)
          .lte("due_date", weekEnd)
          .eq("is_active", true)
          .is("completed_at", null)
          .is("deleted_at", null)
          .order("due_date")
          .order("title"),
        supabase
          .from("alerts")
          .select(`
            id, title, due_date, alert_type, contract_id, assigned_to, category_id,
            contracts (name),
            alert_categories (name),
            profiles!alerts_assigned_to_fkey (full_name, email)
          `)
          .lt("due_date", todayStr)
          .eq("is_active", true)
          .is("completed_at", null)
          .is("deleted_at", null)
          .order("due_date", { ascending: true })
          .order("title"),
      ]);

      if (todayResult.error) throw todayResult.error;
      if (weekResult.error) throw weekResult.error;
      if (overdueResult.error) throw overdueResult.error;

      setTodayAlerts(todayResult.data || []);
      setWeekAlerts(weekResult.data || []);
      setOverdueAlerts(overdueResult.data || []);
    } catch (error) {
      console.error("Error loading alerts:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleCompleteAlert = async (alertId: string) => {
    try {
      const alert = [...todayAlerts, ...weekAlerts, ...overdueAlerts].find(a => a.id === alertId);
      
      const { error } = await supabase
        .from("alerts")
        .update({
          completed_at: new Date().toISOString(),
          completed_by: user?.id,
          is_active: false,
        })
        .eq("id", alertId);

      if (error) throw error;

      setTodayAlerts(prev => prev.filter(a => a.id !== alertId));
      setWeekAlerts(prev => prev.filter(a => a.id !== alertId));
      setOverdueAlerts(prev => prev.filter(a => a.id !== alertId));

      toast({
        title: "Alerta completada",
        description: "La alerta ha sido marcada como completada",
      });

      // Offer to create follow-up alert
      if (alert) {
        setCompletedAlert(alert);
        setFollowUpTitle(`Seguimiento: ${alert.title}`);
        setFollowUpDate(addDays(new Date(), 7));
        setShowFollowUpDialog(true);
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "No se pudo completar la alerta",
        variant: "destructive",
      });
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

      toast({
        title: "Alerta de seguimiento creada",
        description: `Nueva alerta para el ${format(followUpDate, "dd/MM/yyyy")}`,
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "No se pudo crear la alerta de seguimiento",
        variant: "destructive",
      });
    } finally {
      setCreatingFollowUp(false);
      setShowFollowUpDialog(false);
      setCompletedAlert(null);
      setFollowUpTitle("");
      setFollowUpDate(undefined);
    }
  };

  const handleGoToAlerts = () => {
    navigate("/alerts");
  };

  const handleGoToContract = (contractId: string) => {
    navigate(`/contracts/${contractId}`);
  };

  const currentAlerts = viewMode === "today" ? todayAlerts : viewMode === "week" ? weekAlerts : overdueAlerts;
  const hasAnyAlerts = todayAlerts.length > 0 || weekAlerts.length > 0 || overdueAlerts.length > 0;

  if (isDismissed || loading || authLoading || !user || !hasAnyAlerts) {
    return null;
  }

  const formatAlertDate = (dateStr: string) => {
    const date = new Date(dateStr + "T00:00:00");
    return format(date, "EEE d", { locale: es });
  };

  return (
    <>
      <div
        className="fixed bottom-4 right-4 z-50 max-w-sm w-full animate-in slide-in-from-bottom-5 duration-300"
        style={{
          transform: `translate(${dragOffset.x}px, ${dragOffset.y}px)`,
          transition: isDragging ? "none" : "transform 0.4s ease-out",
        }}
      >
        {isOpen && (
          <div
            className="flex items-center justify-center cursor-ns-resize hover:bg-muted/50 transition-colors rounded-t-lg"
            style={{ height: 8 }}
            onPointerDown={handleResizePointerDown}
            onPointerMove={handleResizePointerMove}
            onPointerUp={handleResizePointerUp}
          >
            <GripHorizontal className="h-3 w-3 text-muted-foreground" />
          </div>
        )}
        <Card className="shadow-lg border-2 border-amber-500/50 bg-card">
          <Collapsible open={isOpen} onOpenChange={setIsOpen}>
            <CardHeader
              className="pb-2 pt-3 px-4 cursor-grab active:cursor-grabbing"
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
            >
              <div className="flex items-center justify-between">
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" className="p-0 h-auto hover:bg-transparent flex items-center gap-2">
                    <div className="relative">
                      <Bell className="h-5 w-5 text-amber-500" />
                      <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground flex items-center justify-center">
                        {currentAlerts.length}
                      </span>
                    </div>
                    <CardTitle className="text-sm font-semibold">
                      {viewMode === "today" ? "Alertas del Día" : viewMode === "week" ? "Alertas de la Semana" : "Alertas Vencidas"}
                    </CardTitle>
                    {isOpen ? (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronUp className="h-4 w-4 text-muted-foreground" />
                    )}
                  </Button>
                </CollapsibleTrigger>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => setIsDismissed(true)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </CardHeader>
            
            <CollapsibleContent>
              <CardContent className="pt-0 px-4 pb-3">
                {/* Toggle Buttons */}
                <div className="flex gap-1.5 mb-3">
                  <Button
                    variant={viewMode === "today" ? "default" : "outline"}
                    size="sm"
                    className="flex-1 text-xs px-2"
                    onClick={() => setViewMode("today")}
                  >
                    <Calendar className="h-3 w-3 mr-1" />
                    Día ({todayAlerts.length})
                  </Button>
                  <Button
                    variant={viewMode === "week" ? "default" : "outline"}
                    size="sm"
                    className="flex-1 text-xs px-2"
                    onClick={() => setViewMode("week")}
                  >
                    <CalendarDays className="h-3 w-3 mr-1" />
                    Semana ({weekAlerts.length})
                  </Button>
                  {overdueAlerts.length > 0 && (
                    <Button
                      variant={viewMode === "overdue" ? "default" : "outline"}
                      size="sm"
                      className={`flex-1 text-xs px-2 ${viewMode !== "overdue" ? "border-destructive/50 text-destructive hover:bg-destructive/10" : ""}`}
                      onClick={() => setViewMode("overdue")}
                    >
                      <AlertTriangle className="h-3 w-3 mr-1" />
                      Vencidas ({overdueAlerts.length})
                    </Button>
                  )}
                </div>

                {currentAlerts.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-2">
                    No hay alertas {viewMode === "today" ? "para hoy" : viewMode === "week" ? "esta semana" : "vencidas"}
                  </p>
                ) : (
                  <div className="space-y-2 overflow-y-auto" style={{ maxHeight: customHeight ?? 240 }}>
                    {currentAlerts.map((alert) => (
                      <div
                        key={alert.id}
                        className="p-2 rounded-md bg-muted/50 hover:bg-muted transition-colors"
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
                              <p className="text-xs text-muted-foreground truncate">
                                {alert.contracts.name}
                              </p>
                            )}
                            {alert.alert_categories?.name && (
                              <Badge variant="outline" className="text-[10px] mt-1 h-4">
                                {alert.alert_categories.name}
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 text-green-600 hover:text-green-700 hover:bg-green-100"
                              onClick={() => setCompletingAlertId(alert.id)}
                              title="Completar alerta"
                            >
                              <CheckCircle className="h-4 w-4" />
                            </Button>
                            {alert.contract_id && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                onClick={() => handleGoToContract(alert.contract_id!)}
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
                
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full mt-3"
                  onClick={handleGoToAlerts}
                >
                  Ver todas las alertas
                </Button>
              </CardContent>
            </CollapsibleContent>
          </Collapsible>
        </Card>
      </div>

      {/* Complete Alert Confirmation Dialog */}
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

      {/* Follow-up / Dependent Alert Dialog */}
      <Dialog open={showFollowUpDialog} onOpenChange={(open) => {
        if (!open) {
          setShowFollowUpDialog(false);
          setCompletedAlert(null);
        }
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5" />
              Crear alerta de seguimiento
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              ¿Deseas crear una alerta de seguimiento para esta tarea?
            </p>
            {completedAlert?.contracts?.name && (
              <p className="text-xs text-muted-foreground">
                Local: <span className="font-medium text-foreground">{completedAlert.contracts.name}</span>
              </p>
            )}
            <div className="space-y-2">
              <Label>Título</Label>
              <Input
                value={followUpTitle}
                onChange={(e) => setFollowUpTitle(e.target.value)}
                placeholder="Título de la alerta de seguimiento"
              />
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
                  <CalendarPicker
                    mode="single"
                    selected={followUpDate}
                    onSelect={setFollowUpDate}
                    locale={es}
                    disabled={(date) => date < new Date()}
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => {
              setShowFollowUpDialog(false);
              setCompletedAlert(null);
            }}>
              No, gracias
            </Button>
            <Button
              onClick={handleCreateFollowUp}
              disabled={creatingFollowUp || !followUpTitle.trim() || !followUpDate}
            >
              {creatingFollowUp ? "Creando..." : "Crear alerta"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
