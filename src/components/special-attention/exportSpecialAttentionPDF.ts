import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { supabase } from "@/integrations/supabase/client";

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

export async function exportSpecialAttentionPDF(contracts: SpecialContract[]) {
  if (contracts.length === 0) return;

  // Fetch all checklist items for all contracts at once
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
  const margin = 14;
  const contentW = pageW - margin * 2;
  let y = margin;

  // Title
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text("Atención Especial Contratos", margin, y + 5);
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.text(`Generado: ${fmtDate(new Date().toISOString())}`, pageW - margin, y + 5, { align: "right" });
  y += 12;

  doc.setDrawColor(200);
  doc.line(margin, y, pageW - margin, y);
  y += 6;

  for (let ci = 0; ci < contracts.length; ci++) {
    const c = contracts[ci];
    const items = itemsByContract[c.id] || [];
    const rootItems = items.filter(i => !i.parent_id);
    const childrenOf = (pid: string) => items.filter(i => i.parent_id === pid);

    // Estimate height needed for this contract block
    const estimatedH = 20 + (items.length * 5) + (c.special_attention_reason ? 12 : 0);
    if (y + estimatedH > doc.internal.pageSize.getHeight() - 15) {
      doc.addPage();
      y = margin;
    }

    // Contract header
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text(`${ci + 1}. ${c.name}`, margin, y);
    y += 4;

    const meta: string[] = [];
    if (c.companyNames.length > 0) meta.push(c.companyNames.join(", "));
    if (c.cebe) meta.push(`CEBE: ${c.cebe}`);
    if (c.codigo) meta.push(`Código: ${c.codigo}`);

    if (meta.length > 0) {
      doc.setFontSize(7.5);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(120);
      doc.text(meta.join("  •  "), margin + 2, y);
      doc.setTextColor(0);
      y += 4;
    }

    // Notes
    if (c.special_attention_reason) {
      doc.setFontSize(8);
      doc.setFont("helvetica", "italic");
      doc.setTextColor(80);
      const noteLines = doc.splitTextToSize(`Notas: ${c.special_attention_reason}`, contentW - 4);
      for (const line of noteLines) {
        if (y > doc.internal.pageSize.getHeight() - 15) { doc.addPage(); y = margin; }
        doc.text(line, margin + 2, y);
        y += 3.5;
      }
      doc.setTextColor(0);
      doc.setFont("helvetica", "normal");
      y += 1;
    }

    // Checklist
    if (items.length > 0) {
      const pending = items.filter(i => !i.is_completed).length;
      const completed = items.filter(i => i.is_completed).length;
      doc.setFontSize(7.5);
      doc.setFont("helvetica", "bold");
      doc.text(`Checklist (${completed}/${items.length} completados, ${pending} pendientes)`, margin + 2, y);
      y += 4;

      const renderItemPDF = (item: ChecklistItem, depth: number) => {
        if (y > doc.internal.pageSize.getHeight() - 15) { doc.addPage(); y = margin; }

        const indent = margin + 4 + depth * 6;
        const checkMark = item.is_completed ? "☑" : "☐";
        const datePrefix = fmtDate(item.created_at);
        let line = `${checkMark} ${datePrefix}  ${item.text}`;
        if (item.is_completed && item.completed_at) {
          line += ` (completado el ${fmtCompletedDate(item.completed_at)})`;
        }

        doc.setFontSize(7.5);
        doc.setFont("helvetica", item.is_completed ? "normal" : "normal");
        if (item.is_completed) doc.setTextColor(130); else doc.setTextColor(30);

        const splitLines = doc.splitTextToSize(line, contentW - (indent - margin) - 2);
        for (const sl of splitLines) {
          if (y > doc.internal.pageSize.getHeight() - 15) { doc.addPage(); y = margin; }
          doc.text(sl, indent, y);
          y += 3.5;
        }
        doc.setTextColor(0);

        for (const child of childrenOf(item.id)) {
          renderItemPDF(child, depth + 1);
        }
      };

      for (const root of rootItems) {
        renderItemPDF(root, 0);
      }
      y += 2;
    }

    // Separator between contracts
    if (ci < contracts.length - 1) {
      doc.setDrawColor(220);
      doc.line(margin, y, pageW - margin, y);
      y += 5;
    }
  }

  // Footer with page numbers
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFontSize(7);
    doc.setTextColor(150);
    doc.text(`Página ${p} de ${totalPages}`, pageW - margin, doc.internal.pageSize.getHeight() - 8, { align: "right" });
    doc.setTextColor(0);
  }

  doc.save(`Atencion_Especial_${fmtDate(new Date().toISOString())}.pdf`);
}
