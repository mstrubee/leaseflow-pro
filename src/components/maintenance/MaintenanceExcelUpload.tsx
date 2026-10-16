import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Upload, AlertTriangle, CheckCircle, Loader2, Sparkles, SkipForward, Shield } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { validateExcelFile } from "@/lib/excelFileValidation";
import { ParsedMaintenanceRow, detectMaintenanceType } from "./types";
import * as XLSX from "xlsx";

const normalize = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function MaintenanceExcelUpload({ open, onOpenChange, onSuccess }: Props) {
  const [parsedRows, setParsedRows] = useState<(ParsedMaintenanceRow & { aiMatched?: boolean; isExisting?: boolean })[]>([]);
  const [loading, setLoading] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [inserting, setInserting] = useState(false);
  const [fileName, setFileName] = useState("");

  const reset = () => {
    setParsedRows([]);
    setFileName("");
  };

  const handleFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validation = validateExcelFile(file);
    if (!validation.valid) {
      toast({ title: "Error", description: validation.error, variant: "destructive" });
      return;
    }

    setLoading(true);
    setFileName(file.name);

    try {
      const data = await file.arrayBuffer();
      const wb = XLSX.read(data, { type: "array", cellDates: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });

      // Find header row
      let headerIdx = 0;
      for (let i = 0; i < Math.min(rows.length, 10); i++) {
        const cellA = String(rows[i]?.[0] ?? "").toLowerCase();
        if (cellA.includes("form") || cellA.includes("id") || cellA.includes("n°") || cellA.includes("numero")) {
          headerIdx = i;
          break;
        }
      }

      // Fetch contracts for matching
      const { data: contracts } = await supabase
        .from("contracts")
        .select("id, name")
        .is("deleted_at", null);

      // Strategy 1: Build name-based lookup (normalized)
      const contractsByName = new Map<string, { id: string; name: string }>();
      contracts?.forEach(c => {
        const n = normalize(c.name);
        contractsByName.set(n, { id: c.id, name: c.name });
      });

      // Strategy 2: Build full-CEBE and prefix lookup
      const contractsByFullCEBE = new Map<string, { id: string; name: string }>();
      const contractsByPrefix = new Map<string, { id: string; name: string }>();
      const contractsByDigits = new Map<string, Array<{ id: string; name: string }>>();

      const { data: cebeField } = await supabase
        .from("contract_custom_fields")
        .select("id")
        .ilike("field_name", "cebe")
        .eq("is_active", true)
        .limit(1)
        .single();

      if (cebeField && contracts) {
        const { data: cebeValues } = await supabase
          .from("contract_custom_field_values")
          .select("contract_id, field_value")
          .eq("field_id", cebeField.id);

        const contractMap = new Map<string, string>();
        contracts.forEach(c => contractMap.set(c.id, c.name));

        cebeValues?.forEach(cv => {
          if (cv.field_value) {
            const name = contractMap.get(cv.contract_id);
            if (!name) return;
            const entry = { id: cv.contract_id, name };
            const fullCebe = cv.field_value.trim().toUpperCase();
            contractsByFullCEBE.set(fullCebe, entry);
            const prefixMatch = fullCebe.match(/^(H\w+?)P\d+$/i);
            if (prefixMatch) {
              contractsByPrefix.set(prefixMatch[1], entry);
            }
            if (fullCebe.length >= 5) {
              // El código de 4 caracteres puede ser alfanumérico (ej. "04A4"
              // en el CEBE H04A4P1390 de Agroplanet, o "04C6" en Autoplanet)
              // — no solo dígitos puros.
              const digits4 = fullCebe.substring(1, 5);
              if (/^[A-Z0-9]{4}$/.test(digits4)) {
                if (!contractsByDigits.has(digits4)) {
                  contractsByDigits.set(digits4, []);
                }
                contractsByDigits.get(digits4)!.push(entry);
              }
            }
          }
        });
      }

      // Helper: match Excel text to contract
      const matchContract = (rawText: string): { match: { id: string; name: string } | null; ambiguous?: { id: string; name: string }[] } => {
        const normText = normalize(rawText);
        const upperText = rawText.toUpperCase();

        for (const [cebe, contract] of contractsByFullCEBE) {
          if (upperText.includes(cebe)) return { match: contract };
        }

        // El código corto de tienda (columna "Tienda") puede ser alfanumérico
        // (ej. "04a4" para el CEBE H04A4P1390) — no asumir solo dígitos.
        const cebeMatch = rawText.trim().match(/^H([A-Za-z0-9]{4})P\d+/i);
        const plainDigitsMatch = rawText.trim().match(/^([A-Za-z0-9]{4})/);
        const excelDigits = (cebeMatch?.[1] || plainDigitsMatch?.[1])?.toUpperCase();
        if (excelDigits && contractsByDigits.has(excelDigits)) {
          const candidates = contractsByDigits.get(excelDigits)!;
          if (candidates.length === 1) return { match: candidates[0] };
          for (const c of candidates) {
            if (normText.includes(normalize(c.name)) || normalize(c.name).includes(normText)) {
              return { match: c };
            }
          }
          const words = normText.split(/\s+/).filter(w => w.length > 2);
          let best: { id: string; name: string } | null = null;
          let bestScore = 0;
          for (const c of candidates) {
            const cWords = normalize(c.name).split(/\s+/);
            const score = words.filter(w => cWords.some(cw => cw.includes(w) || w.includes(cw))).length;
            if (score > bestScore) { bestScore = score; best = c; }
          }
          if (best && bestScore > 0) {
            const scores = candidates.map(c => {
              const cWords = normalize(c.name).split(/\s+/);
              return words.filter(w => cWords.some(cw => cw.includes(w) || w.includes(cw))).length;
            });
            const tiedCount = scores.filter(s => s === bestScore).length;
            if (tiedCount === 1) return { match: best };
          }
          return { match: null, ambiguous: candidates };
        }

        for (const [prefix, contract] of contractsByPrefix) {
          if (upperText.includes(prefix)) return { match: contract };
        }

        // Coincidencia por nombre: juntar TODOS los contratos que matchean. Si hay
        // más de uno (ej. "Casablanca" → Casablanca y Casablanca AG), NO elegir uno
        // al azar: marcar como AMBIGUO para que el usuario seleccione manualmente.
        const nameMatches: { id: string; name: string }[] = [];
        const seenIds = new Set<string>();
        for (const [name, contract] of contractsByName) {
          if ((normText.includes(name) || name.includes(normText)) && !seenIds.has(contract.id)) {
            seenIds.add(contract.id);
            nameMatches.push(contract);
          }
        }
        if (nameMatches.length === 1) return { match: nameMatches[0] };
        if (nameMatches.length > 1) return { match: null, ambiguous: nameMatches };
        return { match: null };
      };

      const parsed: ParsedMaintenanceRow[] = [];
      for (let i = headerIdx + 1; i < rows.length; i++) {
        const row = rows[i];
        const formNum = String(row[0] ?? "").trim();
        if (!formNum) continue;

        const errors: string[] = [];
        const warnings: string[] = [];

        const rawStatus = String(row[1] ?? "").trim().toLowerCase();
        let status = rawStatus;
        if (rawStatus.includes("proceso")) status = "proceso";
        else if (rawStatus.includes("solucionado")) status = "solucionado";
        else if (rawStatus) errors.push(`Estado inválido: "${row[1]}"`);

        let createdDate: string | null = null;
        const rawDate = row[2];
        if (rawDate instanceof Date && !isNaN(rawDate.getTime())) {
          createdDate = rawDate.toISOString().split("T")[0];
        } else if (rawDate) {
          const pd = new Date(rawDate);
          if (!isNaN(pd.getTime())) {
            createdDate = pd.toISOString().split("T")[0];
          } else {
            warnings.push("Fecha no reconocida");
          }
        }

        let resolutionDate: string | null = null;
        const rawResDate = row[3];
        if (rawResDate instanceof Date && !isNaN(rawResDate.getTime())) {
          resolutionDate = rawResDate.toISOString().split("T")[0];
        } else if (rawResDate) {
          const parsedRes = new Date(rawResDate);
          if (!isNaN(parsedRes.getTime())) {
            resolutionDate = parsedRes.toISOString().split("T")[0];
          }
        }

        const rawContractText = String(row[4] ?? "").trim();
        let contractId: string | null = null;
        let contractName: string | null = rawContractText || null;
        let ambiguousCandidates: { id: string; name: string }[] | undefined;
        if (rawContractText) {
          const result = matchContract(rawContractText);
          if (result.match) {
            contractId = result.match.id;
            contractName = result.match.name;
          } else if (result.ambiguous) {
            ambiguousCandidates = result.ambiguous;
            warnings.push("Nombre ambiguo — seleccione contrato");
          } else {
            warnings.push("Contrato no encontrado");
          }
        }

        const rawColumnN = String(row[13] ?? "");
        const evidenceLinks: string[] = [];
        const linkRegex = /https?:\/\/[^\s"<>]+\.(?:jpeg|jpg|png|gif|pdf|docx?|xlsx?|pptx?|mp4|mov|zip)/gi;
        let linkMatch;
        while ((linkMatch = linkRegex.exec(rawColumnN)) !== null) {
          evidenceLinks.push(linkMatch[0]);
        }

        parsed.push({
          rowIndex: i,
          form_number: formNum,
          status: status || "proceso",
          created_date: createdDate,
          resolution_date: resolutionDate,
          contract_name: contractName || null,
          contract_id: contractId,
          ambiguousCandidates,
          general_description: String(row[6] ?? "").trim() || null,
          electrical_description: String(row[7] ?? "").trim() || null,
          civil_description: String(row[8] ?? "").trim() || null,
          hvac_description: String(row[9] ?? "").trim() || null,
          fixed_assets_description: String(row[10] ?? "").trim() || null,
          additional_comments: String(row[11] ?? "").trim() || null,
          evidence_links: evidenceLinks,
          errors,
          warnings,
        });
      }

      // AI matching: filas sin contrato resuelto (incluye las AMBIGUAS, para que la IA
      // lea el nombre del local y elija la mejor coincidencia; el selector manual queda
      // como override de la sugerencia de la IA).
      const unmatchedRows = parsed.filter(r => !r.contract_id && r.contract_name);
      if (unmatchedRows.length > 0 && contracts?.length) {
        setParsedRows(parsed);
        setAiLoading(true);

        try {
          const contractsWithCebes: { id: string; name: string; cebe: string }[] = [];
          if (cebeField) {
            const { data: allCebeValues } = await supabase
              .from("contract_custom_field_values")
              .select("contract_id, field_value")
              .eq("field_id", cebeField.id);

            allCebeValues?.forEach(cv => {
              if (cv.field_value) {
                const cName = contracts.find(c => c.id === cv.contract_id)?.name;
                if (cName) {
                  contractsWithCebes.push({ id: cv.contract_id, name: cName, cebe: cv.field_value.trim() });
                }
              }
            });
          }

          if (contractsWithCebes.length > 0) {
            const unmatchedTexts = unmatchedRows.map(r => r.contract_name!);
            const response = await fetch(
              `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/match-contracts`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
                },
                body: JSON.stringify({ unmatchedTexts, contracts: contractsWithCebes }),
              }
            );

            if (response.ok) {
              const { matches } = await response.json();
              if (matches?.length) {
                const matchMap = new Map<string, { contractId: string; contractName: string }>();
                matches.forEach((m: any) => matchMap.set(m.text, { contractId: m.contractId, contractName: m.contractName }));

                for (const row of parsed) {
                  if (!row.contract_id && row.contract_name && matchMap.has(row.contract_name)) {
                    const match = matchMap.get(row.contract_name)!;
                    row.contract_id = match.contractId;
                    row.contract_name = match.contractName;
                    row.warnings = row.warnings.filter(w => w !== "Contrato no encontrado" && w !== "Nombre ambiguo — seleccione contrato");
                    (row as any).aiMatched = true;
                    // Si era ambigua, mantener los candidatos para permitir override manual.
                  }
                }
              }
            }
          }
        } catch (err) {
          console.error("AI matching error:", err);
        } finally {
          setAiLoading(false);
        }
      }

      // Check which form_numbers already exist and fetch their criticality + sub_status + comments
      const allFormNumbers = parsed.map(r => r.form_number);
      const existingFormNumbers = new Set<string>();
      const existingCriticalityMap = new Map<string, string | null>();
      const existingSubStatusMap = new Map<string, string | null>();
      const existingCommentsMap = new Map<string, boolean>();
      
      for (let i = 0; i < allFormNumbers.length; i += 500) {
        const batch = allFormNumbers.slice(i, i + 500);
        const { data: existingForms } = await (supabase.from("maintenance_forms" as any) as any)
          .select("form_number, criticality_category_id, sub_status, additional_comments")
          .in("form_number", batch);
        existingForms?.forEach((f: any) => {
          existingFormNumbers.add(f.form_number);
          existingCriticalityMap.set(f.form_number, f.criticality_category_id);
          existingSubStatusMap.set(f.form_number, f.sub_status);
          existingCommentsMap.set(f.form_number, !!f.additional_comments?.trim());
        });
      }

      // Fetch criticality categories for display
      let critCategoryLookup = new Map<string, { name: string; color: string | null }>();
      const critIds = new Set<string>();
      existingCriticalityMap.forEach(v => { if (v) critIds.add(v); });
      if (critIds.size > 0) {
        const { data: critCats } = await (supabase as any)
          .from("maintenance_criticality_categories")
          .select("id, name, color")
          .in("id", Array.from(critIds));
        critCats?.forEach((c: any) => critCategoryLookup.set(c.id, { name: c.name, color: c.color }));
      }

      // Mark existing rows with their criticality info + sub_status + comments
      parsed.forEach(r => {
        if (existingFormNumbers.has(r.form_number)) {
          (r as any).isExisting = true;
          const critId = existingCriticalityMap.get(r.form_number);
          r.existingCriticalityId = critId || null;
          if (critId) {
            const cat = critCategoryLookup.get(critId);
            r.existingCriticalityName = cat?.name || null;
            r.existingCriticalityColor = cat?.color || null;
          }
          (r as any).existingSubStatus = existingSubStatusMap.get(r.form_number) || null;
          (r as any).existingHasComments = existingCommentsMap.get(r.form_number) || false;
        }
      });

      setParsedRows(parsed);
      if (parsed.length === 0) {
        toast({ title: "Sin datos", description: "No se encontraron filas con datos válidos", variant: "destructive" });
      }
    } catch (err) {
      console.error(err);
      toast({ title: "Error al procesar", description: "No se pudo leer el archivo Excel", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, []);

  const handleInsert = async () => {
    const newRows = parsedRows.filter(r => r.errors.length === 0 && !r.isExisting);
    const skippedCount = parsedRows.filter(r => r.isExisting).length;
    
    if (newRows.length === 0) {
      toast({ title: "Sin forms nuevos", description: `Todos los ${skippedCount} forms ya existen en el sistema`, variant: "destructive" });
      return;
    }

    setInserting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      const records = newRows.map(r => ({
        form_number: r.form_number,
        status: r.status,
        created_date: r.created_date,
        resolution_date: r.resolution_date,
        contract_id: r.contract_id,
        contract_name: r.contract_name,
        general_description: r.general_description,
        electrical_description: r.electrical_description,
        civil_description: r.civil_description,
        hvac_description: r.hvac_description,
        fixed_assets_description: r.fixed_assets_description,
        additional_comments: r.additional_comments,
        evidence_links: r.evidence_links,
        year: r.created_date ? new Date(r.created_date).getFullYear() : new Date().getFullYear(),
        created_by: user?.id ?? null,
        sub_status: 'solicitado',
        sub_status_solicitado_at: new Date().toISOString(),
      }));

      for (let i = 0; i < records.length; i += 100) {
        const batch = records.slice(i, i + 100);
        const { error } = await (supabase.from("maintenance_forms" as any) as any)
          .insert(batch);
        if (error) throw error;
      }

      const msg = skippedCount > 0
        ? `${newRows.length} FORMs nuevos cargados, ${skippedCount} omitidos (ya existían)`
        : `${newRows.length} FORMs nuevos cargados correctamente`;
      toast({ title: "Carga exitosa", description: msg });
      reset();
      onOpenChange(false);
      onSuccess();
    } catch (err: any) {
      console.error(err);
      toast({ title: "Error al cargar", description: err.message, variant: "destructive" });
    } finally {
      setInserting(false);
    }
  };

  const existingCount = parsedRows.filter(r => r.isExisting).length;
  const newCount = parsedRows.filter(r => !r.isExisting && r.errors.length === 0 && !(r.ambiguousCandidates && !r.contract_id)).length;
  const ambiguousCount = parsedRows.filter(r => r.ambiguousCandidates && !r.contract_id).length;
  const errorCount = parsedRows.filter(r => r.errors.length > 0).length;
  const warningCount = parsedRows.filter(r => r.warnings.length > 0 && !r.ambiguousCandidates && !r.isExisting).length;

  const resolveAmbiguous = (rowIndex: number, contract: { id: string; name: string }) => {
    setParsedRows(prev => prev.map(r =>
      r.rowIndex === rowIndex
        ? { ...r, contract_id: contract.id, contract_name: contract.name, aiMatched: false, warnings: r.warnings.filter(w => w !== "Nombre ambiguo — seleccione contrato") }
        : r
    ));
  };

  const resolveAllAmbiguous = (candidateIds: string[], contract: { id: string; name: string }) => {
    setParsedRows(prev => prev.map(r => {
      if (r.ambiguousCandidates && !r.contract_id && r.ambiguousCandidates.some(c => candidateIds.includes(c.id))) {
        return { ...r, contract_id: contract.id, contract_name: contract.name, warnings: r.warnings.filter(w => w !== "Nombre ambiguo — seleccione contrato") };
      }
      return r;
    }));
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-w-5xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Carga Masiva de FORMs</DialogTitle>
          <DialogDescription>
            Sube un archivo Excel con las columnas: A (N° FORM), B (Estado), C (Fecha), E (Contrato), G-L (Descripciones)
          </DialogDescription>
        </DialogHeader>

        {parsedRows.length === 0 ? (
          <div className="flex flex-col items-center gap-4 py-8">
            <Upload className="h-12 w-12 text-muted-foreground" />
            <label className="cursor-pointer">
              <input
                type="file"
                accept=".xls,.xlsx"
                className="hidden"
                onChange={handleFile}
                disabled={loading}
              />
              <Button variant="outline" asChild disabled={loading}>
                <span>{loading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Procesando...</> : "Seleccionar archivo Excel"}</span>
              </Button>
            </label>
            {aiLoading && <p className="text-sm text-muted-foreground flex items-center gap-2"><Sparkles className="h-4 w-4 animate-pulse text-primary" /> Buscando contratos con IA...</p>}
            {fileName && <p className="text-sm text-muted-foreground">{fileName}</p>}
          </div>
        ) : (
          <>
            <div className="flex gap-4 text-sm flex-wrap">
              <span className="flex items-center gap-1"><CheckCircle className="h-4 w-4 text-green-600" /> {newCount} nuevos</span>
              {existingCount > 0 && <span className="flex items-center gap-1 text-muted-foreground"><SkipForward className="h-4 w-4" /> {existingCount} ya existen (criticidad, comentarios y sub-estado preservados)</span>}
              {ambiguousCount > 0 && <span className="flex items-center gap-1 text-orange-600"><AlertTriangle className="h-4 w-4" /> {ambiguousCount} duplicados por resolver</span>}
              {warningCount > 0 && <span className="flex items-center gap-1 text-yellow-600"><AlertTriangle className="h-4 w-4" /> {warningCount} advertencias</span>}
              {errorCount > 0 && <span className="flex items-center gap-1 text-destructive"><AlertTriangle className="h-4 w-4" /> {errorCount} errores</span>}
            </div>

            <div className="border rounded-md overflow-auto max-h-[50vh]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-20">N° FORM</TableHead>
                    <TableHead className="w-24">Estado</TableHead>
                    <TableHead className="w-24">Fecha</TableHead>
                    <TableHead>Contrato</TableHead>
                    <TableHead className="w-24">Tipo</TableHead>
                    <TableHead className="w-28">Criticidad</TableHead>
                    <TableHead>Descripción</TableHead>
                    <TableHead className="w-24">Evidencias</TableHead>
                    <TableHead className="w-32">Validación</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {parsedRows.map((row) => (
                    <TableRow key={row.rowIndex} className={row.isExisting ? "bg-muted/50 opacity-60" : row.errors.length > 0 ? "bg-destructive/10" : (row.ambiguousCandidates && !row.contract_id) ? "bg-orange-50" : row.warnings.length > 0 ? "bg-yellow-50" : ""}>
                      <TableCell className="font-mono text-xs">
                        {row.form_number}
                        {row.isExisting && (
                          <span className="flex gap-1 mt-0.5">
                            <Badge variant="outline" className="text-[10px] text-muted-foreground">Ya existe</Badge>
                            {(row as any).existingSubStatus && (
                              <Badge variant="outline" className="text-[10px]">{(row as any).existingSubStatus === 'revisado' ? '✓ Revisado' : (row as any).existingSubStatus}</Badge>
                            )}
                            {(row as any).existingHasComments && (
                              <Badge variant="outline" className="text-[10px]">💬</Badge>
                            )}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={row.status === "solucionado" ? "default" : "secondary"} className="text-xs">
                          {row.status === "solucionado" ? "Solucionado" : "Proceso"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs">{row.created_date || "-"}</TableCell>
                      <TableCell className="text-xs">
                        {row.ambiguousCandidates && (!row.contract_id || (row as any).aiMatched) ? (
                          <div className="space-y-1">
                            <span className="text-orange-600 font-medium text-[11px] block">
                              {(row as any).aiMatched ? "IA sugirió — confirma o cambia:" : "Nombre ambiguo — Seleccione:"}
                            </span>
                            <div className="flex flex-col gap-1">
                              {row.ambiguousCandidates.map(c => (
                                <button
                                  key={c.id}
                                  onClick={() => resolveAmbiguous(row.rowIndex, c)}
                                  className={`text-left text-[11px] px-2 py-1 rounded border transition-colors ${
                                    c.id === row.contract_id
                                      ? "border-primary bg-primary/10 font-medium"
                                      : "border-border hover:bg-accent hover:text-accent-foreground"
                                  }`}
                                >
                                  {c.id === row.contract_id && (row as any).aiMatched ? "✓ " : ""}{c.name}
                                </button>
                              ))}
                            </div>
                            <button
                              onClick={() => {
                                const candidateIds = row.ambiguousCandidates!.map(c => c.id);
                                const choice = row.ambiguousCandidates![0];
                                resolveAllAmbiguous(candidateIds, choice);
                              }}
                              className="text-[10px] text-muted-foreground underline hover:text-foreground"
                            >
                              Aplicar "{row.ambiguousCandidates[0].name}" a todos los similares
                            </button>
                            {row.ambiguousCandidates.length > 1 && (
                              <button
                                onClick={() => resolveAllAmbiguous(row.ambiguousCandidates!.map(c => c.id), row.ambiguousCandidates![1])}
                                className="text-[10px] text-muted-foreground underline hover:text-foreground"
                              >
                                Aplicar "{row.ambiguousCandidates[1].name}" a todos los similares
                              </button>
                            )}
                          </div>
                        ) : (
                          <>
                            {row.contract_name || "-"}
                            {row.contract_id && !(row as any).aiMatched && <CheckCircle className="h-3 w-3 text-green-600 inline ml-1" />}
                            {row.contract_id && (row as any).aiMatched && <span title="Matcheado por IA"><Sparkles className="h-3 w-3 text-primary inline ml-1" /></span>}
                            {row.contract_id && row.ambiguousCandidates && <span title="Resuelto manualmente" className="text-orange-600 text-[10px] ml-1">(manual)</span>}
                          </>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">{detectMaintenanceType(row)}</Badge>
                      </TableCell>
                      <TableCell className="text-xs">
                        {row.isExisting && row.existingCriticalityName ? (
                          <Badge
                            className="text-[10px]"
                            style={{ backgroundColor: row.existingCriticalityColor || "#6b7280", color: "#fff" }}
                          >
                            <Shield className="h-3 w-3 mr-1" />
                            {row.existingCriticalityName}
                          </Badge>
                        ) : row.isExisting ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          <span className="text-muted-foreground text-[10px]">Nueva</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs max-w-48 truncate">
                        {row.general_description || row.electrical_description || row.civil_description || row.hvac_description || row.fixed_assets_description || "-"}
                      </TableCell>
                      <TableCell className="text-xs text-center">
                        {row.evidence_links.length > 0 ? (
                          <Badge variant="outline" className="text-xs">{row.evidence_links.length} link{row.evidence_links.length > 1 ? "s" : ""}</Badge>
                        ) : "-"}
                      </TableCell>
                      <TableCell className="text-xs">
                        {row.errors.map((e, i) => <span key={i} className="text-destructive block">{e}</span>)}
                        {row.warnings.map((w, i) => <span key={i} className="text-yellow-600 block">{w}</span>)}
                        {row.errors.length === 0 && row.warnings.length === 0 && <CheckCircle className="h-4 w-4 text-green-600" />}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}

        {parsedRows.length > 0 && (
          <DialogFooter className="flex-col sm:flex-row gap-2">
            {ambiguousCount > 0 && (
              <p className="text-xs text-orange-600 mr-auto">⚠ Resuelva los {ambiguousCount} CEBE duplicados antes de cargar</p>
            )}
            <Button variant="outline" onClick={() => { reset(); }}>Cancelar</Button>
            <Button onClick={handleInsert} disabled={inserting || newCount === 0 || ambiguousCount > 0}>
              {inserting ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Cargando...</> : `Cargar ${newCount} FORMs nuevos`}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
