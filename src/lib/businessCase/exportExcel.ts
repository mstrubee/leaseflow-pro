import * as XLSX from "xlsx";
import { BusinessCaseInputs, BusinessCaseResult } from "./calc";

const r1 = (v: number) => Math.round((v ?? 0) * 10) / 10;

export function exportBusinessCaseExcel(inputs: BusinessCaseInputs, result: BusinessCaseResult) {
  const wb = XLSX.utils.book_new();

  // ---------- Hoja Datos ----------
  const datos: (string | number)[][] = [
    ["BUSINESS CASE FINANCIERO"],
    [],
    ["Nombre", inputs.nombre],
    ["Dirección", inputs.direccion],
    ["Comuna", inputs.comuna],
    ["Empresa", inputs.empresa],
    ["Tipo", inputs.tipo],
    [],
    ["Superficie (m²)", r1(inputs.superficieM2)],
    ["Valor UF / m²", inputs.valorUfM2],
    ["Canon (UF/mes)", r1(result.canonUfMensual)],
    ["Gasto común (UF/mes)", r1(inputs.gastoComunUf)],
    ["Plazo (años)", inputs.plazoAnios],
    ["Garantía (UF)", r1(inputs.garantiaUf)],
    ["Fecha entrega", inputs.fechaEntrega],
    ["Gracia (meses)", inputs.graciaMeses],
    [],
    ["UF actual (CLP)", inputs.ufActual],
    ["Crecimiento UF anual", inputs.ufCrecimientoAnual],
    ["Tasa de descuento", inputs.tasaDescuento],
    ["Impuesto", inputs.impuestoPct],
    [],
    ["INVERSIONES (CLP)"],
    ["Habilitación", inputs.invHabilitacion],
    ["Mobiliario", inputs.invMobiliario],
    ["Inventario", inputs.invInventario],
    ["Tecnología", inputs.invTecnologia],
    ["Marketing", inputs.invMarketing],
    ["Inversión total (MM$)", r1(result.inversionTotal)],
    [],
    ["RESULTADOS"],
    ["TIR", result.tir ?? "N/A"],
    ["VAN (MM$)", r1(result.van)],
    ["Payback (años)", result.paybackAnios != null ? r1(result.paybackAnios) : "N/A"],
    ["Rentabilidad estable", result.rentabilidadEstable],
  ];
  const wsDatos = XLSX.utils.aoa_to_sheet(datos);
  wsDatos["!cols"] = [{ wch: 26 }, { wch: 18 }];
  XLSX.utils.book_append_sheet(wb, wsDatos, "Datos");

  // ---------- Hoja Resumen P&L ----------
  const years = result.years;
  const header = ["Concepto (MM$)", ...years.map((y) => String(y.year))];
  const row = (label: string, fn: (y: typeof years[number]) => number, pct = false) => [
    label,
    ...years.map((y) => (pct ? Math.round(fn(y) * 1000) / 10 : r1(fn(y)))),
  ];

  const pl: (string | number)[][] = [
    header,
    ["Meses operativos", ...years.map((y) => y.mesesOperativos)],
    row("Ingresos", (y) => y.ingresos),
    row("Costo de ventas", (y) => y.costoVentas),
    row("Otros costos directos", (y) => y.otrosCostosDirectos),
    row("Costos variables", (y) => y.costosVariables),
    row("Margen de contribución", (y) => y.margenContribucion),
    row("% Margen contribución", (y) => y.margenContribucionPct, true),
    row("Gasto de personal", (y) => y.gastoPersonal),
    row("Publicidad", (y) => y.publicidad),
    row("Gastos generales", (y) => y.gastosGenerales),
    row("Tecnología", (y) => y.tecnologia),
    row("Ocupación", (y) => y.ocupacion),
    row("Canon", (y) => y.canon),
    row("Gasto común", (y) => y.gastoComun),
    row("Otros gastos", (y) => y.customTotal),
    row("EBITDA", (y) => y.ebitda),
    row("% EBITDA", (y) => y.ebitdaPct, true),
    row("Depreciación", (y) => y.depreciacion),
    row("EBIT", (y) => y.ebit),
    row("Impuesto", (y) => y.impuesto),
    row("UDI", (y) => y.udi),
    row("Flujo operativo", (y) => y.flujoOperativo),
    row("Flujo acumulado", (y) => y.flujoAcumulado),
  ];
  const wsPL = XLSX.utils.aoa_to_sheet(pl);
  wsPL["!cols"] = [{ wch: 24 }, ...years.map(() => ({ wch: 12 }))];
  XLSX.utils.book_append_sheet(wb, wsPL, "Resumen P&L");

  const safe = (inputs.nombre || "business_case").replace(/[^\w\-]+/g, "_");
  XLSX.writeFile(wb, `BusinessCase_${safe}.xlsx`);
}
