import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Bell, ChevronDown, ChevronUp, X, ExternalLink, Calendar, CalendarDays } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { format, startOfWeek, endOfWeek, addDays } from "date-fns";
import { es } from "date-fns/locale";

interface TodayAlert {
  id: string;
  title: string;
  due_date: string;
  alert_type: string;
  contract_id: string | null;
  contracts?: {
    name: string;
  } | null;
  alert_categories?: {
    name: string;
  } | null;
}

type ViewMode = "today" | "week";

export function TodayAlertsFloating() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [todayAlerts, setTodayAlerts] = useState<TodayAlert[]>([]);
  const [weekAlerts, setWeekAlerts] = useState<TodayAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [isOpen, setIsOpen] = useState(true);
  const [isDismissed, setIsDismissed] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("today");

  useEffect(() => {
    if (!authLoading && user) {
      loadAlerts();
    }
  }, [authLoading, user]);

  const loadAlerts = async () => {
    try {
      const today = new Date();
      const todayStr = format(today, "yyyy-MM-dd");
      const weekStart = format(startOfWeek(today, { weekStartsOn: 1 }), "yyyy-MM-dd");
      const weekEnd = format(endOfWeek(today, { weekStartsOn: 1 }), "yyyy-MM-dd");
      
      // Load today's alerts
      const { data: todayData, error: todayError } = await supabase
        .from("alerts")
        .select(`
          id,
          title,
          due_date,
          alert_type,
          contract_id,
          contracts (name),
          alert_categories (name)
        `)
        .eq("due_date", todayStr)
        .eq("is_active", true)
        .is("completed_at", null)
        .is("deleted_at", null)
        .order("title");

      if (todayError) throw todayError;
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
          contracts (name),
          alert_categories (name)
        `)
        .gte("due_date", weekStart)
        .lte("due_date", weekEnd)
        .eq("is_active", true)
        .is("completed_at", null)
        .is("deleted_at", null)
        .order("due_date")
        .order("title");

      if (weekError) throw weekError;
      setWeekAlerts(weekData || []);
    } catch (error) {
      console.error("Error loading alerts:", error);
    } finally {
      setLoading(false);
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
                        {alert.contract_id && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 shrink-0"
                            onClick={() => handleGoToContract(alert.contract_id!)}
                          >
                            <ExternalLink className="h-3 w-3" />
                          </Button>
                        )}
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
  );
}
