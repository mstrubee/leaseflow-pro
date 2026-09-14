import { useEffect, useMemo, useState } from "react";
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
import { CalendarRange, Plus, CalendarPlus, Trash2, Minimize2, Maximize2, Download, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

interface TimelineProject {
  contractId: string;
  contractName: string;
  companyNames: string[];
  endDate: string;
  capexUF: number;
  capexCLP: number;
  surfaceM2: number;
  address: string | null;
  commune: string | null;
  /** contracts.clasificacion -- Nuevo/Reemplazo/Regularización/Amplia-Mejora u otro tipo administrado en Admin. */
  clasificacion: string | null;
  /** Color configurado del estado en Admin (uno de PROGRESS_COLOR_OPTIONS) -- null si no tiene. */
  overviewStatusColor: string | null;
  /** true si el estado del proyecto (en Admin > Estados de Cartas Gantt) es "Terminado" -- se marca en verde con un check, sin importar el color configurado. */
  isTerminado: boolean;
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
  // todavía) -- se guarda en gantt_overview_timeline_settings para que la
  // extensión se recuerde entre sesiones (es compartida, no por usuario,
  // igual que los ítems de Presupuesto). "compacted" solo alterna la vista
  // (12 meses vs. rango extendido) y no se persiste: cada sesión arranca
  // mostrando el rango extendido recordado, sin perder la posibilidad de
  // compactarlo para esta vista puntual.
  const [extendedUntil, setExtendedUntil] = useState<Date | null>(null);
  const [compacted, setCompacted] = useState(false);

  const [extendDialogOpen, setExtendDialogOpen] = useState(false);
  const [extendDate, setExtendDate] = useState("");

  useEffect(() => {
    (async () => {
      const { data, error } = await (supabase as any)
        .from("gantt_overview_timeline_settings")
        .select("extended_until")
        .eq("id", 1)
        .maybeSingle();
      if (!error && data?.extended_until) setExtendedUntil(parseISO(data.extended_until));
    })();
  }, []);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<GanttOverviewBudgetItem | null>(null);
  const [formName, setFormName] = useState("");
  const [formDate, setFormDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const { rangeStart, rangeEnd, months, years, todayPct, innerWidthPct } = useMemo(() => {
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
    // Agrupa los meses consecutivos por año calendario, para la barra
    // superior que muestra claramente en qué año(s) está parado el usuario.
    const years: { year: number; widthPct: number }[] = [];
    months.forEach(({ date, widthPct }) => {
      const year = date.getFullYear();
      const last = years[years.length - 1];
      if (last && last.year === year) last.widthPct += widthPct;
      else years.push({ year, widthPct });
    });
    return { rangeStart: start, rangeEnd: end, months, years, todayPct, innerWidthPct };
  }, [baseStart, baseEnd, extendedUntil, compacted, today]);

  const openExtendDialog = () => {
    setExtendDate(format(addMonths(extendedUntil ?? baseEnd, 1), "yyyy-MM-dd"));
    setExtendDialogOpen(true);
  };

  const handleExtend = async () => {
    if (!extendDate) return;
    const target = parseISO(extendDate);
    if (target <= baseEnd) {
      toast.error("La fecha debe ser posterior al rango de 12 meses actual");
      return;
    }
    const newExtendedUntil = extendedUntil && extendedUntil > target ? extendedUntil : target;
    setExtendedUntil(newExtendedUntil);
    setCompacted(false);
    setExtendDialogOpen(false);

    const { data: userData } = await supabase.auth.getUser();
    const { error } = await (supabase as any)
      .from("gantt_overview_timeline_settings")
      .upsert({
        id: 1,
        extended_until: format(newExtendedUntil, "yyyy-MM-dd"),
        updated_at: new Date().toISOString(),
        updated_by: userData.user?.id,
      });
    if (error) toast.error("No se pudo guardar la extensión para futuras sesiones");
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

  const formatUF = (n: number) =>
    new Intl.NumberFormat("es-CL", { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(Math.round(n));
  const formatCLP = (n: number) =>
    new Intl.NumberFormat("es-CL", { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(Math.round(n));
  const formatUFm2 = (n: number) =>
    new Intl.NumberFormat("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

  /**
   * PDF con el listado de la línea de tiempo -- los mismos proyectos e ítems
   * de Presupuesto que se ven en el rango actual, ordenados por fecha, con
   * la misma info que muestra el listado de abajo (nombre, dirección,
   * empresa, CAPEX, UF/m²). A propósito NO dibuja el detalle de cronograma
   * de cada contrato -- eso ya lo cubre el PDF general de "Cartas Gantt -
   * Vista General".
   */
  const handleExportPDF = () => {
    type Row = {
      date: string;
      isBudgetItem: boolean;
      name: string;
      clasificacion: string;
      company: string;
      address: string;
      capexUF: number | null;
      capexCLP: number | null;
      ufM2: number | null;
    };

    const rows: Row[] = [
      ...inRange.map((p): Row => ({
        date: p.endDate,
        isBudgetItem: false,
        name: p.contractName,
        clasificacion: p.clasificacion || "—",
        company: p.companyNames.join(", ") || "—",
        address: [p.address, p.commune].filter(Boolean).join(", ") || "—",
        capexUF: p.capexUF > 0 ? p.capexUF : null,
        capexCLP: p.capexCLP > 0 ? p.capexCLP : null,
        ufM2: p.capexUF > 0 && p.surfaceM2 > 0 ? p.capexUF / p.surfaceM2 : null,
      })),
      ...budgetItemsInRange.map((it): Row => ({
        date: it.date,
        isBudgetItem: true,
        name: `${it.name} (Presupuesto)`,
        clasificacion: "—",
        company: "—",
        address: "—",
        capexUF: null,
        capexCLP: null,
        ufM2: null,
      })),
    ].sort((a, b) => a.date.localeCompare(b.date));

    if (rows.length === 0) {
      toast.info("No hay nada para exportar en el rango visible");
      return;
    }

    // Mismo formato estándar de directorio que el resto de los export de la
    // app (maroon/kicker rojo -- ver CapexPPTExport.ts / exportV2.ts).
    const PDF_MAROON: [number, number, number] = [192, 0, 63];
    const PDF_MAROON_LIGHT: [number, number, number] = [251, 228, 234];
    const PDF_KICKER_RED: [number, number, number] = [194, 29, 24];
    const PDF_PAGE_BG: [number, number, number] = [242, 242, 242];
    const PDF_DARK: [number, number, number] = [26, 26, 26];
    const PDF_MUTED: [number, number, number] = [102, 102, 102];
    const PDF_BORDER: [number, number, number] = [204, 204, 204];

    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();

    doc.setFillColor(...PDF_PAGE_BG);
    doc.rect(0, 0, pageWidth, pageHeight, "F");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...PDF_KICKER_RED);
    doc.text("CARTAS GANTT - VISTA GENERAL", 10, 12);
    doc.setFontSize(15);
    doc.setTextColor(...PDF_DARK);
    doc.text("Línea de Tiempo General", 10, 19);
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...PDF_MUTED);
    doc.text(
      `${format(rangeStart, "MMM yyyy", { locale: es })} a ${format(rangeEnd, "MMM yyyy", { locale: es })}`,
      10,
      24.5
    );
    doc.setFontSize(8);
    doc.text(`Generado: ${format(new Date(), "dd/MM/yyyy HH:mm", { locale: es })}`, pageWidth - 10, 12, { align: "right" });
    doc.setDrawColor(...PDF_BORDER);
    doc.setLineWidth(0.2);
    doc.line(10, 27, pageWidth - 10, 27);
    doc.setTextColor(...PDF_DARK);

    // ── Dibujo de la línea de tiempo (años, meses y chips por fecha) ──
    const chartLeft = 10;
    const chartTop = 32;
    const chartWidth = pageWidth - chartLeft * 2;
    const yearRowH = 6;
    const monthRowH = 5;
    const rowH = 3.2;
    const maxChipRows = 8;

    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    let x = chartLeft;
    years.forEach(({ year, widthPct }) => {
      const w = (widthPct / 100) * chartWidth;
      doc.setFillColor(...PDF_MAROON);
      doc.rect(x, chartTop, w, yearRowH, "F");
      doc.setDrawColor(...PDF_BORDER);
      doc.rect(x, chartTop, w, yearRowH);
      doc.setTextColor(255, 255, 255);
      doc.text(String(year), x + w / 2, chartTop + yearRowH - 1.8, { align: "center" });
      x += w;
    });

    const monthRowY = chartTop + yearRowH;
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    const lanes: { x: number; w: number; key: string }[] = [];
    x = chartLeft;
    months.forEach(({ date, widthPct }) => {
      const w = (widthPct / 100) * chartWidth;
      doc.setFillColor(...PDF_MAROON_LIGHT);
      doc.rect(x, monthRowY, w, monthRowH, "F");
      doc.setDrawColor(...PDF_BORDER);
      doc.rect(x, monthRowY, w, monthRowH);
      doc.setTextColor(...PDF_DARK);
      doc.text(format(date, "MMM", { locale: es }), x + w / 2, monthRowY + monthRowH - 1.3, { align: "center" });
      lanes.push({ x, w, key: format(date, "yyyy-MM") });
      x += w;
    });

    const bodyY = monthRowY + monthRowH;
    const laneItems = lanes.map((lane) => {
      const budgetHere = (budgetItemsByMonthKey.get(lane.key) ?? []).slice().sort((a, b) => a.date.localeCompare(b.date));
      const projectsHere = (projectsByMonthKey.get(lane.key) ?? []).slice().sort((a, b) => a.endDate.localeCompare(b.endDate));
      const combined = [
        ...budgetHere.map((it) => ({ isBudgetItem: true, isTerminado: false, label: `${format(parseISO(it.date), "dd/MM")} ${it.name}` })),
        ...projectsHere.map((p) => ({ isBudgetItem: false, isTerminado: p.isTerminado, label: `${format(parseISO(p.endDate), "dd/MM")} ${p.contractName}` })),
      ];
      return { ...lane, combined };
    });
    const maxRowsUsed = Math.max(1, ...laneItems.map((l) => Math.min(l.combined.length, maxChipRows)));
    const bodyHeight = maxRowsUsed * rowH + 2;

    doc.setFontSize(5.5);
    doc.setFont("helvetica", "normal");
    laneItems.forEach(({ x: laneX, w, combined }) => {
      doc.setDrawColor(...PDF_BORDER);
      doc.rect(laneX, bodyY, w, bodyHeight);
      const maxChars = Math.max(3, Math.floor(w / 1.05));
      combined.slice(0, maxChipRows).forEach((item, idx) => {
        const y = bodyY + 1.6 + idx * rowH;
        if (item.isBudgetItem) {
          doc.setFillColor(254, 226, 226);
          doc.setTextColor(153, 27, 27);
        } else if (item.isTerminado) {
          doc.setFillColor(220, 252, 231);
          doc.setTextColor(21, 128, 61);
        } else {
          doc.setFillColor(229, 231, 235);
          doc.setTextColor(55, 65, 81);
        }
        doc.rect(laneX + 0.3, y - 2.2, w - 0.6, rowH - 0.4, "F");
        const label = item.label.length > maxChars ? `${item.label.slice(0, maxChars - 1)}…` : item.label;
        doc.text(label, laneX + 0.6, y - 0.6);
      });
      if (combined.length > maxChipRows) {
        doc.setFontSize(5);
        doc.setTextColor(90);
        doc.text(`+${combined.length - maxChipRows}`, laneX + w / 2, bodyY + bodyHeight - 0.5, { align: "center" });
        doc.setFontSize(5.5);
      }
    });
    doc.setTextColor(0);

    // Línea de hoy
    if (todayPct >= 0 && todayPct <= 100) {
      const todayX = chartLeft + (todayPct / 100) * chartWidth;
      doc.setDrawColor(220, 38, 38);
      doc.setLineWidth(0.4);
      doc.line(todayX, chartTop, todayX, bodyY + bodyHeight);
    }

    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(0);
    doc.text("Listado", chartLeft, bodyY + bodyHeight + 6);

    const tableStartY = bodyY + bodyHeight + 9;

    autoTable(doc, {
      startY: tableStartY,
      head: [["Fecha", "Nombre", "Clasificación", "Empresa", "Dirección", "CAPEX (UF)", "CAPEX (CLP)", "UF/m²"]],
      body: rows.map((r) => [
        format(parseISO(r.date), "dd/MM/yyyy"),
        r.name,
        r.clasificacion,
        r.company,
        r.address,
        r.capexUF != null ? formatUF(r.capexUF) : "—",
        r.capexCLP != null ? `$${formatCLP(r.capexCLP)}` : "—",
        r.ufM2 != null ? formatUFm2(r.ufM2) : "—",
      ]),
      styles: { fontSize: 8, cellPadding: 1.5, lineColor: PDF_BORDER },
      headStyles: { fillColor: PDF_MAROON, textColor: 255 },
      alternateRowStyles: { fillColor: PDF_MAROON_LIGHT },
      columnStyles: {
        0: { cellWidth: 25 },
        5: { halign: "right" },
        6: { halign: "right" },
        7: { halign: "right" },
      },
      didParseCell: (hookData) => {
        if (hookData.section !== "body") return;
        const row = rows[hookData.row.index];
        if (row?.isBudgetItem) {
          hookData.cell.styles.textColor = [185, 28, 28];
          hookData.cell.styles.fontStyle = "bold";
        }
      },
    });

    doc.save(`Linea_Tiempo_General_${format(new Date(), "yyyyMMdd_HHmm")}.pdf`);
    toast.success("PDF generado");
  };

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
            onClick={handleExportPDF}
            title="Exportar el listado de la línea de tiempo a PDF"
          >
            <Download className="h-3.5 w-3.5" />
            Exportar PDF
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
            {/* Barra superior con el/los año(s) del rango visible */}
            <div className="flex rounded-t-md overflow-hidden border">
              {years.map(({ year, widthPct }) => (
                <div
                  key={year}
                  style={{ width: `${widthPct}%` }}
                  className={cn(
                    "text-center text-xs font-semibold py-1 border-r last:border-r-0",
                    today.getFullYear() === year ? "bg-primary/20 text-primary" : "bg-muted/70 text-foreground"
                  )}
                >
                  {year}
                </div>
              ))}
            </div>
            {/* Encabezado de meses */}
            <div className="flex overflow-hidden border-l border-r">
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
                          }${p.isTerminado ? " · Terminado" : ""}`}
                          className={cn(
                            "relative text-left text-[10px] leading-tight rounded border px-1.5 py-1 truncate transition-shadow hover:shadow-sm hover:border-primary/50",
                            p.isTerminado
                              ? "bg-green-50 border-green-400 text-green-800"
                              : overdue
                              ? "bg-red-50 border-red-200 text-red-700"
                              : getLightColorClass(p.overviewStatusColor)
                          )}
                        >
                          {p.isTerminado && (
                            <span className="absolute -top-1.5 -right-1.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-green-500">
                              <Check className="h-2.5 w-2.5 text-white" strokeWidth={3} />
                            </span>
                          )}
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
