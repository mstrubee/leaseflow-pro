import { useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Upload, FileSpreadsheet, AlertCircle, CheckCircle2 } from "lucide-react";
import * as XLSX from "xlsx";
import { validateExcelFile, withParseTimeout } from "@/lib/excelFileValidation";

interface OpexExcelUploadProps {
  year: number;
  ufValue: number;
  onSuccess: () => void;
}

interface ParsedRow {
  category: string;
  months: number[];
  total: number;
  isValid: boolean;
  error?: string;
}

const MONTH_NAMES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
];

export const OpexExcelUpload = ({ year, ufValue, onSuccess }: OpexExcelUploadProps) => {
  const [open, setOpen] = useState(false);
  const [parsedData, setParsedData] = useState<ParsedRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [fileName, setFileName] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetState = () => {
    setParsedData([]);
    setFileName("");
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file
    const validation = validateExcelFile(file);
    if (!validation.valid) {
      toast.error(validation.error);
      return;
    }

    setFileName(file.name);
    setIsLoading(true);

    try {
      const data = await withParseTimeout(parseExcelFile(file));
      setParsedData(data);
      
      const validRows = data.filter(r => r.isValid).length;
      const invalidRows = data.filter(r => !r.isValid).length;
      
      if (invalidRows > 0) {
        toast.warning(`${validRows} filas válidas, ${invalidRows} con errores`);
      } else {
        toast.success(`${validRows} categorías encontradas`);
      }
    } catch (error) {
      console.error("Error parsing Excel:", error);
      toast.error("Error al procesar el archivo Excel");
      resetState();
    } finally {
      setIsLoading(false);
    }
  };

  const parseExcelFile = (file: File): Promise<ParsedRow[]> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: "array" });
          const sheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[sheetName];
          const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];

          // Skip header row if present
          const startRow = jsonData[0]?.[0]?.toString().toLowerCase().includes("categor") ? 1 : 0;
          
          const rows: ParsedRow[] = [];
          
          for (let i = startRow; i < jsonData.length; i++) {
            const row = jsonData[i];
            if (!row || !row[0]) continue; // Skip empty rows
            
            const category = String(row[0] || "").trim();
            if (!category) continue;
            
            const months: number[] = [];
            let hasError = false;
            let errorMessage = "";
            
            // Parse months (columns B-M, indices 1-12)
            for (let m = 1; m <= 12; m++) {
              const value = row[m];
              const numValue = parseNumericValue(value);
              if (isNaN(numValue)) {
                hasError = true;
                errorMessage = `Valor inválido en mes ${m}`;
              }
              months.push(numValue || 0);
            }
            
            // Parse total (column N, index 13)
            const totalValue = parseNumericValue(row[13]);
            const calculatedTotal = months.reduce((sum, v) => sum + v, 0);
            
            // Validate total matches sum of months (with tolerance)
            if (Math.abs(totalValue - calculatedTotal) > 1) {
              hasError = true;
              errorMessage = `Total (${totalValue.toLocaleString("es-CL")}) no coincide con suma de meses (${calculatedTotal.toLocaleString("es-CL")})`;
            }
            
            rows.push({
              category,
              months,
              total: calculatedTotal,
              isValid: !hasError,
              error: errorMessage || undefined,
            });
          }
          
          resolve(rows);
        } catch (error) {
          reject(error);
        }
      };
      
      reader.onerror = reject;
      reader.readAsArrayBuffer(file);
    });
  };

  const parseNumericValue = (value: any): number => {
    if (typeof value === "number") return value;
    if (!value) return 0;
    // Handle Chilean number format (1.234.567 or 1,234,567)
    const str = String(value).replace(/\./g, "").replace(/,/g, ".");
    return parseFloat(str) || 0;
  };

  const handleUpload = async () => {
    const validRows = parsedData.filter(r => r.isValid);
    if (validRows.length === 0) {
      toast.error("No hay filas válidas para cargar");
      return;
    }

    setIsLoading(true);

    try {
      // Get existing categories
      const { data: existingCategories } = await supabase
        .from("opex_categories")
        .select("id, name")
        .eq("is_active", true);

      const categoryMap = new Map(
        (existingCategories || []).map(c => [c.name.toLowerCase(), c.id])
      );

      // Process each valid row
      for (const row of validRows) {
        let categoryId = categoryMap.get(row.category.toLowerCase());

        // Create category if it doesn't exist
        if (!categoryId) {
          const { data: newCategory, error: catError } = await supabase
            .from("opex_categories")
            .insert({ name: row.category })
            .select("id")
            .single();

          if (catError) throw catError;
          categoryId = newCategory.id;
          categoryMap.set(row.category.toLowerCase(), categoryId);
        }

        // Check if budget exists for this year/category
        const { data: existing } = await supabase
          .from("opex_master_budget")
          .select("id")
          .eq("year", year)
          .eq("category_id", categoryId)
          .single();

        const budgetData = {
          year,
          category_id: categoryId,
          amount_clp: row.total,
          amount_uf: ufValue > 0 ? row.total / ufValue : 0,
          month_01_clp: row.months[0],
          month_02_clp: row.months[1],
          month_03_clp: row.months[2],
          month_04_clp: row.months[3],
          month_05_clp: row.months[4],
          month_06_clp: row.months[5],
          month_07_clp: row.months[6],
          month_08_clp: row.months[7],
          month_09_clp: row.months[8],
          month_10_clp: row.months[9],
          month_11_clp: row.months[10],
          month_12_clp: row.months[11],
          uf_value_at_entry: ufValue,
        };

        if (existing) {
          // Update existing
          const { error } = await supabase
            .from("opex_master_budget")
            .update(budgetData)
            .eq("id", existing.id);
          if (error) throw error;
        } else {
          // Insert new
          const { error } = await supabase
            .from("opex_master_budget")
            .insert(budgetData);
          if (error) throw error;
        }
      }

      toast.success(`${validRows.length} categorías cargadas exitosamente`);
      setOpen(false);
      resetState();
      onSuccess();
    } catch (error) {
      console.error("Error uploading OPEX:", error);
      toast.error("Error al cargar el presupuesto OPEX");
    } finally {
      setIsLoading(false);
    }
  };

  const formatCLP = (value: number) => {
    return `$ ${Math.round(value).toLocaleString("es-CL")}`;
  };

  const formatUF = (value: number) => {
    if (ufValue <= 0) return "-";
    const uf = value / ufValue;
    return `${uf.toLocaleString("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} UF`;
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetState(); }}>
      <DialogTrigger asChild>
        <Button>
          <Upload className="h-4 w-4 mr-2" />
          + Opex Nuevo
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Cargar Presupuesto OPEX {year}</DialogTitle>
          <DialogDescription>
            Suba un archivo Excel con 14 columnas: Categoría (A), Meses Enero-Diciembre (B-M), Total Anual (N)
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* File Input */}
          <div className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-6 text-center">
            <FileSpreadsheet className="h-10 w-10 mx-auto text-muted-foreground mb-2" />
            <Label htmlFor="excel-file" className="cursor-pointer">
              <span className="text-primary hover:underline">Seleccionar archivo Excel</span>
              <span className="text-muted-foreground"> o arrastre aquí</span>
            </Label>
            <Input
              ref={fileInputRef}
              id="excel-file"
              type="file"
              accept=".xlsx,.xls"
              onChange={handleFileChange}
              className="hidden"
            />
            {fileName && (
              <p className="mt-2 text-sm text-muted-foreground">{fileName}</p>
            )}
          </div>

          {/* Preview Table */}
          {parsedData.length > 0 && (
            <div className="border rounded-lg overflow-hidden">
              <div className="max-h-[400px] overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="sticky left-0 bg-muted/50 z-10">Categoría</TableHead>
                      {MONTH_NAMES.map((month, i) => (
                        <TableHead key={i} className="text-right text-xs whitespace-nowrap">
                          {month.slice(0, 3)}
                        </TableHead>
                      ))}
                      <TableHead className="text-right font-bold">Total CLP</TableHead>
                      <TableHead className="text-right">Total UF</TableHead>
                      <TableHead className="w-10">Estado</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {parsedData.map((row, idx) => (
                      <TableRow key={idx} className={!row.isValid ? "bg-destructive/10" : ""}>
                        <TableCell className="sticky left-0 bg-card z-10 font-medium">
                          {row.category}
                        </TableCell>
                        {row.months.map((value, i) => (
                          <TableCell key={i} className="text-right text-xs whitespace-nowrap">
                            {formatCLP(value)}
                          </TableCell>
                        ))}
                        <TableCell className="text-right font-bold">
                          {formatCLP(row.total)}
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          {formatUF(row.total)}
                        </TableCell>
                        <TableCell>
                          {row.isValid ? (
                            <CheckCircle2 className="h-4 w-4 text-green-600" />
                          ) : (
                            <div title={row.error}>
                              <AlertCircle className="h-4 w-4 text-destructive" />
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                    {/* Monthly Totals Row */}
                    {parsedData.length > 0 && (
                      <TableRow className="bg-muted/50 font-bold border-t-2">
                        <TableCell className="sticky left-0 bg-muted/50 z-10 font-bold">
                          TOTAL MENSUAL
                        </TableCell>
                        {MONTH_NAMES.map((_, i) => {
                          const monthTotal = parsedData
                            .filter(r => r.isValid)
                            .reduce((sum, r) => sum + (r.months[i] || 0), 0);
                          return (
                            <TableCell key={i} className="text-right text-xs whitespace-nowrap font-bold">
                              {formatCLP(monthTotal)}
                            </TableCell>
                          );
                        })}
                        <TableCell className="text-right font-bold">
                          {formatCLP(parsedData.filter(r => r.isValid).reduce((s, r) => s + r.total, 0))}
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground font-bold">
                          {formatUF(parsedData.filter(r => r.isValid).reduce((s, r) => s + r.total, 0))}
                        </TableCell>
                        <TableCell></TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          {/* Summary */}
          {parsedData.length > 0 && (
            <div className="flex items-center justify-between text-sm text-muted-foreground bg-muted/50 p-3 rounded-lg">
              <span>
                <strong>{parsedData.filter(r => r.isValid).length}</strong> categorías válidas
                {parsedData.filter(r => !r.isValid).length > 0 && (
                  <span className="text-destructive ml-2">
                    ({parsedData.filter(r => !r.isValid).length} con errores)
                  </span>
                )}
              </span>
              <span>
                Total: <strong>{formatCLP(parsedData.filter(r => r.isValid).reduce((s, r) => s + r.total, 0))}</strong>
                <span className="ml-2 text-muted-foreground">
                  ({formatUF(parsedData.filter(r => r.isValid).reduce((s, r) => s + r.total, 0))})
                </span>
              </span>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => { setOpen(false); resetState(); }}>
            Cancelar
          </Button>
          <Button
            onClick={handleUpload}
            disabled={isLoading || parsedData.filter(r => r.isValid).length === 0}
          >
            {isLoading ? "Cargando..." : "Cargar Presupuesto"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
