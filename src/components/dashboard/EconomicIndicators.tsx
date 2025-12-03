import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { DollarSign, TrendingUp, Calendar } from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

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
      const { data: response, error } = await supabase.functions.invoke('economic-indicators');
      if (error) throw error;
      setData(response);
    } catch (error) {
      console.error('Error fetching indicators:', error);
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

  const dollarChartData = dollarPeriod === "6m" 
    ? data?.dollar.sixMonths || []
    : data?.dollar.oneYear || [];

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
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Valor UF</CardTitle>
          <Calendar className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-primary mb-4">
            {data?.uf.current ? formatCurrency(data.uf.current) : "-"}
          </div>
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground font-medium">Últimos 10 días</p>
            <div className="grid grid-cols-5 gap-1">
              {data?.uf.next10Days.slice(0, 10).map((item, idx) => (
                <div
                  key={idx}
                  className="text-center p-1 bg-muted/50 rounded text-xs"
                >
                  <div className="text-muted-foreground">{formatDate(item.date)}</div>
                  <div className="font-medium">{item.value.toLocaleString("es-CL", { maximumFractionDigits: 0 })}</div>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Dollar Card */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Valor Dólar</CardTitle>
          <DollarSign className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-green-600 mb-4">
            {data?.dollar.current ? formatCurrency(data.dollar.current) : "-"}
          </div>
          <Tabs value={dollarPeriod} onValueChange={(v) => setDollarPeriod(v as "6m" | "1y")}>
            <TabsList className="h-8 mb-2">
              <TabsTrigger value="6m" className="text-xs">6 meses</TabsTrigger>
              <TabsTrigger value="1y" className="text-xs">1 año</TabsTrigger>
            </TabsList>
            <div className="h-32 mt-2">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={sampleData(dollarChartData, 30)} key={dollarPeriod}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis 
                    dataKey="date" 
                    tick={{ fontSize: 10 }} 
                    tickFormatter={formatDate}
                    interval="preserveStartEnd"
                  />
                  <YAxis 
                    tick={{ fontSize: 10 }} 
                    domain={['dataMin - 10', 'dataMax + 10']}
                    tickFormatter={(v) => `$${Math.round(v)}`}
                    width={50}
                  />
                  <Tooltip 
                    formatter={(value: number) => [formatCurrency(value), "Dólar"]}
                    labelFormatter={formatDate}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="value" 
                    stroke="hsl(var(--primary))" 
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
};
