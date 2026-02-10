import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Upload, AlertTriangle, CheckCircle, Loader2, Sparkles } from "lucide-react";
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
  const [parsedRows, setParsedRows] = useState<(ParsedMaintenanceRow & { aiMatched?: boolean })[]>([]);
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

      // Find header row (look for row containing "FORM" or similar in column A)
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
            // Full CEBE (e.g., "H04A2P1390")
            const fullCebe = cv.field_value.trim().toUpperCase();
            contractsByFullCEBE.set(fullCebe, entry);
            // Extract prefix before 'P' (e.g., "H04A2" from "H04A2P1390")
            const prefixMatch = fullCebe.match(/^(H\w+?)P\d+$/i);
            if (prefixMatch) {
              contractsByPrefix.set(prefixMatch[1], entry);
            }
            // Extract 4 digits at positions 1-4 (e.g., "0410" from "H0410P1290")
            if (fullCebe.length >= 5) {
              const digits4 = fullCebe.substring(1, 5);
              if (/^\d{4}$/.test(digits4)) {
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
      const matchContract = (rawText: string): { id: string; name: string } | null => {
        const normText = normalize(rawText);
        // Priority 1: Direct name match (accent-normalized)
        for (const [name, contract] of contractsByName) {
          if (normText.includes(name) || name.includes(normText)) return contract;
        }
        // Priority 2: Full CEBE match (e.g., text contains "H04A2P1390")
        const upperText = rawText.toUpperCase();
        for (const [cebe, contract] of contractsByFullCEBE) {
          if (upperText.includes(cebe)) return contract;
        }
        // Priority 3: 4-digit CEBE match (e.g., "0410" from "0410 TIENDA LA FLORIDA")
        const excelDigits = rawText.trim().match(/^\d{4}/)?.[0];
        if (excelDigits && contractsByDigits.has(excelDigits)) {
          const candidates = contractsByDigits.get(excelDigits)!;
          if (candidates.length === 1) return candidates[0];
          // Disambiguate by name similarity
          for (const c of candidates) {
            if (normText.includes(normalize(c.name)) || normalize(c.name).includes(normText)) {
              return c;
            }
          }
          // Try partial word overlap
          const words = normText.split(/\s+/).filter(w => w.length > 2);
          let best: { id: string; name: string } | null = null;
          let bestScore = 0;
          for (const c of candidates) {
            const cWords = normalize(c.name).split(/\s+/);
            const score = words.filter(w => cWords.some(cw => cw.includes(w) || w.includes(cw))).length;
            if (score > bestScore) { bestScore = score; best = c; }
          }
          if (best) return best;
          // If still ambiguous, return first candidate
          return candidates[0];
        }
        // Priority 4: CEBE prefix match (e.g., text contains "H04A2")
        for (const [prefix, contract] of contractsByPrefix) {
          if (upperText.includes(prefix)) return contract;
        }
        return null;
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
        if (rawContractText) {
          const match = matchContract(rawContractText);
          if (match) {
            contractId = match.id;
            contractName = match.name;
          } else {
            warnings.push("Contrato no encontrado");
          }
        }

        // Extract evidence links from column N (index 13)
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

      // AI matching for unmatched rows
      const unmatchedRows = parsed.filter(r => !r.contract_id && r.contract_name);
      if (unmatchedRows.length > 0 && contracts?.length) {
        setParsedRows(parsed);
        setAiLoading(true);

        try {
          // Build contracts with CEBEs for AI
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
                    row.warnings = row.warnings.filter(w => w !== "Contrato no encontrado");
                    (row as any).aiMatched = true;
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
    const validRows = parsedRows.filter(r => r.errors.length === 0);
    if (validRows.length === 0) {
      toast({ title: "Sin filas válidas", description: "Todas las filas tienen errores", variant: "destructive" });
      return;
    }

    setInserting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      const records = validRows.map(r => ({
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
      }));

      // Upsert in batches of 100 (update existing, insert new based on form_number)
      for (let i = 0; i < records.length; i += 100) {
        const batch = records.slice(i, i + 100);
        const { error } = await (supabase.from("maintenance_forms" as any) as any)
          .upsert(batch, { onConflict: "form_number" });
        if (error) throw error;
      }

      toast({ title: "Carga exitosa", description: `${validRows.length} FORMs cargados/actualizados correctamente` });
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

  const errorCount = parsedRows.filter(r => r.errors.length > 0).length;
  const warningCount = parsedRows.filter(r => r.warnings.length > 0).length;
  const validCount = parsedRows.filter(r => r.errors.length === 0).length;

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
            <div className="flex gap-4 text-sm">
              <span className="flex items-center gap-1"><CheckCircle className="h-4 w-4 text-green-600" /> {validCount} válidos</span>
              {warningCount > 0 && <span className="flex items-center gap-1"><AlertTriangle className="h-4 w-4 text-yellow-600" /> {warningCount} advertencias</span>}
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
                    <TableHead>Descripción</TableHead>
                    <TableHead className="w-24">Evidencias</TableHead>
                    <TableHead className="w-32">Validación</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {parsedRows.map((row) => (
                    <TableRow key={row.rowIndex} className={row.errors.length > 0 ? "bg-destructive/10" : row.warnings.length > 0 ? "bg-yellow-50" : ""}>
                      <TableCell className="font-mono text-xs">{row.form_number}</TableCell>
                      <TableCell>
                        <Badge variant={row.status === "solucionado" ? "default" : "secondary"} className="text-xs">
                          {row.status === "solucionado" ? "Solucionado" : "Proceso"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs">{row.created_date || "-"}</TableCell>
                      <TableCell className="text-xs">
                        {row.contract_name || "-"}
                        {row.contract_id && !(row as any).aiMatched && <CheckCircle className="h-3 w-3 text-green-600 inline ml-1" />}
                        {row.contract_id && (row as any).aiMatched && <span title="Matcheado por IA"><Sparkles className="h-3 w-3 text-primary inline ml-1" /></span>}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">{detectMaintenanceType(row)}</Badge>
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
          <DialogFooter>
            <Button variant="outline" onClick={() => { reset(); }}>Cancelar</Button>
            <Button onClick={handleInsert} disabled={inserting || validCount === 0}>
              {inserting ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Cargando...</> : `Cargar ${validCount} FORMs`}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
