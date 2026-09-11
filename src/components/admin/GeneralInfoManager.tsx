import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, Download, Upload } from "lucide-react";
import { toast } from "sonner";
import { downloadGeneralInfoExcel, uploadGeneralInfoExcel } from "@/lib/generalInfoReport";

/**
 * "Información General Grupo Planet": descarga un Excel con la tipificación
 * de todos los locales (empresa, dirección, coordenadas, tenencia,
 * tipología, superficies, etc.) y permite volver a subirlo para actualizar
 * esos mismos datos en la base -- ver src/lib/generalInfoReport.ts para el
 * detalle de qué se puede editar por esta vía y qué no.
 */
export function GeneralInfoManager() {
  const [downloading, setDownloading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDownload = async () => {
    setDownloading(true);
    try {
      await downloadGeneralInfoExcel();
      toast.success("Excel generado");
    } catch (error: any) {
      toast.error(error.message || "No se pudo generar el Excel");
    } finally {
      setDownloading(false);
    }
  };

  const handleUploadClick = () => fileInputRef.current?.click();

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setUploading(true);
    try {
      const result = await uploadGeneralInfoExcel(file);
      if (result.errors.length > 0) {
        toast.warning(
          `Actualizado con observaciones: ${result.updated} locales actualizados, ${result.errors.length} con errores.`,
          { description: result.errors.slice(0, 3).map((e) => `Fila ${e.row}: ${e.message}`).join(" | ") }
        );
      } else {
        toast.success(`Información actualizada: ${result.updated} locales.`);
      }
    } catch (error: any) {
      toast.error(error.message || "No se pudo procesar el archivo");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Descarga la tipificación de todos los locales (empresa, dirección, coordenadas, tenencia, tipología,
        superficies, etc.). Puedes editar el archivo y volver a subirlo para actualizar esos datos -- la información
        estructural del contrato (nombre, empresa, dirección, superficies) no se modifica por esta vía, se sigue
        editando en la ficha del contrato.
      </p>
      <div className="flex gap-2">
        <Button onClick={handleDownload} disabled={downloading} className="gap-2">
          {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          Descargar Excel
        </Button>
        <Button variant="outline" onClick={handleUploadClick} disabled={uploading} className="gap-2">
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          Subir Excel actualizado
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls"
          className="hidden"
          onChange={handleFileSelected}
        />
      </div>
    </div>
  );
}
