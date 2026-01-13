import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import { Plus, TrendingUp } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { KPI, KPIMeasurement } from "@/hooks/useKPI";
import { supabase } from "@/integrations/supabase/client";

interface KPIMeasurementsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kpi: KPI | null;
  onCreateMeasurement: (data: Partial<KPIMeasurement>) => Promise<KPIMeasurement>;
}

export function KPIMeasurementsDialog({
  open,
  onOpenChange,
  kpi,
  onCreateMeasurement,
}: KPIMeasurementsDialogProps) {
  const [measurements, setMeasurements] = useState<KPIMeasurement[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newMeasurement, setNewMeasurement] = useState({
    period_start: "",
    period_end: "",
    value: "",
    notes: "",
  });

  useEffect(() => {
    if (open && kpi) {
      loadMeasurements();
    }
  }, [open, kpi]);

  const loadMeasurements = async () => {
    if (!kpi) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("kpi_measurements")
        .select("*")
        .eq("kpi_id", kpi.id)
        .order("period_end", { ascending: false });

      if (error) throw error;
      setMeasurements(data || []);
    } catch (error) {
      console.error("Error loading measurements:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddMeasurement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!kpi) return;

    try {
      const newRecord = await onCreateMeasurement({
        kpi_id: kpi.id,
        period_start: newMeasurement.period_start,
        period_end: newMeasurement.period_end,
        value: parseFloat(newMeasurement.value),
        notes: newMeasurement.notes || null,
      });
      
      setMeasurements((prev) => [newRecord, ...prev]);
      setNewMeasurement({ period_start: "", period_end: "", value: "", notes: "" });
      setShowAddForm(false);
    } catch (error) {
      console.error("Error adding measurement:", error);
    }
  };

  const chartData = [...measurements]
    .reverse()
    .map((m) => ({
      date: format(new Date(m.period_end), "MMM yy", { locale: es }),
      value: m.value,
    }));

  if (!kpi) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Mediciones: {kpi.name}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Chart */}
          {chartData.length > 0 && (
            <Card>
              <CardHeader className="py-3">
                <CardTitle className="text-sm">Tendencia Histórica</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                      <YAxis tick={{ fontSize: 12 }} />
                      <Tooltip />
                      <Line
                        type="monotone"
                        dataKey="value"
                        stroke="hsl(var(--primary))"
                        strokeWidth={2}
                        dot={{ fill: "hsl(var(--primary))" }}
                      />
                      {kpi.goal_value != null && (
                        <ReferenceLine
                          y={kpi.goal_value}
                          stroke="hsl(var(--chart-2))"
                          strokeDasharray="5 5"
                          label={{ value: "Meta", position: "right", fontSize: 12 }}
                        />
                      )}
                      {kpi.threshold_yellow != null && (
                        <ReferenceLine
                          y={kpi.threshold_yellow}
                          stroke="hsl(45, 93%, 47%)"
                          strokeDasharray="3 3"
                        />
                      )}
                      {kpi.threshold_red != null && (
                        <ReferenceLine
                          y={kpi.threshold_red}
                          stroke="hsl(var(--destructive))"
                          strokeDasharray="3 3"
                        />
                      )}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Add Measurement Form */}
          <div>
            {!showAddForm ? (
              <Button onClick={() => setShowAddForm(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Nueva Medición
              </Button>
            ) : (
              <Card>
                <CardContent className="pt-4">
                  <form onSubmit={handleAddMeasurement} className="space-y-4">
                    <div className="grid grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <Label>Inicio del Período</Label>
                        <Input
                          type="date"
                          value={newMeasurement.period_start}
                          onChange={(e) =>
                            setNewMeasurement({ ...newMeasurement, period_start: e.target.value })
                          }
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Fin del Período</Label>
                        <Input
                          type="date"
                          value={newMeasurement.period_end}
                          onChange={(e) =>
                            setNewMeasurement({ ...newMeasurement, period_end: e.target.value })
                          }
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Valor ({kpi.unit || "unidades"})</Label>
                        <Input
                          type="number"
                          step="any"
                          value={newMeasurement.value}
                          onChange={(e) =>
                            setNewMeasurement({ ...newMeasurement, value: e.target.value })
                          }
                          required
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Notas (opcional)</Label>
                      <Textarea
                        value={newMeasurement.notes}
                        onChange={(e) =>
                          setNewMeasurement({ ...newMeasurement, notes: e.target.value })
                        }
                        rows={2}
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button type="submit">Guardar Medición</Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setShowAddForm(false)}
                      >
                        Cancelar
                      </Button>
                    </div>
                  </form>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Measurements Table */}
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm">Historial de Mediciones</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Período</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    <TableHead>Notas</TableHead>
                    <TableHead>Registrado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {measurements.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell>
                        {format(new Date(m.period_start), "dd/MM/yyyy")} -{" "}
                        {format(new Date(m.period_end), "dd/MM/yyyy")}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {m.value.toLocaleString()} {kpi.unit || ""}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {m.notes || "-"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {format(new Date(m.created_at), "dd/MM/yyyy HH:mm")}
                      </TableCell>
                    </TableRow>
                  ))}
                  {measurements.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                        No hay mediciones registradas para este KPI
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      </DialogContent>
    </Dialog>
  );
}
