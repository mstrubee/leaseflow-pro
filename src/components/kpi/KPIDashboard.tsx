import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from "recharts";
import { TrendingUp, TrendingDown, Minus, Target, Activity, AlertTriangle, CheckCircle, Download } from "lucide-react";
import { KPI, KPICategory, KPIMeasurement } from "@/hooks/useKPI";
import { generateDashboardPDF } from "./KPIPDFExport";

interface KPIDashboardProps {
  kpis: KPI[];
  categories: KPICategory[];
  measurements: KPIMeasurement[];
  getKPIStatus: (kpi: KPI, value: number) => "green" | "yellow" | "red" | "unknown";
}

export function KPIDashboard({
  kpis,
  categories,
  measurements,
  getKPIStatus,
}: KPIDashboardProps) {
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [periodFilter, setPeriodFilter] = useState<string>("current");

  const activeKPIs = useMemo(() => {
    return kpis.filter((kpi) => {
      const matchesCategory = categoryFilter === "all" || kpi.category_id === categoryFilter;
      return kpi.is_active && matchesCategory;
    });
  }, [kpis, categoryFilter]);

  const kpiWithLatestValue = useMemo(() => {
    return activeKPIs.map((kpi) => {
      const kpiMeasurements = measurements
        .filter((m) => m.kpi_id === kpi.id)
        .sort((a, b) => new Date(b.period_end).getTime() - new Date(a.period_end).getTime());
      
      const latestMeasurement = kpiMeasurements[0];
      const previousMeasurement = kpiMeasurements[1];
      
      const currentValue = latestMeasurement?.value ?? null;
      const previousValue = previousMeasurement?.value ?? null;
      
      let trend: "up" | "down" | "stable" | null = null;
      if (currentValue != null && previousValue != null) {
        if (currentValue > previousValue) trend = "up";
        else if (currentValue < previousValue) trend = "down";
        else trend = "stable";
      }

      const status = currentValue != null ? getKPIStatus(kpi, currentValue) : "unknown";
      
      return {
        ...kpi,
        currentValue,
        previousValue,
        trend,
        status,
        measurements: kpiMeasurements,
      };
    });
  }, [activeKPIs, measurements, getKPIStatus]);

  const summaryStats = useMemo(() => {
    const withStatus = kpiWithLatestValue.filter((k) => k.status !== "unknown");
    return {
      total: kpiWithLatestValue.length,
      green: withStatus.filter((k) => k.status === "green").length,
      yellow: withStatus.filter((k) => k.status === "yellow").length,
      red: withStatus.filter((k) => k.status === "red").length,
      noData: kpiWithLatestValue.filter((k) => k.status === "unknown").length,
    };
  }, [kpiWithLatestValue]);

  const categoryStats = useMemo(() => {
    return categories
      .filter((c) => c.is_active)
      .map((cat) => {
        const catKPIs = kpiWithLatestValue.filter((k) => k.category_id === cat.id);
        const withStatus = catKPIs.filter((k) => k.status !== "unknown");
        return {
          ...cat,
          total: catKPIs.length,
          green: withStatus.filter((k) => k.status === "green").length,
          yellow: withStatus.filter((k) => k.status === "yellow").length,
          red: withStatus.filter((k) => k.status === "red").length,
        };
      })
      .filter((c) => c.total > 0);
  }, [categories, kpiWithLatestValue]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case "green": return "hsl(var(--chart-2))";
      case "yellow": return "hsl(45, 93%, 47%)";
      case "red": return "hsl(var(--destructive))";
      default: return "hsl(var(--muted-foreground))";
    }
  };

  const getTrendIcon = (trend: "up" | "down" | "stable" | null) => {
    switch (trend) {
      case "up": return <TrendingUp className="h-4 w-4 text-green-600" />;
      case "down": return <TrendingDown className="h-4 w-4 text-red-600" />;
      case "stable": return <Minus className="h-4 w-4 text-muted-foreground" />;
      default: return null;
    }
  };

  const handleDownloadPDF = () => {
    generateDashboardPDF(kpiWithLatestValue, categories, summaryStats);
  };

  return (
    <div className="space-y-6">
      {/* Filters and Actions */}
      <div className="flex gap-4 items-center justify-between">
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-64">
            <SelectValue placeholder="Categoría" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas las categorías</SelectItem>
            {categories.filter((c) => c.is_active).map((cat) => (
              <SelectItem key={cat.id} value={cat.id}>
                {cat.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="outline" onClick={handleDownloadPDF} className="gap-2">
          <Download className="h-4 w-4" />
          Descargar PDF
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-primary" />
              <div>
                <p className="text-2xl font-bold">{summaryStats.total}</p>
                <p className="text-xs text-muted-foreground">KPIs Activos</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-600" />
              <div>
                <p className="text-2xl font-bold text-green-600">{summaryStats.green}</p>
                <p className="text-xs text-muted-foreground">En Meta</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-yellow-600" />
              <div>
                <p className="text-2xl font-bold text-yellow-600">{summaryStats.yellow}</p>
                <p className="text-xs text-muted-foreground">En Riesgo</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-600" />
              <div>
                <p className="text-2xl font-bold text-red-600">{summaryStats.red}</p>
                <p className="text-xs text-muted-foreground">Crítico</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Target className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-2xl font-bold">{summaryStats.noData}</p>
                <p className="text-xs text-muted-foreground">Sin Datos</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Category Overview */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Estado por Categoría</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={categoryStats} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" />
                <YAxis dataKey="name" type="category" width={200} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="green" stackId="a" fill="hsl(var(--chart-2))" name="En Meta" />
                <Bar dataKey="yellow" stackId="a" fill="hsl(45, 93%, 47%)" name="En Riesgo" />
                <Bar dataKey="red" stackId="a" fill="hsl(var(--destructive))" name="Crítico" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {kpiWithLatestValue.map((kpi) => (
          <Card key={kpi.id} className="relative overflow-hidden">
            <div
              className="absolute top-0 left-0 w-1 h-full"
              style={{ backgroundColor: getStatusColor(kpi.status) }}
            />
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle className="text-sm font-medium">{kpi.name}</CardTitle>
                  <Badge variant="outline" className="mt-1 text-xs">
                    {kpi.category?.name}
                  </Badge>
                </div>
                {getTrendIcon(kpi.trend)}
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex items-end justify-between">
                  <div>
                    <p className="text-3xl font-bold">
                      {kpi.currentValue != null ? kpi.currentValue.toLocaleString() : "-"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {kpi.unit || "unidades"}
                    </p>
                  </div>
                  {kpi.goal_value != null && (
                    <div className="text-right">
                      <p className="text-sm text-muted-foreground">Meta</p>
                      <p className="font-medium">{kpi.goal_value.toLocaleString()}</p>
                    </div>
                  )}
                </div>

                {kpi.goal_value != null && kpi.currentValue != null && (
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span>Avance</span>
                      <span>{Math.round((kpi.currentValue / kpi.goal_value) * 100)}%</span>
                    </div>
                    <Progress
                      value={Math.min(100, (kpi.currentValue / kpi.goal_value) * 100)}
                      className="h-2"
                    />
                  </div>
                )}

                {kpi.measurements.length > 1 && (
                  <div className="h-16 mt-2">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={kpi.measurements.slice(0, 6).reverse()}>
                        <Line
                          type="monotone"
                          dataKey="value"
                          stroke={getStatusColor(kpi.status)}
                          strokeWidth={2}
                          dot={false}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {kpiWithLatestValue.length === 0 && (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            <Activity className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No hay KPIs activos para mostrar.</p>
            <p className="text-sm">Cree KPIs en la pestaña de Configuración.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
