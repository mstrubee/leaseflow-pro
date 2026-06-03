import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { getOsrmRoute } from "@/lib/osrmRoute";
import { detectMaintenanceType } from "@/components/maintenance/types";
import { findNearbyHardwareStores, type HardwareStore } from "@/lib/findHardwareStore";

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
  dayBreak?: boolean;                  // fuerza el inicio de un día nuevo en esta parada
  priorityFormId?: string | null;      // form que se atiende primero en esta parada
  kind?: "location" | "errand" | "shopping"; // tipo de parada (default location)
  label?: string;                      // etiqueta para errand/shopping (ej. "Compras")
  stopMinutes?: number;                // tiempo de una parada SIN forms (compras / solo parada)
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
  formIds: string[];      // forms de esta parada que caen en este día (puede ser subconjunto)
  partial: boolean;       // true si la parada se parte entre días (continúa o viene de otro día)
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
// Fase 2: mínimo de muestras reales para recomendar un tiempo por tipo
const MIN_TIME_SAMPLES = 3;

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

function hhmmToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

/** Valor numérico de un form_number para comparar (el "padre" es el más alto). */
export function formNumberValue(s: string | null | undefined): number {
  return parseInt((s ?? "").replace(/\D/g, ""), 10) || 0;
}

// ---------------------------------------------------------------------------
// Match forms to location (independent of origin)
// ---------------------------------------------------------------------------

/** Normaliza para comparar: minúsculas, sin acentos (diacríticos U+0300–U+036F), sin espacios extra. */
const DIACRITICS = /[\u0300-\u036f]/g;
function norm(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(DIACRITICS, "").replace(/\s+/g, " ").trim();
}

export type CompanyKey = "agroplanet" | "autoplanet" | null;

/** Empresa canónica a partir de un texto (folder del local o nombre de empresa). */
export function companyKeyFromText(s: string): CompanyKey {
  const n = norm(s);
  if (n.includes("agroplanet")) return "agroplanet";
  if (n.includes("autoplanet")) return "autoplanet";
  return null;
}

function matchFormsToLocation(
  loc: MaintenanceLocation,
  allForms: RouteForm[],
  companyByContract: Map<string, CompanyKey>,
  contractNameById: Map<string, string>,
): RouteForm[] {
  if (allForms.length === 0) return [];

  const localName = norm(loc.local_name ?? "");
  const localCode = norm(loc.local_code ?? "");
  const locName   = norm(loc.name);
  const locCompany = companyKeyFromText(loc.folder); // 'autoplanet' | 'agroplanet'
  // Ciudad del local: el name sin el prefijo de empresa ("Agroplanet Casablanca" → "casablanca")
  const locCity = locName.replace(/^(agro|auto)planet\s+/, "");
  // Nombre "pelado": sin el prefijo de código del local ("AP0048-Rotonda Atena" → "rotonda atena").
  // Permite emparejar con contract_name sin código ("Rotonda Atenas").
  const stripCode = (s: string) => s.replace(/^[a-z]{1,4}\s*\d+\s*[-–]\s*/, "").trim();
  const bareName = stripCode(localName || locName);

  return allForms.filter((f) => {
    // Candidatos de nombre de contrato: el guardado en el form Y el nombre real del
    // contrato (de la tabla contracts, que lleva el código del local, ej. "AP0049-…").
    const candidates = [
      norm(f.contract_name ?? ""),
      norm((f.contract_id ? contractNameById.get(f.contract_id) : "") ?? ""),
    ].filter(Boolean);
    if (candidates.length === 0) return false;

    // Filtro por empresa: si conocemos la del form y la del local, deben coincidir.
    // Evita que un form "Casablanca" (Agroplanet) aparezca en "Autoplanet Casablanca".
    const formCompany = f.contract_id ? companyByContract.get(f.contract_id) ?? null : null;
    if (locCompany && formCompany && locCompany !== formCompany) return false;

    for (const cn of candidates) {
      // Código del local (Autoplanet: "AP0045")
      if (localCode && (cn.includes(localCode) || cn === localCode)) return true;
      // local_name completo (Autoplanet con nombre: "AP0045-Concon")
      if (localName && (cn.includes(localName) || localName.includes(cn))) return true;
      // Ciudad bidireccional ("casablanca" ↔ "agroplanet casablanca")
      if (locCity && (cn === locCity || cn.includes(locCity) || locCity.includes(cn))) return true;
      // Nombre "pelado" sin código ("AP0048-Rotonda Atena" → "rotonda atena" ↔ "Rotonda Atenas")
      if (bareName) {
        if (cn === bareName) return true;
        if (bareName.length >= 5 && (cn.includes(bareName) || bareName.includes(cn))) return true;
      }
      // Nombre completo bidireccional (último recurso)
      if (cn.includes(locName) || locName.includes(cn)) return true;
    }

    return false;
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
// Schedule calculator — MULTI-DÍA a nivel de FORM
// Reparte el trabajo en días hábiles (L-V). Cuando un form no cabe antes de las
// 18:00, continúa al día hábil siguiente. Una parada puede partirse entre días
// (sus forms): genera un ScheduleEntry por (parada, día). El almuerzo (1.5h) se
// aplica una vez por día, cruzando las 13:00.
// ---------------------------------------------------------------------------
export function calculateSchedule(
  stops: RouteStop[],
  startMinutes: number = WORK_START_MINUTES,
  dayStartTimes: Record<number, string> = {},
): ScheduleEntry[] {
  interface Tramo { arrival: number; day: number; travel: number; forms: string[]; work: number; }
  // Hora de inicio de cada día: día 0 = startMinutes (hora global); resto = override
  // del usuario o 9:00 por defecto.
  const dayStartOf = (d: number) =>
    d === 0 ? startMinutes
      : (dayStartTimes[d] != null ? hhmmToMinutes(dayStartTimes[d]) : WORK_START_MINUTES);
  const entries: ScheduleEntry[] = [];
  let cursor = startMinutes;
  let lunchTaken = false;
  let dayIndex = 0;
  let anyWorkPlaced = false; // no trasladar antes del primer trabajo absoluto

  const maybeLunch = (work: number) => {
    if (!lunchTaken && cursor + work > LUNCH_START && cursor < LUNCH_START + LUNCH_DURATION) {
      cursor = Math.max(cursor, LUNCH_START) + LUNCH_DURATION; lunchTaken = true;
    } else if (!lunchTaken && cursor >= LUNCH_START) {
      cursor += LUNCH_DURATION; lunchTaken = true;
    }
  };

  for (let i = 0; i < stops.length; i++) {
    const stop = stops[i];

    // Forms de la parada, con el prioritario primero (si sigue seleccionado)
    let orderedFormIds = stop.formIds;
    if (stop.priorityFormId && stop.formIds.includes(stop.priorityFormId)) {
      orderedFormIds = [stop.priorityFormId, ...stop.formIds.filter((id) => id !== stop.priorityFormId)];
    }
    const ids: (string | null)[] = orderedFormIds.length > 0 ? orderedFormIds : [null];

    // Corte de día forzado: esta parada inicia un día nuevo a su hora (no antes
    // de la 1ª parada). El traslado del día anterior no cuenta (parte aquí).
    const forcedBreak = i > 0 && anyWorkPlaced && !!stop.dayBreak;
    if (forcedBreak) {
      dayIndex += 1;
      cursor = dayStartOf(dayIndex);
      lunchTaken = false;
    } else if (anyWorkPlaced) {
      // Traslado desde la parada anterior (no antes del primer trabajo absoluto)
      cursor += stop.travelMinutes;
    }

    const tramoTravel = forcedBreak || !anyWorkPlaced ? 0 : stop.travelMinutes;
    let tramo: Tramo = { arrival: cursor, day: dayIndex, travel: tramoTravel, forms: [], work: 0 };
    const closeTramo = () => {
      if (tramo.forms.length === 0) return;
      entries.push({
        stopIndex: i, dayIndex: tramo.day,
        arrivalTime: minutesToHHMM(tramo.arrival),
        departureTime: minutesToHHMM(cursor),
        travelMinutes: tramo.travel,
        workMinutes: tramo.work,
        formIds: tramo.forms.filter((x): x is string => x !== null),
        partial: false,
        isLunch: false,
      });
    };

    for (const fid of ids) {
      // Parada sin forms (compras / solo parada): usar su stopMinutes; si tiene forms, el tiempo del form.
      const work = fid === null ? (stop.stopMinutes ?? DEFAULT_FORM_MINUTES) : (stop.formMinutes[fid] || DEFAULT_FORM_MINUTES);
      const lunchCost = (!lunchTaken && cursor + work > LUNCH_START && cursor < LUNCH_START + LUNCH_DURATION) ? LUNCH_DURATION : 0;

      // ¿Este form cabe antes de las 18:00? Si no, cerrar tramo y pasar al día siguiente
      if (anyWorkPlaced && cursor + lunchCost + work > WORK_END_MINUTES) {
        closeTramo();
        dayIndex += 1;
        cursor = dayStartOf(dayIndex);
        lunchTaken = false;
        tramo = { arrival: cursor, day: dayIndex, travel: 0, forms: [], work: 0 };
      }

      maybeLunch(work);
      if (tramo.forms.length === 0) tramo.arrival = cursor; // fijar llegada al primer form (post-almuerzo)
      cursor += work;
      tramo.work += work;
      tramo.forms.push(fid);
      anyWorkPlaced = true;
    }
    closeTramo();
  }

  // Marcar como parcial las paradas que quedaron divididas en más de un día
  const count: Record<number, number> = {};
  entries.forEach((e) => { count[e.stopIndex] = (count[e.stopIndex] ?? 0) + 1; });
  return entries.map((e) => ({ ...e, partial: count[e.stopIndex] > 1 }));
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------
export function useRouteBuilder(editTourId?: string | null) {
  const { user } = useAuth();

  const [locations, setLocations]         = useState<MaintenanceLocation[]>([]);
  const [criticalities, setCriticalities] = useState<CriticalityCategory[]>([]);
  const [allForms, setAllForms]           = useState<RouteForm[]>([]);
  const [loading, setLoading]             = useState(false);
  const [formsReloadKey, setFormsReloadKey] = useState(0);
  // Empresa (Agroplanet/Autoplanet) por contract_id — distingue locales homónimos
  const [companyByContract, setCompanyByContract] = useState<Map<string, CompanyKey>>(new Map());
  // Nombre REAL del contrato por id (lleva el código del local, ej. "AP0049-…").
  // El contract_name guardado en el form a veces es una etiqueta corta ("P20").
  const [contractNameById, setContractNameById] = useState<Map<string, string>>(new Map());
  // Fase 2: recomendación de tiempos — mediana de minutos reales por tipo de form
  const [timeStatsByType, setTimeStatsByType] = useState<Record<string, { median: number; count: number }>>({});
  // Memoria de tiempos por form (recuerda el tiempo aunque se deseleccione)
  const formMinutesMemory = useRef<Record<string, number>>({});

  // Route state
  const [origin, setOrigin]               = useState<MaintenanceLocation | null>(null);
  const [stops, setStops]                 = useState<RouteStop[]>([]);
  const [routeName, setRouteNameState]    = useState("");
  const [routeNameDirty, setRouteNameDirty] = useState(false); // true si el usuario lo editó a mano
  const [supplierId, setSupplierId]       = useState<string | null>(
    () => localStorage.getItem("lastRouteSupplierId") || null,
  );
  const [scheduledDate, setScheduledDate] = useState<string>("");
  const [startTime, setStartTime]         = useState<string>("09:00");
  // Hora de inicio por día (índice de día → "HH:MM"); día 0 usa startTime. Default 9:00.
  const [dayStartTimes, setDayStartTimes] = useState<Record<number, string>>({});
  const [saving, setSaving]               = useState(false);

  // Velocidades editables por el usuario (km/h) para estimar el traslado
  const [urbanSpeed, setUrbanSpeed]     = useState(20);
  const [highwaySpeed, setHighwaySpeed] = useState(100);
  const speedsLoadedRef = useRef(false);

  // Edición de una ruta/gira existente
  const [editingTourId, setEditingTourId]     = useState<string | null>(null);
  const [editingRouteIds, setEditingRouteIds] = useState<string[]>([]);
  const loadedTourRef = useRef<string | null>(null);

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

  // Cargar la última selección GLOBAL de velocidades (de cualquier usuario)
  useEffect(() => {
    (async () => {
      try {
        const { data } = await (supabase as any)
          .from("app_settings").select("value").eq("key", "route_travel_speeds").maybeSingle();
        const v = data?.value;
        if (v && typeof v === "object") {
          if (Number.isFinite(Number(v.urban)))   setUrbanSpeed(Number(v.urban));
          if (Number.isFinite(Number(v.highway))) setHighwaySpeed(Number(v.highway));
        }
      } catch { /* tabla ausente → usar defaults */ }
      finally { speedsLoadedRef.current = true; }
    })();
  }, []);

  // Persistir (global) la última selección de velocidades, con debounce.
  useEffect(() => {
    if (!speedsLoadedRef.current || !user) return;
    const t = setTimeout(() => {
      (supabase as any).from("app_settings").upsert(
        {
          key: "route_travel_speeds",
          value: { urban: urbanSpeed, highway: highwaySpeed },
          updated_at: new Date().toISOString(),
          updated_by: user.id,
        },
        { onConflict: "key" },
      ).then(() => {}, () => {});
    }, 600);
    return () => clearTimeout(t);
  }, [urbanSpeed, highwaySpeed, user]);

  // ---------------------------------------------------------------------------
  // Empresa por contrato (contract_id → agroplanet/autoplanet)
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from("contract_companies")
        .select("contract_id, companies!inner(name)")
        .returns<Array<{ contract_id: string; companies: { name: string } }>>();
      if (!data) return;
      const map = new Map<string, CompanyKey>();
      for (const row of data) {
        const key = companyKeyFromText(row.companies?.name ?? "");
        // No sobreescribir una empresa ya detectada con null
        if (key) map.set(row.contract_id, key);
        else if (!map.has(row.contract_id)) map.set(row.contract_id, null);
      }
      setCompanyByContract(map);
    })();
  }, [user]);

  // Nombre real de cada contrato (id → name), para emparejar forms por código de local
  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase.from("contracts").select("id, name").is("deleted_at", null);
      if (!data) return;
      setContractNameById(new Map((data as Array<{ id: string; name: string }>).map((c) => [c.id, c.name])));
    })();
  }, [user]);

  // ---------------------------------------------------------------------------
  // Load forms — runs once criticalities are ready (or immediately if empty)
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!user) return;

    // Intento con columnas de fusión; si la migración aún no se aplicó, reintenta sin ellas
    const baseCols = "id,form_number,general_description,electrical_description,civil_description,hvac_description,fixed_assets_description,criticality_category_id,contract_id,contract_name";
    (async () => {
      let res = await (supabase as any).from("maintenance_forms")
        .select(`${baseCols},merge_group_id,merge_is_primary`)
        .eq("status", "proceso").is("deleted_at", null);
      if (res.error && /merge_group_id|column|schema cache/i.test(res.error.message)) {
        res = await (supabase as any).from("maintenance_forms").select(baseCols)
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
      const matched = matchFormsToLocation(loc, allForms, companyByContract, contractNameById);
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
        // El "padre" del grupo es el de número de form más alto
        const sorted = [...gforms].sort((a, b) => formNumberValue(b.form_number) - formNumberValue(a.form_number));
        const rep = sorted[0];
        merged.push({
          ...rep,
          mergedFormIds: sorted.map((g) => g.id),
          mergedFormNumbers: sorted.map((g) => g.form_number),
        });
      }
      const result = [...singles, ...merged]
        .sort((a, b) => b.criticality_weight - a.criticality_weight);
      map.set(loc.id, result);
    }
    return map;
  }, [locations, allForms, companyByContract, contractNameById]);

  // Reconciliar stops cuando cambian las fusiones: colapsar los forms de un grupo
  // en su "padre" para que compartan UN solo tiempo (no varios por miembro).
  useEffect(() => {
    setStops((prev) => {
      let changed = false;
      const next = prev.map((stop) => {
        const locForms = formsByLocation.get(stop.locationId) ?? [];
        if (locForms.length === 0) return stop;
        const repByMember = new Map<string, string>();
        for (const rep of locForms) for (const mid of rep.mergedFormIds) repByMember.set(mid, rep.id);
        const newFormIds = Array.from(new Set(stop.formIds.map((id) => repByMember.get(id) ?? id)));
        const sameIds = newFormIds.length === stop.formIds.length && newFormIds.every((id, i) => id === stop.formIds[i]);
        if (sameIds) return stop;
        changed = true;
        // Un tiempo por grupo: usa el del padre si existe, si no el de algún miembro
        const newMinutes: Record<string, number> = {};
        for (const newId of newFormIds) {
          if (stop.formMinutes[newId] != null) { newMinutes[newId] = stop.formMinutes[newId]; continue; }
          const rep = locForms.find((r) => r.id === newId);
          const fromMember = rep?.mergedFormIds.map((mid) => stop.formMinutes[mid]).find((v) => v != null);
          newMinutes[newId] = fromMember ?? formMinutesMemory.current[newId] ?? DEFAULT_FORM_MINUTES;
        }
        const newPriority = stop.priorityFormId
          ? (repByMember.get(stop.priorityFormId) ?? stop.priorityFormId)
          : stop.priorityFormId;
        return { ...stop, formIds: newFormIds, allForms: locForms, formMinutes: newMinutes, priorityFormId: newPriority };
      });
      return changed ? next : prev;
    });
  }, [formsByLocation]);

  // Fusionar forms — directo en el cliente (no depende de RPC, que Lovable a
  // veces omite). Valida mismo local, asigna merge_group_id y registra historial.
  const mergeForms = useCallback(async (formIds: string[]): Promise<void> => {
    if (formIds.length < 2) throw new Error("Selecciona al menos 2 forms");

    const { data: fdata, error: ferr } = await supabase
      .from("maintenance_forms")
      .select("id, contract_id, form_number")
      .in("id", formIds);
    if (ferr) throw new Error(ferr.message);

    const contracts = new Set((fdata ?? []).map((f: { contract_id: string | null }) => f.contract_id));
    if (contracts.size > 1) throw new Error("Solo se pueden fusionar forms del mismo local");

    const groupId = crypto.randomUUID();
    const { error: uerr } = await (supabase as any)
      .from("maintenance_forms")
      .update({ merge_group_id: groupId })
      .in("id", formIds);
    if (uerr) throw new Error(uerr.message);

    // Historial (best-effort: no bloquear la fusión si el log falla)
    try {
      await (supabase as any).from("maintenance_form_merge_log").insert({
        merge_group_id: groupId,
        form_ids: formIds,
        form_numbers: (fdata ?? []).map((f: { form_number: string }) => f.form_number),
        contract_id: [...contracts][0] ?? null,
        action: "merged",
        performed_by: user?.id ?? null,
      });
    } catch { /* log opcional */ }

    setFormsReloadKey((k) => k + 1);
  }, [user]);

  // Deshacer fusión — directo en el cliente.
  const unmergeForms = useCallback(async (groupId: string): Promise<void> => {
    const { data: fdata } = await (supabase as any)
      .from("maintenance_forms")
      .select("id, form_number, contract_id")
      .eq("merge_group_id", groupId);

    const { error } = await (supabase as any)
      .from("maintenance_forms")
      .update({ merge_group_id: null })
      .eq("merge_group_id", groupId);
    if (error) throw new Error(error.message);

    try {
      await (supabase as any).from("maintenance_form_merge_log").insert({
        merge_group_id: groupId,
        form_ids: (fdata ?? []).map((f: { id: string }) => f.id),
        form_numbers: (fdata ?? []).map((f: { form_number: string }) => f.form_number),
        contract_id: (fdata ?? [])[0]?.contract_id ?? null,
        action: "unmerged",
        performed_by: user?.id ?? null,
      });
    } catch { /* log opcional */ }

    setFormsReloadKey((k) => k + 1);
  }, [user]);

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
        const allLocForms = formsByLocation.get(loc.id) ?? [];
        // Con filtros activos, mostrar solo los forms que cumplen
        const hasFilters = filterTypes.size > 0 || filterCriticalities.size > 0;
        const locForms = hasFilters ? allLocForms.filter(formMatchesFilters) : allLocForms;
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
  const schedule = useMemo(() => calculateSchedule(stops, startMinutes, dayStartTimes), [stops, startMinutes, dayStartTimes]);

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

  // Nombre sugerido por defecto: "Ruta <fecha> <zonas>" (zonas de origin + paradas)
  const suggestedRouteName = useMemo(() => {
    const zonas = Array.from(new Set(
      [origin, ...stops.map((s) => s.location)]
        .map((l) => l?.zona?.trim())
        .filter((z): z is string => !!z),
    ));
    const base = scheduledDate
      ? `Ruta ${scheduledDate.split("-").join(".")}`
      : "Ruta";
    return zonas.length ? `${base} ${zonas.join(", ")}` : base;
  }, [origin, stops, scheduledDate]);

  // Aplicar el sugerido mientras el usuario no haya escrito un nombre propio
  useEffect(() => {
    if (!routeNameDirty) setRouteNameState(suggestedRouteName);
  }, [suggestedRouteName, routeNameDirty]);

  // Setter público: marca el nombre como "editado a mano" (deja de autogenerarse)
  const setRouteName = useCallback((v: string) => {
    setRouteNameDirty(true);
    setRouteNameState(v);
  }, []);

  // ---------------------------------------------------------------------------
  // Fase 2: cargar estadísticas de tiempos reales por tipo de form
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await (supabase as any)
          .from("maintenance_route_forms")
          .select("real_minutes, maintenance_forms(electrical_description, civil_description, hvac_description, fixed_assets_description, general_description)")
          .eq("completed", true)
          .not("real_minutes", "is", null)
          .limit(3000);
        if (error || !data || cancelled) return;
        const byType: Record<string, number[]> = {};
        for (const row of data as any[]) {
          const mf = row.maintenance_forms;
          const mins = Number(row.real_minutes);
          if (!mf || !Number.isFinite(mins) || mins <= 0) continue;
          const type = detectMaintenanceType(mf);
          (byType[type] ??= []).push(mins);
        }
        const stats: Record<string, { median: number; count: number }> = {};
        for (const [type, vals] of Object.entries(byType)) {
          const sorted = [...vals].sort((a, b) => a - b);
          const mid = Math.floor(sorted.length / 2);
          const median = sorted.length % 2
            ? sorted[mid]
            : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
          stats[type] = { median, count: sorted.length };
        }
        if (!cancelled) setTimeStatsByType(stats);
      } catch { /* sin recomendación si falla */ }
    })();
    return () => { cancelled = true; };
  }, [user, formsReloadKey]);

  // Recomendación de minutos para un form (null si no hay muestras suficientes)
  const suggestMinutes = useCallback((form: RouteForm): { minutes: number; count: number } | null => {
    const type = detectMaintenanceType(form);
    const s = timeStatsByType[type];
    if (s && s.count >= MIN_TIME_SAMPLES) return { minutes: s.median, count: s.count };
    return null;
  }, [timeStatsByType]);

  // Fase 3: estimación contextual con IA (Gemini) bajo demanda
  const estimateMinutesAI = useCallback(async (form: RouteForm): Promise<{ minutes: number; reason: string } | null> => {
    const type = detectMaintenanceType(form);
    const stat = timeStatsByType[type];
    const descriptions = [
      { label: "Eléctrico", text: form.electrical_description },
      { label: "Obra Civil", text: form.civil_description },
      { label: "Climatización", text: form.hvac_description },
      { label: "Activos Fijos", text: form.fixed_assets_description },
      { label: "General", text: form.general_description },
    ].filter((d) => d.text?.trim());
    const { data, error } = await supabase.functions.invoke("recommend-form-time", {
      body: {
        descriptions,
        formType: type,
        baseMinutes: stat?.median ?? DEFAULT_FORM_MINUTES,
        sampleCount: stat?.count ?? 0,
      },
    });
    if (error || !data || !Number.isFinite(Number((data as any).minutes))) return null;
    return { minutes: Math.round(Number((data as any).minutes)), reason: String((data as any).reason ?? "") };
  }, [timeStatsByType]);

  // Tiempo por defecto de un form: recordado > recomendado > default fijo
  const defaultMinutesFor = useCallback((form?: RouteForm, id?: string): number => {
    const key = id ?? form?.id;
    if (key && formMinutesMemory.current[key] !== undefined) return formMinutesMemory.current[key];
    const rec = form ? suggestMinutes(form) : null;
    return rec?.minutes ?? DEFAULT_FORM_MINUTES;
  }, [suggestMinutes]);

  // ---------------------------------------------------------------------------
  // Mutations
  // ---------------------------------------------------------------------------
  const addStop = useCallback(async (location: MaintenanceLocation, formIds?: string[]) => {
    const locForms       = formsByLocation.get(location.id) ?? [];
    const selectedIds    = formIds ?? locForms.map((f) => f.id);
    // Usar el tiempo recordado si existe (no perder lo configurado antes)
    const defaultMinutes = Object.fromEntries(
      selectedIds.map((id) => [id, defaultMinutesFor(locForms.find((f) => f.id === id), id)]),
    );

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
  }, [formsByLocation, stops, origin, urbanSpeed, highwaySpeed, defaultMinutesFor]);

  const removeStop = useCallback(async (locationId: string) => {
    const idx = stops.findIndex((s) => s.locationId === locationId);
    if (idx === -1) return;
    const remaining = stops.filter((s) => s.locationId !== locationId);

    // El tramo que SEGUÍA a la parada eliminada queda ahora en la posición idx;
    // hay que recalcular su traslado (distancia + geometría OSRM + minutos) para
    // que la ruta deje de pasar por el local eliminado.
    const affected = remaining[idx];
    if (!affected || affected.kind === "shopping") {
      setStops(remaining);
      return;
    }

    // Punto previo = parada real anterior (omitiendo compras sin coords) o el origen.
    let prevPoint: { lat: number; lng: number } | null = origin;
    for (let j = idx - 1; j >= 0; j--) {
      if (remaining[j].kind !== "shopping") { prevPoint = remaining[j].location; break; }
    }

    let km = 0;
    let geom: GeoJSON.LineString | null = null;
    let minutes = 0;
    if (prevPoint) {
      km = haversine(prevPoint.lat, prevPoint.lng, affected.location.lat, affected.location.lng);
      try {
        const osrm = await getOsrmRoute([
          { lat: prevPoint.lat, lng: prevPoint.lng },
          { lat: affected.location.lat, lng: affected.location.lng },
        ]);
        if (osrm) { km = osrm.distance / 1000; geom = osrm.geometry; }
      } catch { /* keep haversine */ }
      minutes = travelMinutesFromKm(km, urbanSpeed, highwaySpeed);
    }

    setStops(remaining.map((s, i) =>
      i === idx ? { ...s, travelDistanceKm: km, travelMinutes: minutes, routeGeometry: geom } : s,
    ));
  }, [stops, origin, urbanSpeed, highwaySpeed]);

  // Parada de compras CON lugar (ferretería sugerida por OSM): tiene coordenadas,
  // entra al mapa y suma traslado real desde la parada previa.
  const addPurchaseStop = useCallback(async (store: { name: string; lat: number; lng: number }, minutes: number) => {
    const id = crypto.randomUUID();
    const loc: MaintenanceLocation = {
      id, poi_id: "", name: store.name, folder: "", local_code: null, local_name: null,
      gerente_zonal: null, zona: null, centro_sap: null, lat: store.lat, lng: store.lng,
    };
    // Punto previo = última parada real (omitiendo compras sin coords) o el origen.
    let prevPoint: { lat: number; lng: number } | null = origin;
    for (let j = stops.length - 1; j >= 0; j--) {
      if (stops[j].kind !== "shopping") { prevPoint = stops[j].location; break; }
    }
    let km = 0;
    let geom: GeoJSON.LineString | null = null;
    if (prevPoint) {
      km = haversine(prevPoint.lat, prevPoint.lng, loc.lat, loc.lng);
      try {
        const osrm = await getOsrmRoute([
          { lat: prevPoint.lat, lng: prevPoint.lng },
          { lat: loc.lat, lng: loc.lng },
        ]);
        if (osrm) { km = osrm.distance / 1000; geom = osrm.geometry; }
      } catch { /* keep haversine */ }
    }
    const travelMinutes = prevPoint ? travelMinutesFromKm(km, urbanSpeed, highwaySpeed) : 0;
    setStops((prev) => [...prev, {
      locationId: id, location: loc, formIds: [], allForms: [], formMinutes: {},
      travelDistanceKm: km, travelMinutes, routeGeometry: geom,
      kind: "errand", label: store.name, stopMinutes: minutes,
    }]);
  }, [stops, origin, urbanSpeed, highwaySpeed]);

  // Punto de trabajo actual = última parada real o el origen (para sugerir ferretería)
  const workingPoint = useMemo<{ lat: number; lng: number } | null>(() => {
    for (let j = stops.length - 1; j >= 0; j--) {
      const s = stops[j];
      if (s.kind !== "shopping" && (s.location.lat || s.location.lng)) {
        return { lat: s.location.lat, lng: s.location.lng };
      }
    }
    return origin ? { lat: origin.lat, lng: origin.lng } : null;
  }, [stops, origin]);

  // Ferreterías candidatas cercanas (para el diálogo de compras y los globos del mapa)
  const [purchaseCandidates, setPurchaseCandidates] = useState<HardwareStore[]>([]);
  const [searchingPurchase, setSearchingPurchase] = useState(false);
  const searchPurchaseCandidates = useCallback(async () => {
    if (!workingPoint) { setPurchaseCandidates([]); return; }
    setSearchingPurchase(true);
    try {
      const list = await findNearbyHardwareStores(workingPoint.lat, workingPoint.lng);
      setPurchaseCandidates(list);
    } catch {
      setPurchaseCandidates([]);
    } finally {
      setSearchingPurchase(false);
    }
  }, [workingPoint]);
  const clearPurchaseCandidates = useCallback(() => setPurchaseCandidates([]), []);

  // Parada de compras: bloque de tiempo SIN lugar (no entra al mapa, sin traslado).
  const addErrandStop = useCallback((label: string, minutes: number) => {
    const id = crypto.randomUUID();
    const placeholder: MaintenanceLocation = {
      id, poi_id: "", name: label, folder: "", local_code: null, local_name: null,
      gerente_zonal: null, zona: null, centro_sap: null, lat: 0, lng: 0,
    };
    setStops((prev) => [...prev, {
      locationId: id, location: placeholder, formIds: [], allForms: [],
      formMinutes: {}, travelDistanceKm: 0, travelMinutes: 0, routeGeometry: null,
      kind: "shopping", label, stopMinutes: minutes,
    }]);
  }, []);

  // Tiempo / etiqueta de una parada sin forms (compras o "solo parada")
  const setStopMinutes = useCallback((stopId: string, minutes: number) => {
    setStops((prev) => prev.map((s) => s.locationId === stopId ? { ...s, stopMinutes: minutes } : s));
  }, []);
  const setStopLabel = useCallback((stopId: string, label: string) => {
    setStops((prev) => prev.map((s) => s.locationId === stopId ? { ...s, label } : s));
  }, []);

  const reorderStops = useCallback((newStops: RouteStop[]) => setStops(newStops), []);

  const toggleFormInStop = useCallback((locationId: string, formId: string) => {
    setStops((prev) => prev.map((s) => {
      if (s.locationId !== locationId) return s;
      const has = s.formIds.includes(formId);
      const formIds = has ? s.formIds.filter((id) => id !== formId) : [...s.formIds, formId];
      const formMinutes = { ...s.formMinutes };
      // Al re-seleccionar, recuperar el tiempo recordado o recomendado (no resetear a default)
      if (!has && formMinutes[formId] === undefined) {
        formMinutes[formId] = defaultMinutesFor(s.allForms.find((f) => f.id === formId), formId);
      }
      return { ...s, formIds, formMinutes };
    }));
  }, [defaultMinutesFor]);

  const addAllFormsToStop = useCallback((locationId: string) => {
    setStops((prev) => prev.map((s) => {
      if (s.locationId !== locationId) return s;
      const formIds    = s.allForms.map((f) => f.id);
      const formMinutes = { ...s.formMinutes };
      for (const id of formIds) if (formMinutes[id] === undefined) {
        formMinutes[id] = defaultMinutesFor(s.allForms.find((f) => f.id === id), id);
      }
      return { ...s, formIds, formMinutes };
    }));
  }, [defaultMinutesFor]);

  const setFormMinutes = useCallback((locationId: string, formId: string, minutes: number) => {
    formMinutesMemory.current[formId] = minutes; // recordar para futuras (de)selecciones
    setStops((prev) => prev.map((s) =>
      s.locationId === locationId
        ? { ...s, formMinutes: { ...s.formMinutes, [formId]: minutes } }
        : s,
    ));
  }, []);

  // Deseleccionar todos los forms de una parada (mantiene la parada y el tiempo recordado)
  const clearFormsInStop = useCallback((locationId: string) => {
    setStops((prev) => prev.map((s) =>
      s.locationId === locationId
        ? { ...s, formIds: [], priorityFormId: null }
        : s,
    ));
  }, []);

  // Marcar/desmarcar una parada como inicio de día (corte forzado). La hora del
  // día se edita por separado (setDayStartTimeForDay), no en la parada.
  const toggleDayBreak = useCallback((locationId: string) => {
    setStops((prev) => prev.map((s) =>
      s.locationId === locationId ? { ...s, dayBreak: !s.dayBreak } : s,
    ));
  }, []);

  // Fijar la hora de inicio de un día concreto (por índice). Día 0 = startTime.
  const setDayStartTimeForDay = useCallback((dayIndex: number, time: string) => {
    if (dayIndex === 0) { setStartTime(time); return; }
    setDayStartTimes((prev) => ({ ...prev, [dayIndex]: time }));
  }, []);

  // Fijar/quitar el form prioritario de una parada (se atiende primero)
  const setPriorityForm = useCallback((locationId: string, formId: string | null) => {
    setStops((prev) => prev.map((s) => {
      if (s.locationId !== locationId) return s;
      const next = s.priorityFormId === formId ? null : formId; // toggle
      return { ...s, priorityFormId: next };
    }));
  }, []);

  const resetRoute = useCallback(() => {
    setOrigin(null); setStops([]);
    setRouteNameState(""); setRouteNameDirty(false); // vuelve a autogenerarse
    setScheduledDate(""); setStartTime("09:00"); setDayStartTimes({});
    setEditingTourId(null); setEditingRouteIds([]); loadedTourRef.current = null;
    // supplierId NO se resetea: mantiene el último usado como default
  }, []);

  // ---------------------------------------------------------------------------
  // Cargar una ruta/gira existente en el armador para editarla
  // ---------------------------------------------------------------------------
  const loadTour = useCallback(async (routeOrTourId: string) => {
    // 1) Tomar la ruta clickeada para conocer su tour_id (si es una gira)
    const { data: clicked } = await (supabase as any)
      .from("maintenance_routes").select("*").eq("id", routeOrTourId).maybeSingle();
    const tid: string | null = clicked?.tour_id ?? null;

    let routeRows: any[] = [];
    if (tid) {
      const res = await (supabase as any).from("maintenance_routes")
        .select("*").eq("tour_id", tid).is("deleted_at", null);
      routeRows = (res.data as any[]) ?? [];
    }
    if (routeRows.length === 0) routeRows = clicked ? [clicked] : [];
    if (routeRows.length === 0) return;

    routeRows.sort((a, b) =>
      (a.day_index ?? 0) - (b.day_index ?? 0) ||
      String(a.scheduled_date).localeCompare(String(b.scheduled_date)),
    );

    const routeIds = routeRows.map((r) => r.id);
    const stopsRes = await (supabase as any).from("maintenance_route_stops")
      .select("*").in("route_id", routeIds);
    const stopRows = (stopsRes.data as any[]) ?? [];
    const stopIds = stopRows.map((s) => s.id);
    const formsRes = stopIds.length
      ? await (supabase as any).from("maintenance_route_forms").select("*").in("route_stop_id", stopIds)
      : { data: [] };
    const formRows = (formsRes.data as any[]) ?? [];

    const formsByStop = new Map<string, any[]>();
    for (const f of formRows) {
      const a = formsByStop.get(f.route_stop_id) || []; a.push(f); formsByStop.set(f.route_stop_id, a);
    }
    const stopsByRoute = new Map<string, any[]>();
    for (const s of stopRows) {
      const a = stopsByRoute.get(s.route_id) || []; a.push(s); stopsByRoute.set(s.route_id, a);
    }

    const allFormById = new Map(allForms.map((f) => [f.id, f]));
    const locById = new Map(locations.map((l) => [l.id, l]));

    const newStops: RouteStop[] = [];
    const newDayStartTimes: Record<number, string> = {};

    routeRows.forEach((r, dayIdx) => {
      const di = r.day_index ?? dayIdx;
      if (r.start_time) newDayStartTimes[di] = String(r.start_time).slice(0, 5);
      const dayStops = (stopsByRoute.get(r.id) || []).sort((a, b) => (a.stop_order ?? 0) - (b.stop_order ?? 0));
      dayStops.forEach((s, idxInDay) => {
        const kind = (s.stop_kind ?? "location") as RouteStop["kind"];
        const locId: string | null = s.location_id;
        let loc: MaintenanceLocation | undefined;
        if (locId && locById.has(locId)) {
          loc = locById.get(locId);
        } else {
          // Parada ad-hoc (ferretería sugerida / compras): usar coords guardadas
          const lat = Number(s.stop_lat ?? 0);
          const lng = Number(s.stop_lng ?? 0);
          loc = {
            id: locId ?? crypto.randomUUID(), poi_id: "", name: s.stop_label ?? "Parada", folder: "",
            local_code: null, local_name: null, gerente_zonal: null, zona: null, centro_sap: null, lat, lng,
          };
        }
        if (!loc) return; // local eliminado: omitir

        const stopForms = formsByStop.get(s.id) || [];
        const formIds = stopForms.map((f) => f.maintenance_form_id).filter((fid: string) => allFormById.has(fid));
        const formMinutes: Record<string, number> = {};
        for (const f of stopForms) formMinutes[f.maintenance_form_id] = f.estimated_minutes ?? DEFAULT_FORM_MINUTES;
        // allForms del local = todos los del local (para poder añadir/quitar al editar)
        const allFs = formsByLocation.get(loc.id) ?? formIds.map((fid) => allFormById.get(fid)!).filter(Boolean);

        newStops.push({
          locationId: loc.id, location: loc,
          formIds, allForms: allFs, formMinutes,
          travelDistanceKm: 0, travelMinutes: s.estimated_travel_min ?? 0, routeGeometry: null,
          dayBreak: di > 0 && idxInDay === 0 ? true : undefined,
          kind, label: s.stop_label ?? undefined, stopMinutes: s.stop_minutes ?? undefined,
        });
      });
    });

    // Recalcular distancias/tiempos por tramo (haversine), para que el efecto de
    // velocidades no los ponga en 0 y el cronograma sea correcto.
    let prev: { lat: number; lng: number } | null = null;
    for (const st of newStops) {
      if (st.kind === "shopping") { st.travelDistanceKm = 0; st.travelMinutes = 0; continue; }
      if (prev) {
        const km = haversine(prev.lat, prev.lng, st.location.lat, st.location.lng);
        st.travelDistanceKm = km;
        st.travelMinutes = travelMinutesFromKm(km, urbanSpeed, highwaySpeed);
      } else {
        st.travelDistanceKm = 0; st.travelMinutes = 0;
      }
      prev = { lat: st.location.lat, lng: st.location.lng };
    }

    // Hidratar estado del armador
    setOrigin(null);
    setStops(newStops);
    setDayStartTimes(newDayStartTimes);
    setSupplierId(routeRows[0].supplier_id ?? null);
    setScheduledDate(routeRows[0].scheduled_date ? String(routeRows[0].scheduled_date) : "");
    if (newDayStartTimes[0]) setStartTime(newDayStartTimes[0]);
    const baseName = String(routeRows[0].name ?? "").replace(/\s—\sDía\s.*$/u, "").trim();
    setRouteNameState(baseName);
    setRouteNameDirty(true); // conservar el nombre cargado
    setEditingTourId(tid ?? routeOrTourId);
    setEditingRouteIds(routeIds);
  }, [allForms, locations, formsByLocation, urbanSpeed, highwaySpeed]);

  // Disparar la carga cuando el contenedor pide editar una ruta/gira
  useEffect(() => {
    if (!editTourId || loading) return;
    if (locations.length === 0 || allForms.length === 0) return;
    if (loadedTourRef.current === editTourId) return;
    loadedTourRef.current = editTourId;
    loadTour(editTourId);
  }, [editTourId, loading, locations, allForms, loadTour]);

  // ---------------------------------------------------------------------------
  // Save
  // ---------------------------------------------------------------------------
  const saveRoute = useCallback(async (opts?: { schedule?: boolean }): Promise<string> => {
    const calendarize = opts?.schedule !== false; // por defecto, calendarizar
    if (!user)              throw new Error("No autenticado");
    if (!routeName.trim())  throw new Error("Ingresa un nombre para la ruta");
    if (stops.length === 0) throw new Error("Agrega al menos una parada");
    if (calendarize && !scheduledDate) throw new Error("Selecciona la fecha de inicio");

    setSaving(true);
    try {
      // Si estamos EDITANDO una ruta/gira: enviar a la papelera las rutas previas
      // (recuperables) antes de volver a insertar la versión actualizada.
      if (editingRouteIds.length > 0) {
        await (supabase as any).from("maintenance_routes")
          .update({ deleted_at: new Date().toISOString() })
          .in("id", editingRouteIds);
      }

      // Ids de locales de mantención reales (para distinguir paradas ad-hoc)
      const realLocIds = new Set(locations.map((l) => l.id));

      // Agrupar los TRAMOS (parada-día) por día. Una parada partida aparece en
      // varios días con sus forms respectivos (e.formIds).
      const byDay = new Map<number, { stopIndex: number; formIds: string[] }[]>();
      const dayStartByIndex = new Map<number, string>();
      schedule.forEach((e) => {
        if (!byDay.has(e.dayIndex)) byDay.set(e.dayIndex, []);
        byDay.get(e.dayIndex)!.push({ stopIndex: e.stopIndex, formIds: e.formIds });
        // Hora de inicio del día = llegada del primer tramo de ese día
        if (!dayStartByIndex.has(e.dayIndex)) dayStartByIndex.set(e.dayIndex, e.arrivalTime);
      });

      const tourId = crypto.randomUUID();
      const days = [...byDay.keys()].sort((a, b) => a - b);
      const multiDay = days.length > 1;
      let firstRouteId = "";

      for (const dayIndex of days) {
        // Sin agendar (calendarize=false) → sin fecha (scheduled_date null)
        const dayDate = calendarize && scheduledDate ? addBusinessDays(scheduledDate, dayIndex) : null;
        const dayName = multiDay
          ? `${routeName.trim()} — Día ${dayIndex + 1}${dayDate ? ` (${dayDate})` : ""}`
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
          start_time: dayStartByIndex.get(dayIndex) ?? startTime,
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

        // Tramos (parada-día) de este día, en orden, re-numerados desde 1
        const dayTramos = byDay.get(dayIndex)!;
        for (let order = 0; order < dayTramos.length; order++) {
          const tramo = dayTramos[order];
          const stop = stops[tramo.stopIndex];
          const isShopping = stop.kind === "shopping";
          // location_id solo si es un local de mantención real; las ferreterías
          // sugeridas (ad-hoc) y las compras genéricas no tienen location_id, pero
          // sí guardan sus coordenadas en stop_lat/stop_lng.
          const hasRealLoc = !isShopping && realLocIds.has(stop.locationId);
          const locId = hasRealLoc ? stop.locationId : null;
          const adHocLat = !hasRealLoc && (stop.location.lat || stop.location.lng) ? stop.location.lat : null;
          const adHocLng = !hasRealLoc && (stop.location.lat || stop.location.lng) ? stop.location.lng : null;
          let stopRow: { id: string } | null = null;
          let stopErr: { message: string } | null = null;
          {
            const res = await supabase.from("maintenance_route_stops").insert({
              route_id: route.id, location_id: locId, stop_order: order + 1,
              estimated_travel_min: stop.travelMinutes,
              stop_kind: stop.kind ?? "location", stop_label: stop.label ?? null, stop_minutes: stop.stopMinutes ?? null,
              stop_lat: adHocLat, stop_lng: adHocLng,
            } as never).select("id").single();
            stopRow = res.data; stopErr = res.error;
            if (stopErr && /stop_kind|stop_label|stop_minutes|stop_lat|stop_lng|column|schema cache/i.test(stopErr.message)) {
              const res2 = await supabase.from("maintenance_route_stops").insert({
                route_id: route.id, location_id: locId, stop_order: order + 1, estimated_travel_min: stop.travelMinutes,
              } as never).select("id").single();
              stopRow = res2.data; stopErr = res2.error;
            }
          }
          if (stopErr || !stopRow) throw new Error(stopErr?.message ?? "Error al crear parada");

          // Solo los forms de ESTA parada que caen en ESTE día
          const dayFormIds = tramo.formIds;
          if (dayFormIds.length > 0) {
            const formRows = dayFormIds.map((fid) => ({
              route_stop_id: stopRow.id,
              maintenance_form_id: fid,
              estimated_minutes: stop.formMinutes[fid] ?? DEFAULT_FORM_MINUTES,
            }));
            let formErr = (await supabase.from("maintenance_route_forms").insert(formRows)).error;
            if (formErr && /estimated_minutes|column|schema cache/i.test(formErr.message)) {
              const baseRows = dayFormIds.map((fid) => ({
                route_stop_id: stopRow.id,
                maintenance_form_id: fid,
              }));
              formErr = (await supabase.from("maintenance_route_forms").insert(baseRows)).error;
            }
            if (formErr) throw new Error(formErr.message);
          }
        }
      }

      if (supplierId) localStorage.setItem("lastRouteSupplierId", supplierId);
      // Edición completada: limpiar estado de edición
      setEditingTourId(null); setEditingRouteIds([]); loadedTourRef.current = null;
      return firstRouteId;
    } finally { setSaving(false); }
  }, [user, routeName, supplierId, scheduledDate, startTime, stops, schedule, editingRouteIds, locations]);

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
    dayStartTimes, setDayStartTimeForDay,
    urbanSpeed, setUrbanSpeed,
    highwaySpeed, setHighwaySpeed,
    saving,
    schedule, totalWorkMinutes, totalTravelMinutes, totalDays, endDate,
    addStop, addErrandStop, addPurchaseStop, workingPoint, removeStop, reorderStops,
    purchaseCandidates, searchingPurchase, searchPurchaseCandidates, clearPurchaseCandidates,
    setStopMinutes, setStopLabel,
    toggleFormInStop, addAllFormsToStop, clearFormsInStop,
    setFormMinutes, resetRoute, saveRoute,
    toggleDayBreak, setPriorityForm,
    mergeForms, unmergeForms,
    suggestMinutes, timeStatsByType, estimateMinutesAI,
    editingTourId, isEditing: editingRouteIds.length > 0, loadTour,
  };
}
