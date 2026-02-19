import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Download, CalendarDays, Clock, Timer, TrendingUp, Wrench, FileText, ArrowLeft, Filter } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "@/hooks/use-toast";
import { MaintenanceForm, detectMaintenanceType, SUB_STATUS_LABELS, SubStatus } from "./types";
import { exportMaintenancePDF } from "./maintenanceExport";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import logosHeader from "@/assets/logos-header.png";
import { toPng } from "html-to-image";
import { useAppLogos } from "@/hooks/useAppLogos";
const CHART_COLORS = [
  "hsl(220, 70%, 50%)", "hsl(142, 71%, 45%)", "hsl(48, 96%, 53%)",
  "hsl(0, 84%, 60%)", "hsl(280, 65%, 60%)", "hsl(200, 80%, 50%)",
  "hsl(25, 95%, 53%)", "hsl(160, 60%, 45%)", "hsl(340, 75%, 55%)",
  "hsl(190, 80%, 42%)",
];

interface ContractStats {
  contractName: string;
  contractId: string | null;
  total: number;
  enProceso: number;
  solucionados: number;
}

interface ResolutionStats {
  avg: number | null;
  min: number | null;
  max: number | null;
  count: number;
}

export function MaintenanceReports() {
  const [forms, setForms] = useState<MaintenanceForm[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedYears, setSelectedYears] = useState<number[]>([new Date().getFullYear()]);
  const [chartTopN, setChartTopN] = useState<15 | 30 | 0>(15);
  const [activeBarContract, setActiveBarContract] = useState<string | null>(null);
  const [selectedBarContract, setSelectedBarContract] = useState<string | null>(null);
  const [selectedFormDetail, setSelectedFormDetail] = useState<MaintenanceForm | null>(null);
  const [dialogStatusFilter, setDialogStatusFilter] = useState<string[]>([]);
  const [dialogSubStatusFilter, setDialogSubStatusFilter] = useState<string[]>([]);
  const [contractCompanyMap, setContractCompanyMap] = useState<Map<string, string>>(new Map());
  const { logos } = useAppLogos();
  const barChartRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchForms();
    fetchContractCompanies();
  }, []);

  const fetchContractCompanies = async () => {
    const { data } = await supabase
      .from("contract_companies")
      .select("contract_id, companies(name)");
    if (data) {
      const map = new Map<string, string>();
      data.forEach((row: any) => {
        if (row.contract_id && row.companies?.name) {
          map.set(row.contract_id, row.companies.name);
        }
      });
      setContractCompanyMap(map);
    }
  };

  const fetchForms = async () => {
    setLoading(true);
    let allData: MaintenanceForm[] = [];
    let from = 0;
    const batchSize = 1000;
    let hasMore = true;

    while (hasMore) {
      const { data, error } = await supabase
        .from("maintenance_forms" as any)
        .select("*")
        .is("deleted_at", null)
        .order("created_date", { ascending: false })
        .range(from, from + batchSize - 1);

      if (error) {
        console.error(error);
        toast({ title: "Error", description: "No se pudieron cargar los FORMs", variant: "destructive" });
        hasMore = false;
      } else {
        const batch = (data as any as MaintenanceForm[]) || [];
        allData = [...allData, ...batch];
        hasMore = batch.length === batchSize;
        from += batchSize;
      }
    }
    setForms(allData);
    setLoading(false);
  };

  const availableYears = useMemo(() => {
    const years = new Set<number>();
    forms.forEach(f => { if (f.year) years.add(f.year); });
    return Array.from(years).sort((a, b) => b - a);
  }, [forms]);

  const toggleYear = (year: number) => {
    setSelectedYears(prev =>
      prev.includes(year) ? prev.filter(y => y !== year) : [...prev, year]
    );
  };

  const filteredForms = useMemo(() => {
    if (selectedYears.length === 0) return forms;
    return forms.filter(f => f.year && selectedYears.includes(f.year));
  }, [forms, selectedYears]);

  // Stats by contract
  const contractStats = useMemo((): ContractStats[] => {
    const map = new Map<string, ContractStats>();
    filteredForms.forEach(f => {
      const key = f.contract_name || "Sin contrato";
      const existing = map.get(key);
      if (existing) {
        existing.total++;
        if (f.status === "proceso") existing.enProceso++;
        else if (f.status === "solucionado") existing.solucionados++;
      } else {
        map.set(key, {
          contractName: key,
          contractId: f.contract_id,
          total: 1,
          enProceso: f.status === "proceso" ? 1 : 0,
          solucionados: f.status === "solucionado" ? 1 : 0,
        });
      }
    });
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [filteredForms]);

  // Top contracts for bar chart
  const topContractsChart = useMemo(() => {
    const slice = chartTopN === 0 ? contractStats : contractStats.slice(0, chartTopN);
    return slice.map(c => {
      const companyName = c.contractId ? contractCompanyMap.get(c.contractId) || "" : "";
      let logoUrl = "";
      if (companyName.toLowerCase().includes("agroplanet")) logoUrl = logos.agroplanet;
      else if (companyName.toLowerCase().includes("autoplanet")) logoUrl = logos.autoplanet;
      return {
        name: c.contractName,
        logoUrl,
        "En Proceso": c.enProceso,
        "Solucionados": c.solucionados,
      };
    });
  }, [contractStats, contractCompanyMap, logos, chartTopN]);

  // Type distribution for pie chart
  const typeDistribution = useMemo(() => {
    const map = new Map<string, number>();
    filteredForms.forEach(f => {
      const type = detectMaintenanceType(f);
      map.set(type, (map.get(type) || 0) + 1);
    });
    return Array.from(map.entries()).map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [filteredForms]);

  // Resolution time stats
  const resolutionStats = useMemo((): ResolutionStats => {
    const resolved = filteredForms.filter(f =>
      f.status === "solucionado" && f.created_date && f.resolution_date
    );
    if (resolved.length === 0) return { avg: null, min: null, max: null, count: 0 };

    const days = resolved.map(f => {
      const start = new Date(f.created_date!);
      const end = new Date(f.resolution_date!);
      return Math.max(0, Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));
    });

    return {
      avg: Math.round(days.reduce((a, b) => a + b, 0) / days.length),
      min: Math.min(...days),
      max: Math.max(...days),
      count: resolved.length,
    };
  }, [filteredForms]);

  // Status summary
  const statusSummary = useMemo(() => {
    const total = filteredForms.length;
    const enProceso = filteredForms.filter(f => f.status === "proceso").length;
    const solucionados = filteredForms.filter(f => f.status === "solucionado").length;
    return { total, enProceso, solucionados };
  }, [filteredForms]);

  const exportPDF = async () => {
    const doc = new jsPDF({ orientation: "landscape" });
    const today = new Date().toLocaleDateString("es-CL");
    const yearLabel = selectedYears.length > 0 ? selectedYears.sort((a,b) => b-a).join(", ") : "Todos";

    // Logo
    try {
      const logoImg = new Image();
      logoImg.src = logosHeader;
      await new Promise((resolve, reject) => { logoImg.onload = resolve; logoImg.onerror = reject; });
      doc.addImage(logoImg, "PNG", 14, 8, 50, 20);
    } catch {}

    doc.setFontSize(18);
    doc.text("Informe de Mantenciones", 70, 18);
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`Generado: ${today} | Año(s): ${yearLabel}`, 70, 25);
    doc.setTextColor(0);

    // Summary
    let y = 35;
    doc.setFontSize(12);
    doc.text("Resumen General", 14, y);
    y += 6;
    autoTable(doc, {
      startY: y,
      head: [["Total FORMs", "En Proceso", "Solucionados"]],
      body: [[
        statusSummary.total.toString(),
        statusSummary.enProceso.toString(),
        statusSummary.solucionados.toString(),
      ]],
      styles: { fontSize: 10, cellPadding: 4 },
      headStyles: { fillColor: [220, 38, 38] },
    });

    y = (doc as any).lastAutoTable.finalY + 10;

    // Resolution stats
    if (resolutionStats.count > 0) {
      doc.setFontSize(12);
      doc.text("Tiempos de Resolución (días)", 14, y);
      y += 6;
      autoTable(doc, {
        startY: y,
        head: [["FORMs con resolución", "Promedio", "Mínimo", "Máximo"]],
        body: [[
          resolutionStats.count.toString(),
          resolutionStats.avg?.toString() || "-",
          resolutionStats.min?.toString() || "-",
          resolutionStats.max?.toString() || "-",
        ]],
        styles: { fontSize: 10, cellPadding: 4 },
        headStyles: { fillColor: [220, 38, 38] },
      });
      y = (doc as any).lastAutoTable.finalY + 10;
    }

    // Type distribution
    doc.setFontSize(12);
    doc.text("Distribución por Tipo", 14, y);
    y += 6;
    autoTable(doc, {
      startY: y,
      head: [["Tipo", "Cantidad", "% del Total"]],
      body: typeDistribution.map(t => [
        t.name,
        t.value.toString(),
        ((t.value / statusSummary.total) * 100).toFixed(1) + "%",
      ]),
      styles: { fontSize: 9, cellPadding: 3 },
      headStyles: { fillColor: [220, 38, 38] },
    });

    // New page for contracts table
    doc.addPage();
    doc.setFontSize(14);
    doc.text("FORMs por Contrato", 14, 20);

    autoTable(doc, {
      startY: 28,
      head: [["Contrato", "Total", "En Proceso", "Solucionados", "% Resolución"]],
      body: contractStats.map(c => [
        c.contractName,
        c.total.toString(),
        c.enProceso.toString(),
        c.solucionados.toString(),
        c.total > 0 ? ((c.solucionados / c.total) * 100).toFixed(1) + "%" : "0%",
      ]),
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [220, 38, 38] },
      columnStyles: { 0: { cellWidth: 80 } },
    });

    doc.save(`Informe_Mantenciones_${yearLabel.replace(/, /g, "_")}.pdf`);
    toast({ title: "PDF generado", description: "El informe se descargó correctamente" });
  };

  const exportChartPDF = async () => {
    if (!barChartRef.current) return;
    try {
      // Capture chart as PNG image
      const dataUrl = await toPng(barChartRef.current, {
        backgroundColor: "#ffffff",
        pixelRatio: 2,
      });

      const doc = new jsPDF({ orientation: "landscape" });
      const today = new Date().toLocaleDateString("es-CL");
      const yearLabel = selectedYears.length > 0 ? selectedYears.sort((a, b) => b - a).join(", ") : "Todos";

      // Logo header
      try {
        const logoImg = new Image();
        logoImg.src = logosHeader;
        await new Promise((resolve, reject) => { logoImg.onload = resolve; logoImg.onerror = reject; });
        doc.addImage(logoImg, "PNG", 14, 8, 50, 20);
      } catch {}

      doc.setFontSize(16);
      doc.text(`${chartTopN === 0 ? "Todos los" : `Top ${chartTopN}`} Contratos por FORMs`, 70, 18);
      doc.setFontSize(10);
      doc.setTextColor(100);
      doc.text(`Generado: ${today} | Año(s): ${yearLabel}`, 70, 25);
      doc.setTextColor(0);

      // Add chart image - fit to page width
      const pageWidth = doc.internal.pageSize.getWidth();
      const margin = 14;
      const imgWidth = pageWidth - margin * 2;
      const chartEl = barChartRef.current;
      const aspectRatio = chartEl.offsetHeight / chartEl.offsetWidth;
      const imgHeight = imgWidth * aspectRatio;

      doc.addImage(dataUrl, "PNG", margin, 32, imgWidth, imgHeight);

      doc.save(`Grafico_Contratos_FORMs_${yearLabel.replace(/, /g, "_")}.pdf`);
      toast({ title: "PDF generado", description: "El gráfico se descargó correctamente" });
    } catch (err) {
      console.error("Error exporting chart PDF:", err);
      toast({ title: "Error", description: "No se pudo generar el PDF del gráfico", variant: "destructive" });
    }
  };


  if (loading) {
    return <div className="text-center py-8 text-muted-foreground">Cargando datos de mantenciones...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header with filters */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Wrench className="h-5 w-5 text-primary" />
          <h3 className="text-lg font-semibold">Informes de Mantenciones</h3>
          <Badge variant="secondary">{filteredForms.length} FORMs</Badge>
        </div>
        <div className="flex items-center gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2">
                <CalendarDays className="h-4 w-4" />
                {selectedYears.length === 0 ? "Todos los años" : selectedYears.sort((a,b) => b-a).join(", ")}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-48 p-2">
              <div className="space-y-1">
                {availableYears.map(year => (
                  <label key={year} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-accent cursor-pointer text-sm">
                    <Checkbox checked={selectedYears.includes(year)} onCheckedChange={() => toggleYear(year)} />
                    {year}
                  </label>
                ))}
                {selectedYears.length > 0 && (
                  <Button variant="ghost" size="sm" className="w-full mt-1 text-xs" onClick={() => setSelectedYears([])}>Limpiar</Button>
                )}
              </div>
            </PopoverContent>
          </Popover>
          <Button onClick={exportPDF} className="gap-2">
            <Download className="h-4 w-4" /> Descargar PDF
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total FORMs</CardTitle>
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{statusSummary.total}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">En Proceso</CardTitle>
          </CardHeader>
          <CardContent><div className="text-2xl font-bold text-yellow-600">{statusSummary.enProceso}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Solucionados</CardTitle>
          </CardHeader>
          <CardContent><div className="text-2xl font-bold text-green-600">{statusSummary.solucionados}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-1 text-muted-foreground"><Timer className="h-3.5 w-3.5" /> T. Promedio</CardTitle>
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{resolutionStats.avg !== null ? `${resolutionStats.avg}d` : "N/A"}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">T. Mínimo</CardTitle>
          </CardHeader>
          <CardContent><div className="text-2xl font-bold text-green-600">{resolutionStats.min !== null ? `${resolutionStats.min}d` : "N/A"}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">T. Máximo</CardTitle>
          </CardHeader>
          <CardContent><div className="text-2xl font-bold text-destructive">{resolutionStats.max !== null ? `${resolutionStats.max}d` : "N/A"}</div></CardContent>
        </Card>
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Bar chart: Forms by contract */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {chartTopN === 0 ? "Todos los" : `Top ${chartTopN}`} Contratos por FORMs
            </CardTitle>
            <div className="flex gap-1 items-center">
              {([15, 30, 0] as const).map(n => (
                <Button
                  key={n}
                  variant={chartTopN === n ? "default" : "outline"}
                  size="sm"
                  className="h-6 px-2 text-xs"
                  onClick={() => setChartTopN(n)}
                >
                  {n === 0 ? "100%" : `Top ${n}`}
                </Button>
              ))}
              <Button variant="outline" size="sm" className="h-6 px-2 text-xs gap-1 ml-1" onClick={exportChartPDF}>
                <Download className="h-3 w-3" /> PDF
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div ref={barChartRef}>
            {topContractsChart.length > 0 ? (
              <ResponsiveContainer width="100%" height={Math.max(400, topContractsChart.length * 32)}>
                <BarChart
                  data={topContractsChart}
                  layout="vertical"
                  margin={{ left: 10, right: 20 }}
                  onMouseMove={(state: any) => {
                    if (state?.activeLabel) setActiveBarContract(state.activeLabel);
                  }}
                  onMouseLeave={() => setActiveBarContract(null)}
                  onClick={(state: any) => {
                    if (state?.activeLabel) setSelectedBarContract(state.activeLabel);
                  }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={250}
                    tick={(props: any) => {
                      const { x, y, payload } = props;
                      const item = topContractsChart.find(c => c.name === payload.value);
                      const logoSrc = item?.logoUrl;
                      const isActive = activeBarContract === payload.value;
                      return (
                        <g transform={`translate(${x},${y})`} style={{ cursor: "pointer" }}>
                          {logoSrc && (
                            <image
                              href={logoSrc}
                              x={-250}
                              y={-9}
                              width={18}
                              height={18}
                              preserveAspectRatio="xMidYMid meet"
                              opacity={activeBarContract && !isActive ? 0.3 : 1}
                            />
                          )}
                          <text
                            x={logoSrc ? -228 : -5}
                            y={0}
                            dy={4}
                            textAnchor={logoSrc ? "start" : "end"}
                            fontSize={isActive ? 10 : 9}
                            fontWeight={isActive ? 700 : 400}
                            fill="currentColor"
                            opacity={activeBarContract && !isActive ? 0.4 : 1}
                          >
                            {payload.value}
                          </text>
                        </g>
                      );
                    }}
                  />
                  <Tooltip
                    formatter={(value: number, name: string) => [value, name]}
                    cursor={{ fill: "hsl(var(--accent))", opacity: 0.3 }}
                  />
                  <Legend />
                  <Bar
                    dataKey="En Proceso"
                    stackId="a"
                    fill="hsl(48, 96%, 53%)"
                    style={{ cursor: "pointer" }}
                    opacity={activeBarContract ? 0.4 : 1}
                    activeBar={{ opacity: 1, strokeWidth: 2, stroke: "hsl(var(--foreground))" }}
                  />
                  <Bar
                    dataKey="Solucionados"
                    stackId="a"
                    fill="hsl(142, 71%, 45%)"
                    style={{ cursor: "pointer" }}
                    opacity={activeBarContract ? 0.4 : 1}
                    activeBar={{ opacity: 1, strokeWidth: 2, stroke: "hsl(var(--foreground))" }}
                  />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="text-center py-8 text-muted-foreground">Sin datos</div>
            )}
            </div>
          </CardContent>
        </Card>

        {/* Pie chart: Type distribution */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Distribución por Tipo de Mantención</CardTitle>
          </CardHeader>
          <CardContent>
            {typeDistribution.length > 0 ? (
              <ResponsiveContainer width="100%" height={350}>
                <PieChart>
                  <Pie
                    data={typeDistribution}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={120}
                    label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                    labelLine
                  >
                    {typeDistribution.map((_, idx) => (
                      <Cell key={idx} fill={CHART_COLORS[idx % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number) => [value, "FORMs"]} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="text-center py-8 text-muted-foreground">Sin datos</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Detailed table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">
            Detalle por Contrato ({contractStats.length} contratos) — Tasa de resolución general: {statusSummary.total > 0 ? ((statusSummary.solucionados / statusSummary.total) * 100).toFixed(1) : "0"}%
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-auto max-h-[400px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Contrato</TableHead>
                  <TableHead className="text-center w-20">Total</TableHead>
                  <TableHead className="text-center w-24">En Proceso</TableHead>
                  <TableHead className="text-center w-28">Solucionados</TableHead>
                  <TableHead className="text-center w-28">% Resolución</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {contractStats.map(c => {
                  const pct = c.total > 0 ? ((c.solucionados / c.total) * 100).toFixed(1) : "0";
                  return (
                    <TableRow key={c.contractName}>
                      <TableCell className="text-xs font-medium">{c.contractName}</TableCell>
                      <TableCell className="text-center text-xs">{c.total}</TableCell>
                      <TableCell className="text-center">
                        {c.enProceso > 0 && <Badge variant="secondary" className="text-xs">{c.enProceso}</Badge>}
                      </TableCell>
                      <TableCell className="text-center">
                        {c.solucionados > 0 && <Badge variant="default" className="text-xs">{c.solucionados}</Badge>}
                      </TableCell>
                      <TableCell className="text-center text-xs">{pct}%</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Dialog: Forms for selected contract */}
      <Dialog open={!!selectedBarContract} onOpenChange={(open) => { if (!open) { setSelectedBarContract(null); setSelectedFormDetail(null); setDialogStatusFilter([]); setDialogSubStatusFilter([]); } }}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-hidden flex flex-col">
          {selectedFormDetail ? (
            <>
              <DialogHeader>
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => setSelectedFormDetail(null)}>
                    <ArrowLeft className="h-4 w-4 mr-1" /> Volver
                  </Button>
                  <DialogTitle className="text-base">FORM {selectedFormDetail.form_number}</DialogTitle>
                </div>
              </DialogHeader>
              <div className="overflow-auto flex-1 space-y-4 p-1">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                  <div><span className="text-muted-foreground">Local:</span> <span className="font-medium">{selectedFormDetail.contract_name || "-"}</span></div>
                  <div><span className="text-muted-foreground">Estado:</span>{" "}
                    <Badge variant={selectedFormDetail.status === "solucionado" ? "default" : "secondary"} className="text-xs">
                      {selectedFormDetail.status === "proceso" ? "En Proceso" : selectedFormDetail.status === "solucionado" ? "Solucionado" : selectedFormDetail.status}
                    </Badge>
                  </div>
                  <div><span className="text-muted-foreground">Sub-Estado:</span> <span className="font-medium">{SUB_STATUS_LABELS[selectedFormDetail.sub_status as SubStatus] || selectedFormDetail.sub_status || "-"}</span></div>
                  <div><span className="text-muted-foreground">Tipo:</span> <span className="font-medium">{detectMaintenanceType(selectedFormDetail)}</span></div>
                  <div><span className="text-muted-foreground">Fecha Creación:</span> <span className="font-medium">{selectedFormDetail.created_date ? new Date(selectedFormDetail.created_date).toLocaleDateString("es-CL") : "-"}</span></div>
                  <div><span className="text-muted-foreground">Fecha Resolución:</span> <span className="font-medium">{selectedFormDetail.resolution_date ? new Date(selectedFormDetail.resolution_date).toLocaleDateString("es-CL") : "-"}</span></div>
                  {selectedFormDetail.supplier_name && <div><span className="text-muted-foreground">Proveedor:</span> <span className="font-medium">{selectedFormDetail.supplier_name}</span></div>}
                  {selectedFormDetail.purchase_order_number && <div><span className="text-muted-foreground">OC:</span> <span className="font-medium">{selectedFormDetail.purchase_order_number}</span></div>}
                </div>

                <div className="space-y-2">
                  {selectedFormDetail.general_description && (
                    <div className="rounded-md border p-3"><p className="text-xs text-muted-foreground font-medium mb-1">Descripción General</p><p className="text-sm">{selectedFormDetail.general_description}</p></div>
                  )}
                  {selectedFormDetail.electrical_description && (
                    <div className="rounded-md border p-3"><p className="text-xs text-muted-foreground font-medium mb-1">Req. Eléctrico</p><p className="text-sm">{selectedFormDetail.electrical_description}</p></div>
                  )}
                  {selectedFormDetail.civil_description && (
                    <div className="rounded-md border p-3"><p className="text-xs text-muted-foreground font-medium mb-1">Req. Obra Civil</p><p className="text-sm">{selectedFormDetail.civil_description}</p></div>
                  )}
                  {selectedFormDetail.hvac_description && (
                    <div className="rounded-md border p-3"><p className="text-xs text-muted-foreground font-medium mb-1">Req. Climatización</p><p className="text-sm">{selectedFormDetail.hvac_description}</p></div>
                  )}
                  {selectedFormDetail.fixed_assets_description && (
                    <div className="rounded-md border p-3"><p className="text-xs text-muted-foreground font-medium mb-1">Req. Activos Fijos</p><p className="text-sm">{selectedFormDetail.fixed_assets_description}</p></div>
                  )}
                  {selectedFormDetail.additional_comments && (
                    <div className="rounded-md border p-3 border-primary/30"><p className="text-xs text-muted-foreground font-medium mb-1">Comentarios Técnicos (Jefe Mantenciones)</p><p className="text-sm">{selectedFormDetail.additional_comments}</p></div>
                  )}
                </div>

                <Button
                  className="gap-2"
                  onClick={() => {
                    const companyName = selectedFormDetail.contract_id ? contractCompanyMap.get(selectedFormDetail.contract_id) : undefined;
                    exportMaintenancePDF(selectedFormDetail, companyName || undefined);
                  }}
                >
                  <Download className="h-4 w-4" /> Descargar PDF
                </Button>
              </div>
            </>
          ) : (() => {
            const STATUS_OPTIONS = [{ value: "proceso", label: "En Proceso" }, { value: "solucionado", label: "Solucionado" }];
            const SUB_STATUS_OPTIONS = Object.entries(SUB_STATUS_LABELS).map(([k, v]) => ({ value: k, label: v }));
            const dialogFilteredForms = filteredForms
              .filter(f => f.contract_name === selectedBarContract)
              .filter(f => dialogStatusFilter.length === 0 || dialogStatusFilter.includes(f.status))
              .filter(f => dialogSubStatusFilter.length === 0 || dialogSubStatusFilter.includes(f.sub_status))
              .sort((a, b) => (b.created_date || "").localeCompare(a.created_date || ""));
            const toggleFilter = (arr: string[], val: string, setter: (v: string[]) => void) => {
              setter(arr.includes(val) ? arr.filter(x => x !== val) : [...arr, val]);
            };
            const exportFilteredListPDF = async () => {
              const doc = new jsPDF({ orientation: "landscape" });
              try { const logoImg = new Image(); logoImg.src = logosHeader; await new Promise((resolve, reject) => { logoImg.onload = resolve; logoImg.onerror = reject; }); doc.addImage(logoImg, "PNG", 14, 8, 50, 20); } catch {}
              doc.setFontSize(16);
              doc.text("FORMs — " + (selectedBarContract || ""), 70, 18);
              doc.setFontSize(9); doc.setTextColor(100);
              const af: string[] = [];
              if (dialogStatusFilter.length > 0) af.push("Estado: " + dialogStatusFilter.map(s => STATUS_OPTIONS.find(o => o.value === s)?.label || s).join(", "));
              if (dialogSubStatusFilter.length > 0) af.push("Sub-Estado: " + dialogSubStatusFilter.map(s => SUB_STATUS_LABELS[s as SubStatus] || s).join(", "));
              doc.text(dialogFilteredForms.length + " FORMs" + (af.length > 0 ? " | Filtros: " + af.join(" | ") : ""), 70, 24);
              doc.setTextColor(0);
              autoTable(doc, { startY: 32, head: [["N° FORM", "Estado", "Sub-Estado", "Descripción", "Fecha Creación", "Fecha Resolución"]], body: dialogFilteredForms.map(f => [f.form_number, f.status === "proceso" ? "En Proceso" : f.status === "solucionado" ? "Solucionado" : f.status, SUB_STATUS_LABELS[f.sub_status as SubStatus] || f.sub_status || "-", (f.general_description || f.electrical_description || f.civil_description || f.hvac_description || f.fixed_assets_description || "-").substring(0, 80), f.created_date ? new Date(f.created_date).toLocaleDateString("es-CL") : "-", f.resolution_date ? new Date(f.resolution_date).toLocaleDateString("es-CL") : "-"]), styles: { fontSize: 8, cellPadding: 2 }, headStyles: { fillColor: [220, 38, 38] } });
              doc.save("FORMs_" + (selectedBarContract || "").replace(/\s+/g, "_") + ".pdf");
              toast({ title: "PDF generado", description: "El listado se descargó correctamente" });
            };
            return (
              <>
                <DialogHeader>
                  <div className="flex items-center justify-between">
                    <DialogTitle className="text-base">FORMs — {selectedBarContract}</DialogTitle>
                    <Button size="sm" className="gap-1.5 h-7 text-xs" onClick={exportFilteredListPDF}>
                      <Download className="h-3.5 w-3.5" /> Descargar listado
                    </Button>
                  </div>
                </DialogHeader>
                <div className="flex flex-wrap gap-2 px-1">
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs">
                        <Filter className="h-3 w-3" />
                        Estado {dialogStatusFilter.length > 0 && <Badge variant="secondary" className="text-[10px] px-1 py-0">{dialogStatusFilter.length}</Badge>}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-44 p-2">
                      {STATUS_OPTIONS.map(o => (
                        <label key={o.value} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-accent cursor-pointer text-sm">
                          <Checkbox checked={dialogStatusFilter.includes(o.value)} onCheckedChange={() => toggleFilter(dialogStatusFilter, o.value, setDialogStatusFilter)} />
                          {o.label}
                        </label>
                      ))}
                    </PopoverContent>
                  </Popover>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs">
                        <Filter className="h-3 w-3" />
                        Sub-Estado {dialogSubStatusFilter.length > 0 && <Badge variant="secondary" className="text-[10px] px-1 py-0">{dialogSubStatusFilter.length}</Badge>}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-48 p-2">
                      {SUB_STATUS_OPTIONS.map(o => (
                        <label key={o.value} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-accent cursor-pointer text-sm">
                          <Checkbox checked={dialogSubStatusFilter.includes(o.value)} onCheckedChange={() => toggleFilter(dialogSubStatusFilter, o.value, setDialogSubStatusFilter)} />
                          {o.label}
                        </label>
                      ))}
                    </PopoverContent>
                  </Popover>
                  {(dialogStatusFilter.length > 0 || dialogSubStatusFilter.length > 0) && (
                    <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => { setDialogStatusFilter([]); setDialogSubStatusFilter([]); }}>
                      Limpiar filtros
                    </Button>
                  )}
                  <span className="text-xs text-muted-foreground self-center ml-auto">{dialogFilteredForms.length} FORMs</span>
                </div>
                <div className="overflow-auto flex-1">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-28">N° FORM</TableHead>
                        <TableHead className="w-24">Estado</TableHead>
                        <TableHead className="w-28">Sub-Estado</TableHead>
                        <TableHead>Descripción</TableHead>
                        <TableHead className="w-28">Fecha Creación</TableHead>
                        <TableHead className="w-28">Fecha Resolución</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {dialogFilteredForms.map(f => (
                        <TableRow key={f.id} className="cursor-pointer hover:bg-accent/50" onClick={() => setSelectedFormDetail(f)}>
                          <TableCell className="text-xs font-medium">{f.form_number}</TableCell>
                          <TableCell>
                            <Badge variant={f.status === "solucionado" ? "default" : "secondary"} className="text-xs">
                              {f.status === "proceso" ? "En Proceso" : f.status === "solucionado" ? "Solucionado" : f.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs">{SUB_STATUS_LABELS[f.sub_status as SubStatus] || f.sub_status?.replace(/_/g, " ") || "-"}</TableCell>
                          <TableCell className="text-xs max-w-[200px] truncate">
                            {f.general_description || f.electrical_description || f.civil_description || f.hvac_description || f.fixed_assets_description || "-"}
                          </TableCell>
                          <TableCell className="text-xs">{f.created_date ? new Date(f.created_date).toLocaleDateString("es-CL") : "-"}</TableCell>
                          <TableCell className="text-xs">{f.resolution_date ? new Date(f.resolution_date).toLocaleDateString("es-CL") : "-"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}
