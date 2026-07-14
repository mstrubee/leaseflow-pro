import { useState, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Download, TrendingUp } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { GanttTask } from "@/hooks/useGantt";
import { useCurvaSData } from "@/hooks/useCurvaSData";
import { exportCurvaSPDF } from "./exportCurvaSPDF";

interface Props {
  tasks: GanttTask[];
  contractName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const ALL = "__all__";

/**
 * Modal de la Curva S: gráfico de avance programado (azul) vs. real
 * (naranja), acumulado por semana, con filtro opcional por una rama del
 * cronograma (una tarea padre y sus hojas descendientes). Ver
 * useCurvaSData.ts para el detalle de cómo se calcula cada línea.
 */
export function GanttCurvaS({ tasks, contractName, open, onOpenChange }: Props) {
  const [filterParentId, setFilterParentId] = useState<string | null>(null);

  // Opciones del dropdown: solo tareas que tienen al menos una hija (las
  // hojas no tiene sentido "filtrar por sí mismas" ya que ya son el nivel
  // más chico del cronograma).
  const parentOptions = useMemo(() => {
    const parentIds = new Set(tasks.filter((t) => t.parent_id).map((t) => t.parent_id!));
    return tasks
      .filter((t) => parentIds.has(t.id))
      .map((t) => ({ id: t.id, name: t.name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [tasks]);

  const data = useCurvaSData(tasks, filterParentId);
  const filterLabel = filterParentId
    ? parentOptions.find((p) => p.id === filterParentId)?.name || "Proyecto Completo"
    : "Proyecto Completo";

  const handleDownload = () => {
    exportCurvaSPDF({ contractName, filterLabel, points: data.points });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-blue-500" />
            Curva S — {contractName}
          </DialogTitle>
          <DialogDescription>
            Avance programado (azul) vs. avance real (naranja), acumulado por semana.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <Label className="text-xs">Filtrar por</Label>
          <Select value={filterParentId ?? ALL} onValueChange={(v) => setFilterParentId(v === ALL ? null : v)}>
            <SelectTrigger className="h-8 text-xs w-full sm:w-72">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Proyecto Completo</SelectItem>
              {parentOptions.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {data.isEmpty ? (
          <p className="text-sm text-muted-foreground text-center py-16">
            No hay tareas en este cronograma para generar la Curva S.
          </p>
        ) : (
          <>
            <div
              role="img"
              aria-label="Gráfico de líneas mostrando avance programado vs avance real acumulado por semana"
            >
              <ResponsiveContainer width="100%" height={380}>
                <LineChart data={data.points} margin={{ top: 10, right: 16, left: 0, bottom: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="weekLabel" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                  <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 10 }} />
                  <Tooltip
                    formatter={(value: number, name: string) => [`${value}%`, name === "scheduledProgress" ? "Programado" : "Real"]}
                    labelFormatter={(label) => `Semana ${label}`}
                  />
                  <Legend formatter={(value) => (value === "scheduledProgress" ? "Avance Programado" : "Avance Real")} />
                  <Line type="monotone" dataKey="scheduledProgress" stroke="#2563eb" strokeWidth={2} dot={false} name="scheduledProgress" />
                  <Line type="monotone" dataKey="actualProgress" stroke="#f97316" strokeWidth={2} dot={false} name="actualProgress" />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <p className="text-xs text-muted-foreground text-center">
              Hoy: Programado {data.todayScheduled.toFixed(1)}% · Real {data.todayActual.toFixed(1)}%
            </p>
          </>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cerrar</Button>
          <Button onClick={handleDownload} disabled={data.isEmpty} className="gap-2">
            <Download className="h-4 w-4" />
            Descargar PDF
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
