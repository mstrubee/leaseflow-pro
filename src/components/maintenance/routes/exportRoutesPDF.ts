import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import logosHeader from "@/assets/logos-header.png";
import { fetchRoutesForExport, type ExportRoute } from "./routesExportData";

const STATUS_LABEL: Record<string, string> = {
  draft: "Borrador", assigned: "Asignada", in_progress: "En ejecución", completed: "Completada",
};

async function loadLogo(): Promise<HTMLImageElement | null> {
  try {
    const img = new Image();
    img.src = logosHeader;
    await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = reject; });
    return img;
  } catch { return null; }
}

/**
 * Dibuja un diagrama esquemático del recorrido: puntos numerados posicionados
 * por su lat/lng (normalizados a la caja) y conectados en orden por una línea.
 * No depende de red/tiles — siempre se renderiza. Devuelve la Y final.
 */
function drawRouteDiagram(
  doc: jsPDF,
  pts: { lat: number; lng: number; name: string }[],
  x: number, y: number, w: number, h: number,
): number {
  // Marco
  doc.setDrawColor(220); doc.setFillColor(248, 250, 252);
  doc.roundedRect(x, y, w, h, 2, 2, "FD");
  doc.setFontSize(7); doc.setTextColor(150);
  doc.text("Recorrido", x + 2, y + 4);
  doc.setTextColor(0);

  const lats = pts.map((p) => p.lat), lngs = pts.map((p) => p.lng);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
  const pad = 8;
  const innerX = x + pad, innerY = y + pad + 2, innerW = w - pad * 2, innerH = h - pad * 2 - 2;

  const project = (lat: number, lng: number): [number, number] => {
    const px = maxLng === minLng ? innerX + innerW / 2 : innerX + ((lng - minLng) / (maxLng - minLng)) * innerW;
    // lat invertido (norte arriba)
    const py = maxLat === minLat ? innerY + innerH / 2 : innerY + (1 - (lat - minLat) / (maxLat - minLat)) * innerH;
    return [px, py];
  };

  // Líneas entre puntos consecutivos
  doc.setDrawColor(59, 130, 246); doc.setLineWidth(0.5);
  for (let i = 1; i < pts.length; i++) {
    const [x1, y1] = project(pts[i - 1].lat, pts[i - 1].lng);
    const [x2, y2] = project(pts[i].lat, pts[i].lng);
    doc.line(x1, y1, x2, y2);
  }
  doc.setLineWidth(0.2);

  // Puntos numerados
  for (let i = 0; i < pts.length; i++) {
    const [px, py] = project(pts[i].lat, pts[i].lng);
    doc.setFillColor(59, 130, 246);
    doc.circle(px, py, 2.6, "F");
    doc.setTextColor(255); doc.setFontSize(6); doc.setFont("helvetica", "bold");
    doc.text(String(i + 1), px, py + 1.1, { align: "center" });
  }
  doc.setTextColor(0); doc.setFont("helvetica", "normal");
  return y + h;
}

/**
 * Exporta a PDF las rutas programadas en las fechas indicadas (YYYY-MM-DD).
 * Una sección por día, una tabla por ruta con sus paradas y forms.
 */
export async function exportRoutesPDF(dates: string[], title = "Rutas de Mantención") {
  if (dates.length === 0) return;
  const sorted = [...dates].sort();

  const routes = await fetchRoutesForExport(sorted);
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
  const byDate = new Map<string, ExportRoute[]>();
  for (const r of routes) {
    if (!byDate.has(r.scheduled_date)) byDate.set(r.scheduled_date, []);
    byDate.get(r.scheduled_date)!.push(r);
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
      const stops = route.stops;

      // Route subtitle
      if (cursorY > 255) { doc.addPage(); cursorY = 20; }
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.text(`${route.name}`, 16, cursorY);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(110);
      const meta = [
        STATUS_LABEL[route.status] ?? route.status,
        route.supplier_name ? `Proveedor: ${route.supplier_name}` : null,
        `${stops.length} paradas`,
      ].filter(Boolean).join("  ·  ");
      doc.text(meta as string, 16, cursorY + 4);
      doc.setTextColor(0);
      cursorY += 7;

      // Diagrama del recorrido (puntos numerados conectados por su lat/lng)
      const pts = stops
        .filter((s) => s.lat != null && s.lng != null)
        .map((s) => ({ lat: s.lat as number, lng: s.lng as number, name: s.name }));
      if (pts.length >= 1) {
        if (cursorY > 215) { doc.addPage(); cursorY = 20; }
        cursorY = drawRouteDiagram(doc, pts, 16, cursorY, pageW - 30, 48) + 4;
      }

      // Build table rows
      const rows: string[][] = [];
      for (const stop of stops) {
        if (stop.forms.length === 0) {
          rows.push([String(stop.stop_order), stop.name, "—", "—", "—", `${stop.travel_min} min`]);
        } else {
          stop.forms.forEach((f, idx) => {
            rows.push([
              idx === 0 ? String(stop.stop_order) : "",
              idx === 0 ? stop.name : "",
              f.form_number,
              f.type,
              f.criticality,
              `${f.minutes} min`,
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
      cursorY = ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? cursorY) + 6;
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
