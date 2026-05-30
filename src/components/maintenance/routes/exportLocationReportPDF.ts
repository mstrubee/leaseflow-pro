import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import logosHeader from "@/assets/logos-header.png";
import type { ExecutionStop, ExecutionForm } from "@/hooks/useRouteExecution";

function typeLabel(f: ExecutionForm): string {
  if (f.electrical_description) return "Eléctrico";
  if (f.civil_description) return "Civil";
  if (f.hvac_description) return "Climatización";
  if (f.fixed_assets_description) return "Activos Fijos";
  return "General";
}

function statusLabel(f: ExecutionForm): string {
  if (f.completed) return f.operator_notes ? "Completado c/obs" : "Completado";
  if (f.postponed_to) return `Pospuesto a ${f.postponed_to}`;
  return "Pendiente";
}

function descriptionOf(f: ExecutionForm): string {
  return (
    f.general_description || f.electrical_description || f.civil_description ||
    f.hvac_description || f.fixed_assets_description || ""
  );
}

async function loadLogo(): Promise<HTMLImageElement | null> {
  try {
    const img = new Image();
    img.src = logosHeader;
    await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = reject; });
    return img;
  } catch { return null; }
}

/** Genera el informe de visita de UN local (parada) como PDF y devuelve el Blob. */
export async function buildLocationReportPDF(
  stop: ExecutionStop,
  routeName: string,
  scheduledDate: string | null,
): Promise<Blob> {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 14;
  let y = margin;

  const logo = await loadLogo();
  if (logo) {
    const w = 50, h = (logo.height / logo.width) * w;
    try { doc.addImage(logo, "PNG", margin, y, w, h); } catch { /* ignore */ }
    y += h + 4;
  }

  doc.setFontSize(15); doc.setFont("helvetica", "bold");
  doc.text("Informe de visita", margin, y); y += 7;

  doc.setFontSize(11); doc.setFont("helvetica", "normal");
  doc.text(stop.location_local_name || stop.location_name, margin, y); y += 5;

  doc.setFontSize(9); doc.setTextColor(110);
  doc.text(`Ruta: ${routeName}`, margin, y); y += 4;
  if (scheduledDate) {
    doc.text(`Fecha: ${format(parseISO(scheduledDate), "EEEE d 'de' MMMM yyyy", { locale: es })}`, margin, y);
    y += 4;
  }
  const done = stop.forms.filter((f) => f.completed).length;
  doc.text(`Tareas: ${done}/${stop.forms.length} completadas`, margin, y); y += 6;
  doc.setTextColor(0);

  autoTable(doc, {
    startY: y,
    head: [["N° Form", "Tipo", "Criticidad", "Estado", "Descripción / Observaciones"]],
    body: stop.forms.map((f) => [
      f.form_number,
      typeLabel(f),
      f.criticality_name ?? "-",
      statusLabel(f),
      [descriptionOf(f), f.operator_notes ? `Obs: ${f.operator_notes}` : ""].filter(Boolean).join("\n"),
    ]),
    styles: { fontSize: 8, cellPadding: 2, valign: "top" },
    headStyles: { fillColor: [59, 130, 246], textColor: 255, fontStyle: "bold" },
    columnStyles: { 0: { cellWidth: 20 }, 1: { cellWidth: 22 }, 2: { cellWidth: 22 }, 3: { cellWidth: 28 }, 4: { cellWidth: "auto" } },
    margin: { left: margin, right: margin },
  });

  // Evidencias (links)
  const withEvidence = stop.forms.filter((f) => f.visit_evidence_urls.length > 0);
  if (withEvidence.length > 0) {
    let ey = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y;
    ey += 8;
    doc.setFontSize(10); doc.setFont("helvetica", "bold");
    doc.text("Evidencia fotográfica", margin, ey); ey += 5;
    doc.setFontSize(8); doc.setFont("helvetica", "normal"); doc.setTextColor(37, 99, 235);
    for (const f of withEvidence) {
      f.visit_evidence_urls.forEach((url, i) => {
        if (ey > 280) { doc.addPage(); ey = margin; }
        const label = `${f.form_number} · Foto ${i + 1}`;
        doc.textWithLink(label, margin, ey, { url });
        ey += 5;
      });
    }
    doc.setTextColor(0);
  }

  return doc.output("blob");
}

/** Comparte el informe del local: Web Share API nativo + fallback (descarga + enlaces). */
export async function shareLocationReport(
  stop: ExecutionStop,
  routeName: string,
  scheduledDate: string | null,
): Promise<void> {
  const blob = await buildLocationReportPDF(stop, routeName, scheduledDate);
  const localName = stop.location_local_name || stop.location_name;
  const safeName = localName.replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "_") || "local";
  const fileName = `Informe_${safeName}.pdf`;
  const file = new File([blob], fileName, { type: "application/pdf" });
  const done = stop.forms.filter((f) => f.completed).length;
  const text = `Informe de visita — ${localName} (${routeName}): ${done}/${stop.forms.length} tareas completadas.`;

  // 1) Compartir nativo con archivo (móvil)
  const nav = navigator as Navigator & { canShare?: (d: unknown) => boolean };
  if (typeof nav.share === "function" && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: `Informe ${localName}`, text });
      return;
    } catch (e) {
      if ((e as DOMException)?.name === "AbortError") return; // el usuario canceló
      // si falla, cae al fallback
    }
  }

  // 2) Fallback: descargar el PDF y ofrecer enlaces (sin adjunto en wa.me/mailto)
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = fileName;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/** Enlaces de fallback para compartir un resumen por WhatsApp / email. */
export function shareLinks(stop: ExecutionStop, routeName: string) {
  const localName = stop.location_local_name || stop.location_name;
  const done = stop.forms.filter((f) => f.completed).length;
  const text = `Informe de visita — ${localName} (${routeName}): ${done}/${stop.forms.length} tareas completadas.`;
  return {
    whatsapp: `https://wa.me/?text=${encodeURIComponent(text)}`,
    email: `mailto:?subject=${encodeURIComponent(`Informe de visita — ${localName}`)}&body=${encodeURIComponent(text)}`,
  };
}
