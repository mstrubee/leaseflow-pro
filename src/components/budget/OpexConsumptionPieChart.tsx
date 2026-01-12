import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from "recharts";
import { Loader2 } from "lucide-react";

interface OpexConsumptionPieChartProps {
  contractId: string;
  year: number;
}

interface CategoryData {
  name: string;
  value: number;
  color: string;
}

const COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
  "#8884d8",
  "#82ca9d",
  "#ffc658",
  "#ff7300",
  "#00C49F",
  "#FFBB28",
  "#FF8042",
];

export const OpexConsumptionPieChart = ({ contractId, year }: OpexConsumptionPieChartProps) => {
  const [data, setData] = useState<CategoryData[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalAmount, setTotalAmount] = useState(0);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        // Get OPEX purchase orders for this contract and year, grouped by category
        const { data: orders, error } = await supabase
          .from("purchase_orders")
          .select(`
            amount_uf,
            opex_category_id,
            opex_categories!purchase_orders_opex_category_id_fkey(name),
            budget_lines!purchase_orders_budget_line_id_fkey(name)
          `)
          .eq("contract_id", contractId)
          .eq("year", year)
          .is("deleted_at", null)
          .not("opex_category_id", "is", null);

        if (error) throw error;

        // Group by category
        const categoryMap = new Map<string, number>();
        let total = 0;

        orders?.forEach((order: any) => {
          const categoryName = order.opex_categories?.name || order.budget_lines?.name || "Sin categoría";
          const amount = order.amount_uf || 0;
          categoryMap.set(categoryName, (categoryMap.get(categoryName) || 0) + amount);
          total += amount;
        });

        // Convert to array for chart
        const chartData: CategoryData[] = Array.from(categoryMap.entries())
          .map(([name, value], index) => ({
            name,
            value,
            color: COLORS[index % COLORS.length],
          }))
          .sort((a, b) => b.value - a.value);

        setData(chartData);
        setTotalAmount(total);
      } catch (error) {
        console.error("Error loading OPEX consumption data:", error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [contractId, year]);

  const formatUF = (value: number) => {
    return `${value.toLocaleString("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} UF`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <p>No hay consumo OPEX registrado para el año {year}</p>
        <p className="text-sm mt-2">El presupuesto OPEX se gestiona desde el Dashboard OPEX.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="text-center">
        <p className="text-sm text-muted-foreground">Consumo Total OPEX {year}</p>
        <p className="text-2xl font-bold text-primary">{formatUF(totalAmount)}</p>
      </div>
      
      <div className="h-[300px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={100}
              paddingAngle={2}
              dataKey="value"
              nameKey="name"
              label={({ name, percent }) => 
                percent > 0.05 ? `${(percent * 100).toFixed(0)}%` : ""
              }
              labelLine={false}
            >
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip 
              formatter={(value: number) => formatUF(value)}
              contentStyle={{
                backgroundColor: "hsl(var(--popover))",
                border: "1px solid hsl(var(--border))",
                borderRadius: "8px",
              }}
            />
            <Legend 
              layout="vertical"
              align="right"
              verticalAlign="middle"
              formatter={(value, entry: any) => (
                <span className="text-xs text-foreground">
                  {value}: {formatUF(entry.payload.value)}
                </span>
              )}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
