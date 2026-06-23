import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import * as XLSX from "xlsx";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import {
  ArrowLeft, Upload, FileSpreadsheet, CheckCircle2, AlertTriangle,
  MapPin, User, Loader2, CloudUpload, History, RefreshCw, ChevronDown, ChevronUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { uploadFileToStorage } from "@/lib/storageUtils";
import {
  parseOCExcelSheet, resolveRows, groupByOrderNumber,
  OCLocation, OCSupplier, GroupedOC, OCRowStatus, DuplicateResolution,
} from "@/lib/parseBulkOCExcel";

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

type Stage = "idle" | "parsing" | "review" | "importing" | "done";

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
  return new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(n);
}

function fmtDate(iso: string) {
  try { return format(parseISO(iso), "dd/MM/yyyy", { locale: es }); } catch { return iso; }
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function BulkOCImport() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Reference data
  const [locations, setLocations]   = useState<OCLocation[]>([]);
  const [suppliers, setSuppliers]   = useState<OCSupplier[]>([]);
  const [batches,   setBatches]     = useState<ImportBatch[]>([]);
  const [loadingRef, setLoadingRef] = useState(true);

  // Import flow
  const [stage,   setStage]   = useState<Stage>("idle");
  const [file,    setFile]    = useState<File | null>(null);
  const [grouped, setGrouped] = useState<GroupedOC[]>([]);
  const [progress, setProgress] = useState(0);
  const [showHistory, setShowHistory] = useState(true);

  // ── Load reference data ──────────────────────────────────────────────────

  useEffect(() => {
    async function load() {
      setLoadingRef(true);
      const [locRes, supRes, batchRes] = await Promise.all([
        supabase
          .from("maintenance_locations" as any)
          .select("contract_id, name, centro_sap")
          .eq("is_active", true)
          .not("contract_id", "is", null),
        supabase
          .from("suppliers")
          .select("id, name")
          .order("name"),
        supabase
          .from("oc_import_batches" as any)
          .select("id,filename,storage_path,imported_at,rows_total,rows_ok,rows_pending_supplier,rows_pending_local,rows_duplicate,drive_synced_at")
          .order("imported_at", { ascending: false })
          .limit(20),
      ]);

      const locs: OCLocation[] = ((locRes.data || []) as any[]).map(l => ({
        contract_id:   l.contract_id,
        contract_name: l.name,
        centro_sap:    l.centro_sap,
      }));
      setLocations(locs);
      setSuppliers(((supRes.data || []) as any[]) as OCSupplier[]);
      setBatches(((batchRes.data || []) as any[]) as ImportBatch[]);
      setLoadingRef(false);
    }
    load();
  }, []);

  // ── File handling ─────────────────────────────────────────────────────────

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
        toast.warning(`Columnas no encontradas: ${missingColumns.join(", ")}. Verifica el formato del archivo.`);
      }
      if (rows.length === 0) {
        toast.error("No se encontraron filas de datos en el archivo.");
        setStage("idle");
        return;
      }

      const parsed   = resolveRows(rows, locations, suppliers);
      const grouped_ = groupByOrderNumber(parsed);

      // Mark duplicates
      const numbers = grouped_.map(g => g.orderNumber).filter(Boolean);
      if (numbers.length > 0) {
        const { data: existing } = await supabase
          .from("purchase_orders")
          .select("id, order_number")
          .in("order_number", numbers)
          .is("deleted_at", null) as any;

        const existingMap = new Map<string, string>();
        for (const o of (existing || []) as any[]) {
          existingMap.set(o.order_number, o.id);
        }
        for (const g of grouped_) {
          if (existingMap.has(g.orderNumber)) {
            g.isDuplicate = true;
            g.existingId  = existingMap.get(g.orderNumber) ?? null;
          }
        }
      }

      setGrouped(grouped_);
      setStage("review");
      toast.success(`${rows.length} filas leídas → ${grouped_.length} OC únicas`);
    } catch (err) {
      console.error(err);
      toast.error("Error al procesar el archivo Excel.");
      setStage("idle");
    }
  }, [locations, suppliers]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  }, [handleFile]);

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) handleFile(f);
  };

  // ── Duplicate resolution ──────────────────────────────────────────────────

  function setResolution(orderNumber: string, res: DuplicateResolution) {
    setGrouped(prev => prev.map(g =>
      g.orderNumber === orderNumber ? { ...g, duplicateResolution: res } : g
    ));
  }

  const unresolvedDuplicates = grouped.filter(g => g.isDuplicate && g.duplicateResolution === null);
  const toImport             = grouped.filter(g => !g.isDuplicate || g.duplicateResolution !== "keep_existing");

  // ── Stats ─────────────────────────────────────────────────────────────────

  const stats = {
    total:           grouped.length,
    ok:              grouped.filter(g => g.status === "ok").length,
    pendingSupplier: grouped.filter(g => g.status === "pending_supplier" || g.status === "pending_both").length,
    pendingLocal:    grouped.filter(g => g.status === "pending_local"    || g.status === "pending_both").length,
    multiLocal:      grouped.filter(g => g.isMultiContract).length,
    duplicates:      grouped.filter(g => g.isDuplicate).length,
  };

  // ── Import ────────────────────────────────────────────────────────────────

  async function handleImport() {
    if (unresolvedDuplicates.length > 0) {
      toast.warning("Hay duplicados sin resolver. Defina qué hacer con cada uno antes de importar.");
      return;
    }
    if (!file) return;

    setStage("importing");
    setProgress(0);

    let storagePath: string | null = null;

    // 1. Upload Excel to storage
    try {
      const year = new Date().getFullYear();
      const ts   = Date.now();
      const path = `oc-imports/${year}/${ts}_${file.name}`;
      const result = await uploadFileToStorage(path, file);
      if (!result.error) storagePath = result.path;
    } catch { /* non-blocking */ }

    // 2. Create batch record
    const { data: batchData } = await supabase
      .from("oc_import_batches" as any)
      .insert({
        filename:             file.name,
        storage_path:         storagePath,
        rows_total:           stats.total,
        rows_ok:              stats.ok,
        rows_pending_supplier: stats.pendingSupplier,
        rows_pending_local:   stats.pendingLocal,
        rows_duplicate:       stats.duplicates,
      })
      .select("id")
      .single() as any;

    const batchId: string | null = batchData?.id ?? null;

    // 3. Insert each OC
    let inserted = 0;
    const ocList = toImport;
    for (let i = 0; i < ocList.length; i++) {
      const g = ocList[i];
      setProgress(Math.round(((i + 1) / ocList.length) * 100));

      try {
        const orderYear = g.orderDate ? parseInt(g.orderDate.slice(0, 4)) : new Date().getFullYear();
        const primaryAlloc = g.allocations.find(a => a.contractId) ?? g.allocations[0];

        if (g.isDuplicate && g.duplicateResolution === "replace" && g.existingId) {
          // Update existing
          await (supabase
            .from("purchase_orders")
            .update({
              description:   g.description,
              amount_clp:    g.totalAmountClp,
              supplier_id:   g.supplierId,
              supplier_name: g.supplierName,
              order_date:    g.orderDate,
              import_pending_supplier: !g.supplierId,
              import_pending_local:    g.allocations.some(a => !a.contractId),
            } as any)
            .eq("id", g.existingId));
          inserted++;
          continue;
        }

        const insertPayload: Record<string, unknown> = {
          order_number:    g.orderNumber,
          description:     g.description,
          amount_uf:       0,
          amount_clp:      g.totalAmountClp,
          input_currency:  "CLP",
          status:          "abierta",
          budget_classification: "OPEX",
          order_date:      g.orderDate,
          year:            orderYear,
          contract_id:     primaryAlloc?.contractId ?? null,
          supplier_id:     g.supplierId,
          supplier_name:   g.supplierName,
          is_multi_contract: g.isMultiContract,
          import_pending_supplier: !g.supplierId,
          import_pending_local:    g.allocations.some(a => !a.contractId),
          import_batch_id: batchId,
        };

        const { data: newOC, error: insertErr } = await (supabase
          .from("purchase_orders")
          .insert(insertPayload as any)
          .select("id")
          .single() as any);

        if (insertErr) { console.error(insertErr); continue; }

        // Insert allocations for each local
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

    // Refresh history
    const { data: freshBatches } = await supabase
      .from("oc_import_batches" as any)
      .select("id,filename,storage_path,imported_at,rows_total,rows_ok,rows_pending_supplier,rows_pending_local,rows_duplicate,drive_synced_at")
      .order("imported_at", { ascending: false })
      .limit(20) as any;
    setBatches(((freshBatches || []) as any[]) as ImportBatch[]);
  }

  function reset() {
    setFile(null);
    setGrouped([]);
    setStage("idle");
    setProgress(0);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const duplicates = grouped.filter(g => g.isDuplicate);
  const nonDuplicates = grouped.filter(g => !g.isDuplicate);

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
          {stage === "review" && (
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
                      <p className="text-sm text-muted-foreground mt-1">.xlsx / .xls — columnas requeridas: Centro, Documento compras, Fecha Documento, Texto Breve, Precio Neto, Proveedor/Centro suministrador</p>
                    </div>
                  </div>
                )}
                <input ref={fileInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={onInputChange} />
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
                      <div className="flex items-center justify-between">
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
                          <p>{g.description}</p>
                          <p className="text-muted-foreground">{g.supplierName}</p>
                          <p className="font-semibold">{fmtClp(g.totalAmountClp)}</p>
                          <p className="text-xs text-muted-foreground">{fmtDate(g.orderDate)}</p>
                        </div>
                        <div className="bg-amber-50 border border-amber-200 rounded p-3">
                          <p className="font-medium text-xs text-amber-700 mb-1">EN EL SISTEMA</p>
                          <p className="text-xs text-muted-foreground italic">Ver en listado de OC (ID: {g.existingId?.slice(0, 8)}…)</p>
                        </div>
                      </div>
                      <div className="flex gap-2 flex-wrap">
                        <Button size="sm" variant={g.duplicateResolution === "keep_existing" ? "default"  : "outline"} onClick={() => setResolution(g.orderNumber, "keep_existing")}>Mantener existente</Button>
                        <Button size="sm" variant={g.duplicateResolution === "replace"       ? "default"  : "outline"} onClick={() => setResolution(g.orderNumber, "replace")}>Reemplazar con importado</Button>
                        <Button size="sm" variant={g.duplicateResolution === "keep_both"     ? "default"  : "outline"} onClick={() => setResolution(g.orderNumber, "keep_both")}>Mantener ambas</Button>
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
                        <TableHead className="w-[120px]">Nº OC</TableHead>
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
                          <TableCell className="text-sm">
                            {g.allocations.map((a, i) => (
                              <div key={i} className="flex items-center gap-1">
                                {a.pendingLocal
                                  ? <span className="text-orange-600 flex items-center gap-1"><MapPin className="h-3 w-3" />{a.rawCentro} (no encontrado)</span>
                                  : <span className="truncate max-w-[160px]">{a.contractName}</span>
                                }
                              </div>
                            ))}
                          </TableCell>
                          <TableCell className="text-sm">
                            {g.supplierId
                              ? g.supplierName
                              : <span className="text-amber-600 flex items-center gap-1"><User className="h-3 w-3" />{g.rawProveedor}</span>
                            }
                          </TableCell>
                          <TableCell className="text-right text-sm font-medium">{fmtClp(g.totalAmountClp)}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{fmtDate(g.orderDate)}</TableCell>
                          <TableCell>{statusBadge(g.status)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>

            {/* Import button */}
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {unresolvedDuplicates.length > 0
                  ? `⚠ ${unresolvedDuplicates.length} duplicados sin resolver`
                  : `${toImport.length} OC listas para importar`}
              </p>
              <Button
                size="lg"
                disabled={unresolvedDuplicates.length > 0 || toImport.length === 0}
                onClick={handleImport}
              >
                <Upload className="h-4 w-4 mr-2" />
                Importar {toImport.length} OC
              </Button>
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
                            <TableCell className="text-sm text-muted-foreground">
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
