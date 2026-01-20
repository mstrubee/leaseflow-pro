import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Bell, ChevronDown, ChevronUp, X, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
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

export function TodayAlertsFloating() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [alerts, setAlerts] = useState<TodayAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [isOpen, setIsOpen] = useState(true);
  const [isDismissed, setIsDismissed] = useState(false);

  useEffect(() => {
    if (!authLoading && user) {
      loadTodayAlerts();
    }
  }, [authLoading, user]);

  const loadTodayAlerts = async () => {
    try {
      const today = format(new Date(), "yyyy-MM-dd");
      
      const { data, error } = await supabase
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
        .eq("due_date", today)
        .eq("is_active", true)
        .is("completed_at", null)
        .is("deleted_at", null)
        .order("title");

      if (error) throw error;
      setAlerts(data || []);
    } catch (error) {
      console.error("Error loading today's alerts:", error);
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

  // Don't show if dismissed, loading, no user, or no alerts
  if (isDismissed || loading || authLoading || !user || alerts.length === 0) {
    return null;
  }

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
                      {alerts.length}
                    </span>
                  </div>
                  <CardTitle className="text-sm font-semibold">
                    Alertas del Día
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
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {alerts.map((alert) => (
                  <div
                    key={alert.id}
                    className="p-2 rounded-md bg-muted/50 hover:bg-muted transition-colors"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{alert.title}</p>
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
