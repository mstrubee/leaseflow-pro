import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Download } from "lucide-react";
import * as XLSX from "xlsx";

interface OpexTemplateDownloadProps {
  year: number;
}

export const OpexTemplateDownload = ({ year }: OpexTemplateDownloadProps) => {
  const [isLoading, setIsLoading] = useState(false);

  const handleDownload = async () => {
    setIsLoading(true);

    try {
      // Get all active categories
      const { data: categories, error } = await supabase
        .from("opex_categories")
        .select("name")
        .eq("is_active", true)
        .order("display_order");

      if (error) throw error;

      // Create workbook and worksheet
      const wb = XLSX.utils.book_new();

      // Headers
      const headers = [
        "Categoría",
        "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
        "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
        "Total Anual"
      ];

      // Create rows with category names and empty values
      const rows = (categories || []).map((cat) => [
        cat.name,
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, // months
        { f: `SUM(B${(categories || []).indexOf(cat) + 2}:M${(categories || []).indexOf(cat) + 2})` } // Total formula
      ]);

      // Add totals row
      const lastDataRow = (categories || []).length + 1;
      const totalsRow = [
        "TOTAL",
        ...Array(12).fill(null).map((_, i) => ({
          f: `SUM(${String.fromCharCode(66 + i)}2:${String.fromCharCode(66 + i)}${lastDataRow})`
        })),
        { f: `SUM(N2:N${lastDataRow})` }
      ];

      const wsData = [headers, ...rows, totalsRow];
      const ws = XLSX.utils.aoa_to_sheet(wsData);

      // Set column widths
      ws["!cols"] = [
        { wch: 25 }, // Category
        ...Array(12).fill({ wch: 12 }), // Months
        { wch: 15 } // Total
      ];

      XLSX.utils.book_append_sheet(wb, ws, `OPEX ${year}`);

      // Download
      XLSX.writeFile(wb, `Plantilla_OPEX_${year}.xlsx`);

      toast.success("Plantilla descargada");
    } catch (error) {
      console.error("Error downloading template:", error);
      toast.error("Error al descargar plantilla");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Button variant="outline" size="sm" onClick={handleDownload} disabled={isLoading}>
      <Download className="h-4 w-4 mr-2" />
      {isLoading ? "Descargando..." : "Plantilla"}
    </Button>
  );
};
