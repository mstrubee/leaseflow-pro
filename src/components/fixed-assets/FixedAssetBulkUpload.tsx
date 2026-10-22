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
import { generateFixedAssetTemplate, parseFixedAssetExcel, ParsedFixedAsset } from "@/lib/generateFixedAssetTemplate";
import { validateExcelFile } from "@/lib/excelFileValidation";

interface FixedAssetBulkUploadProps {
  onComplete: () => void;
  onCancel: () => void;
}

export const FixedAssetBulkUpload = ({ onComplete, onCancel }: FixedAssetBulkUploadProps) => {
  const [file, setFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [parsedData, setParsedData] = useState<ParsedFixedAsset[] | null>(null);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadResults, setUploadResults] = useState<{ success: number; failed: number; errors: string[] } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

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
      const { assets, errors } = await parseFixedAssetExcel(selectedFile);
      setParsedData(assets);
      setParseErrors(errors);

      if (assets.length === 0 && errors.length > 0) {
        toast.error("No se pudieron procesar activos del archivo");
      } else if (assets.length > 0) {
        toast.success(`Se encontraron ${assets.length} activos para cargar`);
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

    for (let i = 0; i < parsedData.length; i++) {
      const asset = parsedData[i];
      setUploadProgress(Math.round(((i + 1) / parsedData.length) * 100));

      try {
        const orFilters = [`name.eq.${asset.name}`];
        if (asset.sku) orFilters.push(`sku.eq.${asset.sku}`);
        const { data: existing } = await supabase
          .from("fixed_assets")
          .select("id")
          .or(orFilters.join(","));

        if (existing && existing.length > 0) {
          results.failed++;
          results.errors.push(`${asset.name}: Ya existe un activo con ese nombre o SKU`);
          continue;
        }

        const { error } = await supabase.from("fixed_assets").insert({
          name: asset.name,
          sku: asset.sku || null,
          category: asset.category || null,
          unit: asset.unit || "unidad",
          total_quantity: asset.total_quantity,
          acquisition_value: asset.acquisition_value,
          acquisition_date: asset.acquisition_date || null,
          location: asset.location || null,
          notes: asset.notes || null,
        });

        if (error) throw error;
        results.success++;
      } catch (error) {
        results.failed++;
        const message = error instanceof Error ? error.message : "Error desconocido";
        results.errors.push(`${asset.name}: ${message}`);
      }
    }

    setUploadResults(results);
    setUploading(false);

    if (results.success > 0) {
      toast.success(`Se cargaron ${results.success} activos exitosamente`);
    }
    if (results.failed > 0) {
      toast.error(`${results.failed} activos no pudieron ser cargados`);
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
      <div className="flex items-center justify-between p-4 border rounded-lg bg-muted/30">
        <div className="flex items-center gap-3">
          <FileSpreadsheet className="h-8 w-8 text-green-600" />
          <div>
            <p className="font-medium">Plantilla de Activos Fijos</p>
            <p className="text-sm text-muted-foreground">
              Descarga la plantilla o sube directamente un inventario existente (Excel)
            </p>
          </div>
        </div>
        <Button variant="outline" onClick={generateFixedAssetTemplate}>
          <Download className="h-4 w-4 mr-2" />
          Descargar Plantilla
        </Button>
      </div>

      <div className="space-y-4">
        <Label>Subir archivo Excel</Label>
        <div className="flex gap-2">
          <Input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            onChange={handleFileChange}
            disabled={parsing || uploading}
          />
          {file && !uploadResults && (
            <Button variant="outline" onClick={handleReset} disabled={parsing || uploading}>
              Limpiar
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          El sistema reconoce automáticamente columnas equivalentes (ej: Descripción/Part #/Unidad/Qty Recibida),
          no es necesario usar exactamente la plantilla.
        </p>
      </div>

      {parsing && (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Procesando archivo...</span>
        </div>
      )}

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

      {parsedData && parsedData.length > 0 && !uploadResults && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              <span className="font-medium">{parsedData.length} activos listos para cargar</span>
            </div>
            <Badge variant="outline">
              {[...new Set(parsedData.map(a => a.category).filter(Boolean))].length || 0} categorías
            </Badge>
          </div>

          <ScrollArea className="h-48 border rounded">
            <table className="w-full text-sm">
              <thead className="bg-muted sticky top-0">
                <tr>
                  <th className="text-left p-2">Nombre</th>
                  <th className="text-left p-2">SKU</th>
                  <th className="text-left p-2">Categoría</th>
                  <th className="text-right p-2">Cantidad</th>
                </tr>
              </thead>
              <tbody>
                {parsedData.map((asset, idx) => (
                  <tr key={idx} className="border-t">
                    <td className="p-2">{asset.name}</td>
                    <td className="p-2">{asset.sku || "-"}</td>
                    <td className="p-2">{asset.category || "-"}</td>
                    <td className="p-2 text-right">{asset.total_quantity} {asset.unit}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollArea>
        </div>
      )}

      {uploading && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Cargando activos...</span>
          </div>
          <Progress value={uploadProgress} />
        </div>
      )}

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
                Cargar {parsedData.length} activos
              </>
            )}
          </Button>
        )}
        {uploadResults && uploadResults.success > 0 && (
          <Button onClick={onComplete}>Finalizar</Button>
        )}
      </div>
    </div>
  );
};
