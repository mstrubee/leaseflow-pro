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
  dayIndex: number;       // 0 = primer día, 1 = segundo día hábil, …
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
// Suma `n` días hábiles (L-V) a una fecha ISO (YYYY-MM-DD). Si la fecha de
// inicio cae en fin de semana, se corre al lunes siguiente antes de sumar.
// ---------------------------------------------------------------------------
export function addBusinessDays(startISO: string, n: number): string {
  if (!startISO) return startISO;
  const [y, m, d] = startISO.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  // Normaliza el día 0 a hábil
  while (date.getDay() === 0 || date.getDay() === 6) date.setDate(date.getDate() + 1);
  let added = 0;
  while (added < n) {
    date.setDate(date.getDate() + 1);
    if (date.getDay() !== 0 && date.getDay() !== 6) added++;
  }
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${mm}-${dd}`;
}

// ---------------------------------------------------------------------------
// Schedule calculator — MULTI-DÍA
// Reparte las paradas en días hábiles (L-V). Cuando una parada no cabe completa
// antes de las 18:00, se mueve entera al siguiente día hábil (no se parte el
// trabajo de un local entre días). El almuerzo (1.5h) se aplica una vez por día.
// ---------------------------------------------------------------------------
export function calculateSchedule(stops: RouteStop[], startMinutes: number = WORK_START_MINUTES): ScheduleEntry[] {
  const entries: ScheduleEntry[] = [];
  let cursor = startMinutes;
  let lunchTaken = false;
  let dayIndex = 0;

  const applyLunchIfNeeded = (workMinutes: number) => {
    // Si cruzamos las 13:00 (al llegar o durante el trabajo), tomar almuerzo
    if (!lunchTaken && cursor + workMinutes > LUNCH_START && cursor < LUNCH_START + LUNCH_DURATION) {
      cursor = Math.max(cursor, LUNCH_START) + LUNCH_DURATION;
      lunchTaken = true;
    } else if (!lunchTaken && cursor >= LUNCH_START) {
      cursor += LUNCH_DURATION;
      lunchTaken = true;
    }
  };

  for (let i = 0; i < stops.length; i++) {
    const stop = stops[i];

    // Tiempo de traslado desde la parada anterior (no en la primera)
    if (i > 0) cursor += stop.travelMinutes;

    const workMinutes = stop.formIds.length > 0
      ? stop.formIds.reduce((s, id) => s + (stop.formMinutes[id] || DEFAULT_FORM_MINUTES), 0)
      : DEFAULT_FORM_MINUTES;

    // ¿Cabe esta parada (almuerzo incluido si aplica) antes de las 18:00?
    const lunchCost = (!lunchTaken && cursor + workMinutes > LUNCH_START) ? LUNCH_DURATION : 0;
    if (cursor + lunchCost + workMinutes > WORK_END_MINUTES && entries.length > 0) {
      // No cabe → avanzar al siguiente día hábil
      dayIndex += 1;
      cursor = startMinutes;
      lunchTaken = false;
      // El traslado del primer local del nuevo día se mantiene como referencia,
      // pero el día arranca a la hora de inicio (sin sumar traslado del día anterior)
    }

    applyLunchIfNeeded(workMinutes);

    const arrivalMinutes = cursor;
    cursor += workMinutes;

    entries.push({
      stopIndex: i,
      dayIndex,
      arrivalTime: minutesToHHMM(arrivalMinutes),
      departureTime: minutesToHHMM(cursor),
      travelMinutes: i > 0 ? stop.travelMinutes : 0,
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

  // Multi-día: cuántos días hábiles abarca y la fecha de término
  const totalDays = schedule.length > 0 ? Math.max(...schedule.map((e) => e.dayIndex)) + 1 : 1;
  const endDate = scheduledDate ? addBusinessDays(scheduledDate, totalDays - 1) : "";

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
    if (!user)              throw new Error("No autenticado");
    if (!routeName.trim())  throw new Error("Ingresa un nombre para la ruta");
    if (stops.length === 0) throw new Error("Agrega al menos una parada");
    if (!scheduledDate)     throw new Error("Selecciona la fecha de inicio");

    setSaving(true);
    try {
      // Agrupar las paradas por día (dayIndex del cronograma multi-día)
      const byDay = new Map<number, number[]>(); // dayIndex → índices de stops
      schedule.forEach((e) => {
        if (!byDay.has(e.dayIndex)) byDay.set(e.dayIndex, []);
        byDay.get(e.dayIndex)!.push(e.stopIndex);
      });

      const tourId = crypto.randomUUID();
      const days = [...byDay.keys()].sort((a, b) => a - b);
      const multiDay = days.length > 1;
      let firstRouteId = "";

      for (const dayIndex of days) {
        const dayDate = addBusinessDays(scheduledDate, dayIndex);
        const dayName = multiDay
          ? `${routeName.trim()} — Día ${dayIndex + 1} (${dayDate})`
          : routeName.trim();

        // Insert robusto: si la migración de tour_id/day_index/start_time aún
        // no se aplicó en la BD, reintenta sin esas columnas para no bloquear.
        const fullPayload = {
          name: dayName,
          supplier_id: supplierId,
          created_by: user.id,
          scheduled_date: dayDate,
          status: "draft",
          tour_id: tourId,
          day_index: dayIndex,
          start_time: startTime,
        };
        let route: { id: string } | null = null;
        let routeErr: { message: string } | null = null;
        {
          const res = await supabase.from("maintenance_routes").insert(fullPayload).select("id").single();
          route = res.data; routeErr = res.error;
          if (routeErr && /day_index|tour_id|start_time|schema cache|column/i.test(routeErr.message)) {
            // Degradar: insertar solo columnas base garantizadas
            const base = { name: dayName, supplier_id: supplierId, created_by: user.id, scheduled_date: dayDate, status: "draft" };
            const res2 = await supabase.from("maintenance_routes").insert(base).select("id").single();
            route = res2.data; routeErr = res2.error;
          }
        }
        if (routeErr || !route) throw new Error(routeErr?.message ?? "Error al crear ruta");
        if (!firstRouteId) firstRouteId = route.id;

        // Paradas de este día (en orden), re-numeradas desde 1
        const dayStopIndices = byDay.get(dayIndex)!;
        for (let order = 0; order < dayStopIndices.length; order++) {
          const stop = stops[dayStopIndices[order]];
          const { data: stopRow, error: stopErr } = await supabase
            .from("maintenance_route_stops")
            .insert({
              route_id: route.id,
              location_id: stop.locationId,
              stop_order: order + 1,
              estimated_travel_min: stop.travelMinutes,
            })
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
      }

      if (supplierId) localStorage.setItem("lastRouteSupplierId", supplierId);
      return firstRouteId;
    } finally { setSaving(false); }
  }, [user, routeName, supplierId, scheduledDate, startTime, stops, schedule]);

  return {
    locations, criticalities, allForms, formsByLocation,
    scoredLocations, loading,
    origin, setOrigin,
    stops, routeName, setRouteName,
    supplierId, setSupplierId,
    scheduledDate, setScheduledDate,
    startTime, setStartTime,
    saving,
    schedule, totalWorkMinutes, totalTravelMinutes, totalDays, endDate,
    addStop, removeStop, reorderStops,
    toggleFormInStop, addAllFormsToStop,
    setFormMinutes, resetRoute, saveRoute,
  };
}
