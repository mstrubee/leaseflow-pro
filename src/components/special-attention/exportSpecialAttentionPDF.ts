import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { supabase } from "@/integrations/supabase/client";
import logosHeader from "@/assets/logos-header.png";

interface SpecialContract {
  id: string;
  name: string;
  special_attention_reason: string | null;
  companyNames: string[];
  cebe?: string;
  codigo?: string;
}

interface ChecklistItem {
  id: string;
  text: string;
  is_completed: boolean;
  completed_at: string | null;
  created_at: string;
  parent_id: string | null;
  contract_id?: string;
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
}

function fmtCompletedDate(iso: string): string {
  const d = new Date(iso);
  const months = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  return `${d.getFullYear()}.${months[d.getMonth()]}.${String(d.getDate()).padStart(2, "0")}`;
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

function buildChecklistRows(
  items: ChecklistItem[],
  parentId: string | null,
  depth: number
): string[][] {
  const children = items.filter(i => i.parent_id === parentId);
  const rows: string[][] = [];
  for (const item of children) {
    const indent = "  ".repeat(depth);
    const check = item.is_completed ? "☑" : "☐";
    const date = fmtDate(item.created_at);
    let line = `${indent}${check} ${date}  ${item.text}`;
    if (item.is_completed && item.completed_at) {
      line += `  (completado el ${fmtCompletedDate(item.completed_at)})`;
    }
    const status = item.is_completed ? "Completado" : "Pendiente";
    rows.push([line, status]);
    rows.push(...buildChecklistRows(items, item.id, depth + 1));
  }
  return rows;
}

export async function exportSpecialAttentionPDF(contracts: SpecialContract[]) {
  if (contracts.length === 0) return;

  // Fetch all checklist items
  const contractIds = contracts.map(c => c.id);
  const { data: allItems } = await supabase
    .from("special_attention_checklist")
    .select("id, text, is_completed, completed_at, created_at, parent_id, contract_id")
    .in("contract_id", contractIds)
    .order("created_at", { ascending: true });

  const itemsByContract: Record<string, ChecklistItem[]> = {};
  if (allItems) {
    for (const item of allItems) {
      const cid = (item as any).contract_id;
      if (!itemsByContract[cid]) itemsByContract[cid] = [];
      itemsByContract[cid].push(item as ChecklistItem);
    }
  }

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "letter" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 14;
  const today = new Date().toLocaleDateString("es-CL");

  // ── Header with logo ──
  const logoImg = await loadLogo();
  if (logoImg) {
    doc.addImage(logoImg, "PNG", margin, 8, 50, 20);
  }

  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text("Atención Especial Contratos", logoImg ? 70 : margin, 18);

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100);
  doc.text(`Generado: ${today}  |  Total: ${contracts.length} contratos`, logoImg ? 70 : margin, 25);
  doc.setTextColor(0);

  // Summary stats
  let totalItems = 0, totalCompleted = 0, totalPending = 0;
  for (const c of contracts) {
    const items = itemsByContract[c.id] || [];
    totalItems += items.length;
    totalCompleted += items.filter(i => i.is_completed).length;
    totalPending += items.filter(i => !i.is_completed).length;
  }

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text(
    `Tareas totales: ${totalItems}  |  Completadas: ${totalCompleted}  |  Pendientes: ${totalPending}`,
    logoImg ? 70 : margin,
    30
  );

  let startY = 36;

  // ── Iterate contracts ──
  for (let ci = 0; ci < contracts.length; ci++) {
    const c = contracts[ci];
    const items = itemsByContract[c.id] || [];
    const completed = items.filter(i => i.is_completed).length;
    const pending = items.filter(i => !i.is_completed).length;

    // ── Contract header bar ──
    if (startY > pageH - 40) {
      doc.addPage();
      startY = margin;
    }

    doc.setFillColor(220, 38, 38);
    doc.rect(margin, startY, pageW - margin * 2, 8, "F");
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(255);

    const meta: string[] = [];
    if (c.companyNames.length > 0) meta.push(c.companyNames.join(", "));
    if (c.cebe) meta.push(`CEBE: ${c.cebe}`);
    if (c.codigo) meta.push(`Cód: ${c.codigo}`);
    const headerText = `${ci + 1}. ${c.name}${meta.length > 0 ? "  —  " + meta.join("  •  ") : ""}`;
    doc.text(headerText, margin + 2, startY + 5.5);
    doc.setTextColor(0);
    startY += 10;

    // ── Stats line ──
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100);
    doc.text(`Checklist: ${completed + pending} ítems  |  ✓ ${completed} completados  |  ○ ${pending} pendientes`, margin + 2, startY + 3);
    doc.setTextColor(0);
    startY += 6;

    // ── Notes ──
    if (c.special_attention_reason) {
      doc.setFillColor(255, 251, 235); // amber-50 tint
      const noteLines = doc.splitTextToSize(c.special_attention_reason, pageW - margin * 2 - 8);
      const noteH = noteLines.length * 3.8 + 6;

      if (startY + noteH > pageH - 15) {
        doc.addPage();
        startY = margin;
      }

      doc.rect(margin, startY, pageW - margin * 2, noteH, "F");
      doc.setFontSize(7.5);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(120, 80, 0);
      doc.text("Notas:", margin + 3, startY + 4);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(80);
      let ny = startY + 4;
      for (const line of noteLines) {
        ny += 3.8;
        doc.text(line, margin + 3, ny);
      }
      doc.setTextColor(0);
      startY += noteH + 2;
    }

    // ── Checklist table ──
    if (items.length > 0) {
      const checklistRows = buildChecklistRows(items, null, 0);

      autoTable(doc, {
        startY,
        head: [["Tarea", "Estado"]],
        body: checklistRows,
        theme: "striped",
        headStyles: {
          fillColor: [220, 38, 38],
          textColor: 255,
          fontStyle: "bold",
          fontSize: 8,
          halign: "left",
        },
        styles: {
          fontSize: 7.5,
          cellPadding: 2,
          overflow: "linebreak",
        },
        columnStyles: {
          0: { cellWidth: pageW - margin * 2 - 25 },
          1: { cellWidth: 23, halign: "center", fontStyle: "bold" },
        },
        alternateRowStyles: {
          fillColor: [245, 247, 250],
        },
        margin: { left: margin, right: margin },
        didParseCell(data) {
          if (data.section === "body" && data.column.index === 1) {
            const val = data.cell.raw as string;
            if (val === "Completado") {
              data.cell.styles.textColor = [22, 163, 74]; // green-600
            } else {
              data.cell.styles.textColor = [202, 138, 4]; // amber-600
            }
          }
        },
      });

      startY = (doc as any).lastAutoTable.finalY + 6;
    }

    // Separator
    if (ci < contracts.length - 1) {
      if (startY > pageH - 30) {
        doc.addPage();
        startY = margin;
      } else {
        startY += 2;
      }
    }
  }

  // ── Page numbers footer ──
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFontSize(7);
    doc.setTextColor(128);
    doc.text(`Página ${p} de ${totalPages}`, pageW / 2, pageH - 8, { align: "center" });
    doc.setTextColor(0);
  }

  doc.save(`Atencion_Especial_${fmtDate(new Date().toISOString())}.pdf`);
}
