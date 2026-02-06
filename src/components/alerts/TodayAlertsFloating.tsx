import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Bell, ChevronDown, ChevronUp, X, ExternalLink, Calendar, CalendarDays, CheckCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { format, startOfWeek, endOfWeek } from "date-fns";
import { es } from "date-fns/locale";
import { useToast } from "@/hooks/use-toast";
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

interface TodayAlert {
  id: string;
  title: string;
  due_date: string;
  alert_type: string;
  contract_id: string | null;
  assigned_to: string | null;
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

type ViewMode = "today" | "week";

export function TodayAlertsFloating() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [todayAlerts, setTodayAlerts] = useState<TodayAlert[]>([]);
  const [weekAlerts, setWeekAlerts] = useState<TodayAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [isOpen, setIsOpen] = useState(true);
  const [isDismissed, setIsDismissed] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("today");
  const [completingAlertId, setCompletingAlertId] = useState<string | null>(null);

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
      
      // Load today's alerts - for admins show all, for regular users show assigned only
      const { data: todayData, error: todayError } = await supabase
        .from("alerts")
        .select(`
          id,
          title,
          due_date,
          alert_type,
          contract_id,
          assigned_to,
          contracts (name),
          alert_categories (name),
          profiles!alerts_assigned_to_fkey (full_name, email)
        `)
        .eq("due_date", todayStr)
        .eq("is_active", true)
        .is("completed_at", null)
        .is("deleted_at", null)
        .order("title");

      if (todayError) {
        console.error("[TodayAlertsFloating] Today query error:", todayError);
        throw todayError;
      }
      console.log("[TodayAlertsFloating] Today alerts:", todayData?.length, "date:", todayStr);
      setTodayAlerts(todayData || []);

      // Load week's alerts
      const { data: weekData, error: weekError } = await supabase
        .from("alerts")
        .select(`
          id,
          title,
          due_date,
          alert_type,
          contract_id,
          assigned_to,
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
        .order("title");

      if (weekError) {
        console.error("[TodayAlertsFloating] Week query error:", weekError);
        throw weekError;
      }
      console.log("[TodayAlertsFloating] Week alerts:", weekData?.length, "range:", weekStart, "-", weekEnd);
      setWeekAlerts(weekData || []);
    } catch (error) {
      console.error("Error loading alerts:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleCompleteAlert = async (alertId: string) => {
    try {
      const { error } = await supabase
        .from("alerts")
        .update({
          completed_at: new Date().toISOString(),
          completed_by: user?.id,
          is_active: false,
        })
        .eq("id", alertId);

      if (error) throw error;

      // Immediately remove the completed alert from local state for instant UI feedback
      setTodayAlerts(prev => prev.filter(a => a.id !== alertId));
      setWeekAlerts(prev => prev.filter(a => a.id !== alertId));

      toast({
        title: "Alerta completada",
        description: "La alerta ha sido marcada como completada",
      });
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

  const handleGoToAlerts = () => {
    navigate("/alerts");
  };

  const handleGoToContract = (contractId: string) => {
    navigate(`/contracts/${contractId}`);
  };

  const currentAlerts = viewMode === "today" ? todayAlerts : weekAlerts;
  const hasAnyAlerts = todayAlerts.length > 0 || weekAlerts.length > 0;

  // Don't show if dismissed, loading, no user, or no alerts at all
  if (isDismissed || loading || authLoading || !user || !hasAnyAlerts) {
    return null;
  }

  const formatAlertDate = (dateStr: string) => {
    const date = new Date(dateStr + "T00:00:00");
    return format(date, "EEE d", { locale: es });
  };

  return (
    <>
      <div className="fixed bottom-4 right-4 z-50 max-w-sm w-full animate-in slide-in-from-bottom-5 duration-300">
        <Card className="shadow-lg border-2 border-amber-500/50 bg-card">
          <Collapsible open={isOpen} onOpenChange={setIsOpen}>
            <CardHeader className="pb-2 pt-3 px-4">
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
                      {viewMode === "today" ? "Alertas del Día" : "Alertas de la Semana"}
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
                <div className="flex gap-2 mb-3">
                  <Button
                    variant={viewMode === "today" ? "default" : "outline"}
                    size="sm"
                    className="flex-1 text-xs"
                    onClick={() => setViewMode("today")}
                  >
                    <Calendar className="h-3 w-3 mr-1" />
                    Día ({todayAlerts.length})
                  </Button>
                  <Button
                    variant={viewMode === "week" ? "default" : "outline"}
                    size="sm"
                    className="flex-1 text-xs"
                    onClick={() => setViewMode("week")}
                  >
                    <CalendarDays className="h-3 w-3 mr-1" />
                    Semana ({weekAlerts.length})
                  </Button>
                </div>

                {currentAlerts.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-2">
                    No hay alertas {viewMode === "today" ? "para hoy" : "esta semana"}
                  </p>
                ) : (
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {currentAlerts.map((alert) => (
                      <div
                        key={alert.id}
                        className="p-2 rounded-md bg-muted/50 hover:bg-muted transition-colors"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-medium truncate">{alert.title}</p>
                              {viewMode === "week" && (
                                <Badge variant="secondary" className="text-[10px] h-4 shrink-0">
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
              Esta acción marcará la alerta como completada y la desactivará. ¿Deseas continuar?
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
    </>
  );
}
