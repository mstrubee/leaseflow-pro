import { useMemo, useState } from "react";
import {
  addMonths,
  differenceInCalendarDays,
  eachMonthOfInterval,
  endOfMonth,
  format,
  isSameMonth,
  parseISO,
  startOfMonth,
  startOfDay,
} from "date-fns";
import { es } from "date-fns/locale";
import { CalendarRange, Plus, CalendarPlus, Trash2, Minimize2, Maximize2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface TimelineProject {
  contractId: string;
  contractName: string;
  companyNames: string[];
  endDate: string;
  capexUF: number;
  /** Color configurado del estado en Admin (uno de PROGRESS_COLOR_OPTIONS) -- null si no tiene. */
  overviewStatusColor: string | null;
}

export interface GanttOverviewBudgetItem {
  id: string;
  name: string;
  date: string;
}

// Variante "clara" (borde+fondo suave) de la paleta de PROGRESS_COLOR_OPTIONS,
// para los chips de esta línea de tiempo -- el rojo queda reservado para
// "vencido" (por fecha) y para los ítems de Presupuesto, independiente del
// color del estado.
const LIGHT_COLOR_CLASSES: Record<string, string> = {
  red: "bg-red-50 border-red-200 text-red-700",
  yellow: "bg-yellow-50 border-yellow-200 text-yellow-700",
  blue: "bg-blue-50 border-blue-200 text-blue-700",
  green: "bg-green-50 border-green-200 text-green-700",
  purple: "bg-purple-50 border-purple-200 text-purple-700",
  orange: "bg-orange-50 border-orange-200 text-orange-700",
  gray: "bg-gray-50 border-gray-200 text-gray-700",
};
const getLightColorClass = (color: string | null) => LIGHT_COLOR_CLASSES[color ?? ""] ?? LIGHT_COLOR_CLASSES.blue;

const BUDGET_ITEM_CLASS = "bg-red-100 border-red-400 text-red-800 font-medium";

const MONTHS_PER_YEAR = 12;

interface GanttOverviewTimelineProps {
  projects: TimelineProject[];
  onSelect: (contractId: string) => void;
  budgetItems: GanttOverviewBudgetItem[];
  /** Se llama después de crear/editar/eliminar un ítem para que el padre recargue la lista. */
  onBudgetItemsChange: () => void;
}

/**
 * Línea de tiempo horizontal con las fechas de término de cada proyecto con
 * carta Gantt cargada, más ítems de "Presupuesto" agregados a mano (en rojo).
 * Ventana de 12 meses SIN scroll (desde el 1° del mes anterior al actual),
 * que se puede extender de a un año con el botón "Extender" -- a partir de
 * ahí, y solo ahí, aparece scroll horizontal (cada mes mantiene el mismo
 * ancho que tenía con la vista base de 12 meses).
 */
export function GanttOverviewTimeline({
  projects,
  onSelect,
  budgetItems,
  onBudgetItemsChange,
}: GanttOverviewTimelineProps) {
  const today = startOfDay(new Date());
  const baseStart = useMemo(() => startOfMonth(addMonths(today, -1)), [today]);
  const baseEnd = useMemo(() => endOfMonth(addMonths(baseStart, MONTHS_PER_YEAR - 1)), [baseStart]);

  // Fecha hasta la que se extendió el calendario (null = sin extensión
  // todavía). "compacted" alterna entre mostrar los 12 meses base o el rango
  // extendido completo, sin perder la extensión ya elegida.
  const [extendedUntil, setExtendedUntil] = useState<Date | null>(null);
  const [compacted, setCompacted] = useState(false);

  const [extendDialogOpen, setExtendDialogOpen] = useState(false);
  const [extendDate, setExtendDate] = useState("");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<GanttOverviewBudgetItem | null>(null);
  const [formName, setFormName] = useState("");
  const [formDate, setFormDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const { rangeStart, rangeEnd, months, todayPct, innerWidthPct } = useMemo(() => {
    const start = baseStart;
    const fullEnd = extendedUntil && extendedUntil > baseEnd ? endOfMonth(extendedUntil) : baseEnd;
    const end = compacted ? baseEnd : fullEnd;
    const totalDays = differenceInCalendarDays(end, start) + 1;
    const months = eachMonthOfInterval({ start, end }).map((m) => {
      const monthStart = m < start ? start : startOfMonth(m);
      const monthEnd = endOfMonth(m) > end ? end : endOfMonth(m);
      const days = differenceInCalendarDays(monthEnd, monthStart) + 1;
      return { date: m, widthPct: (days / totalDays) * 100 };
    });
    const todayPct = (differenceInCalendarDays(today, start) / totalDays) * 100;
    // El contenedor interno mide (totalDays/díasBase) * 100% del ancho
    // visible -- con los 12 meses base da exactamente 100% (sin scroll);
    // cada mes adicional agrega proporcionalmente más ancho al interior, así
    // que el tamaño de cada mes en pantalla se mantiene constante y recién
    // ahí aparece scroll.
    const baseDays = differenceInCalendarDays(baseEnd, baseStart) + 1;
    const innerWidthPct = (totalDays / baseDays) * 100;
    return { rangeStart: start, rangeEnd: end, months, todayPct, innerWidthPct };
  }, [baseStart, baseEnd, extendedUntil, compacted, today]);

  const openExtendDialog = () => {
    setExtendDate(format(addMonths(extendedUntil ?? baseEnd, 1), "yyyy-MM-dd"));
    setExtendDialogOpen(true);
  };

  const handleExtend = () => {
    if (!extendDate) return;
    const target = parseISO(extendDate);
    if (target <= baseEnd) {
      toast.error("La fecha debe ser posterior al rango de 12 meses actual");
      return;
    }
    setExtendedUntil((prev) => (prev && prev > target ? prev : target));
    setCompacted(false);
    setExtendDialogOpen(false);
  };

  const { inRange, before, after } = useMemo(() => {
    const inRange: TimelineProject[] = [];
    let before = 0;
    let after = 0;
    for (const p of projects) {
      if (!p.endDate) continue;
      const d = parseISO(p.endDate);
      if (d < rangeStart) before++;
      else if (d > rangeEnd) after++;
      else inRange.push(p);
    }
    inRange.sort((a, b) => a.endDate.localeCompare(b.endDate));
    return { inRange, before, after };
  }, [projects, rangeStart, rangeEnd]);

  const budgetItemsInRange = useMemo(
    () => budgetItems.filter((it) => {
      const d = parseISO(it.date);
      return d >= rangeStart && d <= rangeEnd;
    }),
    [budgetItems, rangeStart, rangeEnd]
  );

  const projectsByMonthKey = useMemo(() => {
    const map = new Map<string, TimelineProject[]>();
    for (const p of inRange) {
      const key = format(parseISO(p.endDate), "yyyy-MM");
      const list = map.get(key) ?? [];
      list.push(p);
      map.set(key, list);
    }
    return map;
  }, [inRange]);

  const budgetItemsByMonthKey = useMemo(() => {
    const map = new Map<string, GanttOverviewBudgetItem[]>();
    for (const it of budgetItemsInRange) {
      const key = format(parseISO(it.date), "yyyy-MM");
      const list = map.get(key) ?? [];
      list.push(it);
      map.set(key, list);
    }
    return map;
  }, [budgetItemsInRange]);

  const openCreate = () => {
    setEditing(null);
    setFormName("");
    setFormDate(format(today, "yyyy-MM-dd"));
    setDialogOpen(true);
  };

  const openEdit = (item: GanttOverviewBudgetItem) => {
    setEditing(item);
    setFormName(item.name);
    setFormDate(item.date);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formName.trim() || !formDate) {
      toast.error("El nombre y la fecha son requeridos");
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        const { error } = await (supabase as any)
          .from("gantt_overview_budget_items")
          .update({ name: formName.trim(), date: formDate, updated_at: new Date().toISOString() })
          .eq("id", editing.id);
        if (error) throw error;
        toast.success("Ítem actualizado");
      } else {
        const { data: userData } = await supabase.auth.getUser();
        const { error } = await (supabase as any)
          .from("gantt_overview_budget_items")
          .insert({ name: formName.trim(), date: formDate, created_by: userData.user?.id });
        if (error) throw error;
        toast.success("Ítem creado");
      }
      setDialogOpen(false);
      onBudgetItemsChange();
    } catch (err: any) {
      toast.error(err.message || "Error al guardar");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!editing) return;
    setDeleting(true);
    try {
      const { error } = await (supabase as any)
        .from("gantt_overview_budget_items")
        .delete()
        .eq("id", editing.id);
      if (error) throw error;
      toast.success("Ítem eliminado");
      setDialogOpen(false);
      onBudgetItemsChange();
    } catch (err: any) {
      toast.error(err.message || "Error al eliminar");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Card className="border-dashed bg-muted/20">
      <CardContent className="pt-4 pb-3">
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <CalendarRange className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold">
            Línea de tiempo general — términos {format(rangeStart, "MMM yyyy", { locale: es })} a{" "}
            {format(rangeEnd, "MMM yyyy", { locale: es })}
          </span>
          <span className="text-xs text-muted-foreground ml-auto">
            {inRange.length} proyecto{inRange.length !== 1 ? "s" : ""} en el rango
          </span>
          <Button variant="outline" size="sm" className="h-7 px-2 text-xs gap-1" onClick={openCreate}>
            <Plus className="h-3.5 w-3.5" />
            Agregar Ítem
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7 px-2 text-xs gap-1"
            onClick={openExtendDialog}
            title="Extender la línea de tiempo hasta una fecha"
          >
            <CalendarPlus className="h-3.5 w-3.5" />
            Extender
          </Button>
          {extendedUntil && !compacted && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2 text-xs gap-1"
              onClick={() => setCompacted(true)}
              title="Volver a la vista de 12 meses, sin scroll"
            >
              <Minimize2 className="h-3.5 w-3.5" />
              Compactar a 12 Meses
            </Button>
          )}
          {extendedUntil && compacted && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2 text-xs gap-1"
              onClick={() => setCompacted(false)}
              title={`Ver el rango extendido hasta ${format(endOfMonth(extendedUntil), "MMM yyyy", { locale: es })}`}
            >
              <Maximize2 className="h-3.5 w-3.5" />
              Ver Extensión
            </Button>
          )}
        </div>

        <div className="relative overflow-x-auto">
          <div style={{ width: `${innerWidthPct}%`, minWidth: "100%" }}>
            {/* Encabezado de meses */}
            <div className="flex rounded-t-md overflow-hidden border border-b-0">
              {months.map(({ date, widthPct }) => {
                const isCurrent = isSameMonth(date, today);
                return (
                  <div
                    key={date.toISOString()}
                    style={{ width: `${widthPct}%` }}
                    className={cn(
                      "text-center text-[11px] font-medium py-1.5 border-r last:border-r-0 capitalize truncate px-1",
                      isCurrent ? "bg-primary/10 text-primary" : "bg-muted/40 text-muted-foreground"
                    )}
                    title={format(date, "MMMM yyyy", { locale: es })}
                  >
                    {format(date, "MMM", { locale: es })}
                  </div>
                );
              })}
            </div>

            {/* Carriles con las fechas de término y los ítems de Presupuesto */}
            <div className="flex border rounded-b-md relative min-h-[104px] bg-background">
              {months.map(({ date, widthPct }) => {
                const key = format(date, "yyyy-MM");
                const items = (projectsByMonthKey.get(key) ?? []).slice().sort(
                  (a, b) => a.endDate.localeCompare(b.endDate)
                );
                const budgetItemsHere = (budgetItemsByMonthKey.get(key) ?? []).slice().sort(
                  (a, b) => a.date.localeCompare(b.date)
                );
                const isCurrent = isSameMonth(date, today);
                return (
                  <div
                    key={key}
                    style={{ width: `${widthPct}%` }}
                    className={cn(
                      "border-r last:border-r-0 px-1 py-1.5 flex flex-col gap-1",
                      isCurrent && "bg-primary/[0.03]"
                    )}
                  >
                    {budgetItemsHere.map((it) => {
                      const d = parseISO(it.date);
                      return (
                        <button
                          key={it.id}
                          type="button"
                          onClick={() => openEdit(it)}
                          title={`${it.name} — ${format(d, "dd/MM/yyyy")} (Presupuesto)`}
                          className={cn(
                            "text-left text-[10px] leading-tight rounded border px-1.5 py-1 truncate transition-shadow hover:shadow-sm hover:border-red-500",
                            BUDGET_ITEM_CLASS
                          )}
                        >
                          <div className="font-semibold">{format(d, "dd MMM", { locale: es })}</div>
                          <div className="truncate">{it.name}</div>
                        </button>
                      );
                    })}
                    {items.map((p) => {
                      const d = parseISO(p.endDate);
                      const overdue = d < today;
                      return (
                        <button
                          key={p.contractId}
                          type="button"
                          onClick={() => onSelect(p.contractId)}
                          title={`${p.contractName} — término ${format(d, "dd/MM/yyyy")}${
                            p.companyNames.length ? ` · ${p.companyNames.join(", ")}` : ""
                          }`}
                          className={cn(
                            "text-left text-[10px] leading-tight rounded border px-1.5 py-1 truncate transition-shadow hover:shadow-sm hover:border-primary/50",
                            overdue ? "bg-red-50 border-red-200 text-red-700" : getLightColorClass(p.overviewStatusColor)
                          )}
                        >
                          <div className="font-semibold">{format(d, "dd MMM", { locale: es })}</div>
                          <div className="truncate">{p.contractName}</div>
                        </button>
                      );
                    })}
                  </div>
                );
              })}

              {/* Línea de hoy */}
              {todayPct >= 0 && todayPct <= 100 && (
                <div
                  className="absolute top-0 bottom-0 w-px bg-red-500 pointer-events-none"
                  style={{ left: `${todayPct}%` }}
                >
                  <div className="absolute -top-4 -translate-x-1/2 text-[9px] font-semibold text-red-500 bg-background px-1 rounded whitespace-nowrap">
                    Hoy
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {(before > 0 || after > 0) && (
          <div className="text-[11px] text-muted-foreground mt-1.5">
            {before > 0 && <>{before} proyecto{before !== 1 ? "s" : ""} con término anterior al rango. </>}
            {after > 0 && <>{after} proyecto{after !== 1 ? "s" : ""} con término posterior a {format(rangeEnd, "MMM yyyy", { locale: es })}.</>}
          </div>
        )}
      </CardContent>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Editar Ítem de Presupuesto" : "Nuevo Ítem de Presupuesto"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Nombre *</Label>
              <Input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="Ej: Presupuesto Q1" />
            </div>
            <div className="space-y-2">
              <Label>Fecha *</Label>
              <Input type="date" value={formDate} onChange={(e) => setFormDate(e.target.value)} />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:justify-between">
            {editing ? (
              <Button variant="ghost" onClick={handleDelete} disabled={deleting || saving} className="text-destructive hover:text-destructive gap-1.5">
                <Trash2 className="h-4 w-4" />
                {deleting ? "Eliminando..." : "Eliminar"}
              </Button>
            ) : <span />}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
              <Button onClick={handleSave} disabled={saving || deleting}>{saving ? "Guardando..." : "Guardar"}</Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={extendDialogOpen} onOpenChange={setExtendDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Extender línea de tiempo</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Extender hasta *</Label>
              <Input type="date" value={extendDate} onChange={(e) => setExtendDate(e.target.value)} />
              <p className="text-xs text-muted-foreground">
                La línea de tiempo mostrará meses hasta la fecha que elijas acá.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExtendDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleExtend}>Extender</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
