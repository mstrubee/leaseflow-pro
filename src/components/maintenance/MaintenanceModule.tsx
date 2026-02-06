import { useState, useEffect, useMemo, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Upload, Search, ClipboardList, Clock, CheckCircle, Pencil, FileDown, Download, Link, CalendarDays } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { MaintenanceForm, detectMaintenanceType } from "./types";
import { MaintenanceExcelUpload } from "./MaintenanceExcelUpload";
import { MaintenanceEditDialog } from "./MaintenanceEditDialog";
import { SortableTableHead, SortOrder } from "@/components/contracts/SortableTableHead";
import { exportMaintenanceExcel, exportMaintenancePDF } from "./maintenanceExport";

export function MaintenanceModule() {
  const [forms, setForms] = useState<MaintenanceForm[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [selectedYears, setSelectedYears] = useState<number[]>([]);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [editForm, setEditForm] = useState<MaintenanceForm | null>(null);
  const [sortKey, setSortKey] = useState<string | null>("created_date");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");

  const fetchForms = async () => {
    setLoading(true);
    // Fetch all records in batches to avoid the 1000-row default limit
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
        .order("id", { ascending: true })
        .range(from, from + batchSize - 1);

      if (error) {
        console.error(error);
        toast({ title: "Error", description: "No se pudieron cargar los FORMs", variant: "destructive" });
        hasMore = false;
      } else {
        const batch = (data as any as MaintenanceForm[]) || [];
        // Deduplicate by id to prevent overlapping ranges
        const existingIds = new Set(allData.map(d => d.id));
        const newBatch = batch.filter(b => !existingIds.has(b.id));
        allData = [...allData, ...newBatch];
        hasMore = batch.length === batchSize;
        from += batchSize;
      }
    }

    setForms(allData);
    setLoading(false);
  };

  useEffect(() => { fetchForms(); }, []);

  // Available years for filtering
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

  const handleSort = useCallback((key: string) => {
    setSortKey(prev => {
      if (prev === key) {
        setSortOrder(o => o === "asc" ? "desc" : "asc");
        return key;
      }
      setSortOrder("asc");
      return key;
    });
  }, []);

  const filtered = useMemo(() => {
    let result = forms.filter(f => {
      if (selectedYears.length > 0 && (!f.year || !selectedYears.includes(f.year))) return false;
      const normalizedStatus = (f.status || "").trim().toLowerCase();
      const normalizedFilter = statusFilter.trim().toLowerCase();
      if (normalizedFilter !== "all" && normalizedStatus !== normalizedFilter) return false;
      if (typeFilter !== "all" && detectMaintenanceType(f) !== typeFilter) return false;
      if (search) {
        const s = search.toLowerCase();
        const matches = [f.form_number, f.contract_name, f.general_description, f.electrical_description, f.civil_description, f.hvac_description, f.fixed_assets_description]
          .some(v => v?.toLowerCase().includes(s));
        if (!matches) return false;
      }
      return true;
    });

    if (sortKey && sortOrder) {
      result = [...result].sort((a, b) => {
        let valA: any = (a as any)[sortKey];
        let valB: any = (b as any)[sortKey];
        if (sortKey === "created_date") {
          valA = valA ? new Date(valA).getTime() : 0;
          valB = valB ? new Date(valB).getTime() : 0;
        } else {
          valA = (valA ?? "").toString().toLowerCase();
          valB = (valB ?? "").toString().toLowerCase();
        }
        if (valA < valB) return sortOrder === "asc" ? -1 : 1;
        if (valA > valB) return sortOrder === "asc" ? 1 : -1;
        return 0;
      });
    }

    return result;
  }, [forms, statusFilter, typeFilter, search, selectedYears, sortKey, sortOrder]);

  const totalForms = filtered.length;
  const enProceso = filtered.filter(f => f.status === "proceso").length;
  const solucionados = filtered.filter(f => f.status === "solucionado").length;

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total FORMs</CardTitle>
            <ClipboardList className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{totalForms}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">En Proceso</CardTitle>
            <Clock className="h-4 w-4 text-yellow-600" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold text-yellow-600">{enProceso}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Solucionados</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold text-green-600">{solucionados}</div></CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-48 space-y-1">
          <Label className="text-xs text-muted-foreground">Buscar</Label>
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input placeholder="N° FORM, contrato, descripción..." value={search} onChange={e => setSearch(e.target.value)} className="pl-8" />
          </div>
        </div>
        <div>
          <Label className="text-xs text-muted-foreground block mb-1">Año</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="w-40 justify-start gap-2">
                <CalendarDays className="h-4 w-4" />
                {selectedYears.length === 0 ? "Todos" : [...selectedYears].sort((a,b) => b-a).join(", ")}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-48 p-2">
              <div className="space-y-1">
                {availableYears.map(year => (
                  <label key={year} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-accent cursor-pointer text-sm">
                    <Checkbox
                      checked={selectedYears.includes(year)}
                      onCheckedChange={() => toggleYear(year)}
                    />
                    {year}
                  </label>
                ))}
                {selectedYears.length > 0 && (
                  <Button variant="ghost" size="sm" className="w-full mt-1 text-xs" onClick={() => setSelectedYears([])}>
                    Limpiar
                  </Button>
                )}
              </div>
            </PopoverContent>
          </Popover>
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Estado</Label>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40"><SelectValue placeholder="Estado" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="proceso">En Proceso</SelectItem>
              <SelectItem value="solucionado">Solucionado</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Tipo</Label>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-40"><SelectValue placeholder="Tipo" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="Eléctrico">Eléctrico</SelectItem>
              <SelectItem value="Obra Civil">Obra Civil</SelectItem>
              <SelectItem value="Climatización">Climatización</SelectItem>
              <SelectItem value="Activos Fijos">Activos Fijos</SelectItem>
              <SelectItem value="General">General</SelectItem>
              <SelectItem value="Múltiple">Múltiple</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button onClick={() => setUploadOpen(true)} className="gap-2">
          <Upload className="h-4 w-4" /> Cargar Excel
        </Button>
        <Button variant="outline" onClick={() => exportMaintenanceExcel(filtered)} disabled={filtered.length === 0} className="gap-2">
          <Download className="h-4 w-4" /> Descargar Excel
        </Button>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableTableHead label="N° FORM" sortKey="form_number" currentSortKey={sortKey} currentSortOrder={sortOrder} onSort={handleSort} className="w-24" />
                  <SortableTableHead label="Estado" sortKey="status" currentSortKey={sortKey} currentSortOrder={sortOrder} onSort={handleSort} className="w-28" />
                  <SortableTableHead label="Fecha" sortKey="created_date" currentSortKey={sortKey} currentSortOrder={sortOrder} onSort={handleSort} className="w-28" />
                  <SortableTableHead label="Contrato" sortKey="contract_name" currentSortKey={sortKey} currentSortOrder={sortOrder} onSort={handleSort} />
                  <TableHead className="w-28">Tipo</TableHead>
                  <TableHead>Descripción</TableHead>
                  <TableHead>Comentarios</TableHead>
                  <TableHead className="w-28">Evidencia</TableHead>
                  <TableHead className="w-24 text-center">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">Cargando...</TableCell></TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">No hay FORMs registrados</TableCell></TableRow>
                ) : (
                  filtered.map(f => (
                    <TableRow key={f.id}>
                      <TableCell className="font-mono text-xs">{f.form_number}</TableCell>
                      <TableCell>
                        <Badge variant={f.status === "solucionado" ? "default" : "secondary"} className="text-xs">
                          {f.status === "solucionado" ? "Solucionado" : "En Proceso"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs">{f.created_date || "-"}</TableCell>
                      <TableCell className="text-xs">{f.contract_name || "-"}</TableCell>
                      <TableCell><Badge variant="outline" className="text-xs">{detectMaintenanceType(f)}</Badge></TableCell>
                      <TableCell className="text-xs max-w-48 truncate">
                        {f.general_description || f.electrical_description || f.civil_description || f.hvac_description || f.fixed_assets_description || "-"}
                      </TableCell>
                      <TableCell className="text-xs max-w-32 truncate">{f.additional_comments || "-"}</TableCell>
                      <TableCell className="text-xs">
                        {f.evidence_links && f.evidence_links.length > 0 ? (
                          <div className="flex flex-col gap-0.5">
                            {f.evidence_links.map((link, idx) => (
                              <a key={idx} href={link} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline flex items-center gap-1">
                                <Link className="h-3 w-3" />Evidencia {idx + 1}
                              </a>
                            ))}
                          </div>
                        ) : "-"}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-center gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditForm(f)} title="Editar">
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => exportMaintenancePDF(f)} title="Descargar PDF">
                            <FileDown className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <MaintenanceExcelUpload open={uploadOpen} onOpenChange={setUploadOpen} onSuccess={fetchForms} />
      <MaintenanceEditDialog form={editForm} open={!!editForm} onOpenChange={v => { if (!v) setEditForm(null); }} onSuccess={fetchForms} />
    </div>
  );
}
