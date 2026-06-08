import { useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Upload, Download, FileSpreadsheet, CheckCircle2, XCircle, AlertCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { generateSupplierTemplate, parseSupplierExcel, ParsedSupplier } from "@/lib/generateSupplierTemplate";
import { validateExcelFile } from "@/lib/excelFileValidation";

interface SupplierBulkUploadProps {
  onComplete: () => void;
  onCancel: () => void;
}

export const SupplierBulkUpload = ({ onComplete, onCancel }: SupplierBulkUploadProps) => {
  const [file, setFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [parsedData, setParsedData] = useState<ParsedSupplier[] | null>(null);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadResults, setUploadResults] = useState<{ success: number; failed: number; errors: string[] } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    // Validate file using security validation
    const validation = validateExcelFile(selectedFile);
    if (!validation.valid) {
      toast.error(validation.error || "Archivo no válido");
      return;
    }

    setFile(selectedFile);
    setParsing(true);
    setParsedData(null);
    setParseErrors([]);
    setUploadResults(null);

    try {
      const { suppliers, errors } = await parseSupplierExcel(selectedFile);
      setParsedData(suppliers);
      setParseErrors(errors);
      
      if (suppliers.length === 0 && errors.length > 0) {
        toast.error("No se pudieron procesar proveedores del archivo");
      } else if (suppliers.length > 0) {
        toast.success(`Se encontraron ${suppliers.length} proveedores para cargar`);
      }
    } catch (error) {
      console.error("Error parsing file:", error);
      toast.error("Error al procesar el archivo Excel");
    } finally {
      setParsing(false);
    }
  };

  const handleUpload = async () => {
    if (!parsedData || parsedData.length === 0) return;

    setUploading(true);
    setUploadProgress(0);
    const results = { success: 0, failed: 0, errors: [] as string[] };

    // First, get or create categories
    const categoryMap = new Map<string, string>();
    const uniqueCategories = [...new Set(parsedData.map(s => s.category_name))];
    
    for (const catName of uniqueCategories) {
      // Check if category exists
      const { data: existing } = await supabase
        .from("supplier_categories")
        .select("id")
        .ilike("name", catName)
        .limit(1);

      if (existing && existing.length > 0) {
        categoryMap.set(catName.toLowerCase(), existing[0].id);
      } else {
        // Create new category
        const { data: newCat, error } = await supabase
          .from("supplier_categories")
          .insert({ name: catName, is_active: true })
          .select()
          .single();

        if (newCat) {
          categoryMap.set(catName.toLowerCase(), newCat.id);
        } else if (error) {
          console.error("Error creating category:", error);
        }
      }
    }

    // Now insert suppliers
    for (let i = 0; i < parsedData.length; i++) {
      const supplier = parsedData[i];
      setUploadProgress(Math.round(((i + 1) / parsedData.length) * 100));

      try {
        const categoryId = categoryMap.get(supplier.category_name.toLowerCase());
        if (!categoryId) {
          results.failed++;
          results.errors.push(`${supplier.name}: No se pudo obtener el rubro "${supplier.category_name}"`);
          continue;
        }

        // Check for duplicates
        const { data: existing } = await supabase
          .from("suppliers")
          .select("id, name, rut")
          .or(`name.eq.${supplier.name}${supplier.rut ? `,rut.eq.${supplier.rut}` : ""}`);

        if (existing && existing.length > 0) {
          results.failed++;
          results.errors.push(`${supplier.name}: Ya existe un proveedor con ese nombre o RUT`);
          continue;
        }

        // Insert supplier
        const { data: newSupplier, error } = await supabase
          .from("suppliers")
          .insert({
            name: supplier.name,
            rut: supplier.rut || null,
            street: supplier.street || null,
            street_number: supplier.street_number || null,
            commune: supplier.commune || null,
            contact_name: supplier.contact_name || null,
            phone: supplier.phone || null,
            category_id: categoryId,
            is_generic: supplier.is_generic,
          })
          .select()
          .single();

        if (error) throw error;

        // Bank details live in an admin-only table; only admins can write them
        if (newSupplier && (supplier.bank_name || supplier.bank_account_type || supplier.bank_account_number)) {
          await supabase.from("supplier_bank_details").insert({
            supplier_id: newSupplier.id,
            bank_name: supplier.bank_name || null,
            bank_account_type: supplier.bank_account_type || null,
            bank_account_number: supplier.bank_account_number || null,
          });
        }

        // Insert emails
        if (newSupplier && supplier.emails.length > 0) {
          await supabase.from("supplier_emails").insert(
            supplier.emails.map((email, idx) => ({
              supplier_id: newSupplier.id,
              email,
              is_primary: idx === 0,
            }))
          );
        }

        results.success++;
      } catch (error: any) {
        results.failed++;
        results.errors.push(`${supplier.name}: ${error.message || "Error desconocido"}`);
      }
    }

    setUploadResults(results);
    setUploading(false);

    if (results.success > 0) {
      toast.success(`Se cargaron ${results.success} proveedores exitosamente`);
    }
    if (results.failed > 0) {
      toast.error(`${results.failed} proveedores no pudieron ser cargados`);
    }
  };

  const handleReset = () => {
    setFile(null);
    setParsedData(null);
    setParseErrors([]);
    setUploadResults(null);
    setUploadProgress(0);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  return (
    <div className="space-y-6">
      {/* Download Template */}
      <div className="flex items-center justify-between p-4 border rounded-lg bg-muted/30">
        <div className="flex items-center gap-3">
          <FileSpreadsheet className="h-8 w-8 text-green-600" />
          <div>
            <p className="font-medium">Plantilla de Proveedores</p>
            <p className="text-sm text-muted-foreground">
              Descarga la plantilla, complétala y súbela para cargar proveedores masivamente
            </p>
          </div>
        </div>
        <Button variant="outline" onClick={generateSupplierTemplate}>
          <Download className="h-4 w-4 mr-2" />
          Descargar Plantilla
        </Button>
      </div>

      {/* Upload File */}
      <div className="space-y-4">
        <Label>Subir archivo completado</Label>
        <div className="flex gap-2">
          <Input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            onChange={handleFileChange}
            disabled={parsing || uploading}
          />
          {file && !uploadResults && (
            <Button
              variant="outline"
              onClick={handleReset}
              disabled={parsing || uploading}
            >
              Limpiar
            </Button>
          )}
        </div>
      </div>

      {/* Parsing indicator */}
      {parsing && (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Procesando archivo...</span>
        </div>
      )}

      {/* Parse errors */}
      {parseErrors.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-amber-600">
            <AlertCircle className="h-4 w-4" />
            <span className="font-medium">Advertencias del archivo ({parseErrors.length})</span>
          </div>
          <ScrollArea className="h-32 border rounded p-2">
            <ul className="text-sm space-y-1">
              {parseErrors.map((error, idx) => (
                <li key={idx} className="text-muted-foreground">{error}</li>
              ))}
            </ul>
          </ScrollArea>
        </div>
      )}

      {/* Parsed data preview */}
      {parsedData && parsedData.length > 0 && !uploadResults && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              <span className="font-medium">{parsedData.length} proveedores listos para cargar</span>
            </div>
            <Badge variant="outline">
              {[...new Set(parsedData.map(s => s.category_name))].length} rubros
            </Badge>
          </div>
          
          <ScrollArea className="h-48 border rounded">
            <table className="w-full text-sm">
              <thead className="bg-muted sticky top-0">
                <tr>
                  <th className="text-left p-2">Nombre</th>
                  <th className="text-left p-2">RUT</th>
                  <th className="text-left p-2">Rubro</th>
                  <th className="text-left p-2">Contacto</th>
                </tr>
              </thead>
              <tbody>
                {parsedData.map((supplier, idx) => (
                  <tr key={idx} className="border-t">
                    <td className="p-2">{supplier.name}</td>
                    <td className="p-2">{supplier.rut || "-"}</td>
                    <td className="p-2">{supplier.category_name}</td>
                    <td className="p-2">{supplier.emails[0] || supplier.phone || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollArea>
        </div>
      )}

      {/* Upload progress */}
      {uploading && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Cargando proveedores...</span>
          </div>
          <Progress value={uploadProgress} />
        </div>
      )}

      {/* Upload results */}
      {uploadResults && (
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-green-600">
              <CheckCircle2 className="h-5 w-5" />
              <span className="font-medium">{uploadResults.success} exitosos</span>
            </div>
            {uploadResults.failed > 0 && (
              <div className="flex items-center gap-2 text-red-600">
                <XCircle className="h-5 w-5" />
                <span className="font-medium">{uploadResults.failed} fallidos</span>
              </div>
            )}
          </div>

          {uploadResults.errors.length > 0 && (
            <ScrollArea className="h-32 border rounded p-2">
              <ul className="text-sm space-y-1">
                {uploadResults.errors.map((error, idx) => (
                  <li key={idx} className="text-red-600">{error}</li>
                ))}
              </ul>
            </ScrollArea>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex justify-end gap-2 pt-4 border-t">
        <Button variant="outline" onClick={onCancel} disabled={uploading}>
          {uploadResults ? "Cerrar" : "Cancelar"}
        </Button>
        {parsedData && parsedData.length > 0 && !uploadResults && (
          <Button onClick={handleUpload} disabled={uploading}>
            {uploading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Cargando...
              </>
            ) : (
              <>
                <Upload className="h-4 w-4 mr-2" />
                Cargar {parsedData.length} proveedores
              </>
            )}
          </Button>
        )}
        {uploadResults && uploadResults.success > 0 && (
          <Button onClick={onComplete}>
            Finalizar
          </Button>
        )}
      </div>
    </div>
  );
};
