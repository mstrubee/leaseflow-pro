import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Bell, ChevronDown, ChevronUp, Search, ArrowUpDown, Filter } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { format, differenceInDays, parseISO } from "date-fns";
import { es } from "date-fns/locale";

interface AlertWithDetails {
  id: string;
  title: string;
  due_date: string;
  last_sent_at: string | null;
  is_active: boolean;
  alert_type: string;
  priority?: number;
  alert_subtype?: string;
  contracts: {
    name: string;
    contract_addresses: {
      region: string;
    }[];
  } | null;
}

type SortField = "date" | "name" | "region";
type SortOrder = "asc" | "desc";

export function UpcomingAlertsPanel() {
  const [isOpen, setIsOpen] = useState(false);
  const [alerts, setAlerts] = useState<AlertWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [regionFilter, setRegionFilter] = useState<string>("all");
  const [sortField, setSortField] = useState<SortField>("date");
  const [sortOrder, setSortOrder] = useState<SortOrder>("asc");

  useEffect(() => {
    loadAlerts();
  }, []);

  const loadAlerts = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("alerts")
        .select(`
          id,
          title,
          due_date,
          last_sent_at,
          is_active,
          alert_type,
          priority,
          alert_subtype,
          contracts (
            name,
            contract_addresses (region)
          )
        `)
        .is("completed_at", null)
        .is("deleted_at", null)
        .order("priority", { ascending: false })
        .order("due_date", { ascending: true });

      if (error) throw error;
      setAlerts(data || []);
    } catch (error) {
      console.error("Error loading alerts:", error);
    } finally {
      setLoading(false);
    }
  };

  const getAlertStatus = (alert: AlertWithDetails): "red" | "yellow" | "green" | "priority" => {
    // High priority alerts (finiquito pendiente) are always shown first with special styling
    if (alert.priority && alert.priority >= 100) {
      return "priority";
    }
    
    const daysUntilDue = differenceInDays(parseISO(alert.due_date), new Date());
    const hasBeenSent = alert.last_sent_at !== null;

    if (hasBeenSent && daysUntilDue < 15) {
      return "red";
    } else if (hasBeenSent) {
      return "yellow";
    }
    return "green";
  };

  const getStatusColor = (status: "red" | "yellow" | "green" | "priority") => {
    switch (status) {
      case "priority":
        return "bg-purple-500 animate-pulse";
      case "red":
        return "bg-red-500";
      case "yellow":
        return "bg-yellow-500";
      case "green":
        return "bg-green-500";
    }
  };

  const getStatusLabel = (status: "red" | "yellow" | "green" | "priority") => {
    switch (status) {
      case "priority":
        return "Prioritario";
      case "red":
        return "Urgente";
      case "yellow":
        return "Enviada";
      case "green":
        return "Sin urgencia";
    }
  };

  const regions = useMemo(() => {
    const uniqueRegions = new Set<string>();
    alerts.forEach((alert) => {
      alert.contracts?.contract_addresses?.forEach((addr) => {
        if (addr.region) uniqueRegions.add(addr.region);
      });
    });
    return Array.from(uniqueRegions).sort();
  }, [alerts]);

  const filteredAndSortedAlerts = useMemo(() => {
    let filtered = alerts.filter((alert) => {
      const matchesSearch =
        alert.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        alert.contracts?.name?.toLowerCase().includes(searchTerm.toLowerCase());

      const alertRegion = alert.contracts?.contract_addresses?.[0]?.region;
      const matchesRegion = regionFilter === "all" || alertRegion === regionFilter;

      return matchesSearch && matchesRegion;
    });

    filtered.sort((a, b) => {
      let comparison = 0;

      switch (sortField) {
        case "date":
          comparison = new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
          break;
        case "name":
          comparison = a.title.localeCompare(b.title);
          break;
        case "region":
          const regionA = a.contracts?.contract_addresses?.[0]?.region || "";
          const regionB = b.contracts?.contract_addresses?.[0]?.region || "";
          comparison = regionA.localeCompare(regionB);
          break;
      }

      return sortOrder === "asc" ? comparison : -comparison;
    });

    return filtered;
  }, [alerts, searchTerm, regionFilter, sortField, sortOrder]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortOrder("asc");
    }
  };

  const alertCounts = useMemo(() => {
    return {
      red: alerts.filter((a) => getAlertStatus(a) === "red").length,
      yellow: alerts.filter((a) => getAlertStatus(a) === "yellow").length,
      green: alerts.filter((a) => getAlertStatus(a) === "green").length,
    };
  }, [alerts]);

  return (
    <Card className="mb-6">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base">
                <Bell className="h-5 w-5" />
                Próximas alertas
                <span className="text-sm font-normal text-muted-foreground">
                  ({alerts.length})
                </span>
              </CardTitle>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2 text-sm">
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-red-500" />
                    {alertCounts.red}
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-yellow-500" />
                    {alertCounts.yellow}
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-green-500" />
                    {alertCounts.green}
                  </span>
                </div>
                {isOpen ? (
                  <ChevronUp className="h-5 w-5" />
                ) : (
                  <ChevronDown className="h-5 w-5" />
                )}
              </div>
            </div>
          </CardHeader>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <CardContent className="pt-0 space-y-4">
            {/* Filters and Search */}
            <div className="flex flex-wrap gap-3 pb-4 border-b">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por nombre..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9"
                />
              </div>

              <Select value={regionFilter} onValueChange={setRegionFilter}>
                <SelectTrigger className="w-[180px]">
                  <Filter className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="Región" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas las regiones</SelectItem>
                  {regions.map((region) => (
                    <SelectItem key={region} value={region}>
                      {region}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <div className="flex gap-1">
                <Button
                  variant={sortField === "date" ? "default" : "outline"}
                  size="sm"
                  onClick={() => toggleSort("date")}
                  className="gap-1"
                >
                  Fecha
                  <ArrowUpDown className="h-3 w-3" />
                </Button>
                <Button
                  variant={sortField === "name" ? "default" : "outline"}
                  size="sm"
                  onClick={() => toggleSort("name")}
                  className="gap-1"
                >
                  Nombre
                  <ArrowUpDown className="h-3 w-3" />
                </Button>
                <Button
                  variant={sortField === "region" ? "default" : "outline"}
                  size="sm"
                  onClick={() => toggleSort("region")}
                  className="gap-1"
                >
                  Región
                  <ArrowUpDown className="h-3 w-3" />
                </Button>
              </div>
            </div>

            {/* Legend */}
            <div className="flex gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-red-500" />
                Urgente (&lt;15 días, enviada)
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-yellow-500" />
                Alerta enviada
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-green-500" />
                Sin urgencia
              </span>
            </div>

            {/* Alerts List */}
            {loading ? (
              <div className="text-center py-8 text-muted-foreground">
                Cargando alertas...
              </div>
            ) : filteredAndSortedAlerts.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No hay alertas que coincidan con los filtros
              </div>
            ) : (
              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                {filteredAndSortedAlerts.map((alert) => {
                  const status = getAlertStatus(alert);
                  const daysUntilDue = differenceInDays(
                    parseISO(alert.due_date),
                    new Date()
                  );
                  const region = alert.contracts?.contract_addresses?.[0]?.region;

                  return (
                    <div
                      key={alert.id}
                      className="flex items-center gap-3 p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
                    >
                      {/* Status Indicator */}
                      <div
                        className={`w-3 h-3 rounded-full flex-shrink-0 ${getStatusColor(status)}`}
                        title={getStatusLabel(status)}
                      />

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium truncate">{alert.title}</span>
                        </div>
                        {alert.contracts?.name && (
                          <p className="text-sm text-muted-foreground truncate">
                            {alert.contracts.name}
                            {region && ` • ${region}`}
                          </p>
                        )}
                      </div>

                      {/* Date */}
                      <div className="text-right flex-shrink-0">
                        <p className="text-sm font-medium">
                          {format(parseISO(alert.due_date), "dd MMM yyyy", {
                            locale: es,
                          })}
                        </p>
                        <p
                          className={`text-xs ${
                            daysUntilDue < 0
                              ? "text-destructive"
                              : daysUntilDue < 15
                              ? "text-amber-600"
                              : "text-muted-foreground"
                          }`}
                        >
                          {daysUntilDue < 0
                            ? `Vencido hace ${Math.abs(daysUntilDue)} días`
                            : daysUntilDue === 0
                            ? "Vence hoy"
                            : `En ${daysUntilDue} días`}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
