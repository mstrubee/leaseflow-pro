import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { getOsrmRoute } from "@/lib/osrmRoute";

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
  // Fusión de forms
  merge_group_id: string | null;
  mergedFormIds: string[];      // todos los IDs representados (1 si no está fusionado)
  mergedFormNumbers: string[];  // números de los forms del grupo
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
  travelDistanceKm: number;            // distancia del tramo (OSRM o Haversine)
  travelMinutes: number;               // tiempo de traslado (derivado de distancia y velocidades)
  routeGeometry: GeoJSON.LineString | null;
}

const URBAN_THRESHOLD_KM = 20; // < 20 km = ciudad; ≥ = carretera

/** Tiempo de traslado (min) según distancia y velocidades configuradas. */
export function travelMinutesFromKm(km: number, urbanSpeed: number, highwaySpeed: number): number {
  const speed = km < URBAN_THRESHOLD_KM ? urbanSpeed : highwaySpeed;
  return speed > 0 ? Math.round((km / speed) * 60) : 0;
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
  const [formsReloadKey, setFormsReloadKey] = useState(0);

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

  // Velocidades editables por el usuario (km/h) para estimar el traslado
  const [urbanSpeed, setUrbanSpeed]     = useState(20);
  const [highwaySpeed, setHighwaySpeed] = useState(100);

  // Filtros / orden de la lista de locales (afectan también el mapa)
  const [sortBy, setSortBy] = useState<"priority" | "distance" | "forms">("priority");
  const [filterTypes, setFilterTypes] = useState<Set<string>>(new Set());
  const [filterCriticalities, setFilterCriticalities] = useState<Set<string>>(new Set());

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

    // Intento con columnas de fusión; si la migración aún no se aplicó, reintenta sin ellas
    const baseCols = "id,form_number,general_description,electrical_description,civil_description,hvac_description,fixed_assets_description,criticality_category_id,contract_id,contract_name";
    (async () => {
      let res = await supabase.from("maintenance_forms")
        .select(`${baseCols},merge_group_id,merge_is_primary`)
        .eq("status", "proceso").is("deleted_at", null);
      if (res.error && /merge_group_id|column|schema cache/i.test(res.error.message)) {
        res = await supabase.from("maintenance_forms").select(baseCols)
          .eq("status", "proceso").is("deleted_at", null);
      }
      const data = res.data;
      if (!data) return;
        const weightMap = new Map(
          criticalities.map((c) => [c.id, { weight: getCriticalityWeight(c), name: c.name, color: c.color }]),
        );
        const forms: RouteForm[] = data.map((f: Record<string, unknown>) => {
          const cat = f.criticality_category_id ? weightMap.get(f.criticality_category_id as string) : null;
          return {
            id: f.id as string,
            form_number: f.form_number as string,
            general_description: f.general_description as string ?? null,
            electrical_description: f.electrical_description as string ?? null,
            civil_description: f.civil_description as string ?? null,
            hvac_description: f.hvac_description as string ?? null,
            fixed_assets_description: f.fixed_assets_description as string ?? null,
            criticality_category_id: f.criticality_category_id as string ?? null,
            criticality_name: cat?.name ?? null,
            criticality_color: cat?.color ?? null,
            criticality_weight: cat?.weight ?? 1,
            contract_id: f.contract_id as string ?? null,
            contract_name: f.contract_name as string ?? null,
            merge_group_id: (f.merge_group_id as string) ?? null,
            mergedFormIds: [f.id as string],
            mergedFormNumbers: [f.form_number as string],
          };
        });
        setAllForms(forms);
    })();
  }, [user, criticalities, formsReloadKey]); // re-run when criticalities load o tras fusionar

  // ---------------------------------------------------------------------------
  // Pre-compute forms per location (independent of origin — fixes popup bug)
  // ---------------------------------------------------------------------------
  const formsByLocation = useMemo(() => {
    const map = new Map<string, RouteForm[]>();
    for (const loc of locations) {
      const matched = matchFormsToLocation(loc, allForms);
      // Colapsar forms fusionados en un representante (el de mayor criticidad del grupo)
      const groups = new Map<string, RouteForm[]>();
      const singles: RouteForm[] = [];
      for (const f of matched) {
        if (f.merge_group_id) {
          if (!groups.has(f.merge_group_id)) groups.set(f.merge_group_id, []);
          groups.get(f.merge_group_id)!.push(f);
        } else {
          singles.push(f);
        }
      }
      const merged: RouteForm[] = [];
      for (const [, gforms] of groups) {
        const sorted = [...gforms].sort((a, b) => b.criticality_weight - a.criticality_weight);
        const rep = sorted[0];
        merged.push({
          ...rep,
          mergedFormIds: gforms.map((g) => g.id),
          mergedFormNumbers: gforms.map((g) => g.form_number),
        });
      }
      const result = [...singles, ...merged]
        .sort((a, b) => b.criticality_weight - a.criticality_weight);
      map.set(loc.id, result);
    }
    return map;
  }, [locations, allForms]);

  // Fusionar forms (RPC). Devuelve el group_id. Refresca la lista.
  const mergeForms = useCallback(async (formIds: string[]): Promise<void> => {
    const { error } = await supabase.rpc("merge_maintenance_forms", { p_form_ids: formIds });
    if (error) throw new Error(error.message);
    setFormsReloadKey((k) => k + 1);
  }, []);

  // ---------------------------------------------------------------------------
  // Filtros: ¿un form cumple los filtros activos de tipo y criticidad?
  // (sin filtros activos → todo pasa)
  // ---------------------------------------------------------------------------
  const formMatchesFilters = useCallback((f: RouteForm): boolean => {
    if (filterTypes.size > 0) {
      const typeOk =
        (filterTypes.has("Eléctrico")    && !!f.electrical_description) ||
        (filterTypes.has("Obra Civil")   && !!f.civil_description) ||
        (filterTypes.has("Climatización")&& !!f.hvac_description) ||
        (filterTypes.has("Activos Fijos")&& !!f.fixed_assets_description) ||
        (filterTypes.has("General")      && !!f.general_description &&
          !f.electrical_description && !f.civil_description && !f.hvac_description && !f.fixed_assets_description);
      if (!typeOk) return false;
    }
    if (filterCriticalities.size > 0) {
      if (!f.criticality_name || !filterCriticalities.has(f.criticality_name)) return false;
    }
    return true;
  }, [filterTypes, filterCriticalities]);

  // IDs de locales que tienen ≥1 form que cumple los filtros (null = sin filtro)
  const visibleLocationIds = useMemo((): Set<string> | null => {
    if (filterTypes.size === 0 && filterCriticalities.size === 0) return null;
    const ids = new Set<string>();
    for (const [locId, forms] of formsByLocation) {
      if (forms.some(formMatchesFilters)) ids.add(locId);
    }
    return ids;
  }, [formsByLocation, filterTypes, filterCriticalities, formMatchesFilters]);

  // ---------------------------------------------------------------------------
  // Scored locations relative to origin (con filtros + orden)
  // ---------------------------------------------------------------------------
  const scoredLocations = useMemo((): ScoredLocation[] => {
    if (!origin) return [];
    const stopIds = new Set(stops.map((s) => s.locationId));

    return locations
      .filter((loc) => loc.id !== origin.id && !stopIds.has(loc.id))
      .filter((loc) => !visibleLocationIds || visibleLocationIds.has(loc.id))
      .map((loc) => {
        const locForms   = formsByLocation.get(loc.id) ?? [];
        const totalScore = locForms.reduce((acc, f) => acc + f.criticality_weight, 0);
        const distanceKm = haversine(origin.lat, origin.lng, loc.lat, loc.lng);
        return { ...loc, forms: locForms, totalForms: locForms.length, totalScore, distanceKm };
      })
      .sort((a, b) => {
        if (sortBy === "distance") return a.distanceKm - b.distanceKm;
        if (sortBy === "forms") return b.totalForms - a.totalForms || a.distanceKm - b.distanceKm;
        // priority (default): score/distancia
        const sa = a.distanceKm > 0 ? a.totalScore / a.distanceKm : a.totalScore;
        const sb = b.distanceKm > 0 ? b.totalScore / b.distanceKm : b.totalScore;
        return sb !== sa ? sb - sa : a.distanceKm - b.distanceKm;
      });
  }, [origin, locations, formsByLocation, stops, visibleLocationIds, sortBy]);

  // ---------------------------------------------------------------------------
  // Schedule (con hora de inicio configurable)
  // ---------------------------------------------------------------------------
  const startMinutes = useMemo(() => {
    const [h, m] = startTime.split(":").map(Number);
    return (h || 9) * 60 + (m || 0);
  }, [startTime]);
  const schedule = useMemo(() => calculateSchedule(stops, startMinutes), [stops, startMinutes]);

  // Recalcular el tiempo de traslado de las paradas cuando cambian las velocidades
  useEffect(() => {
    setStops((prev) => {
      let changed = false;
      const next = prev.map((s) => {
        const tm = travelMinutesFromKm(s.travelDistanceKm ?? 0, urbanSpeed, highwaySpeed);
        if (tm !== s.travelMinutes) { changed = true; return { ...s, travelMinutes: tm }; }
        return s;
      });
      return changed ? next : prev;
    });
  }, [urbanSpeed, highwaySpeed]);

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

    let travelDistanceKm = 0;
    let routeGeometry: GeoJSON.LineString | null = null;

    if (prevPoint) {
      travelDistanceKm = haversine(prevPoint.lat, prevPoint.lng, location.lat, location.lng);
      // OSRM: usar la distancia real por calles y la geometría
      try {
        const osrm = await getOsrmRoute([
          { lat: prevPoint.lat, lng: prevPoint.lng },
          { lat: location.lat, lng: location.lng },
        ]);
        if (osrm) {
          travelDistanceKm = osrm.distance / 1000; // metros → km
          routeGeometry = osrm.geometry;
        }
      } catch { /* keep haversine */ }
    }

    // El tiempo se calcula con las velocidades configuradas por el usuario
    const travelMinutes = travelMinutesFromKm(travelDistanceKm, urbanSpeed, highwaySpeed);

    setStops((prev) => [
      ...prev,
      {
        locationId: location.id,
        location,
        formIds: selectedIds,
        allForms: locForms,
        formMinutes: defaultMinutes,
        travelDistanceKm,
        travelMinutes,
        routeGeometry,
      },
    ]);
  }, [formsByLocation, stops, origin, urbanSpeed, highwaySpeed]);

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
    visibleLocationIds,
    sortBy, setSortBy,
    filterTypes, setFilterTypes,
    filterCriticalities, setFilterCriticalities,
    origin, setOrigin,
    stops, routeName, setRouteName,
    supplierId, setSupplierId,
    scheduledDate, setScheduledDate,
    startTime, setStartTime,
    urbanSpeed, setUrbanSpeed,
    highwaySpeed, setHighwaySpeed,
    saving,
    schedule, totalWorkMinutes, totalTravelMinutes, totalDays, endDate,
    addStop, removeStop, reorderStops,
    toggleFormInStop, addAllFormsToStop,
    setFormMinutes, resetRoute, saveRoute,
    mergeForms,
  };
}
