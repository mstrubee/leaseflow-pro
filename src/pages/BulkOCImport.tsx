import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import * as XLSX from "xlsx";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import {
  ArrowLeft, Upload, FileSpreadsheet, CheckCircle2, AlertTriangle,
  MapPin, User, Loader2, CloudUpload, History, RefreshCw,
  ChevronDown, ChevronUp, Link2,
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
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { uploadFileToStorage } from "@/lib/storageUtils";
import {
  parseOCExcelSheet, resolveRows, groupByOrderNumber,
  OCSupplier, GroupedOC, OCAllocation, OCRowStatus, DuplicateResolution,
  RawOCRow,
} from "@/lib/parseBulkOCExcel";

// ── Extended location type (includes id for centro_sap update) ────────────────

interface FullLocation {
  id: string;
  contract_id: string | null;
  contract_name: string;
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

// ── Component ─────────────────────────────────────────────────────────────────

export default function BulkOCImport() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { logos } = useAppLogos();

  // Reference data
  const [allLocations, setAllLocations] = useState<FullLocation[]>([]);
  const [suppliers,    setSuppliers]    = useState<OCSupplier[]>([]);
  const [batches,      setBatches]      = useState<ImportBatch[]>([]);
  const [loadingRef,   setLoadingRef]   = useState(true);

  // Import flow
  const [stage,    setStage]    = useState<Stage>("idle");
  const [file,     setFile]     = useState<File | null>(null);
  const [rawRows,  setRawRows]  = useState<RawOCRow[]>([]);
  const [grouped,  setGrouped]  = useState<GroupedOC[]>([]);
  const [mappings, setMappings] = useState<CentroMapping[]>([]);
  const [progress, setProgress] = useState(0);
  const [showHistory, setShowHistory] = useState(true);

  // Inline editing in review table (key = "orderNumber:allocIdx" for local, "orderNumber" for supplier)
  const [editingLocalKey,    setEditingLocalKey]    = useState<string | null>(null);
  const [editingSupplierKey, setEditingSupplierKey] = useState<string | null>(null);

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

        cebeLocations = ((cebeValues || []) as any[])
          .filter((v: any) => v.contract_id && v.field_value && v.contracts?.name)
          .map((v: any) => ({
            id:            v.contract_id,
            contract_id:   v.contract_id,
            contract_name: v.contracts.name as string,
            centro_sap:    v.field_value as string,
          }));
      }

      const [supRes, batchRes] = await Promise.all([
        supabase.from("suppliers").select("id, name").order("name"),
        supabase
          .from("oc_import_batches" as any)
          .select("id,filename,storage_path,imported_at,rows_total,rows_ok,rows_pending_supplier,rows_pending_local,rows_duplicate,drive_synced_at")
          .order("imported_at", { ascending: false })
          .limit(20),
      ]);

      setAllLocations(cebeLocations);
      setSuppliers(((supRes.data || []) as any[]) as OCSupplier[]);
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

  const locationOptions = allLocations
    .filter(l => l.contract_id)
    .map(l => {
      const cebeCode = extractCentroCode(l.centro_sap);
      const logoUrl  = logoForName(l.contract_name);
      return {
        value:       l.id,
        label:       l.contract_name,
        searchValue: cebeCode,
        icon: logoUrl
          ? <img src={logoUrl} alt="" className="h-5 w-5 rounded object-contain flex-shrink-0" />
          : undefined,
      };
    });

  // ── File handling ──────────────────────────────────────────────────────────

  const handleFile = useCallback(async (f: File) => {
    if (!f.name.match(/\.(xlsx|xls)$/i)) {
      toast.error("Solo se aceptan archivos Excel (.xlsx / .xls)");
      return;
    }
    setFile(f);
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

      setRawRows(rows);

      // Build OCLocation array from locations that have centro_sap populated
      const knownLocations = allLocations
        .filter(l => l.centro_sap && l.contract_id)
        .map(l => ({
          contract_id:   l.contract_id!,
          contract_name: l.contract_name,
          centro_sap:    l.centro_sap,
        }));

      const parsed  = resolveRows(rows, knownLocations, suppliers);
      const grouped_ = groupByOrderNumber(parsed);

      // Collect distinct unmatched Centro codes
      const unmatchedCodes = new Set<string>();
      for (const row of parsed) {
        if (!row.contractId) unmatchedCodes.add(row.centro.trim());
      }

      if (unmatchedCodes.size > 0) {
        // Pre-populate with any already-mapped locations (centro_sap without leading zeros)
        const initialMappings: CentroMapping[] = [...unmatchedCodes].map(code => {
          // Try to auto-match via existing centro_sap
          const stripped = code.replace(/^0+/, "");
          const auto = allLocations.find(l => {
            const existing = extractCentroCode(l.centro_sap);
            return existing === code || existing.replace(/^0+/, "") === stripped;
          });
          return {
            centroCode:   code,
            locationId:   auto?.id ?? null,
            contractId:   auto?.contract_id ?? null,
            contractName: auto?.contract_name ?? null,
            remember:     true,
          };
        });

        setRawRows(rows);
        setGrouped(grouped_);
        setMappings(initialMappings);
        setStage("mapping");
        toast.info(`${unmatchedCodes.size} código(s) Centro sin match — asigna los locales correspondientes`);
      } else {
        await markDuplicates(grouped_);
        setGrouped(grouped_);
        setStage("review");
        toast.success(`${rows.length} filas → ${grouped_.length} OC únicas`);
      }
    } catch (err) {
      console.error(err);
      toast.error("Error al procesar el archivo Excel.");
      setStage("idle");
    }
  }, [allLocations, suppliers]);

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
    // Build complete location list (known + manually mapped)
    const manualLocations = mappings
      .filter(m => m.contractId)
      .map(m => ({
        contract_id:   m.contractId!,
        contract_name: m.contractName!,
        centro_sap:    m.centroCode,  // use raw code directly for this resolve pass
      }));

    const knownLocations = allLocations
      .filter(l => l.centro_sap && l.contract_id)
      .map(l => ({
        contract_id:   l.contract_id!,
        contract_name: l.contract_name,
        centro_sap:    l.centro_sap,
      }));

    const allLocs = [...knownLocations, ...manualLocations];
    const parsed   = resolveRows(rawRows, allLocs, suppliers);
    const grouped_ = groupByOrderNumber(parsed);

    await markDuplicates(grouped_);
    setGrouped(grouped_);
    setStage("review");
    toast.success(`${grouped_.length} OC listas para revisión`);
  }

  // ── Inline edit helpers ────────────────────────────────────────────────────

  function recomputeStatus(allocs: OCAllocation[], supplierId: string | null): OCRowStatus {
    const pendingLocal    = allocs.some(a => a.pendingLocal);
    const pendingSupplier = !supplierId;
    if (pendingLocal && pendingSupplier) return "pending_both";
    if (pendingLocal)                   return "pending_local";
    if (pendingSupplier)                return "pending_supplier";
    return "ok";
  }

  function handleLocalPick(orderNumber: string, allocIdx: number, locationId: string) {
    const loc = allLocations.find(l => l.id === locationId);
    setGrouped(prev => prev.map(g => {
      if (g.orderNumber !== orderNumber) return g;
      const newAllocs: OCAllocation[] = g.allocations.map((a, i) =>
        i === allocIdx
          ? { ...a, contractId: loc?.contract_id ?? null, contractName: loc?.contract_name ?? null, pendingLocal: !loc?.contract_id }
          : a
      );
      return { ...g, allocations: newAllocs, status: recomputeStatus(newAllocs, g.supplierId) };
    }));
    setEditingLocalKey(null);
  }

  function handleSupplierPick(orderNumber: string, supplierId: string) {
    const sup = suppliers.find(s => s.id === supplierId);
    setGrouped(prev => prev.map(g => {
      if (g.orderNumber !== orderNumber) return g;
      return {
        ...g,
        supplierId:   sup?.id   ?? null,
        supplierName: sup?.name ?? g.rawProveedor,
        status: recomputeStatus(g.allocations, sup?.id ?? null),
      };
    }));
    setEditingSupplierKey(null);
  }

  // ── Duplicate detection ────────────────────────────────────────────────────

  async function markDuplicates(groups: GroupedOC[]) {
    const numbers = groups.map(g => g.orderNumber).filter(Boolean);
    if (numbers.length === 0) return;
    const { data: existing } = await supabase
      .from("purchase_orders")
      .select("id, order_number")
      .in("order_number", numbers)
      .is("deleted_at", null) as any;

    const existingMap = new Map<string, string>();
    for (const o of (existing || []) as any[]) existingMap.set(o.order_number, o.id);
    for (const g of groups) {
      if (existingMap.has(g.orderNumber)) {
        g.isDuplicate = true;
        g.existingId  = existingMap.get(g.orderNumber) ?? null;
      }
    }
  }

  // ── Duplicate resolution ───────────────────────────────────────────────────

  function setResolution(orderNumber: string, res: DuplicateResolution) {
    setGrouped(prev => prev.map(g =>
      g.orderNumber === orderNumber ? { ...g, duplicateResolution: res } : g
    ));
  }

  const unresolvedDuplicates = grouped.filter(g => g.isDuplicate && g.duplicateResolution === null);
  const toImport             = grouped.filter(g => !g.isDuplicate || g.duplicateResolution !== "keep_existing");

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

    setStage("importing");
    setProgress(0);

    let storagePath: string | null = null;
    try {
      const year = new Date().getFullYear();
      const ts   = Date.now();
      const { path, error } = await uploadFileToStorage(`oc-imports/${year}/${ts}_${file.name}`, file);
      if (!error) storagePath = path;
    } catch { /* non-blocking */ }

    const { data: batchData } = await supabase
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
    let inserted = 0;

    for (let i = 0; i < toImport.length; i++) {
      const g = toImport[i];
      setProgress(Math.round(((i + 1) / toImport.length) * 100));

      try {
        const orderYear    = g.orderDate ? parseInt(g.orderDate.slice(0, 4)) : new Date().getFullYear();
        const primaryAlloc = g.allocations.find(a => a.contractId) ?? g.allocations[0];

        if (g.isDuplicate && g.duplicateResolution === "replace" && g.existingId) {
          await (supabase
            .from("purchase_orders")
            .update({
              description:             g.description,
              amount_clp:              g.totalAmountClp,
              supplier_id:             g.supplierId,
              supplier_name:           g.supplierName,
              order_date:              g.orderDate,
              import_pending_supplier: !g.supplierId,
              import_pending_local:    g.allocations.some(a => !a.contractId),
            } as any)
            .eq("id", g.existingId));
          inserted++;
          continue;
        }

        const payload: Record<string, unknown> = {
          order_number:            g.orderNumber,
          description:             g.description,
          amount_uf:               0,
          amount_clp:              g.totalAmountClp,
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
        };

        const { data: newOC, error: insertErr } = await (supabase
          .from("purchase_orders")
          .insert(payload as any)
          .select("id")
          .single() as any);

        if (insertErr) { console.error(insertErr); continue; }

        if (newOC?.id) {
          const allocRows = g.allocations
            .filter(a => a.contractId)
            .map(a => ({
              purchase_order_id: newOC.id,
              contract_id:       a.contractId,
              amount_uf:         0,
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
    toast.success(`${inserted} OC importadas correctamente.`);

    const { data: freshBatches } = await supabase
      .from("oc_import_batches" as any)
      .select("id,filename,storage_path,imported_at,rows_total,rows_ok,rows_pending_supplier,rows_pending_local,rows_duplicate,drive_synced_at")
      .order("imported_at", { ascending: false })
      .limit(20) as any;
    setBatches(((freshBatches || []) as any[]) as ImportBatch[]);
  }

  function reset() {
    setFile(null);
    setRawRows([]);
    setGrouped([]);
    setMappings([]);
    setStage("idle");
    setProgress(0);
    if (fileInputRef.current) fileInputRef.current.value = "";
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
              <Button variant="outline" size="sm" onClick={reset}>
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
                    <p className="text-sm text-muted-foreground">Procesando archivo…</p>
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
                Los siguientes códigos SAP no tienen match automático. Asígnalos manualmente.
                Los marcados con "Recordar" quedarán guardados para futuros archivos.
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
                        {g.duplicateResolution && (
                          <Badge variant="outline" className="text-xs">
                            {g.duplicateResolution === "keep_existing" && "Mantener existente"}
                            {g.duplicateResolution === "replace"       && "Reemplazar"}
                            {g.duplicateResolution === "keep_both"     && "Mantener ambas"}
                          </Badge>
                        )}
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
                          <p className="text-xs text-muted-foreground italic">
                            ID: {g.existingId?.slice(0, 8)}… — ver en listado de OC
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-2 flex-wrap">
                        <Button size="sm" variant={g.duplicateResolution === "keep_existing" ? "default" : "outline"} onClick={() => setResolution(g.orderNumber, "keep_existing")}>Mantener existente</Button>
                        <Button size="sm" variant={g.duplicateResolution === "replace"       ? "default" : "outline"} onClick={() => setResolution(g.orderNumber, "replace")}>Reemplazar con importado</Button>
                        <Button size="sm" variant={g.duplicateResolution === "keep_both"     ? "default" : "outline"} onClick={() => setResolution(g.orderNumber, "keep_both")}>Mantener ambas</Button>
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
                                      <SearchableSelect
                                        value=""
                                        onValueChange={val => handleLocalPick(g.orderNumber, idx, val)}
                                        options={locationOptions}
                                        placeholder="Buscar local…"
                                        className="w-[220px]"
                                      />
                                    ) : (
                                      <button
                                        className="flex items-center gap-1 text-orange-600 hover:text-orange-800 hover:underline text-xs text-left"
                                        onClick={() => { setEditingLocalKey(editKey); setEditingSupplierKey(null); }}
                                        title="Clic para asignar local"
                                      >
                                        <MapPin className="h-3 w-3 shrink-0" />
                                        {a.rawCentro} (no encontrado)
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

                          {/* Proveedor — clickeable cuando hay pendiente */}
                          <TableCell className="text-sm min-w-[180px]">
                            {g.supplierId ? (
                              <span className="truncate max-w-[180px] block">{g.supplierName}</span>
                            ) : (
                              editingSupplierKey === g.orderNumber ? (
                                <SearchableSelect
                                  value=""
                                  onValueChange={val => handleSupplierPick(g.orderNumber, val)}
                                  options={suppliers.map(s => ({ value: s.id, label: s.name }))}
                                  placeholder="Buscar proveedor…"
                                  className="w-[220px]"
                                  autoFocus
                                />
                              ) : (
                                <button
                                  className="flex items-center gap-1 text-amber-600 hover:text-amber-800 hover:underline text-xs text-left"
                                  onClick={() => { setEditingSupplierKey(g.orderNumber); setEditingLocalKey(null); }}
                                  title="Clic para asignar proveedor"
                                >
                                  <User className="h-3 w-3 shrink-0" />
                                  <span className="truncate max-w-[160px]">{g.rawProveedor}</span>
                                </button>
                              )
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
                <Button variant="outline" size="lg" onClick={reset}>
                  Cancelar
                </Button>
                <Button
                  size="lg"
                  disabled={unresolvedDuplicates.length > 0 || toImport.length === 0}
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
          <button
            className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors w-full"
            onClick={() => setShowHistory(v => !v)}
          >
            <History className="h-4 w-4" />
            Historial de importaciones
            {showHistory ? <ChevronUp className="h-4 w-4 ml-auto" /> : <ChevronDown className="h-4 w-4 ml-auto" />}
          </button>

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
    </div>
  );
}
