import { useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "sonner";
import { Plus, Upload, FileSpreadsheet, AlertCircle, CheckCircle2 } from "lucide-react";
import * as XLSX from "xlsx";
import { validateExcelFile, withParseTimeout } from "@/lib/excelFileValidation";

interface OpexCreateDialogProps {
  currentYear: number;
  ufValue: number;
  availableYears: number[];
  contracts: Array<{ id: string; name: string }>;
  categories: Array<{ id: string; name: string }>;
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

export const OpexCreateDialog = ({
  currentYear,
  ufValue,
  availableYears,
  contracts,
  categories,
  onSuccess,
}: OpexCreateDialogProps) => {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"choose" | "newYear" | "additional">("choose");
  const [isLoading, setIsLoading] = useState(false);
  
  // New Year state
  const [selectedYear, setSelectedYear] = useState<number>(currentYear + 1);
  const [parsedData, setParsedData] = useState<ParsedRow[]>([]);
  const [fileName, setFileName] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Additional state
  const [additionalContract, setAdditionalContract] = useState("");
  const [additionalCategory, setAdditionalCategory] = useState("");
  const [additionalAmount, setAdditionalAmount] = useState("");
  const [additionalNotes, setAdditionalNotes] = useState("");

  const resetState = () => {
    setStep("choose");
    setParsedData([]);
    setFileName("");
    setSelectedYear(currentYear + 1);
    setAdditionalContract("");
    setAdditionalCategory("");
    setAdditionalAmount("");
    setAdditionalNotes("");
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  // Calculate available years for new year creation
  const newYearOptions = () => {
    const years: number[] = [];
    const maxExisting = Math.max(...availableYears, currentYear);
    for (let y = currentYear; y <= maxExisting + 2; y++) {
      if (!availableYears.includes(y)) {
        years.push(y);
      }
    }
    // Also allow current year if it doesn't exist
    if (!years.includes(currentYear)) {
      years.unshift(currentYear);
    }
    return years.sort((a, b) => a - b);
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

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
      setParsedData([]);
      setFileName("");
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

          const startRow = jsonData[0]?.[0]?.toString().toLowerCase().includes("categor") ? 1 : 0;
          
          const rows: ParsedRow[] = [];
          
          for (let i = startRow; i < jsonData.length; i++) {
            const row = jsonData[i];
            if (!row || !row[0]) continue;
            
            const category = String(row[0] || "").trim();
            if (!category) continue;
            
            const months: number[] = [];
            let hasError = false;
            let errorMessage = "";
            
            for (let m = 1; m <= 12; m++) {
              const value = row[m];
              const numValue = parseNumericValue(value);
              if (isNaN(numValue)) {
                hasError = true;
                errorMessage = `Valor inválido en mes ${m}`;
              }
              months.push(numValue || 0);
            }
            
            const totalValue = parseNumericValue(row[13]);
            const calculatedTotal = months.reduce((sum, v) => sum + v, 0);
            
            if (Math.abs(totalValue - calculatedTotal) > 1) {
              hasError = true;
              errorMessage = `Total (${totalValue.toLocaleString("es-CL")}) no coincide`;
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
    const str = String(value).replace(/\./g, "").replace(/,/g, ".");
    return parseFloat(str) || 0;
  };

  const handleUploadNewYear = async () => {
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

      for (const row of validRows) {
        let categoryId = categoryMap.get(row.category.toLowerCase());

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

        const { data: existing } = await supabase
          .from("opex_master_budget")
          .select("id")
          .eq("year", selectedYear)
          .eq("category_id", categoryId)
          .single();

        const budgetData = {
          year: selectedYear,
          category_id: categoryId,
          amount_clp: Math.abs(row.total),
          amount_uf: ufValue > 0 ? Math.abs(row.total) / ufValue : 0,
          month_01_clp: Math.abs(row.months[0]),
          month_02_clp: Math.abs(row.months[1]),
          month_03_clp: Math.abs(row.months[2]),
          month_04_clp: Math.abs(row.months[3]),
          month_05_clp: Math.abs(row.months[4]),
          month_06_clp: Math.abs(row.months[5]),
          month_07_clp: Math.abs(row.months[6]),
          month_08_clp: Math.abs(row.months[7]),
          month_09_clp: Math.abs(row.months[8]),
          month_10_clp: Math.abs(row.months[9]),
          month_11_clp: Math.abs(row.months[10]),
          month_12_clp: Math.abs(row.months[11]),
          uf_value_at_entry: ufValue,
        };

        if (existing) {
          const { error } = await supabase
            .from("opex_master_budget")
            .update(budgetData)
            .eq("id", existing.id);
          if (error) throw error;
        } else {
          const { error } = await supabase
            .from("opex_master_budget")
            .insert(budgetData);
          if (error) throw error;
        }
      }

      toast.success(`OPEX ${selectedYear} creado con ${validRows.length} categorías`);
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

  const handleCreateAdditional = async () => {
    if (!additionalContract || !additionalCategory || !additionalAmount) {
      toast.error("Complete todos los campos");
      return;
    }

    const amountUf = parseFloat(additionalAmount.replace(/\./g, "").replace(/,/g, "."));
    if (isNaN(amountUf) || amountUf <= 0) {
      toast.error("Monto inválido");
      return;
    }

    setIsLoading(true);

    try {
      // Check if already exists
      const { data: existing } = await supabase
        .from("opex_local_additional")
        .select("id, amount_uf")
        .eq("contract_id", additionalContract)
        .eq("category_id", additionalCategory)
        .eq("year", currentYear)
        .single();

      if (existing) {
        // Update existing
        const { error } = await supabase
          .from("opex_local_additional")
          .update({
            amount_uf: existing.amount_uf + amountUf,
            notes: additionalNotes || null,
          })
          .eq("id", existing.id);

        if (error) throw error;
        toast.success("Adicional actualizado");
      } else {
        // Create new
        const { error } = await supabase
          .from("opex_local_additional")
          .insert({
            contract_id: additionalContract,
            category_id: additionalCategory,
            year: currentYear,
            amount_uf: amountUf,
            notes: additionalNotes || null,
          });

        if (error) throw error;
        toast.success("Adicional creado");
      }

      setOpen(false);
      resetState();
      onSuccess();
    } catch (error) {
      console.error("Error creating additional:", error);
      toast.error("Error al crear adicional");
    } finally {
      setIsLoading(false);
    }
  };

  const formatCLP = (value: number) => {
    return `$ ${Math.round(Math.abs(value)).toLocaleString("es-CL")}`;
  };

  const formatUF = (value: number) => {
    if (ufValue <= 0) return "-";
    const uf = Math.abs(value) / ufValue;
    return `${uf.toLocaleString("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} UF`;
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetState(); }}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          + Opex
        </Button>
      </DialogTrigger>
      <DialogContent className={step === "newYear" && parsedData.length > 0 ? "max-w-5xl max-h-[90vh] overflow-y-auto" : "max-w-md"}>
        {step === "choose" && (
          <>
            <DialogHeader>
              <DialogTitle>Crear OPEX</DialogTitle>
              <DialogDescription>
                Seleccione el tipo de OPEX que desea crear
              </DialogDescription>
            </DialogHeader>

            <RadioGroup
              defaultValue="newYear"
              onValueChange={(v) => setStep(v as "newYear" | "additional")}
              className="space-y-4 py-4"
            >
              <div 
                className="flex items-center space-x-3 p-4 rounded-lg border cursor-pointer hover:bg-muted/50 transition-colors"
                onClick={() => setStep("newYear")}
              >
                <RadioGroupItem value="newYear" id="newYear" />
                <div className="flex-1">
                  <Label htmlFor="newYear" className="text-base font-medium cursor-pointer">
                    Nuevo Año
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Crear presupuesto OPEX para un nuevo año fiscal
                  </p>
                </div>
              </div>

              <div 
                className="flex items-center space-x-3 p-4 rounded-lg border cursor-pointer hover:bg-muted/50 transition-colors"
                onClick={() => setStep("additional")}
              >
                <RadioGroupItem value="additional" id="additional" />
                <div className="flex-1">
                  <Label htmlFor="additional" className="text-base font-medium cursor-pointer">
                    Adicional ({currentYear})
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Agregar presupuesto adicional a un local para el año en curso
                  </p>
                </div>
              </div>
            </RadioGroup>
          </>
        )}

        {step === "newYear" && (
          <>
            <DialogHeader>
              <DialogTitle>Nuevo Año OPEX</DialogTitle>
              <DialogDescription>
                Seleccione el año y suba el archivo Excel con el presupuesto
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              {/* Year selector */}
              <div className="space-y-2">
                <Label>Año</Label>
                <Select value={selectedYear.toString()} onValueChange={(v) => setSelectedYear(parseInt(v))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {newYearOptions().map((year) => (
                      <SelectItem key={year} value={year.toString()}>
                        {year}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

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
                  </span>
                  <span>
                    Total: <strong>{formatCLP(parsedData.filter(r => r.isValid).reduce((s, r) => s + r.total, 0))}</strong>
                  </span>
                </div>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setStep("choose")}>
                Atrás
              </Button>
              <Button
                onClick={handleUploadNewYear}
                disabled={isLoading || parsedData.filter(r => r.isValid).length === 0}
              >
                {isLoading ? "Cargando..." : "Crear OPEX"}
              </Button>
            </DialogFooter>
          </>
        )}

        {step === "additional" && (
          <>
            <DialogHeader>
              <DialogTitle>Adicional OPEX {currentYear}</DialogTitle>
              <DialogDescription>
                Agregar presupuesto adicional a un local específico
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Local</Label>
                <Select value={additionalContract} onValueChange={setAdditionalContract}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar local..." />
                  </SelectTrigger>
                  <SelectContent>
                    {contracts.map((contract) => (
                      <SelectItem key={contract.id} value={contract.id}>
                        {contract.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Categoría</Label>
                <Select value={additionalCategory} onValueChange={setAdditionalCategory}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar categoría..." />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((category) => (
                      <SelectItem key={category.id} value={category.id}>
                        {category.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Monto (UF)</Label>
                <Input
                  type="text"
                  value={additionalAmount}
                  onChange={(e) => setAdditionalAmount(e.target.value)}
                  placeholder="Ej: 100,00"
                />
              </div>

              <div className="space-y-2">
                <Label>Notas (opcional)</Label>
                <Input
                  value={additionalNotes}
                  onChange={(e) => setAdditionalNotes(e.target.value)}
                  placeholder="Observaciones..."
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setStep("choose")}>
                Atrás
              </Button>
              <Button
                onClick={handleCreateAdditional}
                disabled={isLoading || !additionalContract || !additionalCategory || !additionalAmount}
              >
                {isLoading ? "Creando..." : "Crear Adicional"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};
