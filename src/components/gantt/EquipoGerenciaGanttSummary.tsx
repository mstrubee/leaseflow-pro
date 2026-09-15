import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, ExternalLink } from "lucide-react";
import { useReportsNavigation } from "@/components/reports/ReportsReturnButton";

interface ContractGanttSummary {
  contractId: string;
  contractName: string;
  timelineName: string;
  totalTasks: number;
  completedTasks: number;
  startDate: string | null;
  endDate: string | null;
}

// Vista de solo lectura de "Cartas Gantt" para equipo_gerencia. El reporte
// completo (GanttReportsSection) arranca desde contract_budgets y cruza
// company/address/custom-fields -- todas tablas bloqueadas por RLS para este
// rol (Fase 1), así que para ellos siempre saldría vacío. Esta vista usa
// exclusivamente `contracts` y `gantt_timelines`/`gantt_tasks`, que sí puede
// leer (RLS ya restringe estas dos últimas al cronograma principal).
export function EquipoGerenciaGanttSummary() {
  const [items, setItems] = useState<ContractGanttSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const { navigateToContractFromReports } = useReportsNavigation();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data: timelines } = await supabase
        .from("gantt_timelines")
        .select("id, name, contract_id")
        .eq("category", "general");
      if (cancelled) return;
      if (!timelines || timelines.length === 0) {
        setItems([]);
        setLoading(false);
        return;
      }

      const timelineIds = timelines.map((t) => t.id);
      const contractIds = Array.from(new Set(timelines.map((t) => t.contract_id).filter(Boolean))) as string[];

      const [{ data: contracts }, { data: tasks }] = await Promise.all([
        supabase.from("contracts").select("id, name, deleted_at").in("id", contractIds),
        supabase.from("gantt_tasks").select("timeline_id, status, start_date, end_date").in("timeline_id", timelineIds),
      ]);
      if (cancelled) return;

      const contractById = new Map((contracts || []).filter((c: any) => !c.deleted_at).map((c: any) => [c.id, c]));

      const result: ContractGanttSummary[] = timelines
        .filter((t) => t.contract_id && contractById.has(t.contract_id))
        .map((t) => {
          const timelineTasks = (tasks || []).filter((task: any) => task.timeline_id === t.id);
          const dates = timelineTasks.flatMap((task: any) => [task.start_date, task.end_date]).filter(Boolean) as string[];
          return {
            contractId: t.contract_id as string,
            contractName: contractById.get(t.contract_id as string)?.name || "",
            timelineName: t.name,
            totalTasks: timelineTasks.length,
            completedTasks: timelineTasks.filter((task: any) => task.status === "completed").length,
            startDate: dates.length ? dates.reduce((a, b) => (a < b ? a : b)) : null,
            endDate: dates.length ? dates.reduce((a, b) => (a > b ? a : b)) : null,
          };
        })
        .sort((a, b) => a.contractName.localeCompare(b.contractName));

      setItems(result);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle className="text-base">Cartas Gantt - Cronograma Principal</CardTitle>
        <CardDescription>Solo lectura. Un elemento por proyecto, con su cronograma principal.</CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">No hay cronogramas disponibles.</p>
        ) : (
          <div className="space-y-2">
            {items.map((item) => (
              <div key={item.contractId} className="flex items-center justify-between rounded-md border p-3">
                <div>
                  <p className="font-medium text-sm">{item.contractName}</p>
                  <p className="text-xs text-muted-foreground">
                    {item.completedTasks}/{item.totalTasks} tareas completadas
                    {item.startDate && item.endDate && <> · {item.startDate} a {item.endDate}</>}
                  </p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => navigateToContractFromReports(item.contractId, "gantt")}>
                  <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                  Ver cronograma
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
