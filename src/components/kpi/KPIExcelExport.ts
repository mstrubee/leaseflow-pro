import * as XLSX from "xlsx";
import { KPI, KPICategory } from "@/hooks/useKPI";

export function generateSelectedKPIsExcel(
  selectedKPIs: KPI[],
  subKPIs: KPI[],
  categories: KPICategory[]
) {
  const workbook = XLSX.utils.book_new();

  // Main KPIs sheet
  const kpiData = selectedKPIs.map((kpi) => {
    const classificationLabel = kpi.kpi_classification === "kpi_empresa" ? "KPI Empresa" : "Objetivos Gerencia";
    const kpiSubKPIs = subKPIs.filter((sub) => (sub as any).parent_kpi_id === kpi.id);
    
    return {
      "Nombre": kpi.name,
      "Clasificación": classificationLabel,
      "Categoría": kpi.category?.name || "-",
      "Descripción": kpi.description || "-",
      "Estado": kpi.is_active ? "Activo" : "Inactivo",
      "Cantidad Sub-KPIs": kpiSubKPIs.length,
    };
  });

  const kpiSheet = XLSX.utils.json_to_sheet(kpiData);
  
  // Set column widths
  kpiSheet["!cols"] = [
    { wch: 30 }, // Nombre
    { wch: 20 }, // Clasificación
    { wch: 20 }, // Categoría
    { wch: 50 }, // Descripción
    { wch: 10 }, // Estado
    { wch: 15 }, // Cantidad Sub-KPIs
  ];
  
  XLSX.utils.book_append_sheet(workbook, kpiSheet, "KPIs");

  // Sub-KPIs sheet
  const subKPIData: any[] = [];
  
  selectedKPIs.forEach((parentKPI) => {
    const kpiSubKPIs = subKPIs.filter((sub) => (sub as any).parent_kpi_id === parentKPI.id);
    
    kpiSubKPIs.forEach((sub) => {
      const assignedUser = (sub as any).responsible_user;
      subKPIData.push({
        "KPI Padre": parentKPI.name,
        "Nombre Sub-KPI": sub.name,
        "Objetivo/Descripción": sub.description || "-",
        "Responsable": assignedUser?.full_name || assignedUser?.email || "-",
        "Estado": sub.is_active ? "Activo" : "Inactivo",
      });
    });
  });

  if (subKPIData.length > 0) {
    const subKPISheet = XLSX.utils.json_to_sheet(subKPIData);
    
    // Set column widths
    subKPISheet["!cols"] = [
      { wch: 30 }, // KPI Padre
      { wch: 30 }, // Nombre Sub-KPI
      { wch: 60 }, // Objetivo/Descripción
      { wch: 25 }, // Responsable
      { wch: 10 }, // Estado
    ];
    
    XLSX.utils.book_append_sheet(workbook, subKPISheet, "Sub-KPIs");
  }

  // Download
  XLSX.writeFile(workbook, "informe-kpis-seleccionados.xlsx");
}
