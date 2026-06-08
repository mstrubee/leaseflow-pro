import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import logosHeader from "@/assets/logos-header.png";

export interface MeetingParticipant {
  name: string;
  role?: string | null;
}

export interface MeetingChecklistItem {
  id: string;
  text: string;
  is_completed: boolean;
  completed_at: string | null;
  created_at: string;
  parent_id: string | null;
}

export interface MeetingContractSnapshot {
  id: string;
  name: string;
  cebe?: string;
  codigo?: string;
  companyNames?: string[];
  special_attention_reason?: string | null;
  checklistItems?: MeetingChecklistItem[];
}

export interface MeetingPDFInput {
  meetingDate: Date;
  notes?: string | null;
  participants: MeetingParticipant[];
  contracts: MeetingContractSnapshot[];
}

function fmtDateLong(d: Date): string {
  return d.toLocaleDateString("es-CL", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function fmtTime(d: Date): string {
  return d.toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" });
}

function fmtFileDate(d: Date): string {
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
}

function fmtDateShort(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
}

function fmtCompletedDate(iso: string): string {
  const d = new Date(iso);
  const months = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  return `${d.getFullYear()}.${months[d.getMonth()]}.${String(d.getDate()).padStart(2, "0")}`;
}

function buildChecklistRows(items: MeetingChecklistItem[], parentId: string | null, depth: number): string[][] {
  const rows: string[][] = [];
  for (const item of items.filter(i => i.parent_id === parentId)) {
    const indent = "  ".repeat(depth);
    const check = item.is_completed ? "[x]" : "[ ]";
    let line = `${indent}${check} ${fmtDateShort(item.created_at)}  ${item.text}`;
    if (item.is_completed && item.completed_at) line += `  (completado el ${fmtCompletedDate(item.completed_at)})`;
    rows.push([line, item.is_completed ? "Completado" : "Pendiente"]);
    rows.push(...buildChecklistRows(items, item.id, depth + 1));
  }
  return rows;
}

async function loadLogo(): Promise<HTMLImageElement | null> {
  try {
    const img = new Image();
    img.src = logosHeader;
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
    });
    return img;
  } catch {
    return null;
  }
}

/**
 * Generates an "Acta de Reunión" PDF for a Special Attention meeting.
 * Returns the PDF as a Blob (caller is responsible for upload/save).
 */
export async function generateMeetingPDF(input: MeetingPDFInput): Promise<{ blob: Blob; filename: string }> {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "letter" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 14;

  const logoImg = await loadLogo();
  if (logoImg) doc.addImage(logoImg, "PNG", margin, 8, 50, 20);

  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text("Acta de Reunión — Atención Especial", logoImg ? 70 : margin, 18);

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(60);
  doc.text(`${fmtDateLong(input.meetingDate)} · ${fmtTime(input.meetingDate)} hrs`, logoImg ? 70 : margin, 25);
  doc.setTextColor(0);

  let y = 36;

  // Participants block
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setFillColor(220, 38, 38);
  doc.setTextColor(255);
  doc.rect(margin, y, pageW - margin * 2, 7, "F");
  doc.text(`Participantes (${input.participants.length})`, margin + 2, y + 5);
  doc.setTextColor(0);
  y += 9;

  if (input.participants.length === 0) {
    doc.setFontSize(9);
    doc.setFont("helvetica", "italic");
    doc.setTextColor(120);
    doc.text("Sin participantes registrados.", margin + 2, y);
    doc.setTextColor(0);
    y += 6;
  } else {
    autoTable(doc, {
      startY: y,
      head: [["#", "Nombre", "Cargo / Rol"]],
      body: input.participants.map((p, i) => [String(i + 1), p.name, p.role || "—"]),
      theme: "striped",
      headStyles: { fillColor: [237, 146, 146], textColor: [80, 0, 0], fontStyle: "bold", fontSize: 8 },
      styles: { fontSize: 8.5, cellPadding: 2 },
      columnStyles: {
        0: { cellWidth: 10, halign: "center" },
        1: { cellWidth: 90 },
        2: { cellWidth: pageW - margin * 2 - 100 },
      },
      margin: { left: margin, right: margin },
    });
    y = (doc as any).lastAutoTable.finalY + 6;
  }

  // Notes block
  if (input.notes && input.notes.trim()) {
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setFillColor(220, 38, 38);
    doc.setTextColor(255);
    doc.rect(margin, y, pageW - margin * 2, 7, "F");
    doc.text("Notas de la reunión", margin + 2, y + 5);
    doc.setTextColor(0);
    y += 9;

    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    const lines = doc.splitTextToSize(input.notes.trim(), pageW - margin * 2 - 4);
    doc.setFillColor(255, 251, 235);
    const h = lines.length * 4 + 4;
    doc.rect(margin, y, pageW - margin * 2, h, "F");
    let ny = y + 4;
    for (const line of lines) {
      doc.text(line, margin + 3, ny);
      ny += 4;
    }
    y += h + 6;
  }

  // Contracts snapshot
  if (input.contracts.length > 0) {
    if (y > pageH - 40) {
      doc.addPage();
      y = margin;
    }
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setFillColor(220, 38, 38);
    doc.setTextColor(255);
    doc.rect(margin, y, pageW - margin * 2, 7, "F");
    doc.text(`Contratos en Atención Especial al momento de la reunión (${input.contracts.length})`, margin + 2, y + 5);
    doc.setTextColor(0);
    y += 9;

    autoTable(doc, {
      startY: y,
      head: [["#", "Contrato", "Empresa", "CEBE", "Código"]],
      body: input.contracts.map((c, i) => [
        String(i + 1),
        c.name,
        (c.companyNames || []).join(", ") || "—",
        c.cebe || "—",
        c.codigo || "—",
      ]),
      theme: "striped",
      headStyles: { fillColor: [237, 146, 146], textColor: [80, 0, 0], fontStyle: "bold", fontSize: 8 },
      styles: { fontSize: 7.5, cellPadding: 1.8 },
      columnStyles: {
        0: { cellWidth: 8, halign: "center" },
        3: { cellWidth: 22, halign: "center" },
        4: { cellWidth: 22, halign: "center" },
      },
      margin: { left: margin, right: margin },
    });
  }

  // ── Detalle completo por contrato (notas + checklist) ────────────────────
  const contractsWithDetail = input.contracts.filter(
    c => c.special_attention_reason || (c.checklistItems && c.checklistItems.length > 0)
  );
  if (contractsWithDetail.length > 0) {
    // Siempre empieza en página nueva para separar el resumen del detalle
    doc.addPage();
    let y2 = margin;

    // Encabezado de sección
    doc.setFillColor(180, 30, 30);
    doc.rect(margin, y2, pageW - margin * 2, 9, "F");
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(255);
    doc.text("Detalle de contratos — Tareas y seguimiento", margin + 3, y2 + 6.2);
    doc.setTextColor(0);
    y2 += 13;

    for (let ci = 0; ci < input.contracts.length; ci++) {
      const c = input.contracts[ci];
      const items = c.checklistItems || [];
      const completed = items.filter(i => i.is_completed).length;
      const pending = items.filter(i => !i.is_completed).length;

      // Salto de página si no cabe
      if (y2 > pageH - 40) { doc.addPage(); y2 = margin; }

      // Barra roja de contrato
      doc.setFillColor(220, 38, 38);
      doc.rect(margin, y2, pageW - margin * 2, 8, "F");
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(255);
      const meta: string[] = [];
      if ((c.companyNames || []).length > 0) meta.push((c.companyNames || []).join(", "));
      if (c.cebe) meta.push(`CEBE: ${c.cebe}`);
      if (c.codigo) meta.push(`Cód: ${c.codigo}`);
      doc.text(`${ci + 1}. ${c.name}${meta.length ? "  —  " + meta.join("  •  ") : ""}`, margin + 2, y2 + 5.5);
      doc.setTextColor(0);
      y2 += 10;

      // Línea de stats
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(100);
      doc.text(`Checklist: ${items.length} items  |  ${completed} completados  |  ${pending} pendientes`, margin + 2, y2 + 3);
      doc.setTextColor(0);
      y2 += 6;

      // Notas del contrato
      if (c.special_attention_reason) {
        const noteLines = doc.splitTextToSize(c.special_attention_reason, pageW - margin * 2 - 8);
        const noteH = noteLines.length * 3.8 + 6;
        if (y2 + noteH > pageH - 15) { doc.addPage(); y2 = margin; }
        doc.setFillColor(255, 251, 235);
        doc.rect(margin, y2, pageW - margin * 2, noteH, "F");
        doc.setFontSize(7.5);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(120, 80, 0);
        doc.text("Notas:", margin + 3, y2 + 4);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(80);
        let ny = y2 + 4;
        for (const line of noteLines) { ny += 3.8; doc.text(line, margin + 3, ny); }
        doc.setTextColor(0);
        y2 += noteH + 2;
      }

      // Tabla de checklist
      if (items.length > 0) {
        const checklistRows = buildChecklistRows(items, null, 0);
        autoTable(doc, {
          startY: y2,
          head: [["Tarea", "Estado"]],
          body: checklistRows,
          theme: "striped",
          headStyles: { fillColor: [237, 146, 146], textColor: [80, 0, 0], fontStyle: "bold", fontSize: 8, halign: "left" },
          styles: { fontSize: 7.5, cellPadding: 2, overflow: "linebreak", halign: "left" },
          columnStyles: {
            0: { cellWidth: pageW - margin * 2 - 25, halign: "left" },
            1: { cellWidth: 23, halign: "center", fontStyle: "bold" },
          },
          alternateRowStyles: { fillColor: [245, 247, 250] },
          margin: { left: margin, right: margin },
          didParseCell(data) {
            if (data.section === "body" && data.column.index === 1) {
              data.cell.styles.textColor = data.cell.raw === "Completado" ? [22, 163, 74] : [202, 138, 4];
            }
          },
        });
        y2 = (doc as any).lastAutoTable.finalY + 6;
      }

      if (ci < input.contracts.length - 1) {
        if (y2 > pageH - 30) { doc.addPage(); y2 = margin; }
        else y2 += 2;
      }
    }
  }

  // Footer
  const total = doc.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    doc.setFontSize(7);
    doc.setTextColor(128);
    doc.text(`Página ${p} de ${total}`, pageW / 2, pageH - 8, { align: "center" });
    doc.setTextColor(0);
  }

  const blob = doc.output("blob");
  const filename = `Acta_Reunion_${fmtFileDate(input.meetingDate)}_${input.meetingDate.getTime()}.pdf`;
  return { blob, filename };
}
