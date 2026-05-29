import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";

function formTypeLabel(f: Record<string, unknown>): string {
  if (f.electrical_description) return "Eléctrico";
  if (f.civil_description) return "Obra Civil";
  if (f.hvac_description) return "Climatización";
  if (f.fixed_assets_description) return "Activos Fijos";
  return "General";
}

function formDescription(f: Record<string, unknown>): string {
  return (
    (f.electrical_description as string) || (f.civil_description as string) ||
    (f.hvac_description as string) || (f.fixed_assets_description as string) ||
    (f.general_description as string) || ""
  );
}

/**
 * Exporta a Excel las rutas de las fechas indicadas (una hoja por día).
 * Cada fila: parada, local, dirección, form, tipo, criticidad, tiempo.
 */
export async function exportRoutesExcel(dates: string[], baseName = "Rutas_Mantencion") {
  if (dates.length === 0) return;
  const sorted = [...dates].sort();

  const { data, error } = await supabase
    .from("maintenance_routes")
    .select(`
      id, name, scheduled_date, status, start_time,
      suppliers ( name ),
      maintenance_route_stops (
        stop_order, estimated_travel_min,
        maintenance_locations ( name, local_name, zona, lat, lng ),
        maintenance_route_forms (
          estimated_minutes,
          maintenance_forms (
            form_number, electrical_description, civil_description,
            hvac_description, fixed_assets_description, general_description,
            maintenance_criticality_categories ( name )
          )
        )
      )
    `)
    .in("scheduled_date", sorted)
    .order("scheduled_date");

  if (error) throw new Error(error.message);

  const wb = XLSX.utils.book_new();
  const routes = data ?? [];

  // Una hoja por día
  for (const date of sorted) {
    const dayRoutes = routes.filter((r) => r.scheduled_date === date);
    const rows: Record<string, unknown>[] = [];

    for (const route of dayRoutes) {
      const supplier = (route.suppliers as { name: string } | null)?.name ?? "";
      const stops = ((route.maintenance_route_stops as Record<string, unknown>[]) ?? [])
        .sort((a, b) => (a.stop_order as number) - (b.stop_order as number));

      for (const stop of stops) {
        const loc = stop.maintenance_locations as Record<string, unknown> | null;
        const locName = (loc?.local_name as string) || (loc?.name as string) || "—";
        const forms = (stop.maintenance_route_forms as Record<string, unknown>[]) ?? [];

        if (forms.length === 0) {
          rows.push({
            Ruta: route.name, Proveedor: supplier, Parada: stop.stop_order,
            Local: locName, Zona: (loc?.zona as string) ?? "",
            "Traslado (min)": stop.estimated_travel_min ?? 0,
            Form: "—", Tipo: "—", Criticidad: "—", "Tiempo (min)": 0, Descripción: "",
          });
        } else {
          for (const rf of forms) {
            const mf = rf.maintenance_forms as Record<string, unknown>;
            const crit = (mf?.maintenance_criticality_categories as { name: string } | null)?.name ?? "";
            rows.push({
              Ruta: route.name, Proveedor: supplier, Parada: stop.stop_order,
              Local: locName, Zona: (loc?.zona as string) ?? "",
              "Traslado (min)": stop.estimated_travel_min ?? 0,
              Form: (mf?.form_number as string) ?? "",
              Tipo: formTypeLabel(mf), Criticidad: crit,
              "Tiempo (min)": rf.estimated_minutes ?? 30,
              Descripción: formDescription(mf),
            });
          }
        }
      }
    }

    const sheetName = date.replace(/-/g, ".").slice(0, 31);
    const ws = rows.length > 0
      ? XLSX.utils.json_to_sheet(rows)
      : XLSX.utils.aoa_to_sheet([["Sin rutas programadas este día"]]);

    // Ancho de columnas
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
