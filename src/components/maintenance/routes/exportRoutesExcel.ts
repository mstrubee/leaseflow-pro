import * as XLSX from "xlsx";
import { fetchRoutesForExport } from "./routesExportData";

/**
 * Exporta a Excel las rutas de las fechas indicadas (una hoja por día).
 * Cada fila: ruta, proveedor, parada, local, zona, traslado, form, tipo,
 * criticidad, tiempo y descripción.
 */
export async function exportRoutesExcel(dates: string[], baseName = "Rutas_Mantencion") {
  if (dates.length === 0) return;
  const sorted = [...dates].sort();
  const routes = await fetchRoutesForExport(sorted);

  const wb = XLSX.utils.book_new();

  for (const date of sorted) {
    const dayRoutes = routes.filter((r) => r.scheduled_date === date);
    const rows: Record<string, unknown>[] = [];

    for (const route of dayRoutes) {
      for (const stop of route.stops) {
        if (stop.forms.length === 0) {
          rows.push({
            Ruta: route.name, Proveedor: route.supplier_name ?? "", Parada: stop.stop_order,
            Local: stop.name, Zona: stop.zona, "Traslado (min)": stop.travel_min,
            Form: "—", Tipo: "—", Criticidad: "—", "Tiempo (min)": 0, Descripción: "",
          });
        } else {
          for (const f of stop.forms) {
            rows.push({
              Ruta: route.name, Proveedor: route.supplier_name ?? "", Parada: stop.stop_order,
              Local: stop.name, Zona: stop.zona, "Traslado (min)": stop.travel_min,
              Form: f.form_number, Tipo: f.type, Criticidad: f.criticality,
              "Tiempo (min)": f.minutes, Descripción: f.description,
            });
          }
        }
      }
    }

    const sheetName = date.replace(/-/g, ".").slice(0, 31);
    const ws = rows.length > 0
      ? XLSX.utils.json_to_sheet(rows)
      : XLSX.utils.aoa_to_sheet([["Sin rutas programadas este día"]]);
    if (rows.length > 0) {
      ws["!cols"] = [
        { wch: 22 }, { wch: 16 }, { wch: 7 }, { wch: 24 }, { wch: 10 },
        { wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 50 },
      ];
    }
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
  }

  const fileName = sorted.length === 1
    ? `${baseName}_${sorted[0].replace(/-/g, ".")}.xlsx`
    : `${baseName}_${sorted[0].replace(/-/g, ".")}_a_${sorted[sorted.length - 1].replace(/-/g, ".")}.xlsx`;
  XLSX.writeFile(wb, fileName);
}
