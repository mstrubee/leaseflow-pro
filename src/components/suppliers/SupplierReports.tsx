import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Download, ChevronDown, ChevronRight, Users, MapPin, Tag, CalendarDays } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useSingleCollapsible } from "@/hooks/useCollapsibleState";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import logosHeader from "@/assets/logos-header.png";

const CHART_COLORS = [
  "hsl(220, 70%, 50%)", "hsl(142, 71%, 45%)", "hsl(48, 96%, 53%)",
  "hsl(0, 84%, 60%)", "hsl(280, 65%, 60%)", "hsl(200, 80%, 50%)",
  "hsl(25, 95%, 53%)", "hsl(160, 60%, 45%)", "hsl(340, 75%, 55%)",
  "hsl(190, 80%, 42%)", "hsl(60, 70%, 50%)", "hsl(310, 60%, 50%)",
  "hsl(130, 50%, 40%)", "hsl(10, 80%, 55%)", "hsl(240, 60%, 55%)",
];

interface SupplierRow {
  id: string;
  name: string;
  is_generic: boolean;
  category_id: string | null;
  created_at: string;
  category_name?: string | null;
}

interface ZoneRow {
  supplier_id: string;
  region: string;
  commune: string | null;
  supplier_name?: string;
}

export function SupplierReports() {
  const [suppliers, setSuppliers] = useState<SupplierRow[]>([]);
  const [zones, setZones] = useState<ZoneRow[]>([]);
  const [loading, setLoading] = useState(true);

  const { isOpen: isSummaryOpen, setIsOpen: setSummaryOpen } = useSingleCollapsible("supplier-reports-summary", true);
  const { isOpen: isZoneOpen, setIsOpen: setZoneOpen } = useSingleCollapsible("supplier-reports-zone", true);
  const { isOpen: isCategoryOpen, setIsOpen: setCategoryOpen } = useSingleCollapsible("supplier-reports-category", true);
  const { isOpen: isTimelineOpen, setIsOpen: setTimelineOpen } = useSingleCollapsible("supplier-reports-timeline", false);

  const [expandedRegions, setExpandedRegions] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [suppRes, zoneRes] = await Promise.all([
        supabase
          .from("suppliers")
          .select("id, name, is_generic, category_id, created_at, category:supplier_categories(name)")
          .order("name"),
        supabase
          .from("supplier_influence_zones" as any)
          .select("supplier_id, region, commune")
      ]);

      const suppData = (suppRes.data as any[] || []).map((s: any) => ({
        id: s.id,
        name: s.name,
        is_generic: s.is_generic,
        category_id: s.category_id,
        created_at: s.created_at,
        category_name: s.category?.name || null,
      }));
      setSuppliers(suppData);

      // Build zone data with supplier names
      const supplierMap = new Map(suppData.map(s => [s.id, s.name]));
      const zoneData = (zoneRes.data as any[] || []).map((z: any) => ({
        supplier_id: z.supplier_id,
        region: z.region,
        commune: z.commune,
        supplier_name: supplierMap.get(z.supplier_id) || "Desconocido",
      }));
      setZones(zoneData);
    } catch (error) {
      console.error("Error loading supplier report data:", error);
      toast({ title: "Error", description: "No se pudieron cargar datos de proveedores", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  // Summary stats
  const summary = useMemo(() => {
    const total = suppliers.length;
    const generic = suppliers.filter(s => s.is_generic).length;
    const specific = total - generic;
    const dates = suppliers.map(s => new Date(s.created_at)).sort((a, b) => a.getTime() - b.getTime());
    const oldest = dates.length > 0 ? dates[0] : null;
    const newest = dates.length > 0 ? dates[dates.length - 1] : null;
    return { total, generic, specific, oldest, newest };
  }, [suppliers]);

  // Zone stats
  const zoneStats = useMemo(() => {
    const regionMap = new Map<string, { suppliers: Set<string>; communes: Map<string, Set<string>> }>();
    zones.forEach(z => {
      if (!regionMap.has(z.region)) {
        regionMap.set(z.region, { suppliers: new Set(), communes: new Map() });
      }
      const entry = regionMap.get(z.region)!;
      entry.suppliers.add(z.supplier_id);
      if (z.commune) {
        if (!entry.communes.has(z.commune)) {
          entry.communes.set(z.commune, new Set());
        }
        entry.communes.get(z.commune)!.add(z.supplier_name || z.supplier_id);
      }
    });

    return Array.from(regionMap.entries())
      .map(([region, data]) => ({
        region,
        supplierCount: data.suppliers.size,
        communes: Array.from(data.communes.entries())
          .map(([commune, names]) => ({ commune, suppliers: Array.from(names) }))
          .sort((a, b) => a.commune.localeCompare(b.commune)),
      }))
      .sort((a, b) => b.supplierCount - a.supplierCount);
  }, [zones]);

  const zoneChartData = useMemo(() =>
    zoneStats.map(z => ({ name: z.region, value: z.supplierCount }))
  , [zoneStats]);

  // Category stats
  const categoryStats = useMemo(() => {
    const catMap = new Map<string, { total: number; generic: number; specific: number }>();
    suppliers.forEach(s => {
      const cat = s.category_name || "Sin categoría";
      if (!catMap.has(cat)) catMap.set(cat, { total: 0, generic: 0, specific: 0 });
      const entry = catMap.get(cat)!;
      entry.total++;
      if (s.is_generic) entry.generic++;
      else entry.specific++;
    });
    return Array.from(catMap.entries())
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.total - a.total);
  }, [suppliers]);

  const categoryChartData = useMemo(() =>
    categoryStats.map(c => ({ name: c.name, value: c.total }))
  , [categoryStats]);

  // Timeline stats (by month)
  const timelineStats = useMemo(() => {
    const monthMap = new Map<string, number>();
    suppliers.forEach(s => {
      const d = new Date(s.created_at);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      monthMap.set(key, (monthMap.get(key) || 0) + 1);
    });
    return Array.from(monthMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, count]) => ({ month, count }));
  }, [suppliers]);

  const toggleRegion = (region: string) => {
    setExpandedRegions(prev => {
      const next = new Set(prev);
      if (next.has(region)) next.delete(region);
      else next.add(region);
      return next;
    });
  };

  const formatDate = (date: Date | null) =>
    date ? date.toLocaleDateString("es-CL", { year: "numeric", month: "long", day: "numeric" }) : "N/A";

  const exportPDF = async () => {
    const doc = new jsPDF({ orientation: "landscape" });
    const today = new Date().toLocaleDateString("es-CL");

    try {
      const logoImg = new Image();
      logoImg.src = logosHeader;
      await new Promise((resolve, reject) => { logoImg.onload = resolve; logoImg.onerror = reject; });
      doc.addImage(logoImg, "PNG", 14, 8, 50, 20);
    } catch {}

    doc.setFontSize(18);
    doc.text("Informe de Proveedores", 70, 18);
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`Generado: ${today}`, 70, 25);
    doc.setTextColor(0);

    let y = 35;

    // Summary
    doc.setFontSize(12);
    doc.text("Resumen General", 14, y);
    y += 6;
    autoTable(doc, {
      startY: y,
      head: [["Total Proveedores", "Genéricos", "Específicos", "Más Antiguo", "Más Reciente"]],
      body: [[
        summary.total.toString(),
        summary.generic.toString(),
        summary.specific.toString(),
        formatDate(summary.oldest),
        formatDate(summary.newest),
      ]],
      styles: { fontSize: 9, cellPadding: 3 },
      headStyles: { fillColor: [59, 130, 246] },
    });
    y = (doc as any).lastAutoTable.finalY + 10;

    // By Zone
    doc.setFontSize(12);
    doc.text("Proveedores por Zona de Influencia", 14, y);
    y += 6;
    autoTable(doc, {
      startY: y,
      head: [["Región", "Proveedores", "% del Total"]],
      body: zoneStats.map(z => [
        z.region,
        z.supplierCount.toString(),
        summary.total > 0 ? ((z.supplierCount / summary.total) * 100).toFixed(1) + "%" : "0%",
      ]),
      styles: { fontSize: 9, cellPadding: 3 },
      headStyles: { fillColor: [59, 130, 246] },
    });
    y = (doc as any).lastAutoTable.finalY + 10;

    // By Category
    if (y > 160) { doc.addPage(); y = 20; }
    doc.setFontSize(12);
    doc.text("Proveedores por Rubro", 14, y);
    y += 6;
    autoTable(doc, {
      startY: y,
      head: [["Rubro", "Total", "Genéricos", "Específicos"]],
      body: categoryStats.map(c => [c.name, c.total.toString(), c.generic.toString(), c.specific.toString()]),
      styles: { fontSize: 9, cellPadding: 3 },
      headStyles: { fillColor: [59, 130, 246] },
    });

    doc.save(`Informe_Proveedores_${today.replace(/\//g, "-")}.pdf`);
    toast({ title: "PDF generado", description: "El informe se descargó correctamente" });
  };

  if (loading) {
    return <div className="text-center py-8 text-muted-foreground">Cargando datos de proveedores...</div>;
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Users className="h-5 w-5 text-primary" />
          <h3 className="text-lg font-semibold">Informes de Proveedores</h3>
          <Badge variant="secondary">{summary.total} proveedores</Badge>
        </div>
        <Button onClick={exportPDF} className="gap-2">
          <Download className="h-4 w-4" /> Descargar PDF
        </Button>
      </div>

      {/* Summary */}
      <CollapsibleSection
        title="Resumen General"
        icon={<Users className="h-4 w-4" />}
        isOpen={isSummaryOpen}
        setIsOpen={setSummaryOpen}
      >
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <StatCard label="Total Proveedores" value={summary.total} />
          <StatCard label="Genéricos" value={summary.generic} className="text-blue-600" />
          <StatCard label="Específicos" value={summary.specific} className="text-emerald-600" />
          <StatCard label="Más Antiguo" value={formatDate(summary.oldest)} small />
          <StatCard label="Más Reciente" value={formatDate(summary.newest)} small />
        </div>
      </CollapsibleSection>

      {/* By Zone */}
      <CollapsibleSection
        title="Proveedores por Zona de Influencia"
        icon={<MapPin className="h-4 w-4" />}
        isOpen={isZoneOpen}
        setIsOpen={setZoneOpen}
      >
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="overflow-auto max-h-[400px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Región</TableHead>
                  <TableHead className="text-center w-28">Proveedores</TableHead>
                  <TableHead className="text-center w-24">%</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {zoneStats.length === 0 ? (
                  <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground">Sin datos de zonas</TableCell></TableRow>
                ) : zoneStats.map(z => (
                  <TableRow key={z.region} className="cursor-pointer hover:bg-muted/50" onClick={() => toggleRegion(z.region)}>
                    <TableCell className="text-sm font-medium">
                      <div className="flex items-center gap-1">
                        {expandedRegions.has(z.region) ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                        {z.region}
                      </div>
                      {expandedRegions.has(z.region) && z.communes.length > 0 && (
                        <div className="ml-5 mt-2 space-y-1">
                          {z.communes.map(c => (
                            <div key={c.commune} className="text-xs text-muted-foreground">
                              {c.commune} ({c.suppliers.length})
                            </div>
                          ))}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-center">{z.supplierCount}</TableCell>
                    <TableCell className="text-center text-xs">
                      {summary.total > 0 ? ((z.supplierCount / summary.total) * 100).toFixed(1) : 0}%
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {zoneChartData.length > 0 && (
            <ResponsiveContainer width="100%" height={350}>
              <PieChart>
                <Pie
                  data={zoneChartData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={120}
                  label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                  labelLine
                >
                  {zoneChartData.map((_, idx) => (
                    <Cell key={idx} fill={CHART_COLORS[idx % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value: number) => [value, "Proveedores"]} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </CollapsibleSection>

      {/* By Category */}
      <CollapsibleSection
        title="Proveedores por Rubro (Categoría)"
        icon={<Tag className="h-4 w-4" />}
        isOpen={isCategoryOpen}
        setIsOpen={setCategoryOpen}
      >
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="overflow-auto max-h-[400px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Rubro</TableHead>
                  <TableHead className="text-center w-20">Total</TableHead>
                  <TableHead className="text-center w-24">Genéricos</TableHead>
                  <TableHead className="text-center w-28">Específicos</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {categoryStats.map(c => (
                  <TableRow key={c.name}>
                    <TableCell className="text-sm font-medium">{c.name}</TableCell>
                    <TableCell className="text-center">{c.total}</TableCell>
                    <TableCell className="text-center">
                      {c.generic > 0 && <Badge variant="secondary" className="text-xs">{c.generic}</Badge>}
                    </TableCell>
                    <TableCell className="text-center">
                      {c.specific > 0 && <Badge variant="default" className="text-xs">{c.specific}</Badge>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {categoryChartData.length > 0 && (
            <ResponsiveContainer width="100%" height={350}>
              <PieChart>
                <Pie
                  data={categoryChartData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={120}
                  label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                  labelLine
                >
                  {categoryChartData.map((_, idx) => (
                    <Cell key={idx} fill={CHART_COLORS[idx % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value: number) => [value, "Proveedores"]} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </CollapsibleSection>

      {/* Timeline */}
      <CollapsibleSection
        title="Proveedores por Fecha de Creación"
        icon={<CalendarDays className="h-4 w-4" />}
        isOpen={isTimelineOpen}
        setIsOpen={setTimelineOpen}
      >
        {timelineStats.length > 0 ? (
          <div className="overflow-auto max-h-[300px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Período</TableHead>
                  <TableHead className="text-center w-28">Creados</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {timelineStats.map(t => (
                  <TableRow key={t.month}>
                    <TableCell className="text-sm">{t.month}</TableCell>
                    <TableCell className="text-center">{t.count}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="text-center py-4 text-muted-foreground text-sm">Sin datos de creación</div>
        )}
      </CollapsibleSection>
    </div>
  );
}

// Reusable collapsible sub-section
function CollapsibleSection({
  title,
  icon,
  isOpen,
  setIsOpen,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  isOpen: boolean;
  setIsOpen: (v: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Card>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors py-3">
            <div className="flex items-center gap-2">
              {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              {icon}
              <CardTitle className="text-sm font-medium">{title}</CardTitle>
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent>{children}</CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

function StatCard({ label, value, className, small }: { label: string; value: string | number; className?: string; small?: boolean }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className={`${small ? "text-sm" : "text-2xl"} font-bold ${className || ""}`}>{value}</div>
      </CardContent>
    </Card>
  );
}
