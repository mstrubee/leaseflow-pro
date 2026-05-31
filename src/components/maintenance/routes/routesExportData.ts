import { supabase } from "@/integrations/supabase/client";

export interface ExportForm {
  form_number: string;
  type: string;
  criticality: string;
  criticality_color: string | null;
  minutes: number;
  description: string;
}
export interface ExportStop {
  stop_order: number;
  travel_min: number;
  name: string;
  zona: string;
  lat: number | null;
  lng: number | null;
  forms: ExportForm[];
}
export interface ExportRoute {
  id: string;
  name: string;
  scheduled_date: string;
  status: string;
  supplier_name: string | null;
  start_time: string | null;
  stops: ExportStop[];
}

function formType(f: Record<string, unknown>): string {
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

// Select completo (con columnas que pueden no existir aún) y versión segura.
const SELECT_FULL = `
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
        maintenance_criticality_categories ( name, color )
      )
    )
  )
`;
const SELECT_SAFE = `
  id, name, scheduled_date, status,
  suppliers ( name ),
  maintenance_route_stops (
    stop_order, estimated_travel_min,
    maintenance_locations ( name, local_name, zona, lat, lng ),
    maintenance_route_forms (
      maintenance_forms (
        form_number, electrical_description, civil_description,
        hvac_description, fixed_assets_description, general_description,
        maintenance_criticality_categories ( name, color )
      )
    )
  )
`;

/**
 * Trae las rutas (con paradas/forms) para las fechas indicadas, normalizadas.
 * Robusto: si las columnas nuevas (start_time/estimated_minutes) aún no existen
 * en la BD, reintenta con un select reducido y usa valores por defecto.
 */
export async function fetchRoutesForExport(dates: string[]): Promise<ExportRoute[]> {
  const sorted = [...dates].sort();

  let { data, error } = await (supabase as any)
    .from("maintenance_routes")
    .select(SELECT_FULL)
    .in("scheduled_date", sorted)
    .order("scheduled_date");

  if (error && /column|schema cache|estimated_minutes|start_time/i.test(error.message)) {
    ({ data, error } = await (supabase as any)
      .from("maintenance_routes")
      .select(SELECT_SAFE)
      .in("scheduled_date", sorted)
      .order("scheduled_date"));
  }
  if (error) throw new Error(error.message);

  return (data ?? []).map((r: Record<string, unknown>): ExportRoute => {
    const stops = ((r.maintenance_route_stops as Record<string, unknown>[]) ?? [])
      .sort((a, b) => (a.stop_order as number) - (b.stop_order as number))
      .map((s: Record<string, unknown>): ExportStop => {
        const loc = s.maintenance_locations as Record<string, unknown> | null;
        const forms = ((s.maintenance_route_forms as Record<string, unknown>[]) ?? []).map((rf): ExportForm => {
          const mf = rf.maintenance_forms as Record<string, unknown>;
          const cat = mf?.maintenance_criticality_categories as { name: string; color: string | null } | null;
          return {
            form_number: (mf?.form_number as string) ?? "—",
            type: mf ? formType(mf) : "—",
            criticality: cat?.name ?? "—",
            criticality_color: cat?.color ?? null,
            minutes: (rf.estimated_minutes as number) ?? 30,
            description: mf ? formDescription(mf) : "",
          };
        });
        return {
          stop_order: s.stop_order as number,
          travel_min: (s.estimated_travel_min as number) ?? 0,
          name: (loc?.local_name as string) || (loc?.name as string) || "—",
          zona: (loc?.zona as string) ?? "",
          lat: loc?.lat != null ? Number(loc.lat) : null,
          lng: loc?.lng != null ? Number(loc.lng) : null,
          forms,
        };
      });
    const suppliers = r.suppliers as { name: string } | null;
    return {
      id: r.id as string,
      name: r.name as string,
      scheduled_date: r.scheduled_date as string,
      status: r.status as string,
      supplier_name: suppliers?.name ?? null,
      start_time: (r.start_time as string) ?? null,
      stops,
    };
  });
}
