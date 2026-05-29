import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { getOsrmRoute, estimateTravelMinutes } from "@/lib/osrmRoute";

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
  formIds: string[];
  allForms: RouteForm[];
  formMinutes: Record<string, number>; // formId → estimated minutes
  travelMinutes: number;               // travel time from previous stop
  routeGeometry: GeoJSON.LineString | null;
}

export interface ScheduleEntry {
  stopIndex: number;
  arrivalTime: string;    // "HH:MM"
  departureTime: string;
  travelMinutes: number;
  workMinutes: number;
  isLunch: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const WORK_START_MINUTES = 9 * 60;        // 09:00
const WORK_END_MINUTES   = 18 * 60;       // 18:00
const LUNCH_START        = 13 * 60;       // 13:00
const LUNCH_DURATION     = 90;            // 1.5h
const DEFAULT_FORM_MINUTES = 30;

const WEIGHT_BY_NAME: Record<string, number> = {
  crítica: 4, critica: 4, alta: 3, media: 2, baja: 1,
  "falta info": 0.5, "sin info": 0.5, derivada: 0,
};

function getCriticalityWeight(cat: CriticalityCategory): number {
  const key = cat.name.toLowerCase().trim();
  if (key in WEIGHT_BY_NAME) return WEIGHT_BY_NAME[key];
  return Math.max(0, 5 - cat.display_order);
}

function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function minutesToHHMM(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// Match forms to location (independent of origin)
// ---------------------------------------------------------------------------
function matchFormsToLocation(
  loc: MaintenanceLocation,
  allForms: RouteForm[],
): RouteForm[] {
  if (allForms.length === 0) return [];

  const localName = loc.local_name?.toLowerCase().trim() ?? "";
  const localCode = loc.local_code?.toLowerCase().trim() ?? "";
  const locName   = loc.name.toLowerCase().trim();
  const locFolder = loc.folder.toLowerCase(); // 'autoplanet' | 'agroplanet'

  return allForms.filter((f) => {
    const cn = (f.contract_name ?? "").toLowerCase().trim();
    if (!cn) return false;
    return (
      (localName && (cn.includes(localName) || localName.includes(cn))) ||
      (localCode && (cn.includes(localCode) || cn === localCode))       ||
      cn.includes(locName)                                               ||
      cn.includes(locFolder)
    );
  });
}

// ---------------------------------------------------------------------------
// Schedule calculator
// ---------------------------------------------------------------------------
export function calculateSchedule(stops: RouteStop[], startMinutes: number = WORK_START_MINUTES): ScheduleEntry[] {
  const entries: ScheduleEntry[] = [];
  let cursor = startMinutes;
  let lunchTaken = false;

  for (let i = 0; i < stops.length; i++) {
    const stop = stops[i];

    // Add travel time
    if (i > 0) cursor += stop.travelMinutes;

    // Lunch check: if we hit 13:00 before starting this stop, take lunch first
    if (!lunchTaken && cursor >= LUNCH_START) {
      cursor += LUNCH_DURATION;
      lunchTaken = true;
    }

    const arrivalMinutes = cursor;
    // SOLO sumar el tiempo de los forms SELECCIONADOS (formIds), no de todos los
    // que quedaron en formMinutes tras deseleccionar. Si no hay forms, 1×default.
    const workMinutes = stop.formIds.length > 0
      ? stop.formIds.reduce((s, id) => s + (stop.formMinutes[id] || DEFAULT_FORM_MINUTES), 0)
      : DEFAULT_FORM_MINUTES;

    // Mid-stop lunch
    if (!lunchTaken && cursor + workMinutes > LUNCH_START) {
      cursor += LUNCH_DURATION;
      lunchTaken = true;
    }

    cursor += workMinutes;

    entries.push({
      stopIndex: i,
      arrivalTime: minutesToHHMM(arrivalMinutes),
      departureTime: minutesToHHMM(Math.min(cursor, WORK_END_MINUTES)),
      travelMinutes: stop.travelMinutes,
      workMinutes,
      isLunch: false,
    });
  }

  return entries;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------
export function useRouteBuilder() {
  const { user } = useAuth();

  const [locations, setLocations]         = useState<MaintenanceLocation[]>([]);
  const [criticalities, setCriticalities] = useState<CriticalityCategory[]>([]);
  const [allForms, setAllForms]           = useState<RouteForm[]>([]);
  const [loading, setLoading]             = useState(false);

  // Route state
  const [origin, setOrigin]               = useState<MaintenanceLocation | null>(null);
  const [stops, setStops]                 = useState<RouteStop[]>([]);
  const [routeName, setRouteName]         = useState("");
  const [supplierId, setSupplierId]       = useState<string | null>(
    () => localStorage.getItem("lastRouteSupplierId") || null,
  );
  const [scheduledDate, setScheduledDate] = useState<string>("");
  const [startTime, setStartTime]         = useState<string>("09:00");
  const [saving, setSaving]               = useState(false);

  // ---------------------------------------------------------------------------
  // Load base data: locations + criticalities in one shot
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!user) return;
    setLoading(true);
    Promise.all([
      supabase.from("maintenance_locations").select("*").eq("is_active", true).order("name"),
      supabase.from("maintenance_criticality_categories")
        .select("id,name,code,color,display_order").eq("is_active", true).order("display_order"),
    ]).then(([locRes, catRes]) => {
      if (locRes.data)  setLocations(locRes.data as MaintenanceLocation[]);
      if (catRes.data)  setCriticalities(catRes.data as CriticalityCategory[]);
      setLoading(false);
    });
  }, [user]);

  // ---------------------------------------------------------------------------
  // Load forms — runs once criticalities are ready (or immediately if empty)
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!user) return;

    supabase
      .from("maintenance_forms")
      .select("id,form_number,general_description,electrical_description,civil_description,hvac_description,fixed_assets_description,criticality_category_id,contract_id,contract_name")
      .eq("status", "proceso")
      .is("deleted_at", null)
      .then(({ data }) => {
        if (!data) return;
        const weightMap = new Map(
          criticalities.map((c) => [c.id, { weight: getCriticalityWeight(c), name: c.name, color: c.color }]),
        );
        const forms: RouteForm[] = data.map((f) => {
          const cat = f.criticality_category_id ? weightMap.get(f.criticality_category_id) : null;
          return {
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
        });
        setAllForms(forms);
      });
  }, [user, criticalities]); // re-run when criticalities load

  // ---------------------------------------------------------------------------
  // Pre-compute forms per location (independent of origin — fixes popup bug)
  // ---------------------------------------------------------------------------
  const formsByLocation = useMemo(() => {
    const map = new Map<string, RouteForm[]>();
    for (const loc of locations) {
      // Ordenados por criticidad descendente (más alta primero)
      const matched = matchFormsToLocation(loc, allForms)
        .sort((a, b) => b.criticality_weight - a.criticality_weight);
      map.set(loc.id, matched);
    }
    return map;
  }, [locations, allForms]);

  // ---------------------------------------------------------------------------
  // Scored locations relative to origin
  // ---------------------------------------------------------------------------
  const scoredLocations = useMemo((): ScoredLocation[] => {
    if (!origin) return [];
    const stopIds = new Set(stops.map((s) => s.locationId));

    return locations
      .filter((loc) => loc.id !== origin.id && !stopIds.has(loc.id))
      .map((loc) => {
        const locForms   = formsByLocation.get(loc.id) ?? [];
        const totalScore = locForms.reduce((acc, f) => acc + f.criticality_weight, 0);
        const distanceKm = haversine(origin.lat, origin.lng, loc.lat, loc.lng);
        return { ...loc, forms: locForms, totalForms: locForms.length, totalScore, distanceKm };
      })
      .sort((a, b) => {
        const sa = a.distanceKm > 0 ? a.totalScore / a.distanceKm : a.totalScore;
        const sb = b.distanceKm > 0 ? b.totalScore / b.distanceKm : b.totalScore;
        return sb !== sa ? sb - sa : a.distanceKm - b.distanceKm;
      });
  }, [origin, locations, formsByLocation, stops]);

  // ---------------------------------------------------------------------------
  // Schedule (con hora de inicio configurable)
  // ---------------------------------------------------------------------------
  const startMinutes = useMemo(() => {
    const [h, m] = startTime.split(":").map(Number);
    return (h || 9) * 60 + (m || 0);
  }, [startTime]);
  const schedule = useMemo(() => calculateSchedule(stops, startMinutes), [stops, startMinutes]);

  const totalWorkMinutes  = schedule.reduce((s, e) => s + e.workMinutes, 0);
  const totalTravelMinutes = stops.reduce((s, st) => s + st.travelMinutes, 0);

  // ---------------------------------------------------------------------------
  // Mutations
  // ---------------------------------------------------------------------------
  const addStop = useCallback(async (location: MaintenanceLocation, formIds?: string[]) => {
    const locForms       = formsByLocation.get(location.id) ?? [];
    const selectedIds    = formIds ?? locForms.map((f) => f.id);
    const defaultMinutes = Object.fromEntries(selectedIds.map((id) => [id, DEFAULT_FORM_MINUTES]));

    // Get previous waypoint
    const prevPoint = stops.length > 0
      ? stops[stops.length - 1].location
      : origin;

    let travelMinutes  = 0;
    let routeGeometry: GeoJSON.LineString | null = null;

    if (prevPoint) {
      const dist  = haversine(prevPoint.lat, prevPoint.lng, location.lat, location.lng);
      travelMinutes = estimateTravelMinutes(dist);
      // Try OSRM for real road geometry
      try {
        const osrm = await getOsrmRoute([
          { lat: prevPoint.lat, lng: prevPoint.lng },
          { lat: location.lat, lng: location.lng },
        ]);
        if (osrm) {
          travelMinutes = Math.round(osrm.duration / 60);
          routeGeometry = osrm.geometry;
        }
      } catch { /* keep estimate */ }
    }

    setStops((prev) => [
      ...prev,
      {
        locationId: location.id,
        location,
        formIds: selectedIds,
        allForms: locForms,
        formMinutes: defaultMinutes,
        travelMinutes,
        routeGeometry,
      },
    ]);
  }, [formsByLocation, stops, origin]);

  const removeStop = useCallback((locationId: string) => {
    setStops((prev) => prev.filter((s) => s.locationId !== locationId));
  }, []);

  const reorderStops = useCallback((newStops: RouteStop[]) => setStops(newStops), []);

  const toggleFormInStop = useCallback((locationId: string, formId: string) => {
    setStops((prev) => prev.map((s) => {
      if (s.locationId !== locationId) return s;
      const has = s.formIds.includes(formId);
      const formIds = has ? s.formIds.filter((id) => id !== formId) : [...s.formIds, formId];
      const formMinutes = { ...s.formMinutes };
      if (!has) formMinutes[formId] = DEFAULT_FORM_MINUTES;
      return { ...s, formIds, formMinutes };
    }));
  }, []);

  const addAllFormsToStop = useCallback((locationId: string) => {
    setStops((prev) => prev.map((s) => {
      if (s.locationId !== locationId) return s;
      const formIds    = s.allForms.map((f) => f.id);
      const formMinutes = { ...s.formMinutes };
      for (const id of formIds) if (!formMinutes[id]) formMinutes[id] = DEFAULT_FORM_MINUTES;
      return { ...s, formIds, formMinutes };
    }));
  }, []);

  const setFormMinutes = useCallback((locationId: string, formId: string, minutes: number) => {
    setStops((prev) => prev.map((s) =>
      s.locationId === locationId
        ? { ...s, formMinutes: { ...s.formMinutes, [formId]: minutes } }
        : s,
    ));
  }, []);

  const resetRoute = useCallback(() => {
    setOrigin(null); setStops([]); setRouteName("");
    setScheduledDate(""); setStartTime("09:00");
    // supplierId NO se resetea: mantiene el último usado como default
  }, []);

  // ---------------------------------------------------------------------------
  // Save
  // ---------------------------------------------------------------------------
  const saveRoute = useCallback(async (): Promise<string> => {
    if (!user)           throw new Error("No autenticado");
    if (!routeName.trim()) throw new Error("Ingresa un nombre para la ruta");
    if (stops.length === 0) throw new Error("Agrega al menos una parada");

    setSaving(true);
    try {
      const { data: route, error: routeErr } = await supabase
        .from("maintenance_routes")
        .insert({ name: routeName.trim(), supplier_id: supplierId, created_by: user.id, scheduled_date: scheduledDate || null, status: "draft" })
        .select("id").single();
      if (routeErr || !route) throw new Error(routeErr?.message ?? "Error al crear ruta");

      for (let i = 0; i < stops.length; i++) {
        const stop = stops[i];
        const { data: stopRow, error: stopErr } = await supabase
          .from("maintenance_route_stops")
          .insert({ route_id: route.id, location_id: stop.locationId, stop_order: i + 1, estimated_travel_min: stop.travelMinutes })
          .select("id").single();
        if (stopErr || !stopRow) throw new Error(stopErr?.message ?? "Error al crear parada");

        if (stop.formIds.length > 0) {
          const formRows = stop.formIds.map((fid) => ({
            route_stop_id: stopRow.id,
            maintenance_form_id: fid,
            estimated_minutes: stop.formMinutes[fid] ?? DEFAULT_FORM_MINUTES,
          }));
          const { error: formErr } = await supabase.from("maintenance_route_forms").insert(formRows);
          if (formErr) throw new Error(formErr.message);
        }
      }
      // Recordar el último proveedor usado para la próxima ruta
      if (supplierId) localStorage.setItem("lastRouteSupplierId", supplierId);
      return route.id;
    } finally { setSaving(false); }
  }, [user, routeName, supplierId, scheduledDate, stops]);

  return {
    locations, criticalities, allForms, formsByLocation,
    scoredLocations, loading,
    origin, setOrigin,
    stops, routeName, setRouteName,
    supplierId, setSupplierId,
    scheduledDate, setScheduledDate,
    startTime, setStartTime,
    saving,
    schedule, totalWorkMinutes, totalTravelMinutes,
    addStop, removeStop, reorderStops,
    toggleFormInStop, addAllFormsToStop,
    setFormMinutes, resetRoute, saveRoute,
  };
}
