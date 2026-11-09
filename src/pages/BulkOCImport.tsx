import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import * as XLSX from "xlsx";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import {
  ArrowLeft, Upload, FileSpreadsheet, CheckCircle2, AlertTriangle,
  MapPin, User, Loader2, CloudUpload, History, RefreshCw,
  ChevronDown, ChevronUp, Link2, Pencil, Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { useAppLogos } from "@/hooks/useAppLogos";
import { useEconomicIndicators } from "@/hooks/useEconomicIndicators";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { uploadFileToStorage, extractStoragePath } from "@/lib/storageUtils";
import { useAuth } from "@/hooks/useAuth";
import { ReconcileImportsDialog } from "@/components/budget/ReconcileImportsDialog";
import {
  OPEX_CATEGORY_COLUMNS,
  FIRST_CATEGORY_REQUIRED_YEAR,
  isCategoryValidForYear,
  isOpexCategoryRequired,
  opexCategoryErrorMessage,
  yearFromDate,
  type OpexCategoryRecord,
} from "@/lib/opexCategories";
import {
  parseOCExcelSheet, resolveRows, groupByOrderNumber, centroKey, supplierOverrideKey,
  OCSupplier, SupplierOverride, GroupedOC, OCRowStatus, DuplicateResolution,
  RawOCRow,
} from "@/lib/parseBulkOCExcel";
import { matchSuppliersWithAI, findSupplierMatch, SupplierMatchSource } from "@/lib/supplierMatching";

// ── Extended location type (includes id for centro_sap update) ────────────────

interface FullLocation {
  id: string;
  contract_id: string | null;
  contract_name: string;
  /** Empresa del contrato. El logo NO se puede deducir de contract_name: ese
   *  campo es el nombre del local ("San Felipe"), no el de la empresa. */
  company_name: string | null;
  centro_sap: string | null;
}

interface CentroMapping {
  centroCode: string;       // raw value from Excel, e.g. "0428"
  locationId: string | null;
  contractId: string | null;
  contractName: string | null;
  remember: boolean;        // save to centro_sap for future imports
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface ImportBatch {
  id: string;
  filename: string;
  storage_path: string | null;
  imported_at: string;
  rows_total: number;
  rows_ok: number;
  rows_pending_supplier: number;
  rows_pending_local: number;
  rows_duplicate: number;
  drive_synced_at: string | null;
}

type Stage = "idle" | "parsing" | "mapping" | "review" | "importing" | "done";

// ── Helpers ───────────────────────────────────────────────────────────────────

function statusBadge(status: OCRowStatus) {
  switch (status) {
    case "ok":               return <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200">Listo</Badge>;
    case "pending_supplier": return <Badge className="bg-amber-100 text-amber-800 border-amber-200">Sin proveedor</Badge>;
    case "pending_local":    return <Badge className="bg-orange-100 text-orange-800 border-orange-200">Sin local</Badge>;
    case "pending_both":     return <Badge className="bg-red-100 text-red-800 border-red-200">Sin local y proveedor</Badge>;
  }
}

function fmtClp(n: number) {
  return new Intl.NumberFormat("es-CL", {
    style: "currency", currency: "CLP", maximumFractionDigits: 0,
  }).format(n);
}

function fmtDate(iso: string) {
  try { return format(parseISO(iso), "dd/MM/yyyy", { locale: es }); } catch { return iso; }
}

function extractCentroCode(cebe: string | null): string {
  if (!cebe) return "";
  return cebe.replace(/^H/i, "").replace(/P\d+$/i, "").trim();
}

const SUPPLIER_SOURCE_LABEL: Partial<Record<SupplierMatchSource, string>> = {
  ai:     "Identificado con IA",
  fuzzy:  "Nombre similar",
  manual: "Asignado manualmente",
};

/** Tolerancia de 1 peso: los montos vienen de sumar filas del Excel y el
 *  redondeo no debe contar como diferencia real. */
function amountsDiffer(a: number, b: number): boolean {
  return Math.abs((a || 0) - (b || 0)) >= 1;
}

/** Guarda "código Centro → contrato" para que próximas cargas lo reconozcan solas. */
async function saveCentroMappings(items: { centroCode: string; contractId: string }[]): Promise<boolean> {
  if (items.length === 0) return true;
  const { error } = await (supabase
    .from("oc_centro_mappings" as any)
    .upsert(
      items.map(m => ({
        centro_code: m.centroCode.trim().toUpperCase(),
        contract_id: m.contractId,
        updated_at:  new Date().toISOString(),
      })),
      { onConflict: "centro_code" },
    ) as any);
  if (error) console.error("Error al guardar los mapeos de código Centro:", error);
  return !error;
}

interface ExistingOrder { id: string; amountClp: number }

/** OC ya existentes por número. Una OC "digitada" multi-local tiene N filas con el
 *  MISMO order_number (una por contrato, con el monto PARCIAL de cada asignación),
 *  así que se suman todas para obtener el total real. Devuelve null si la consulta falla. */
async function fetchExistingOrders(orderNumbers: string[]): Promise<Map<string, ExistingOrder> | null> {
  const result = new Map<string, ExistingOrder>();
  const unique = [...new Set(orderNumbers.filter(Boolean))];
  for (let i = 0; i < unique.length; i += 200) {
    const { data, error } = await supabase
      .from("purchase_orders")
      .select("id, order_number, amount_clp")
      .in("order_number", unique.slice(i, i + 200))
      .is("deleted_at", null) as any;
    if (error) {
      console.error("Error al buscar OC existentes:", error);
      toast.error("No se pudo verificar qué OC ya existen. Revisa antes de importar para no duplicar.");
      return null;
    }
    for (const o of (data || []) as any[]) {
      const prev = result.get(o.order_number);
      result.set(o.order_number, {
        id:        prev?.id ?? o.id, // se usa la primera fila como referencia
        amountClp: (prev?.amountClp ?? 0) + (Number(o.amount_clp) || 0),
      });
    }
  }
  return result;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function BulkOCImport() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { logos } = useAppLogos();
  const { ufValue } = useEconomicIndicators();
  const { isAdmin } = useAuth();
  const [showReconcileDialog, setShowReconcileDialog] = useState(false);

  // Reference data
  const [allLocations, setAllLocations] = useState<FullLocation[]>([]);
  const [suppliers,    setSuppliers]    = useState<OCSupplier[]>([]);
  const [batches,      setBatches]      = useState<ImportBatch[]>([]);
  const [loadingRef,   setLoadingRef]   = useState(true);

  // Import flow
  const [stage,    setStage]    = useState<Stage>("idle");
  const [file,     setFile]     = useState<File | null>(null);
  const [rawRows,  setRawRows]  = useState<RawOCRow[]>([]);
  const [mappings, setMappings] = useState<CentroMapping[]>([]);
  const [progress, setProgress] = useState(0);
  const [showHistory, setShowHistory] = useState(true);

  // Desde 2027 toda OC de OPEX necesita categoría; el Excel de SAP no la trae, así que se elige una para toda la importación.
  const [opexCategories, setOpexCategories] = useState<OpexCategoryRecord[]>([]);
  const [importCategoryId, setImportCategoryId] = useState<string | null>(null);

  // Decisiones del usuario. Viven aparte de la tabla de revisión (que se deriva de
  // ellas) para que volver un paso atrás o re-resolver no pierda avance.
  const [supplierOverrides, setSupplierOverrides] = useState<Record<string, SupplierOverride>>({});
  const [existingOrders,    setExistingOrders]    = useState<Map<string, ExistingOrder>>(new Map());
  const [resolutions,       setResolutions]       = useState<Record<string, DuplicateResolution>>({});
  const [parsingMessage,    setParsingMessage]    = useState("Procesando archivo…");

  // Inline editing in review table (key = "orderNumber:allocIdx" for local, "orderNumber" for supplier)
  const [editingLocalKey,    setEditingLocalKey]    = useState<string | null>(null);
  const [editingSupplierKey, setEditingSupplierKey] = useState<string | null>(null);

  // Categorías OPEX (con vigencia) para asignarlas a las OC desde 2027.
  useEffect(() => {
    supabase
      .from("opex_categories")
      .select(OPEX_CATEGORY_COLUMNS)
      .eq("is_active", true)
      .order("display_order", { ascending: true })
      .then(({ data, error }) => {
        if (error) {
          console.error("Error al cargar categorías OPEX:", error);
          toast.error("No se pudieron cargar las categorías OPEX");
          return;
        }
        setOpexCategories((data || []) as OpexCategoryRecord[]);
      });
  }, []);

  // ── Load reference data ────────────────────────────────────────────────────

  useEffect(() => {
    async function load() {
      setLoadingRef(true);
      // Load CEBE codes from contract_custom_field_values
      const { data: cebeFields } = await supabase
        .from("contract_custom_fields" as any)
        .select("id")
        .ilike("field_name", "%cebe%") as any;

      const fieldIds: string[] = (cebeFields || []).map((f: any) => f.id);

      let cebeLocations: FullLocation[] = [];
      if (fieldIds.length > 0) {
        const { data: cebeValues } = await supabase
          .from("contract_custom_field_values" as any)
          .select("contract_id, field_value, contracts(name)")
          .in("field_id", fieldIds)
          .not("field_value", "is", null) as any;

        const rows = ((cebeValues || []) as any[])
          .filter((v: any) => v.contract_id && v.field_value && v.contracts?.name);

        // Query separada a propósito: si el join de empresas falla, se pierden
        // los logos pero NO la lista de locales.
        const companyByContract = new Map<string, string>();
        const contractIds = [...new Set(rows.map((v: any) => v.contract_id as string))];
        if (contractIds.length > 0) {
          const { data: compRows, error: compErr } = await supabase
            .from("contract_companies")
            .select("contract_id, companies(name)")
            .in("contract_id", contractIds) as any;
          if (compErr) {
            console.error("No se pudieron cargar las empresas de los contratos:", compErr);
          }
          for (const r of ((compRows || []) as any[])) {
            const name = r.companies?.name;
            if (r.contract_id && name) companyByContract.set(r.contract_id, name as string);
          }
        }

        cebeLocations = rows.map((v: any) => ({
          id:            v.contract_id,
          contract_id:   v.contract_id,
          contract_name: v.contracts.name as string,
          company_name:  companyByContract.get(v.contract_id) ?? null,
          centro_sap:    v.field_value as string,
        }));
      }

      const [supRes, batchRes, mapRes] = await Promise.all([
        supabase.from("suppliers").select("id, name").order("name"),
        supabase
          .from("oc_import_batches" as any)
          .select("id,filename,storage_path,imported_at,rows_total,rows_ok,rows_pending_supplier,rows_pending_local,rows_duplicate,drive_synced_at")
          .order("imported_at", { ascending: false })
          .limit(20),
        // Mapeos código Centro → contrato guardados en cargas anteriores.
        supabase
          .from("oc_centro_mappings" as any)
          .select("centro_code, contract_id") as any,
      ]);

      // Los mapeos recordados se suman a los locales conocidos, así el match
      // automático resuelve los códigos que alguna vez se asignaron a mano.
      // Sin toast a propósito: si esto falla, la única consecuencia es que la
      // pantalla pide el mapeo a mano, que es el comportamiento de siempre.
      // Un aviso en cada visita sería ruido. El camino de GUARDADO sí avisa,
      // porque ahí el usuario espera que quede persistido.
      if ((mapRes as any)?.error) {
        console.error("No se pudieron cargar los mapeos recordados:", (mapRes as any).error);
      }
      const nameByContract = new Map<string, string>();
      for (const l of cebeLocations) {
        if (l.contract_id) nameByContract.set(l.contract_id, l.contract_name);
      }
      const remembered: FullLocation[] = (((mapRes as any)?.data || []) as any[])
        .filter(m => m.centro_code && m.contract_id)
        .map(m => ({
          id:            m.contract_id as string,
          contract_id:   m.contract_id as string,
          contract_name: nameByContract.get(m.contract_id as string) ?? "(contrato)",
          company_name:  null,
          centro_sap:    m.centro_code as string,
        }));
      // Se agregan al final: si un código ya matchea por CEBE, gana el CEBE.
      cebeLocations = [...cebeLocations, ...remembered];

      // Todos los contratos vigentes como opciones: un local puede no tener CEBE
      // cargado (p. ej. un centro logístico) y aun así hay que poder asignarlo a
      // mano. También da el nombre real a los mapeos recordados de esos contratos.
      const allContracts: { id: string; name: string }[] = [];
      for (let from = 0; ; from += 1000) {
        const { data: page, error: pageErr } = await supabase
          .from("contracts")
          .select("id, name")
          .is("deleted_at", null)
          .order("name")
          .range(from, from + 999) as any;
        if (pageErr) { console.error("No se pudo cargar la lista de contratos:", pageErr); break; }
        allContracts.push(...((page || []) as { id: string; name: string }[]));
        if (!page || page.length < 1000) break;
      }
      const contractNameById = new Map(allContracts.map(c => [c.id, c.name]));

      const companyById = new Map<string, string>();
      for (const l of cebeLocations) if (l.contract_id && l.company_name) companyById.set(l.contract_id, l.company_name);
      const idsMissingCompany = allContracts.map(c => c.id).filter(id => !companyById.has(id));
      for (let i = 0; i < idsMissingCompany.length; i += 200) {
        const { data: compRows } = await supabase
          .from("contract_companies")
          .select("contract_id, companies(name)")
          .in("contract_id", idsMissingCompany.slice(i, i + 200)) as any;
        for (const r of ((compRows || []) as any[])) {
          if (r.contract_id && r.companies?.name) companyById.set(r.contract_id, r.companies.name as string);
        }
      }

      cebeLocations = cebeLocations.map(l =>
        l.contract_name === "(contrato)" && l.contract_id && contractNameById.has(l.contract_id)
          ? { ...l, contract_name: contractNameById.get(l.contract_id)!, company_name: companyById.get(l.contract_id) ?? null }
          : l
      );
      const optionIds = new Set(cebeLocations.map(l => l.contract_id));
      const extras: FullLocation[] = allContracts
        .filter(c => !optionIds.has(c.id))
        .map(c => ({
          id: c.id, contract_id: c.id, contract_name: c.name,
          company_name: companyById.get(c.id) ?? null,
          centro_sap: null, // solo opción manual: no participa del match automático
        }));

      setAllLocations([...cebeLocations, ...extras]);
      setSuppliers(((supRes.data || []) as any[]) as OCSupplier[]);
      if ((batchRes as any).error) {
        // Antes se mostraba "Sin importaciones anteriores" aunque la lectura
        // hubiera fallado, haciendo parecer que las cargas no existían.
        console.error("Error al cargar el historial de importaciones:", (batchRes as any).error);
        toast.error("No se pudo cargar el historial de importaciones. Puede haber cargas previas que no se muestran.");
      }
      setBatches(((batchRes.data || []) as any[]) as ImportBatch[]);
      setLoadingRef(false);
    }
    load();
  }, []);

  // ── Location options for SearchableSelect ──────────────────────────────────

  function logoForName(name: string): string | null {
    const n = name.toLowerCase();
    if (/grupo\s*planet/.test(n)) return logos.grupoPlanet;
    if (n.includes("autoplanet")) return logos.autoplanet;
    if (n.includes("agroplanet")) return logos.agroplanet;
    return null;
  }

  // Un contrato puede aparecer varias veces (CEBE + mapeos recordados): una sola
  // opción por contrato, buscable por todos sus códigos.
  const locationOptions = useMemo(() => {
    const byId = new Map<string, { loc: FullLocation; codes: Set<string> }>();
    for (const l of allLocations) {
      if (!l.contract_id) continue;
      const entry = byId.get(l.id) ?? { loc: l, codes: new Set<string>() };
      const code = extractCentroCode(l.centro_sap);
      if (code) entry.codes.add(code);
      byId.set(l.id, entry);
    }
    return [...byId.values()].map(({ loc: l, codes }) => {
      // El logo sale de la empresa, no del nombre del local. Además se muestra
      // la empresa en la etiqueta: hay locales Agroplanet y Autoplanet en la
      // misma ciudad y sin eso la elección es ambigua.
      const logoUrl = l.company_name ? logoForName(l.company_name) : null;
      return {
        value:       l.id,
        label:       l.company_name
          ? `${l.contract_name} — ${l.company_name}`
          : l.contract_name,
        searchValue: [...codes, l.company_name].filter(Boolean).join(" "),
        icon: logoUrl
          ? <img src={logoUrl} alt="" className="h-5 w-5 rounded object-contain flex-shrink-0" />
          : undefined,
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allLocations, logos]);

  // ── Derived review data ────────────────────────────────────────────────────
  // La tabla de revisión se calcula desde las filas del Excel + las decisiones del
  // usuario, así cada decisión (un local para un código Centro, un proveedor, una
  // acción sobre un duplicado) se aplica en todos los lugares que corresponde y
  // sobrevive a volver un paso atrás.

  const knownLocations = useMemo(() =>
    allLocations
      .filter(l => l.centro_sap && l.contract_id)
      .map(l => ({
        contract_id:   l.contract_id!,
        contract_name: l.contract_name,
        centro_sap:    l.centro_sap,
      })),
    [allLocations],
  );

  const locationsForResolve = useMemo(() => [
    ...knownLocations,
    ...mappings
      .filter(m => m.contractId)
      .map(m => ({
        contract_id:   m.contractId!,
        contract_name: m.contractName!,
        centro_sap:    m.centroCode,
      })),
  ], [knownLocations, mappings]);

  const overridesMap = useMemo(
    () => new Map(Object.entries(supplierOverrides)),
    [supplierOverrides],
  );

  const grouped: GroupedOC[] = useMemo(() => {
    if (rawRows.length === 0) return [];
    const parsed = resolveRows(rawRows, locationsForResolve, suppliers, overridesMap);
    return groupByOrderNumber(parsed).map(g => {
      const hit = existingOrders.get(g.orderNumber);
      return {
        ...g,
        isDuplicate:         !!hit,
        existingId:          hit?.id ?? null,
        existingAmountClp:   hit?.amountClp ?? null,
        duplicateResolution: hit ? (resolutions[g.orderNumber] ?? null) : null,
      };
    });
  }, [rawRows, locationsForResolve, suppliers, overridesMap, existingOrders, resolutions]);

  // ── File handling ──────────────────────────────────────────────────────────

  const handleFile = useCallback(async (f: File) => {
    if (!f.name.match(/\.(xlsx|xls)$/i)) {
      toast.error("Solo se aceptan archivos Excel (.xlsx / .xls)");
      return;
    }
    setFile(f);
    setParsingMessage("Procesando archivo…");
    setStage("parsing");

    try {
      const buffer = await f.arrayBuffer();
      const wb = XLSX.read(buffer, { type: "array", cellDates: false });
      const { rows, missingColumns } = parseOCExcelSheet(wb);

      if (missingColumns.length > 0) {
        toast.warning(`Columnas no encontradas: ${missingColumns.join(", ")}`);
      }
      if (rows.length === 0) {
        toast.error("No se encontraron filas de datos en el archivo.");
        setStage("idle");
        return;
      }

      // Primera pasada: match automático (códigos CEBE conocidos, nombres de proveedor)
      const firstPass = resolveRows(rows, knownLocations, suppliers);

      // Proveedores que siguen sin match → IA (un nombre por proveedor distinto)
      const aiNames = new Map<string, string>(); // clave → nombre en el Excel
      for (const row of firstPass) {
        if (!row.supplierId && row.proveedorRaw) {
          aiNames.set(supplierOverrideKey(row.proveedorRaw, row.orderNumber), row.proveedorRaw);
        }
      }
      const overrides: Record<string, SupplierOverride> = {};
      if (aiNames.size > 0) {
        setParsingMessage(`Identificando ${aiNames.size} proveedor(es) con IA…`);
        const aiMatches = await matchSuppliersWithAI([...aiNames.values()], suppliers);
        for (const [rawName, supplier] of aiMatches) {
          overrides[supplierOverrideKey(rawName, "")] = { id: supplier.id, name: supplier.name, source: "ai" };
        }
      }

      setParsingMessage("Buscando OC ya existentes…");
      const existing = await fetchExistingOrders(rows.map(r => r.orderNumber));

      // Preselección para duplicados: si el monto difiere hay que sincerarlo, así
      // que se propone reemplazar; si coincide, se conserva lo que ya está. En ambos
      // casos queda visible y se puede cambiar con un clic.
      const initialResolutions: Record<string, DuplicateResolution> = {};
      for (const g of groupByOrderNumber(firstPass)) {
        const hit = existing?.get(g.orderNumber);
        if (hit) initialResolutions[g.orderNumber] = amountsDiffer(g.totalAmountClp, hit.amountClp) ? "replace" : "keep_existing";
      }

      // Códigos Centro distintos sin match ("0473" == "473")
      const unmatched = new Map<string, string>(); // centroKey → código tal como viene
      for (const row of firstPass) {
        const key = centroKey(row.centro);
        if (!row.contractId && key && !unmatched.has(key)) unmatched.set(key, row.centro.trim());
      }
      const initialMappings: CentroMapping[] = [...unmatched.values()].map(code => ({
        centroCode: code, locationId: null, contractId: null, contractName: null, remember: true,
      }));

      setRawRows(rows);
      setSupplierOverrides(overrides);
      setExistingOrders(existing ?? new Map());
      setResolutions(initialResolutions);
      setMappings(initialMappings);
      setEditingLocalKey(null);
      setEditingSupplierKey(null);

      const aiCount = Object.keys(overrides).length;
      if (aiCount > 0) toast.info(`${aiCount} proveedor(es) identificados automáticamente con IA`);

      if (initialMappings.length > 0) {
        setStage("mapping");
        toast.info(`${initialMappings.length} código(s) Centro sin match — asigna los locales correspondientes`);
      } else {
        setStage("review");
        toast.success(`${rows.length} filas → ${new Set(rows.map(r => r.orderNumber)).size} OC únicas`);
      }
    } catch (err) {
      console.error(err);
      toast.error("Error al procesar el archivo Excel.");
      setStage("idle");
    }
  }, [knownLocations, suppliers]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  }, [handleFile]);

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) handleFile(f);
  };

  // ── Mapping step ───────────────────────────────────────────────────────────

  function updateMapping(centroCode: string, patch: Partial<CentroMapping>) {
    setMappings(prev => prev.map(m =>
      m.centroCode === centroCode ? { ...m, ...patch } : m
    ));
  }

  async function applyMappings() {
    // Guardar los mapeos marcados con "Recordar" para no volver a pedirlos.
    // No aborta la importación: puede continuar con los mapeos en memoria.
    const toRemember = mappings.filter(m => m.contractId && m.remember);
    if (toRemember.length > 0) {
      const ok = await saveCentroMappings(toRemember.map(m => ({ centroCode: m.centroCode, contractId: m.contractId! })));
      if (ok) {
        toast.success(`${toRemember.length} asignación(es) guardada(s) para futuras cargas`);
      } else {
        toast.error(
          "No se pudieron guardar las asignaciones para futuras cargas. " +
          "Esta importación sigue igual, pero habrá que reasignarlas la próxima vez."
        );
      }
    }
    setStage("review");
    toast.success(`${grouped.length} OC listas para revisión`);
  }

  // ── Inline edit helpers ────────────────────────────────────────────────────

  /** Asigna un local a un código Centro → se aplica a TODAS las líneas (de todas las OC) con ese código. */
  async function handleLocalPick(rawCentro: string, locationId: string) {
    const key = centroKey(rawCentro);
    const loc = allLocations.find(l => l.id === locationId);
    if (!key || !loc?.contract_id) return;

    const affected = grouped.filter(g =>
      g.allocations.some(a => a.pendingLocal && centroKey(a.rawCentro) === key)
    ).length;

    const entry: CentroMapping = {
      centroCode:   rawCentro,
      locationId:   loc.id,
      contractId:   loc.contract_id,
      contractName: loc.contract_name,
      remember:     true,
    };
    setMappings(prev =>
      prev.some(m => centroKey(m.centroCode) === key)
        ? prev.map(m => centroKey(m.centroCode) === key ? { ...entry, centroCode: m.centroCode } : m)
        : [...prev, entry]
    );
    setEditingLocalKey(null);
    toast.success(`${loc.contract_name} asignado al centro ${rawCentro} en ${affected} OC`);

    // Igual que en el paso de asignación: queda guardado para próximas cargas.
    const ok = await saveCentroMappings([{ centroCode: rawCentro, contractId: loc.contract_id }]);
    if (!ok) toast.error("No se pudo guardar la asignación para futuras cargas; habrá que reasignarla la próxima vez.");
  }

  /** Asigna un proveedor → se aplica a toda OC cuyo nombre de proveedor en el Excel sea el mismo. */
  function applySupplier(orderNumber: string, supplier: OCSupplier) {
    const g = grouped.find(x => x.orderNumber === orderNumber);
    if (!g) return;
    const key = supplierOverrideKey(g.rawProveedor, g.orderNumber);
    setSupplierOverrides(prev => ({ ...prev, [key]: { ...supplier, source: "manual" } }));
    setEditingSupplierKey(null);
    const affected = grouped.filter(x => supplierOverrideKey(x.rawProveedor, x.orderNumber) === key).length;
    if (affected > 1) toast.success(`${supplier.name} asignado a ${affected} OC`);
  }

  function handleSupplierPick(orderNumber: string, supplierId: string) {
    const sup = suppliers.find(s => s.id === supplierId);
    if (sup) applySupplier(orderNumber, sup);
  }

  async function handleAddNewSupplier(orderNumber: string, name: string) {
    // Evita crear un duplicado de un proveedor que ya existe con nombre parecido
    const existingMatch = findSupplierMatch(name, suppliers);
    if (existingMatch) {
      applySupplier(orderNumber, existingMatch.supplier);
      toast.info(`Ya existe el proveedor "${existingMatch.supplier.name}", se asignó ese.`);
      return;
    }

    const { data, error } = await (supabase
      .from("suppliers")
      .insert({ name } as any)
      .select("id, name")
      .single() as any);
    if (error || !data) { toast.error("Error al crear proveedor"); return; }
    const created: OCSupplier = { id: data.id, name: data.name };
    setSuppliers(prev => [...prev, created]);
    applySupplier(orderNumber, created);
    toast.success(`Proveedor "${created.name}" creado y asignado`);
  }

  // ── Duplicate resolution ───────────────────────────────────────────────────

  function setResolution(orderNumber: string, res: DuplicateResolution) {
    setResolutions(prev => ({ ...prev, [orderNumber]: res }));
  }

  // OC que se guardan (nuevas o reemplazadas) con fecha desde 2027: necesitan categoría. Las verificadas sin cambios no se tocan.
  const needsCategory = (g: GroupedOC) =>
    isOpexCategoryRequired(g.orderDate) && !(g.isDuplicate && g.duplicateResolution === "keep_existing");
  const ocsNeedingCategory = grouped.filter(needsCategory);
  // Solo categorías vigentes en el año de todas esas OC.
  const importCategoryOptions = opexCategories.filter((c) =>
    ocsNeedingCategory.every((g) => isCategoryValidForYear(c, yearFromDate(g.orderDate))),
  );
  const missingImportCategory = ocsNeedingCategory.length > 0 && !importCategoryId;

  const unresolvedDuplicates = grouped.filter(g => g.isDuplicate && g.duplicateResolution === null);
  const toImport             = grouped; // se procesan todas: nueva, reemplazo o verificación de existente

  // ── Stats ──────────────────────────────────────────────────────────────────

  const stats = {
    total:           grouped.length,
    ok:              grouped.filter(g => g.status === "ok").length,
    pendingSupplier: grouped.filter(g => g.status === "pending_supplier" || g.status === "pending_both").length,
    pendingLocal:    grouped.filter(g => g.status === "pending_local"    || g.status === "pending_both").length,
    multiLocal:      grouped.filter(g => g.isMultiContract).length,
    duplicates:      grouped.filter(g => g.isDuplicate).length,
  };

  // ── Import ─────────────────────────────────────────────────────────────────

  async function handleImport() {
    if (unresolvedDuplicates.length > 0) {
      toast.warning("Hay duplicados sin resolver.");
      return;
    }
    if (!file) return;
    if (missingImportCategory) {
      toast.warning(`Elige la categoría OPEX: desde ${FIRST_CATEGORY_REQUIRED_YEAR} toda OC de OPEX debe tenerla.`);
      return;
    }

    setStage("importing");
    setProgress(0);

    let storagePath: string | null = null;
    try {
      const year = new Date().getFullYear();
      const ts   = Date.now();
      const { path, error } = await uploadFileToStorage(`oc-imports/${year}/${ts}_${file.name}`, file);
      if (!error) storagePath = path;
    } catch { /* non-blocking */ }

    const { data: batchData, error: batchErr } = await supabase
      .from("oc_import_batches" as any)
      .insert({
        filename:              file.name,
        storage_path:          storagePath,
        rows_total:            stats.total,
        rows_ok:               stats.ok,
        rows_pending_supplier: stats.pendingSupplier,
        rows_pending_local:    stats.pendingLocal,
        rows_duplicate:        stats.duplicates,
      })
      .select("id")
      .single() as any;

    const batchId: string | null = batchData?.id ?? null;

    // Sin batchId las OC se insertan con import_batch_id = null y quedan
    // marcadas como "D" (digitadas) en el listado, indistinguibles de las
    // manuales, y la importación no aparece en el historial. Antes este error
    // se descartaba y el import seguía igual: se perdía toda la trazabilidad
    // en silencio. Se aborta para no ensuciar los datos.
    if (batchErr || !batchId) {
      console.error("Error al registrar el lote de importación:", batchErr);
      setStage("review");
      setProgress(0);
      toast.error(
        "No se pudo registrar el lote de importación, así que se canceló para no cargar OC sin trazabilidad. " +
        (batchErr?.message ? `Detalle: ${batchErr.message}` : "Revisa los permisos de la tabla oc_import_batches.")
      );
      return;
    }

    // Reconciliación de "Reemplazar" para OC multi-local digitadas: existen
    // como N filas en purchase_orders con el MISMO order_number (una por
    // contrato, ver ConvertOCRequestDialog), no como una sola fila con el
    // total. Se traen todas para actualizar cada una por su contract_id en
    // vez de tocar solo g.existingId (la primera fila del grupo).
    const replaceOrderNumbers = toImport
      .filter(g => g.isDuplicate && g.duplicateResolution === "replace")
      .map(g => g.orderNumber);

    const existingRowsByOrder = new Map<string, { id: string; contractId: string | null; amountClp: number }[]>();
    if (replaceOrderNumbers.length > 0) {
      const { data: existingRows, error: existingRowsErr } = await supabase
        .from("purchase_orders")
        .select("id, order_number, contract_id, amount_clp")
        .in("order_number", replaceOrderNumbers)
        .is("deleted_at", null) as any;
      if (existingRowsErr) {
        console.error("Error al leer OC existentes para reemplazo:", existingRowsErr);
      }
      for (const row of ((existingRows || []) as any[])) {
        const list = existingRowsByOrder.get(row.order_number) ?? [];
        list.push({ id: row.id, contractId: row.contract_id, amountClp: Number(row.amount_clp) || 0 });
        existingRowsByOrder.set(row.order_number, list);
      }
    }

    let inserted = 0;
    let verified  = 0;
    // OC que la base rechazó porque su categoría no está vigente en el año de la fecha (mensaje en español del trigger).
    const rejectedByCategory: string[] = [];
    const noteCategoryRejection = (orderNumber: string, err: unknown) => {
      const message = opexCategoryErrorMessage(err);
      if (message) rejectedByCategory.push(`OC ${orderNumber}: ${message}`);
    };

    for (let i = 0; i < toImport.length; i++) {
      const g = toImport[i];
      setProgress(Math.round(((i + 1) / toImport.length) * 100));

      try {
        const orderYear    = g.orderDate ? parseInt(g.orderDate.slice(0, 4)) : new Date().getFullYear();
        const primaryAlloc = g.allocations.find(a => a.contractId) ?? g.allocations[0];
        // La categoría elegida se aplica solo a las OC desde 2027; las anteriores se importan como siempre.
        const categoryFields = importCategoryId && isOpexCategoryRequired(g.orderDate) ? { opex_category_id: importCategoryId } : {};

        if (g.isDuplicate && g.duplicateResolution === "keep_existing" && g.existingId) {
          // Un solo UPDATE por order_number: no hace falta reconciliar por
          // contrato porque no se toca ningún monto, solo se deja constancia
          // de que el import confirmó que esta OC ya está correcta.
          const { error: verifyErr } = await (supabase
            .from("purchase_orders")
            .update({ import_batch_id: batchId } as any)
            .eq("order_number", g.orderNumber)
            .is("deleted_at", null));
          if (verifyErr) {
            console.error("Error al marcar OC existente como verificada", g.orderNumber, verifyErr);
          } else {
            verified++;
          }
          continue;
        }

        if (g.isDuplicate && g.duplicateResolution === "replace" && g.existingId) {
          const existingRows = existingRowsByOrder.get(g.orderNumber) ?? [];
          const sharedFields = {
            description:             g.description,
            supplier_id:             g.supplierId,
            supplier_name:           g.supplierName,
            order_date:              g.orderDate,
            import_pending_supplier: !g.supplierId,
            import_batch_id:         batchId,
            ...categoryFields,
          };

          if (existingRows.length > 1) {
            // Multi-local: una fila existente por contrato. Se actualiza cada
            // una con el monto de SU asignación (matcheando por contract_id),
            // no con el total. Un contrato del Excel sin fila existente se
            // inserta; una fila existente sin contrato en el Excel se avisa
            // y se deja intacta (no se borra sin confirmación explícita).
            const allocByContract = new Map(
              g.allocations.filter(a => a.contractId).map(a => [a.contractId as string, a])
            );
            const matchedContractIds = new Set<string>();

            for (const row of existingRows) {
              const alloc = row.contractId ? allocByContract.get(row.contractId) : undefined;
              if (!alloc) continue;
              matchedContractIds.add(row.contractId!);
              const { error: updErr } = await (supabase
                .from("purchase_orders")
                .update({
                  ...sharedFields,
                  amount_clp:           alloc.amountClp,
                  amount_uf:            ufValue > 0 ? alloc.amountClp / ufValue : 0,
                  import_pending_local: false,
                } as any)
                .eq("id", row.id));
              if (updErr) {
                console.error("Error al reemplazar asignación de OC", g.orderNumber, row.contractId, updErr);
                noteCategoryRejection(g.orderNumber, updErr);
              }
              await (supabase
                .from("purchase_order_contract_allocations")
                .update({ amount_clp: alloc.amountClp, amount_uf: ufValue > 0 ? alloc.amountClp / ufValue : 0 } as any)
                .eq("purchase_order_id", row.id));
            }

            const unmatchedExisting = existingRows.filter(r => !r.contractId || !matchedContractIds.has(r.contractId));
            if (unmatchedExisting.length > 0) {
              toast.warning(
                `OC ${g.orderNumber}: ${unmatchedExisting.length} contrato(s) existente(s) no está(n) en el Excel y NO se modificaron. Revisar manualmente.`
              );
            }

            const newContracts = [...allocByContract.keys()].filter(cId => !existingRows.some(r => r.contractId === cId));
            for (const contractId of newContracts) {
              const alloc = allocByContract.get(contractId)!;
              const { data: newRow, error: insErr } = await (supabase
                .from("purchase_orders")
                .insert({
                  ...sharedFields,
                  order_number:      g.orderNumber,
                  contract_id:       contractId,
                  amount_clp:        alloc.amountClp,
                  amount_uf:         ufValue > 0 ? alloc.amountClp / ufValue : 0,
                  uf_value_at_entry: ufValue > 0 ? ufValue : null,
                  input_currency:    "CLP",
                  status:            "abierta",
                  budget_classification: "OPEX",
                  year:              g.orderDate ? parseInt(g.orderDate.slice(0, 4)) : new Date().getFullYear(),
                  is_multi_contract: true,
                  import_pending_local: false,
                } as any)
                .select("id")
                .single() as any);
              if (insErr) {
                console.error("Error al agregar contrato nuevo a OC existente", g.orderNumber, contractId, insErr);
                noteCategoryRejection(g.orderNumber, insErr);
                continue;
              }
              await supabase.from("purchase_order_contract_allocations").insert({
                purchase_order_id: newRow.id,
                contract_id:       contractId,
                amount_clp:        alloc.amountClp,
                amount_uf:         ufValue > 0 ? alloc.amountClp / ufValue : 0,
              } as any);
            }

            inserted++;
            continue;
          }

          // Caso simple: una sola fila existente para este order_number.
          const { error: updErr } = await (supabase
            .from("purchase_orders")
            .update({
              ...sharedFields,
              amount_clp:           g.totalAmountClp,
              amount_uf:            ufValue > 0 ? g.totalAmountClp / ufValue : 0,
              import_pending_local: g.allocations.some(a => !a.contractId),
            } as any)
            .eq("id", g.existingId));
          if (updErr) {
            console.error("Error al reemplazar OC", g.orderNumber, updErr);
            noteCategoryRejection(g.orderNumber, updErr);
          } else {
            inserted++;
          }
          continue;
        }

        const payload: Record<string, unknown> = {
          order_number:            g.orderNumber,
          description:             g.description,
          amount_uf:               ufValue > 0 ? g.totalAmountClp / ufValue : 0,
          amount_clp:              g.totalAmountClp,
          uf_value_at_entry:       ufValue > 0 ? ufValue : null,
          input_currency:          "CLP",
          status:                  "abierta",
          budget_classification:   "OPEX",
          order_date:              g.orderDate,
          year:                    orderYear,
          contract_id:             primaryAlloc?.contractId ?? null,
          supplier_id:             g.supplierId,
          supplier_name:           g.supplierName,
          is_multi_contract:       g.isMultiContract,
          import_pending_supplier: !g.supplierId,
          import_pending_local:    g.allocations.some(a => !a.contractId),
          import_batch_id:         batchId,
          ...categoryFields,
        };

        const { data: newOC, error: insertErr } = await (supabase
          .from("purchase_orders")
          .insert(payload as any)
          .select("id")
          .single() as any);

        if (insertErr) {
          console.error(insertErr);
          noteCategoryRejection(g.orderNumber, insertErr);
          continue;
        }

        if (newOC?.id) {
          const allocRows = g.allocations
            .filter(a => a.contractId)
            .map(a => ({
              purchase_order_id: newOC.id,
              contract_id:       a.contractId,
              amount_uf:         ufValue > 0 ? a.amountClp / ufValue : 0,
              amount_clp:        a.amountClp,
            }));
          if (allocRows.length > 0) {
            await supabase
              .from("purchase_order_contract_allocations")
              .insert(allocRows as any);
          }
        }
        inserted++;
      } catch (err) {
        console.error("Error inserting OC", g.orderNumber, err);
      }
    }

    setProgress(100);
    setStage("done");
    const parts = [`${inserted} OC importadas`];
    if (verified > 0) parts.push(`${verified} verificadas sin cambios`);
    toast.success(`${parts.join(", ")}.`);
    if (rejectedByCategory.length > 0) {
      toast.error(`${rejectedByCategory.length} OC no se importaron: ${rejectedByCategory.slice(0, 3).join(" | ")}`, {
        duration: 15000,
      });
    }

    const { data: freshBatches, error: freshErr } = await supabase
      .from("oc_import_batches" as any)
      .select("id,filename,storage_path,imported_at,rows_total,rows_ok,rows_pending_supplier,rows_pending_local,rows_duplicate,drive_synced_at")
      .order("imported_at", { ascending: false })
      .limit(20) as any;
    if (freshErr) console.error("Error al refrescar el historial:", freshErr);
    setBatches(((freshBatches || []) as any[]) as ImportBatch[]);
  }

  function reset() {
    setFile(null);
    setRawRows([]);
    setMappings([]);
    setSupplierOverrides({});
    setExistingOrders(new Map());
    setResolutions({});
    setEditingLocalKey(null);
    setEditingSupplierKey(null);
    setImportCategoryId(null);
    setStage("idle");
    setProgress(0);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  /** Descartar el archivo cargado pierde todas las decisiones manuales: se pregunta antes. */
  function requestReset() {
    if (
      (stage === "mapping" || stage === "review") &&
      !window.confirm("Se perderá el avance de esta carga (locales y proveedores asignados). ¿Continuar?")
    ) return;
    reset();
  }

  async function reloadBatch(b: ImportBatch) {
    if (!b.storage_path) {
      toast.error("Este lote no tiene archivo almacenado.");
      return;
    }
    const filePath = extractStoragePath(b.storage_path);
    if (!filePath) {
      toast.error("Ruta de archivo inválida.");
      return;
    }
    toast.info("Descargando archivo almacenado…");
    const { data: blob, error } = await supabase.storage
      .from("repository-files")
      .download(filePath);
    if (error || !blob) {
      toast.error("No se pudo descargar el archivo.");
      return;
    }
    const f = new File([blob], b.filename, {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    reset();
    handleFile(f);
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  const duplicates    = grouped.filter(g => g.isDuplicate);
  const nonDuplicates = grouped.filter(g => !g.isDuplicate);
  const mappedCount   = mappings.filter(m => m.contractId).length;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-[1400px] mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate("/purchase-orders")}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-lg font-semibold">Carga Masiva de OOCC</h1>
              <p className="text-xs text-muted-foreground">Órdenes de Compra — Mantenciones</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {(stage === "mapping" || stage === "review") && (
              <Button variant="outline" size="sm" onClick={requestReset}>
                <RefreshCw className="h-4 w-4 mr-1" /> Cargar otro archivo
              </Button>
            )}
            {stage === "done" && (
              <Button size="sm" onClick={() => navigate("/purchase-orders")}>
                Ver listado de OC
              </Button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-[1400px] mx-auto px-6 py-8 space-y-8">

        {/* ── STAGE: idle / parsing ── */}
        {(stage === "idle" || stage === "parsing") && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <FileSpreadsheet className="h-5 w-5 text-primary" />
                Seleccionar archivo Excel
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div
                className="border-2 border-dashed border-border rounded-lg p-12 text-center cursor-pointer hover:border-primary/50 hover:bg-muted/30 transition-colors"
                onDrop={onDrop}
                onDragOver={e => e.preventDefault()}
                onClick={() => fileInputRef.current?.click()}
              >
                {stage === "parsing" ? (
                  <div className="flex flex-col items-center gap-3">
                    <Loader2 className="h-10 w-10 animate-spin text-primary" />
                    <p className="text-sm text-muted-foreground">{parsingMessage}</p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-3">
                    <Upload className="h-10 w-10 text-muted-foreground" />
                    <div>
                      <p className="font-medium">Arrastra el archivo aquí o haz clic para seleccionar</p>
                      <p className="text-sm text-muted-foreground mt-1">
                        .xlsx / .xls — columnas: Centro, Documento compras, Fecha Documento, Texto Breve, Precio Neto, Proveedor/Centro suministrador
                      </p>
                    </div>
                  </div>
                )}
                <input ref={fileInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={onInputChange} />
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── STAGE: mapping ── */}
        {stage === "mapping" && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Link2 className="h-5 w-5 text-amber-500" />
                Asignar códigos Centro a locales del sistema
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Los siguientes códigos SAP no tienen match automático. Asígnalos manualmente:
                cada asignación se aplica a todas las líneas del Excel con ese código y queda
                guardada para futuros archivos.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[120px]">Código Centro</TableHead>
                      <TableHead>Local en el sistema</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {mappings.map(m => (
                      <TableRow key={m.centroCode}>
                        <TableCell>
                          <code className="bg-muted rounded px-2 py-0.5 text-sm font-mono">{m.centroCode}</code>
                        </TableCell>
                        <TableCell>
                          <SearchableSelect
                            value={m.locationId ?? ""}
                            onValueChange={val => {
                              const loc = allLocations.find(l => l.id === val);
                              updateMapping(m.centroCode, {
                                locationId:   loc?.id ?? null,
                                contractId:   loc?.contract_id ?? null,
                                contractName: loc?.contract_name ?? null,
                              });
                            }}
                            options={locationOptions}
                            placeholder="Buscar local…"
                            className="w-full max-w-sm"
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="flex items-center justify-between pt-2 border-t">
                <p className="text-sm text-muted-foreground">
                  {mappedCount} de {mappings.length} código(s) asignados
                  {mappings.length - mappedCount > 0 && (
                    <span className="text-orange-600 ml-1">
                      — los {mappings.length - mappedCount} restantes se importarán como "Sin local"
                    </span>
                  )}
                </p>
                <Button onClick={applyMappings}>
                  Continuar con revisión →
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── STAGE: review ── */}
        {stage === "review" && (
          <>
            {/* Stats bar */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {[
                { label: "OC únicas",    value: stats.total,           color: "text-foreground" },
                { label: "Listas",        value: stats.ok,              color: "text-emerald-600" },
                { label: "Sin proveedor", value: stats.pendingSupplier, color: "text-amber-600" },
                { label: "Sin local",     value: stats.pendingLocal,    color: "text-orange-600" },
                { label: "Multi-local",   value: stats.multiLocal,      color: "text-blue-600" },
                { label: "Duplicadas",    value: stats.duplicates,      color: "text-destructive" },
              ].map(s => (
                <Card key={s.label} className="py-3 px-4">
                  <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
                </Card>
              ))}
            </div>

            {/* Categoría OPEX para toda la importación (obligatoria desde 2027) */}
            {ocsNeedingCategory.length > 0 && (
              <Card className={missingImportCategory ? "border-amber-300" : undefined}>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Categoría OPEX de la importación *</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <p className="text-sm text-muted-foreground">
                    Desde {FIRST_CATEGORY_REQUIRED_YEAR} toda OC de OPEX debe tener categoría y el Excel no la trae. La que elijas se
                    asigna a las {ocsNeedingCategory.length} OC con fecha desde {FIRST_CATEGORY_REQUIRED_YEAR}; las OC anteriores se
                    importan como siempre.
                  </p>
                  <SearchableSelect
                    value={importCategoryId ?? ""}
                    onValueChange={(val) => setImportCategoryId(val || null)}
                    options={importCategoryOptions.map((c) => ({ value: c.id, label: c.name }))}
                    placeholder="Buscar categoría OPEX…"
                    emptyMessage="Ninguna categoría vigente coincide"
                    className="w-full max-w-sm"
                  />
                  {missingImportCategory && <p className="text-xs text-amber-700">Elige una categoría para poder guardar.</p>}
                </CardContent>
              </Card>
            )}

            {/* Duplicates resolution */}
            {duplicates.length > 0 && (
              <Card className="border-destructive/30">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base text-destructive flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4" />
                    {duplicates.length} OC ya existen en el sistema — definir acción
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {duplicates.map(g => (
                    <div key={g.orderNumber} className="border rounded-lg p-4 space-y-3">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <div>
                          <span className="font-mono font-semibold">OC {g.orderNumber}</span>
                          <span className="text-muted-foreground text-sm ml-2">— {g.description}</span>
                        </div>
                        {(() => {
                          const differs = g.existingAmountClp !== null
                            && amountsDiffer(g.totalAmountClp, g.existingAmountClp);
                          return differs ? (
                            <Badge className="bg-amber-100 text-amber-800 border-amber-200 text-xs">
                              Monto distinto — se sincera
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-xs">Sin diferencias</Badge>
                          );
                        })()}
                      </div>
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div className="bg-muted/40 rounded p-3">
                          <p className="font-medium text-xs text-muted-foreground mb-1">IMPORTADO</p>
                          <p>{g.description || "—"}</p>
                          <p className="text-muted-foreground">{g.supplierName}</p>
                          <p className="font-semibold">{fmtClp(g.totalAmountClp)}</p>
                          <p className="text-xs text-muted-foreground">{fmtDate(g.orderDate)}</p>
                        </div>
                        <div className="bg-amber-50 border border-amber-200 rounded p-3">
                          <p className="font-medium text-xs text-amber-700 mb-1">EN EL SISTEMA</p>
                          <p className="font-semibold">
                            {g.existingAmountClp !== null ? fmtClp(g.existingAmountClp) : "—"}
                          </p>
                          {g.existingAmountClp !== null
                            && amountsDiffer(g.totalAmountClp, g.existingAmountClp) && (
                            <p className="text-xs font-medium text-amber-700 mt-1">
                              Diferencia: {fmtClp(g.totalAmountClp - g.existingAmountClp)}
                            </p>
                          )}
                          <p className="text-xs text-muted-foreground italic mt-1">
                            ID: {g.existingId?.slice(0, 8)}…
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-2 flex-wrap items-center">
                        <Button size="sm" variant={g.duplicateResolution === "keep_existing" ? "default" : "outline"} onClick={() => setResolution(g.orderNumber, "keep_existing")}>Mantener existente</Button>
                        <Button size="sm" variant={g.duplicateResolution === "replace"       ? "default" : "outline"} onClick={() => setResolution(g.orderNumber, "replace")}>Reemplazar con importado</Button>
                        <span className="text-xs text-muted-foreground">
                          {g.duplicateResolution === "replace"
                            ? "Se actualizará la OC existente con los datos del Excel."
                            : "La OC existente queda como está."}
                        </span>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* Main review table */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">
                  Revisión de OC ({nonDuplicates.length} nuevas{duplicates.length > 0 ? ` + ${duplicates.length} duplicadas` : ""})
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[130px]">Nº OC</TableHead>
                        <TableHead>Local(es)</TableHead>
                        <TableHead>Proveedor</TableHead>
                        <TableHead className="text-right">Monto</TableHead>
                        <TableHead>Fecha</TableHead>
                        <TableHead>Estado</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {grouped.map(g => (
                        <TableRow key={g.orderNumber} className={g.isDuplicate ? "bg-amber-50/50" : ""}>
                          <TableCell className="font-mono text-sm font-medium">
                            {g.orderNumber}
                            {g.isMultiContract && (
                              <Badge variant="outline" className="ml-1 text-xs">{g.allocations.length} locales</Badge>
                            )}
                          </TableCell>

                          {/* Local(es) — clickeable cuando hay pendiente */}
                          <TableCell className="text-sm min-w-[200px]">
                            {g.allocations.map((a, idx) => {
                              const editKey = `${g.orderNumber}:${idx}`;
                              const isEditing = editingLocalKey === editKey;
                              if (a.pendingLocal) {
                                return (
                                  <div key={idx} className="mb-1">
                                    {isEditing ? (
                                      <div className="flex flex-col gap-1">
                                        <SearchableSelect
                                          value=""
                                          onValueChange={val => handleLocalPick(a.rawCentro, val)}
                                          options={locationOptions}
                                          placeholder="Buscar local…"
                                          className="w-[220px]"
                                        />
                                        <p className="text-[10px] text-muted-foreground">
                                          Se aplicará a todas las líneas con centro {a.rawCentro}
                                        </p>
                                      </div>
                                    ) : !centroKey(a.rawCentro) ? (
                                      <span className="flex items-center gap-1 text-orange-600 text-xs">
                                        <MapPin className="h-3 w-3 shrink-0" />
                                        Sin centro en el Excel
                                      </span>
                                    ) : (
                                      <button
                                        className="flex items-center gap-1 text-orange-600 hover:text-orange-800 hover:underline text-xs text-left"
                                        onClick={() => { setEditingLocalKey(editKey); setEditingSupplierKey(null); }}
                                        title="Clic para asignar local"
                                      >
                                        <MapPin className="h-3 w-3 shrink-0" />
                                        {a.rawCentro} — Sin identificar
                                      </button>
                                    )}
                                  </div>
                                );
                              }
                              return (
                                <div key={idx} className="truncate max-w-[220px] text-xs">
                                  {a.contractName}
                                </div>
                              );
                            })}
                          </TableCell>

                          {/* Proveedor — siempre editable (los matches por similitud/IA pueden corregirse) */}
                          <TableCell className="text-sm min-w-[180px]">
                            {editingSupplierKey === g.orderNumber ? (
                              <div className="flex flex-col gap-1">
                                <p className="text-[10px] text-muted-foreground">
                                  SAP: <span className="font-medium text-foreground">{g.rawProveedor || "—"}</span>
                                </p>
                                <SearchableSelect
                                  value={g.supplierId ?? ""}
                                  onValueChange={val => handleSupplierPick(g.orderNumber, val)}
                                  options={suppliers.map(s => ({ value: s.id, label: s.name }))}
                                  placeholder="Buscar proveedor…"
                                  className="w-[220px]"
                                />
                                {g.rawProveedor && (
                                  <button
                                    className="text-xs text-blue-600 hover:text-blue-800 hover:underline text-left mt-0.5"
                                    onClick={() => handleAddNewSupplier(g.orderNumber, g.rawProveedor)}
                                  >
                                    + Agregar "{g.rawProveedor}" como nuevo proveedor
                                  </button>
                                )}
                                <button
                                  className="text-xs text-muted-foreground hover:underline text-left"
                                  onClick={() => setEditingSupplierKey(null)}
                                >
                                  Cancelar
                                </button>
                              </div>
                            ) : g.supplierId ? (
                              <div className="group flex items-center gap-1.5">
                                <span className="truncate max-w-[180px]" title={`SAP: ${g.rawProveedor}`}>{g.supplierName}</span>
                                {g.supplierSource && SUPPLIER_SOURCE_LABEL[g.supplierSource] && (
                                  <span title={`${SUPPLIER_SOURCE_LABEL[g.supplierSource]} — SAP: ${g.rawProveedor}`}>
                                    <Sparkles className="h-3 w-3 text-blue-500 shrink-0" />
                                  </span>
                                )}
                                <button
                                  className="opacity-0 group-hover:opacity-100 focus:opacity-100 text-muted-foreground hover:text-foreground"
                                  onClick={() => { setEditingSupplierKey(g.orderNumber); setEditingLocalKey(null); }}
                                  title="Cambiar proveedor"
                                >
                                  <Pencil className="h-3 w-3" />
                                </button>
                              </div>
                            ) : (
                              <button
                                className="flex items-center gap-1 text-amber-600 hover:text-amber-800 hover:underline text-xs text-left"
                                onClick={() => { setEditingSupplierKey(g.orderNumber); setEditingLocalKey(null); }}
                                title="Clic para asignar proveedor"
                              >
                                <User className="h-3 w-3 shrink-0" />
                                <span className="truncate max-w-[160px]">{g.rawProveedor || "Sin proveedor"}</span>
                              </button>
                            )}
                          </TableCell>

                          <TableCell className="text-right text-sm font-medium whitespace-nowrap">{fmtClp(g.totalAmountClp)}</TableCell>
                          <TableCell className="text-sm text-muted-foreground whitespace-nowrap">{fmtDate(g.orderDate)}</TableCell>
                          <TableCell>{statusBadge(g.status)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>

            {/* Cancelar / Guardar */}
            <div className="flex items-center justify-between border-t pt-4">
              <div className="text-sm text-muted-foreground">
                {unresolvedDuplicates.length > 0 && (
                  <span className="text-destructive font-medium">
                    ⚠ {unresolvedDuplicates.length} duplicado(s) sin resolver — resuélvelos antes de guardar
                  </span>
                )}
                {unresolvedDuplicates.length === 0 && (
                  <span>{toImport.length} OC listas para guardar</span>
                )}
              </div>
              <div className="flex items-center gap-3">
                {mappings.length > 0 && (
                  <Button variant="outline" size="lg" onClick={() => { setEditingLocalKey(null); setEditingSupplierKey(null); setStage("mapping"); }}>
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Volver a asignar centros
                  </Button>
                )}
                <Button variant="outline" size="lg" onClick={requestReset}>
                  Cancelar
                </Button>
                <Button
                  size="lg"
                  disabled={unresolvedDuplicates.length > 0 || toImport.length === 0 || missingImportCategory}
                  onClick={handleImport}
                >
                  <Upload className="h-4 w-4 mr-2" />
                  Guardar {toImport.length} OC
                </Button>
              </div>
            </div>
          </>
        )}

        {/* ── STAGE: importing ── */}
        {stage === "importing" && (
          <Card>
            <CardContent className="py-12 flex flex-col items-center gap-4">
              <Loader2 className="h-10 w-10 animate-spin text-primary" />
              <p className="font-medium">Importando OC…</p>
              <div className="w-full max-w-md">
                <Progress value={progress} className="h-3" />
                <p className="text-xs text-muted-foreground text-center mt-1">{progress}%</p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── STAGE: done ── */}
        {stage === "done" && (
          <Card className="border-emerald-200">
            <CardContent className="py-10 text-center space-y-3">
              <CheckCircle2 className="h-12 w-12 text-emerald-500 mx-auto" />
              <h2 className="text-xl font-semibold">Importación completada</h2>
              <div className="flex justify-center gap-6 text-sm mt-2">
                <div><p className="text-2xl font-bold text-emerald-600">{stats.ok}</p><p className="text-muted-foreground">Importadas OK</p></div>
                <div><p className="text-2xl font-bold text-amber-500">{stats.pendingSupplier}</p><p className="text-muted-foreground">Sin proveedor</p></div>
                <div><p className="text-2xl font-bold text-orange-500">{stats.pendingLocal}</p><p className="text-muted-foreground">Sin local</p></div>
              </div>
              <div className="flex justify-center gap-3 pt-4">
                <Button onClick={reset} variant="outline">Nueva importación</Button>
                <Button onClick={() => navigate("/purchase-orders")}>Ver OC en sistema</Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── Import history ── */}
        <div>
          <div className="flex items-center gap-2">
            <button
              className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors flex-1"
              onClick={() => setShowHistory(v => !v)}
            >
              <History className="h-4 w-4" />
              Historial de importaciones
              {showHistory ? <ChevronUp className="h-4 w-4 ml-auto" /> : <ChevronDown className="h-4 w-4 ml-auto" />}
            </button>
            {isAdmin && (
              <Button
                variant="outline"
                size="sm"
                className="flex-shrink-0"
                onClick={() => setShowReconcileDialog(true)}
              >
                Reconciliar importaciones anteriores
              </Button>
            )}
          </div>

          {showHistory && (
            <Card className="mt-3">
              <CardContent className="p-0">
                {loadingRef ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : batches.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">Sin importaciones anteriores</p>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Archivo</TableHead>
                          <TableHead>Fecha</TableHead>
                          <TableHead className="text-center">Total</TableHead>
                          <TableHead className="text-center">OK</TableHead>
                          <TableHead className="text-center">Sin proveedor</TableHead>
                          <TableHead className="text-center">Sin local</TableHead>
                          <TableHead className="text-center">Duplicadas</TableHead>
                          <TableHead>Drive</TableHead>
                          <TableHead></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {batches.map(b => (
                          <TableRow key={b.id}>
                            <TableCell className="text-sm font-medium">{b.filename}</TableCell>
                            <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                              {b.imported_at ? format(parseISO(b.imported_at), "dd/MM/yyyy HH:mm", { locale: es }) : "—"}
                            </TableCell>
                            <TableCell className="text-center">{b.rows_total}</TableCell>
                            <TableCell className="text-center text-emerald-600 font-medium">{b.rows_ok}</TableCell>
                            <TableCell className="text-center text-amber-600">{b.rows_pending_supplier}</TableCell>
                            <TableCell className="text-center text-orange-600">{b.rows_pending_local}</TableCell>
                            <TableCell className="text-center text-destructive">{b.rows_duplicate}</TableCell>
                            <TableCell>
                              {b.drive_synced_at ? (
                                <Badge className="bg-emerald-100 text-emerald-800 text-xs">Sincronizado</Badge>
                              ) : (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 text-xs"
                                  onClick={() => toast.info("Respaldo en Drive disponible próximamente. El archivo queda almacenado en Supabase Storage.")}
                                >
                                  <CloudUpload className="h-3.5 w-3.5 mr-1" />
                                  Respaldar en Drive
                                </Button>
                              )}
                            </TableCell>
                            <TableCell>
                              {b.storage_path && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 text-xs"
                                  onClick={() => reloadBatch(b)}
                                  title="Recargar este Excel para continuar con los pendientes"
                                >
                                  <RefreshCw className="h-3.5 w-3.5 mr-1" />
                                  Recargar
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>

      </main>

      <ReconcileImportsDialog
        open={showReconcileDialog}
        onOpenChange={setShowReconcileDialog}
      />
    </div>
  );
}
