import type { BCInputs, BCResult } from "./model";
import { fmtMM, fmtPct } from "./format";

// Filas de las 2 tablas del "Informe Directorio" (slide por contrato), en el
// MISMO formato/orden que la planilla de referencia (Business Case AP
// Villarrica → PPT Directorio.pptx, slide "Detalle Capex Plan Expansión").
// Reutilizado tanto por el generador de PPT (tablas nativas) como por la
// previsualización web (misma data, renderizada como HTML).

export interface InfoRow {
  label: string;
  unit: string;
  value: string;
  highlight?: boolean;
  divider?: boolean; // línea divisoria arriba de esta fila
}

export interface PnlRow {
  label: string;
  values: string[]; // 5 columnas (Año 1..5)
  col0?: string; // valor en la columna "Año 0" (solo Capex/Flujo operativo/Payback)
  bold?: boolean;
  grayHighlight?: boolean;
  maroonHighlight?: boolean;
}

const nf = (v: number, dec = 0) => (v ?? 0).toLocaleString("es-CL", { minimumFractionDigits: dec, maximumFractionDigits: dec });
const money = (v: number) => (v === 0 ? "-" : `$${Math.round(v)}`);

export function buildResumenEjecutivoRows(inputs: BCInputs, result: BCResult): InfoRow[] {
  const inv = (id: string) => result.inv.rows.find((r) => r.id === id)?.monto ?? 0;
  const invHab = result.inv.rows.filter((r) => !["inv", "gar", "mob", "tec", "mkt"].includes(r.id)).reduce((s, r) => s + r.monto, 0);

  const inicioDate = inputs.inicio ? new Date(inputs.inicio + "T00:00:00") : null;
  const pagoCanonDate = inicioDate ? new Date(inicioDate.getTime()) : null;
  if (pagoCanonDate) pagoCanonDate.setMonth(pagoCanonDate.getMonth() + (inputs.graciaMeses || 0));
  const finDate = inicioDate ? new Date(inicioDate.getTime()) : null;
  if (finDate) finDate.setFullYear(finDate.getFullYear() + (inputs.durContratoAnios || 0));
  const fmtDate = (d: Date | null) => (d && !Number.isNaN(d.getTime()) ? d.toLocaleDateString("es-CL", { day: "2-digit", month: "2-digit", year: "numeric" }) : "-");

  return [
    { label: "Fecha", unit: "", value: fmtDate(inicioDate) },
    { label: "Comuna", unit: "", value: inputs.comuna || "-" },
    { label: "Ubicación", unit: "", value: inputs.direccion || "-" },
    { label: "Tipo", unit: "", value: inputs.tipo || "-" },
    { label: "Superficie Local", unit: "mt2", value: nf(inputs.superficie) },
    { label: "Valor x mt2", unit: "mt2", value: nf(inputs.ufM2, 2) },
    { label: "Contrato Arriendo", unit: "Años", value: nf(inputs.durContratoAnios) },
    { label: "Canon", unit: "UF", value: nf(result.canonUF, 1), highlight: true },
    { label: "Gasto comun x mt2", unit: "mt2", value: nf(inputs.gastoComunUf, 2) },
    { label: "Inicio", unit: "", value: fmtDate(inicioDate) },
    { label: "Periodo Gracia / Habilitación", unit: "meses", value: nf(inputs.graciaMeses) },
    { label: "Inicio pago Canon", unit: "", value: fmtDate(pagoCanonDate) },
    { label: "Fecha estimada de Finalización", unit: "", value: fmtDate(finDate) },
    { label: "Obras / Habilitación", unit: "$ Clp", value: money(invHab), divider: true },
    { label: "Mobiliario AF", unit: "$ Clp", value: money(inv("mob")) },
    { label: "Inventario", unit: "$ Clp", value: money(inv("inv")) },
    { label: "Tecnología", unit: "$ Clp", value: money(inv("tec")) },
    { label: "Marketing / Publicidad", unit: "$ Clp", value: money(inv("mkt")) },
    { label: "Garantia", unit: "UF", value: nf(result.garantiaUF, 1) },
    { label: "Cobro por Instalaciones", unit: "UF", value: "-" },
    { label: "Tasa de descuento", unit: "", value: fmtPct(inputs.waccRate / 100, 0), divider: true },
    { label: "Periodo de Recuperación (Año)", unit: "años", value: result.paybackAnio > 0 ? nf(result.paybackAnio) : "-" },
    { label: "Rentabilidad al 4 año", unit: "", value: fmtPct(result.ros[4] ?? 0, 2) },
    { label: "TIR", unit: "", value: result.tir != null ? fmtPct(result.tir, 0) : "N/A", divider: true },
    { label: "VAN", unit: "", value: fmtMM(result.van, 2) },
  ];
}

export function buildPnlRows(inputs: BCInputs, result: BCResult): PnlRow[] {
  const yr = (arr: number[], dec = 0) => [1, 2, 3, 4, 5].map((i) => fmtMM(arr[i] ?? 0, dec));
  const pct = (num: number[], den: number[], dec = 0) => [1, 2, 3, 4, 5].map((i) => fmtPct(den[i] ? num[i] / den[i] : 0, dec));
  const constPct = (v: number) => [1, 2, 3, 4, 5].map(() => fmtPct(v, 0));

  // Capital de trabajo (inventario) y activos netos: mismas fórmulas que la
  // planilla de referencia (N37 = M37 - depreciación acumulada; ver exportV2.ts).
  const inventario = result.inv.rows.find((r) => r.id === "inv")?.monto ?? 0;
  const activosNetos: number[] = [];
  let acc = result.capex[0];
  for (let i = 1; i <= 5; i++) {
    acc = acc - result.depreciacion[i];
    activosNetos.push(acc);
  }
  const capitalEmpleado = activosNetos.map((a) => a + inventario);

  // "PAYBACK años": primer año en que el flujo acumulado (payback) se vuelve
  // positivo, mostrado una sola vez (mismo patrón que la fórmula original).
  const paybackAnios: string[] = [];
  let shown = false;
  for (let i = 1; i <= 5; i++) {
    if (result.payback[i] > 0 && !shown) { paybackAnios.push(String(i)); shown = true; }
    else if (shown) paybackAnios.push("-");
    else paybackAnios.push("");
  }

  return [
    { label: "Venta / mes", values: [1, 2, 3, 4, 5].map((i) => fmtMM(inputs.ventaMes[i - 1] ?? 0, 0)) },
    { label: "Ingresos", values: yr(result.ingresos) },
    { label: "Costo por ventas", values: yr(result.costoVentas) },
    { label: "Margen directo %", values: constPct((inputs.margenDir || 0) / 100), grayHighlight: true },
    { label: "Otros Costos directos", values: yr(result.otrosCostos) },
    { label: "Costos Variables", values: yr(result.costosVar) },
    { label: "Margen de contribucion $", values: yr(result.margenCtrib), bold: true },
    { label: "Margen de contribucion %", values: pct(result.margenCtrib, result.ingresos) },
    { label: "Gastos Personal", values: yr(result.personal) },
    { label: "Publicidad y Promocion", values: yr(result.publicidad) },
    { label: "Gastos Generales", values: yr(result.gastosGral) },
    { label: "Tecnologia", values: yr(result.tecnologia) },
    { label: "Ocupacion (sin Arrdo)", values: yr(result.ocupacion) },
    { label: "Canon Arriendo", values: yr(result.canonArr, 1) },
    { label: "Gasto comun", values: yr(result.gastoComun, 1) },
    { label: "GAVs", values: yr(result.gavs), bold: true },
    { label: "EBITDA", values: yr(result.ebitda), bold: true, grayHighlight: true },
    { label: "Ebitda/vta", values: pct(result.ebitda, result.ingresos), grayHighlight: true },
    { label: "Depreciación y Amortizacion", values: yr(result.depreciacion) },
    { label: "EBIT", values: yr(result.ebit), bold: true, grayHighlight: true },
    { label: "ROS%", values: pct(result.ebit, result.ingresos) },
    { label: "Intereses (-)", values: ["-", "-", "-", "-", "-"] },
    { label: "UAI", values: yr(result.ebit), bold: true },
    { label: "Impuesto%", values: constPct((inputs.taxRate || 0) / 100) },
    { label: "Impuesto", values: yr(result.impuesto) },
    { label: "UDI", values: yr(result.udi), bold: true, grayHighlight: true },
    { label: "", values: ["", "", "", "", ""] },
    { label: "Capex", values: ["-", "-", "-", "-", "-"], col0: fmtMM(result.capex[0], 0) },
    { label: "Flujo operativo", values: yr(result.flujoOp), col0: fmtMM(result.capex[0], 0), bold: true, maroonHighlight: true },
    { label: "PAYBACK", values: yr(result.payback), col0: fmtMM(result.capex[0], 0) },
    { label: "PAYBACK años", values: paybackAnios, bold: true, maroonHighlight: true },
    { label: "Activos Netos Totales", values: activosNetos.map((v) => fmtMM(v, 0)) },
    { label: "Capital de Trabajo", values: [1, 2, 3, 4, 5].map(() => fmtMM(inventario, 0)) },
    { label: "Capital empleado", values: capitalEmpleado.map((v) => fmtMM(v, 0)), bold: true, maroonHighlight: true },
    { label: "Rentabilidad", values: pct(result.ebit, result.ingresos, 1), bold: true, maroonHighlight: true },
  ];
}
