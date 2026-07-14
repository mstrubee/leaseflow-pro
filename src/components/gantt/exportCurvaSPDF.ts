import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { CurvaSPoint } from "@/hooks/useCurvaSData";

interface ExportOptions {
  contractName: string;
  filterLabel: string; // "Proyecto Completo" o nombre de la tarea padre
  points: CurvaSPoint[];
}

/**
 * Exporta la Curva S a PDF. LeaseFlow-Pro no tiene ninguna librería para
 * "convertir un gráfico en pantalla a imagen" (no hay html2canvas ni
 * similar instalado) — todos los demás export a PDF del proyecto dibujan
 * con las primitivas de jsPDF, así que el gráfico se redibuja acá a mano
 * (dos líneas de color + ejes), en vez de agregar una librería nueva solo
 * para esto.
 */
export function exportCurvaSPDF({ contractName, filterLabel, points }: ExportOptions) {
  const doc = new jsPDF({ orientation: "landscape" });
  const pageW = doc.internal.pageSize.getWidth();

  // Encabezado
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text(`Curva S — Programa ${contractName}`, 14, 16);

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100);
  doc.text(`Generado: ${format(new Date(), "dd/MM/yyyy HH:mm", { locale: es })}`, 14, 23);
  doc.text(`Alcance: ${filterLabel}`, 14, 28);
  doc.setTextColor(0);

  if (points.length === 0) {
    doc.setFontSize(12);
    doc.text("No hay datos para graficar.", 14, 45);
    doc.save(`CurvaS_${contractName}.pdf`);
    return;
  }

  // --- Gráfico dibujado a mano ---
  const chartX = 20;
  const chartY = 38;
  const chartW = pageW - 40;
  const chartH = 90;
  const chartBottom = chartY + chartH;

  // Ejes
  doc.setDrawColor(180);
  doc.setLineWidth(0.2);
  // Líneas de grilla horizontales cada 25%
  for (let pct = 0; pct <= 100; pct += 25) {
    const y = chartBottom - (pct / 100) * chartH;
    doc.line(chartX, y, chartX + chartW, y);
    doc.setFontSize(8);
    doc.setTextColor(120);
    doc.text(`${pct}%`, chartX - 10, y + 1.5);
  }
  doc.setTextColor(0);
  doc.setDrawColor(0);
  doc.setLineWidth(0.3);
  doc.line(chartX, chartY, chartX, chartBottom); // eje Y
  doc.line(chartX, chartBottom, chartX + chartW, chartBottom); // eje X

  // Etiquetas del eje X — se muestran cada N semanas para no amontonarlas
  const labelEvery = Math.max(1, Math.ceil(points.length / 12));
  const stepX = chartW / Math.max(1, points.length - 1);
  doc.setFontSize(7);
  points.forEach((p, i) => {
    if (i % labelEvery === 0 || i === points.length - 1) {
      const x = chartX + i * stepX;
      doc.text(p.weekLabel, x, chartBottom + 5, { angle: 45 });
    }
  });

  const toXY = (i: number, value: number): [number, number] => [
    chartX + i * stepX,
    chartBottom - (Math.min(100, Math.max(0, value)) / 100) * chartH,
  ];

  const drawSeries = (key: "scheduledProgress" | "actualProgress", color: [number, number, number]) => {
    doc.setDrawColor(...color);
    doc.setLineWidth(0.8);
    for (let i = 0; i < points.length - 1; i++) {
      const [x1, y1] = toXY(i, points[i][key]);
      const [x2, y2] = toXY(i + 1, points[i + 1][key]);
      doc.line(x1, y1, x2, y2);
    }
  };

  drawSeries("scheduledProgress", [37, 99, 235]); // azul
  drawSeries("actualProgress", [249, 115, 22]); // naranja

  // Leyenda + % actual
  const last = points[points.length - 1];
  const legendY = chartY - 4;
  doc.setDrawColor(37, 99, 235);
  doc.setLineWidth(1.5);
  doc.line(chartX + chartW - 130, legendY, chartX + chartW - 120, legendY);
  doc.setFontSize(9);
  doc.setTextColor(0);
  doc.text(`Programado: ${last.scheduledProgress}%`, chartX + chartW - 118, legendY + 1.5);

  doc.setDrawColor(249, 115, 22);
  doc.line(chartX + chartW - 60, legendY, chartX + chartW - 50, legendY);
  doc.text(`Real: ${last.actualProgress}%`, chartX + chartW - 48, legendY + 1.5);

  // --- Tabla resumen ---
  const rows = points.map((p) => {
    const deviation = p.actualProgress - p.scheduledProgress;
    const estado = Math.abs(deviation) < 2 ? "On track" : deviation < 0 ? "Atrasado" : "Adelantado";
    return [p.weekLabel, `${p.scheduledProgress}%`, `${p.actualProgress}%`, `${deviation > 0 ? "+" : ""}${deviation.toFixed(1)}%`, estado];
  });

  autoTable(doc, {
    startY: chartBottom + 15,
    head: [["Semana", "Programado", "Real", "Desviación", "Estado"]],
    body: rows,
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [37, 99, 235] },
  });

  doc.save(`CurvaS_${contractName.replace(/\s+/g, "_")}.pdf`);
}
