import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { supabase } from "@/integrations/supabase/client";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import logosHeader from "@/assets/logos-header.png";

const STATUS_LABEL: Record<string, string> = {
  draft: "Borrador", assigned: "Asignada", in_progress: "En ejecución", completed: "Completada",
};

function formTypeLabel(f: Record<string, unknown>): string {
  if (f.electrical_description) return "Eléctrico";
  if (f.civil_description) return "Obra Civil";
  if (f.hvac_description) return "Climatización";
  if (f.fixed_assets_description) return "Activos Fijos";
  return "General";
}

async function loadLogo(): Promise<HTMLImageElement | null> {
  try {
    const img = new Image();
    img.src = logosHeader;
    await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = reject; });
    return img;
  } catch { return null; }
}

/**
 * Exporta a PDF las rutas programadas en las fechas indicadas (YYYY-MM-DD).
 * Una sección por día, una tabla por ruta con sus paradas y forms.
 */
export async function exportRoutesPDF(dates: string[], title = "Rutas de Mantención") {
  if (dates.length === 0) return;
  const sorted = [...dates].sort();

  // Fetch routes with full detail for the selected dates
  const { data, error } = await supabase
    .from("maintenance_routes")
    .select(`
      id, name, scheduled_date, status,
      suppliers ( name ),
      maintenance_route_stops (
        stop_order, status, estimated_travel_min,
        maintenance_locations ( name, local_name, zona ),
        maintenance_route_forms (
          estimated_minutes,
          maintenance_forms (
            form_number, electrical_description, civil_description,
            hvac_description, fixed_assets_description, general_description,
            maintenance_criticality_categories ( name )
          )
        )
      )
    `)
    .in("scheduled_date", sorted)
    .order("scheduled_date");

  if (error) throw new Error(error.message);

  const routes = data ?? [];
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const logo = await loadLogo();

  // Header
  if (logo) {
    const w = 50, h = (logo.height / logo.width) * w;
    doc.addImage(logo, "PNG", 14, 10, w, h);
  }
  doc.setFontSize(15);
  doc.setFont("helvetica", "bold");
  doc.text(title, pageW - 14, 16, { align: "right" });
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(120);
  const rangeLabel = sorted.length === 1
    ? format(parseISO(sorted[0]), "d 'de' MMMM yyyy", { locale: es })
    : `${format(parseISO(sorted[0]), "d MMM", { locale: es })} – ${format(parseISO(sorted[sorted.length - 1]), "d MMM yyyy", { locale: es })}`;
  doc.text(rangeLabel, pageW - 14, 22, { align: "right" });
  doc.setTextColor(0);

  let cursorY = 32;

  // Group routes by date
  const byDate = new Map<string, typeof routes>();
  for (const r of routes) {
    const d = r.scheduled_date as string;
    if (!byDate.has(d)) byDate.set(d, []);
    byDate.get(d)!.push(r);
  }

  for (const date of sorted) {
    const dayRoutes = byDate.get(date) ?? [];

    // Day header
    if (cursorY > 260) { doc.addPage(); cursorY = 20; }
    doc.setFillColor(59, 130, 246);
    doc.rect(14, cursorY, pageW - 28, 7, "F");
    doc.setTextColor(255);
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text(format(parseISO(date), "EEEE d 'de' MMMM yyyy", { locale: es }).replace(/^\w/, (c) => c.toUpperCase()), 16, cursorY + 5);
    doc.setTextColor(0);
    cursorY += 11;

    if (dayRoutes.length === 0) {
      doc.setFontSize(8);
      doc.setFont("helvetica", "italic");
      doc.setTextColor(150);
      doc.text("Sin rutas programadas", 16, cursorY);
      doc.setTextColor(0);
      cursorY += 8;
      continue;
    }

    for (const route of dayRoutes) {
      const supplier = (route.suppliers as { name: string } | null)?.name;
      const stops = ((route.maintenance_route_stops as Record<string, unknown>[]) ?? [])
        .sort((a, b) => (a.stop_order as number) - (b.stop_order as number));

      // Route subtitle
      if (cursorY > 255) { doc.addPage(); cursorY = 20; }
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.text(`${route.name}`, 16, cursorY);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(110);
      const meta = [
        STATUS_LABEL[route.status as string] ?? route.status,
        supplier ? `Proveedor: ${supplier}` : null,
        `${stops.length} paradas`,
      ].filter(Boolean).join("  ·  ");
      doc.text(meta as string, 16, cursorY + 4);
      doc.setTextColor(0);
      cursorY += 7;

      // Build table rows
      const rows: string[][] = [];
      for (const stop of stops) {
        const loc = stop.maintenance_locations as Record<string, unknown> | null;
        const locName = (loc?.local_name as string) || (loc?.name as string) || "—";
        const forms = (stop.maintenance_route_forms as Record<string, unknown>[]) ?? [];

        if (forms.length === 0) {
          rows.push([String(stop.stop_order), locName, "—", "—", "—", "—"]);
        } else {
          forms.forEach((rf, idx) => {
            const mf = rf.maintenance_forms as Record<string, unknown>;
            const crit = (mf?.maintenance_criticality_categories as { name: string } | null)?.name ?? "—";
            rows.push([
              idx === 0 ? String(stop.stop_order) : "",
              idx === 0 ? locName : "",
              (mf?.form_number as string) ?? "—",
              formTypeLabel(mf),
              crit,
              `${rf.estimated_minutes ?? 30} min`,
            ]);
          });
        }
      }

      autoTable(doc, {
        startY: cursorY,
        head: [["#", "Local", "Form", "Tipo", "Criticidad", "Tiempo"]],
        body: rows,
        theme: "grid",
        headStyles: { fillColor: [71, 85, 105], fontSize: 7.5, textColor: 255 },
        bodyStyles: { fontSize: 7.5, cellPadding: 1.3 },
        columnStyles: {
          0: { cellWidth: 8, halign: "center" },
          1: { cellWidth: 50 },
          2: { cellWidth: 32 },
          3: { cellWidth: 28 },
          4: { cellWidth: 28 },
          5: { cellWidth: 18, halign: "right" },
        },
        margin: { left: 16, right: 14 },
        didDrawPage: () => { /* keep */ },
      });
      // @ts-expect-error lastAutoTable is injected by the plugin
      cursorY = (doc.lastAutoTable?.finalY ?? cursorY) + 6;
    }
    cursorY += 2;
  }

  // Footer
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(150);
    doc.text(
      `Generado ${format(new Date(), "d/MM/yyyy HH:mm")} · LeaseFlow Pro`,
      14, doc.internal.pageSize.getHeight() - 8,
    );
    doc.text(`Página ${i} de ${pageCount}`, pageW - 14, doc.internal.pageSize.getHeight() - 8, { align: "right" });
  }
  doc.setTextColor(0);

  const fileName = sorted.length === 1
    ? `Ruta_${sorted[0].replace(/-/g, ".")}.pdf`
    : `Rutas_${sorted[0].replace(/-/g, ".")}_a_${sorted[sorted.length - 1].replace(/-/g, ".")}.pdf`;
  doc.save(fileName);
}
