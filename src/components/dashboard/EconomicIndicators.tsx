import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { DollarSign, TrendingUp, Calendar } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

interface IndicatorData {
  uf: {
    current: number;
    next10Days: { date: string; value: number }[];
    date: string;
  };
  dollar: {
    current: number;
    sixMonths: { date: string; value: number }[];
    oneYear: { date: string; value: number }[];
    date: string;
  };
}

export const EconomicIndicators = () => {
  const [data, setData] = useState<IndicatorData | null>(null);
  const [loading, setLoading] = useState(true);
  const [dollarPeriod, setDollarPeriod] = useState<"6m" | "1y">("6m");

  useEffect(() => {
    fetchIndicators();
  }, []);

  const fetchIndicators = async () => {
    try {
      const { data: response, error } = await supabase.functions.invoke("economic-indicators");
      if (error) throw error;
      setData(response);
    } catch (error) {
      console.error("Error fetching indicators:", error);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value: number, currency: "CLP" | "UF" = "CLP") => {
    if (currency === "UF") {
      return `UF ${value.toLocaleString("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    return new Intl.NumberFormat("es-CL", {
      style: "currency",
      currency: "CLP",
      maximumFractionDigits: 0,
    }).format(value);
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("es-CL", { day: "2-digit", month: "short" });
  };

  const dollarChartData = dollarPeriod === "6m" ? data?.dollar.sixMonths || [] : data?.dollar.oneYear || [];

  // Calculate statistics for selected period
  const calculateStats = (dataArray: { date: string; value: number }[]) => {
    if (!dataArray || dataArray.length === 0) return null;
    
    const values = dataArray.map(d => d.value);
    const max = Math.max(...values);
    const min = Math.min(...values);
    const avg = values.reduce((sum, v) => sum + v, 0) / values.length;
    
    // Calculate median
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    const median = sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    
    return { max, min, avg, median };
  };

  const dollarStats = calculateStats(dollarChartData);

  // Sample every nth point for cleaner chart
  const sampleData = (arr: any[], maxPoints: number) => {
    if (arr.length <= maxPoints) return arr;
    const step = Math.ceil(arr.length / maxPoints);
    return arr.filter((_, i) => i % step === 0);
  };

  if (loading) {
    return (
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="animate-pulse">
          <CardHeader className="pb-2">
            <div className="h-4 bg-muted rounded w-1/3"></div>
          </CardHeader>
          <CardContent>
            <div className="h-8 bg-muted rounded w-1/2 mb-4"></div>
            <div className="h-32 bg-muted rounded"></div>
          </CardContent>
        </Card>
        <Card className="animate-pulse">
          <CardHeader className="pb-2">
            <div className="h-4 bg-muted rounded w-1/3"></div>
          </CardHeader>
          <CardContent>
            <div className="h-8 bg-muted rounded w-1/2 mb-4"></div>
            <div className="h-32 bg-muted rounded"></div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {/* UF Card */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 py-2 px-4">
          <CardTitle className="text-sm font-medium">Valor UF</CardTitle>
          <Calendar className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent className="pt-0 px-4 pb-3">
          <div className="flex items-baseline gap-3 mb-2">
            <span className="text-xl font-bold text-primary">
              {data?.uf.current ? formatCurrency(data.uf.current) : "-"}
            </span>
            <span className="text-xs text-muted-foreground">Últimos 10 días</span>
          </div>
          <div className="grid grid-cols-5 gap-1">
            {data?.uf.next10Days.slice(0, 10).map((item, idx) => (
              <div key={idx} className="text-center py-1 px-0.5 bg-muted/50 rounded text-xs">
                <div className="text-muted-foreground text-[10px]">{formatDate(item.date)}</div>
                <div className="font-medium text-[11px]">{item.value.toLocaleString("es-CL", { maximumFractionDigits: 0 })}</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Dollar Card */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 py-2 px-4">
          <div className="flex items-center gap-3">
            <CardTitle className="text-sm font-medium">Valor Dólar</CardTitle>
            <span className="text-xl font-bold text-green-600">
              {data?.dollar.current ? formatCurrency(data.dollar.current) : "-"}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Tabs value={dollarPeriod} onValueChange={(v) => setDollarPeriod(v as "6m" | "1y")}>
              <TabsList className="h-7">
                <TabsTrigger value="6m" className="text-xs px-2 py-1">6 meses</TabsTrigger>
                <TabsTrigger value="1y" className="text-xs px-2 py-1">1 año</TabsTrigger>
              </TabsList>
            </Tabs>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </div>
        </CardHeader>
        <CardContent className="pt-0 px-4 pb-3">
          <div className="h-20">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={sampleData(dollarChartData, 30)} key={dollarPeriod}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 9 }}
                  tickFormatter={formatDate}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tick={{ fontSize: 9 }}
                  domain={["dataMin - 10", "dataMax + 10"]}
                  tickFormatter={(v) => `$${Math.round(v)}`}
                  width={40}
                />
                <Tooltip
                  formatter={(value: number) => [formatCurrency(value), "Dólar"]}
                  labelFormatter={formatDate}
                />
                <Line type="monotone" dataKey="value" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          {dollarStats && (
            <div className="grid grid-cols-4 gap-2 mt-2 pt-2 border-t">
              <div className="text-center">
                <p className="text-[10px] text-muted-foreground">Máximo</p>
                <p className="text-xs font-semibold text-red-600">{formatCurrency(dollarStats.max)}</p>
              </div>
              <div className="text-center">
                <p className="text-[10px] text-muted-foreground">Mínimo</p>
                <p className="text-xs font-semibold text-green-600">{formatCurrency(dollarStats.min)}</p>
              </div>
              <div className="text-center">
                <p className="text-[10px] text-muted-foreground">Mediana</p>
                <p className="text-xs font-semibold">{formatCurrency(dollarStats.median)}</p>
              </div>
              <div className="text-center">
                <p className="text-[10px] text-muted-foreground">Promedio</p>
                <p className="text-xs font-semibold">{formatCurrency(dollarStats.avg)}</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
