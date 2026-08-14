import { forwardRef } from "react";
import { toPng } from "html-to-image";
import type { BCInputs, BCResult } from "@/lib/businessCase/model";
import { fmtMM, fmtPct } from "@/lib/businessCase/format";

// Reconstrucción HTML de los 3 recortes del Excel del Business Case
// Financiero (hoja "Datos" Región A y Región B, hoja "Resumen business case"
// tabla de P&L), para poder capturarlos como imagen (html-to-image) y
// embeberlos en el PPT del Informe Directorio. El mapeo de celdas replica
// exactamente lo que escribe src/lib/businessCase/exportV2.ts en la plantilla
// bc_template.xlsx.

const PRIMARY = "#1E2761";
const ACCENT = "#DC2626";
const LIGHT_BG = "#F8FAFC";
const MUTED = "#64748B";
const DARK = "#1E293B";
const BORDER = "#E2E8F0";

const YEAR_LABELS = ["Año 0", "Año 1", "Año 2", "Año 3", "Año 4", "Año 5"];

const PNL_ROWS: { label: string; key: keyof BCResult; bold?: boolean }[] = [
  { label: "Ingresos", key: "ingresos" },
  { label: "Costo de Ventas", key: "costoVentas" },
  { label: "Otros costos directos", key: "otrosCostos" },
  { label: "Costos variables", key: "costosVar" },
  { label: "Margen de Contribución", key: "margenCtrib", bold: true },
  { label: "Personal", key: "personal" },
  { label: "Publicidad", key: "publicidad" },
  { label: "Gastos Generales", key: "gastosGral" },
  { label: "Tecnología", key: "tecnologia" },
  { label: "Ocupación", key: "ocupacion" },
  { label: "Canon Arriendo", key: "canonArr" },
  { label: "Gasto Común", key: "gastoComun" },
  { label: "EBITDA", key: "ebitda", bold: true },
  { label: "Depreciación", key: "depreciacion" },
  { label: "EBIT", key: "ebit" },
  { label: "Impuesto", key: "impuesto" },
  { label: "UDI", key: "udi", bold: true },
  { label: "Flujo operativo", key: "flujoOp" },
  { label: "Flujo acumulado", key: "payback" },
];

const th: React.CSSProperties = {
  background: PRIMARY, color: "#fff", fontSize: 10, fontWeight: 700,
  padding: "4px 6px", textAlign: "right", whiteSpace: "nowrap",
};
const tdLabel: React.CSSProperties = {
  fontSize: 10, padding: "3px 6px", color: DARK, textAlign: "left", whiteSpace: "nowrap",
};
const tdVal: React.CSSProperties = {
  fontSize: 10, padding: "3px 6px", color: DARK, textAlign: "right", whiteSpace: "nowrap",
};

interface DatosRegionAProps {
  inputs: BCInputs;
  result: BCResult;
}

/** Región A: ficha de datos del proyecto + plan de inversión (hoja "Datos"). */
export const DatosRegionA = forwardRef<HTMLDivElement, DatosRegionAProps>(({ inputs, result }, ref) => (
  <div ref={ref} style={{ width: 460, background: "#fff", fontFamily: "Arial, sans-serif", border: `1px solid ${BORDER}` }}>
    <div style={{ background: PRIMARY, color: "#fff", fontSize: 13, fontWeight: 700, padding: "6px 10px" }}>
      Datos del Proyecto
    </div>
    <table style={{ width: "100%", borderCollapse: "collapse" }}>
      <tbody>
        {[
          ["Nombre", inputs.nombre || "-"],
          ["Dirección", inputs.direccion || "-"],
          ["Comuna", inputs.comuna || "-"],
          ["Tipo", inputs.tipo],
          ["Superficie (m²)", inputs.superficie.toLocaleString("es-CL")],
          ["Valor x m² (UF)", fmtMM(inputs.ufM2, 3)],
          ["Duración contrato (años)", String(inputs.durContratoAnios)],
          ["Inicio", inputs.inicio],
          ["Gracia (meses)", String(inputs.graciaMeses)],
        ].map(([label, val]) => (
          <tr key={label} style={{ borderBottom: `1px solid ${BORDER}` }}>
            <td style={{ ...tdLabel, color: MUTED }}>{label}</td>
            <td style={{ ...tdVal, fontWeight: 600 }}>{val}</td>
          </tr>
        ))}
      </tbody>
    </table>
    <div style={{ background: LIGHT_BG, color: PRIMARY, fontSize: 12, fontWeight: 700, padding: "5px 10px", borderTop: `1px solid ${BORDER}` }}>
      Plan de Inversión (MM CLP)
    </div>
    <table style={{ width: "100%", borderCollapse: "collapse" }}>
      <tbody>
        {result.inv.rows.map((r) => (
          <tr key={r.id} style={{ borderBottom: `1px solid ${BORDER}` }}>
            <td style={{ ...tdLabel, color: MUTED }}>{r.nombre}</td>
            <td style={tdVal}>{fmtMM(r.monto)}</td>
            <td style={{ ...tdVal, color: MUTED, width: 40 }}>{r.pct.toFixed(1)}%</td>
          </tr>
        ))}
        <tr style={{ background: LIGHT_BG }}>
          <td style={{ ...tdLabel, fontWeight: 700 }}>TOTAL</td>
          <td style={{ ...tdVal, fontWeight: 700 }}>{fmtMM(result.inv.total)}</td>
          <td style={tdVal}>100%</td>
        </tr>
      </tbody>
    </table>
  </div>
));
DatosRegionA.displayName = "DatosRegionA";

interface DatosRegionBProps {
  inputs: BCInputs;
  result: BCResult;
}

/** Región B: mini caja de indicadores (TIR / VAN / Payback), hoja "Datos". */
export const DatosRegionB = forwardRef<HTMLDivElement, DatosRegionBProps>(({ inputs, result }, ref) => {
  const rows: [string, string][] = [
    ["TIR", result.tir != null ? fmtPct(result.tir) : "N/A"],
    ["Tasa descuento", `${inputs.waccRate}%`],
    ["VAN (MM CLP)", fmtMM(result.van)],
    ["Payback", result.paybackAnio > 0 ? `${result.paybackAnio} año(s)` : ">5 años"],
    ["Inversión total (MM CLP)", fmtMM(result.totalCapex)],
    ["EBITDA Margin Año 5", fmtPct(result.ebitdaMargin5)],
    ["Escenario", inputs.scenario === "opt" ? "Optimista" : inputs.scenario === "cons" ? "Conservador" : "Base"],
  ];
  return (
    <div ref={ref} style={{ width: 300, background: "#fff", fontFamily: "Arial, sans-serif", border: `1px solid ${BORDER}` }}>
      <div style={{ background: ACCENT, color: "#fff", fontSize: 12, fontWeight: 700, padding: "5px 10px" }}>
        Indicadores Financieros
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <tbody>
          {rows.map(([label, val]) => (
            <tr key={label} style={{ borderBottom: `1px solid ${BORDER}` }}>
              <td style={{ ...tdLabel, color: MUTED }}>{label}</td>
              <td style={{ ...tdVal, fontWeight: 700, color: DARK }}>{val}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
});
DatosRegionB.displayName = "DatosRegionB";

interface ResumenBusinessCaseProps {
  result: BCResult;
}

/** Tabla P&L completa, hoja "Resumen business case" (rango C7:I44). */
export const ResumenBusinessCase = forwardRef<HTMLDivElement, ResumenBusinessCaseProps>(({ result }, ref) => (
  <div ref={ref} style={{ width: 780, background: "#fff", fontFamily: "Arial, sans-serif", border: `1px solid ${BORDER}` }}>
    <div style={{ background: PRIMARY, color: "#fff", fontSize: 13, fontWeight: 700, padding: "6px 10px" }}>
      Resumen Business Case (MM CLP)
    </div>
    <table style={{ width: "100%", borderCollapse: "collapse" }}>
      <thead>
        <tr>
          <th style={{ ...th, textAlign: "left" }}>Concepto</th>
          {YEAR_LABELS.map((y) => <th key={y} style={th}>{y}</th>)}
        </tr>
      </thead>
      <tbody>
        {PNL_ROWS.map((row, i) => {
          const vals = result[row.key] as number[];
          return (
            <tr key={row.label} style={{ background: i % 2 === 0 ? "#fff" : LIGHT_BG, borderBottom: `1px solid ${BORDER}` }}>
              <td style={{ ...tdLabel, fontWeight: row.bold ? 700 : 400 }}>{row.label}</td>
              {vals.map((v, yi) => (
                <td key={yi} style={{ ...tdVal, fontWeight: row.bold ? 700 : 400 }}>{fmtMM(v ?? 0)}</td>
              ))}
            </tr>
          );
        })}
      </tbody>
    </table>
  </div>
));
ResumenBusinessCase.displayName = "ResumenBusinessCase";

/** Captura un elemento del DOM ya renderizado como PNG data URL. */
export async function captureSnapshot(el: HTMLElement | null): Promise<string | null> {
  if (!el) return null;
  try {
    return await toPng(el, { backgroundColor: "#ffffff", pixelRatio: 2 });
  } catch (err) {
    console.error("Error capturando snapshot de Business Case:", err);
    return null;
  }
}
