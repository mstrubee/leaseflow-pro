import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MaintenanceLocation {
  id: string;
  poi_id: string;
  name: string;
  folder: string;
  local_code: string | null;
  local_name: string | null;
  gerente_zonal: string | null;
  zona: string | null;
  centro_sap: string | null;
  lat: number;
  lng: number;
}

export interface CriticalityCategory {
  id: string;
  name: string;
  code: string;
  color: string | null;
  display_order: number;
}

export interface RouteForm {
  id: string;
  form_number: string;
  general_description: string | null;
  electrical_description: string | null;
  civil_description: string | null;
  hvac_description: string | null;
  fixed_assets_description: string | null;
  criticality_category_id: string | null;
  criticality_name: string | null;
  criticality_color: string | null;
  criticality_weight: number;
  contract_id: string | null;
  contract_name: string | null;
}

export interface ScoredLocation extends MaintenanceLocation {
  forms: RouteForm[];
  totalForms: number;
  totalScore: number;
  distanceKm: number;
}

export interface RouteStop {
  locationId: string;
  location: MaintenanceLocation;
  formIds: string[];                // subset de forms seleccionados
  allForms: RouteForm[];
}

// ---------------------------------------------------------------------------
// Criticality weight map (by display_order: 1=Crítica, 2=Alta, 3=Media, 4=Baja,
// 5=Falta info, 6=Derivada). We also check code/name as fallback.
// ---------------------------------------------------------------------------
const WEIGHT_BY_NAME: Record<string, number> = {
  crítica: 4,
  critica: 4,
  alta: 3,
  media: 2,
  baja: 1,
  "falta info": 0.5,
  "sin info": 0.5,
  derivada: 0,
};

function getCriticalityWeight(cat: CriticalityCategory): number {
  const key = cat.name.toLowerCase().trim();
  if (key in WEIGHT_BY_NAME) return WEIGHT_BY_NAME[key];
  // fallback: invert display_order (lower order = higher weight)
  return Math.max(0, 5 - cat.display_order);
}

// ---------------------------------------------------------------------------
// Haversine distance (km)
// ---------------------------------------------------------------------------
function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------
export function useRouteBuilder() {
  const { user } = useAuth();

  const [locations, setLocations] = useState<MaintenanceLocation[]>([]);
  const [criticalities, setCriticalities] = useState<CriticalityCategory[]>([]);
  const [formsByContract, setFormsByContract] = useState<Map<string, RouteForm[]>>(new Map());
  const [loading, setLoading] = useState(false);

  // Route builder state
  const [origin, setOrigin] = useState<MaintenanceLocation | null>(null);
  const [stops, setStops] = useState<RouteStop[]>([]);
  const [routeName, setRouteName] = useState("");
  const [supplierId, setSupplierId] = useState<string | null>(null);
  const [scheduledDate, setScheduledDate] = useState<string>("");
  const [saving, setSaving] = useState(false);

  // Load base data
  useEffect(() => {
    if (!user) return;
    setLoading(true);
    Promise.all([
      supabase.from("maintenance_locations").select("*").eq("is_active", true).order("name"),
      supabase
        .from("maintenance_criticality_categories")
        .select("id,name,code,color,display_order")
        .eq("is_active", true)
        .order("display_order"),
    ]).then(([locRes, catRes]) => {
      if (locRes.data) setLocations(locRes.data as MaintenanceLocation[]);
      if (catRes.data) setCriticalities(catRes.data as CriticalityCategory[]);
      setLoading(false);
    });
  }, [user]);

  // Load "en proceso" forms (status = 'proceso') — joined with contract name
  useEffect(() => {
    if (!user || locations.length === 0) return;

    supabase
      .from("maintenance_forms")
      .select(
        "id,form_number,general_description,electrical_description,civil_description,hvac_description,fixed_assets_description,criticality_category_id,contract_id,contract_name",
      )
      .eq("status", "proceso")
      .is("deleted_at", null)
      .then(({ data }) => {
        if (!data) return;

        const weightMap = new Map(
          criticalities.map((c) => [c.id, { weight: getCriticalityWeight(c), name: c.name, color: c.color }]),
        );

        const map = new Map<string, RouteForm[]>();
        for (const f of data) {
          const cid = f.contract_id ?? "__none__";
          const cat = f.criticality_category_id ? weightMap.get(f.criticality_category_id) : null;
          const form: RouteForm = {
            id: f.id,
            form_number: f.form_number,
            general_description: f.general_description,
            electrical_description: f.electrical_description,
            civil_description: f.civil_description,
            hvac_description: f.hvac_description,
            fixed_assets_description: f.fixed_assets_description,
            criticality_category_id: f.criticality_category_id,
            criticality_name: cat?.name ?? null,
            criticality_color: cat?.color ?? null,
            criticality_weight: cat?.weight ?? 1,
            contract_id: f.contract_id,
            contract_name: f.contract_name,
          };
          if (!map.has(cid)) map.set(cid, []);
          map.get(cid)!.push(form);
        }
        setFormsByContract(map);
      });
  }, [user, locations, criticalities]);

  // ---------------------------------------------------------------------------
  // Scored locations relative to origin
  // ---------------------------------------------------------------------------
  const scoredLocations = useMemo((): ScoredLocation[] => {
    if (!origin) return [];

    const stopLocationIds = new Set(stops.map((s) => s.locationId));

    return locations
      .filter((loc) => loc.id !== origin.id && !stopLocationIds.has(loc.id))
      .map((loc) => {
        // Match forms by contract_name containing local_name (or local_code)
        const locForms = matchFormsToLocation(loc, formsByContract);
        const totalScore = locForms.reduce((acc, f) => acc + f.criticality_weight, 0);
        const distanceKm = haversine(origin.lat, origin.lng, loc.lat, loc.lng);

        return {
          ...loc,
          forms: locForms,
          totalForms: locForms.length,
          totalScore,
          distanceKm,
        };
      })
      .sort((a, b) => {
        // Primary: score/distance descending; secondary: distance ascending
        const sa = a.distanceKm > 0 ? a.totalScore / a.distanceKm : a.totalScore;
        const sb = b.distanceKm > 0 ? b.totalScore / b.distanceKm : b.totalScore;
        if (sb !== sa) return sb - sa;
        return a.distanceKm - b.distanceKm;
      });
  }, [origin, locations, formsByContract, stops]);

  // ---------------------------------------------------------------------------
  // Mutations
  // ---------------------------------------------------------------------------
  const addStop = useCallback(
    (location: MaintenanceLocation, formIds?: string[]) => {
      const locForms = matchFormsToLocation(location, formsByContract);
      const selectedFormIds = formIds ?? locForms.map((f) => f.id);
      setStops((prev) => [
        ...prev,
        { locationId: location.id, location, formIds: selectedFormIds, allForms: locForms },
      ]);
    },
    [formsByContract],
  );

  const removeStop = useCallback((locationId: string) => {
    setStops((prev) => prev.filter((s) => s.locationId !== locationId));
  }, []);

  const reorderStops = useCallback((newStops: RouteStop[]) => {
    setStops(newStops);
  }, []);

  const toggleFormInStop = useCallback((locationId: string, formId: string) => {
    setStops((prev) =>
      prev.map((s) => {
        if (s.locationId !== locationId) return s;
        const has = s.formIds.includes(formId);
        return {
          ...s,
          formIds: has ? s.formIds.filter((id) => id !== formId) : [...s.formIds, formId],
        };
      }),
    );
  }, []);

  const addAllFormsToStop = useCallback((locationId: string) => {
    setStops((prev) =>
      prev.map((s) =>
        s.locationId === locationId ? { ...s, formIds: s.allForms.map((f) => f.id) } : s,
      ),
    );
  }, []);

  const resetRoute = useCallback(() => {
    setOrigin(null);
    setStops([]);
    setRouteName("");
    setSupplierId(null);
    setScheduledDate("");
  }, []);

  // ---------------------------------------------------------------------------
  // Save route to Supabase
  // ---------------------------------------------------------------------------
  const saveRoute = useCallback(async (): Promise<string> => {
    if (!user) throw new Error("No autenticado");
    if (!routeName.trim()) throw new Error("Ingresa un nombre para la ruta");
    if (stops.length === 0) throw new Error("Agrega al menos una parada");

    setSaving(true);
    try {
      const { data: route, error: routeErr } = await supabase
        .from("maintenance_routes")
        .insert({
          name: routeName.trim(),
          supplier_id: supplierId,
          created_by: user.id,
          scheduled_date: scheduledDate || null,
          status: "draft",
        })
        .select("id")
        .single();

      if (routeErr || !route) throw new Error(routeErr?.message ?? "Error al crear ruta");

      for (let i = 0; i < stops.length; i++) {
        const stop = stops[i];
        const { data: stopRow, error: stopErr } = await supabase
          .from("maintenance_route_stops")
          .insert({
            route_id: route.id,
            location_id: stop.locationId,
            stop_order: i + 1,
          })
          .select("id")
          .single();

        if (stopErr || !stopRow) throw new Error(stopErr?.message ?? "Error al crear parada");

        if (stop.formIds.length > 0) {
          const formRows = stop.formIds.map((fid) => ({
            route_stop_id: stopRow.id,
            maintenance_form_id: fid,
          }));
          const { error: formErr } = await supabase.from("maintenance_route_forms").insert(formRows);
          if (formErr) throw new Error(formErr.message);
        }
      }

      return route.id;
    } finally {
      setSaving(false);
    }
  }, [user, routeName, supplierId, scheduledDate, stops]);

  return {
    // data
    locations,
    criticalities,
    scoredLocations,
    loading,
    // route state
    origin,
    setOrigin,
    stops,
    routeName,
    setRouteName,
    supplierId,
    setSupplierId,
    scheduledDate,
    setScheduledDate,
    saving,
    // actions
    addStop,
    removeStop,
    reorderStops,
    toggleFormInStop,
    addAllFormsToStop,
    resetRoute,
    saveRoute,
  };
}

// ---------------------------------------------------------------------------
// Helper: match forms to location by contract_name ↔ local_name/code
// Tries multiple strategies so partial matches are caught:
//   1. contract_name contains local_name  (e.g. "AP0070-Orientales" ⊂ contract)
//   2. contract_name contains local_code  (e.g. "AP0070" ⊂ contract)
//   3. local_name contains contract_name  (reverse containment)
//   4. local_code == contract_name        (exact code match)
//   5. folder name match                  (last resort: same brand)
// ---------------------------------------------------------------------------
function matchFormsToLocation(
  loc: MaintenanceLocation,
  formsByContract: Map<string, RouteForm[]>,
): RouteForm[] {
  const results: RouteForm[] = [];
  const localName = loc.local_name?.toLowerCase().trim() ?? "";
  const localCode = loc.local_code?.toLowerCase().trim() ?? "";
  const locFolder = loc.folder.toLowerCase(); // 'autoplanet' | 'agroplanet'

  for (const [, forms] of formsByContract) {
    for (const f of forms) {
      const cn = (f.contract_name ?? "").toLowerCase().trim();
      if (!cn) continue;

      const matched =
        (localName && (cn.includes(localName) || localName.includes(cn))) ||
        (localCode && (cn.includes(localCode) || cn === localCode)) ||
        cn.includes(locFolder);

      if (matched) results.push(f);
    }
  }
  return results;
}
