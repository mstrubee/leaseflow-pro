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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Upload, Search, ClipboardList, Clock, CheckCircle, Pencil, FileDown, Download, Link, CalendarDays, ListFilter, Building2, ExternalLink, Shield } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { MaintenanceForm, detectMaintenanceType, SUB_STATUS_LABELS, SubStatus } from "./types";
import { CompanyLogo } from "@/components/contracts/CompanyLogo";
import { MaintenanceExcelUpload } from "./MaintenanceExcelUpload";
import { MaintenanceEditDialog } from "./MaintenanceEditDialog";
import { SortableTableHead, SortOrder } from "@/components/contracts/SortableTableHead";
import { exportMaintenanceExcel, exportMaintenancePDF } from "./maintenanceExport";
import { useNavigate } from "react-router-dom";

interface CriticalityCategory {
  id: string;
  name: string;
  code: string;
  description: string | null;
  color: string | null;
}

export function MaintenanceModule() {
  const navigate = useNavigate();
  const [forms, setForms] = useState<MaintenanceForm[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [criticalityFilter, setCriticalityFilter] = useState("all");
  const [selectedYears, setSelectedYears] = useState<number[]>([]);
  const [selectedContracts, setSelectedContracts] = useState<string[]>([]);
  const [contractSearch, setContractSearch] = useState("");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [editForm, setEditForm] = useState<MaintenanceForm | null>(null);
  const [sortKey, setSortKey] = useState<string | null>("created_date");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const [contractCompanyMap, setContractCompanyMap] = useState<Record<string, string[]>>({});
  const [companyFilter, setCompanyFilter] = useState("all");
  const [criticalityCategories, setCriticalityCategories] = useState<CriticalityCategory[]>([]);

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
        .order("id", { ascending: true })
        .range(from, from + batchSize - 1);

      if (error) {
        console.error(error);
        toast({ title: "Error", description: "No se pudieron cargar los FORMs", variant: "destructive" });
        hasMore = false;
      } else {
        const batch = (data as any as MaintenanceForm[]) || [];
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

  // Fetch criticality categories with code and description
  useEffect(() => {
    const fetchCriticalities = async () => {
      const { data } = await (supabase as any)
        .from("maintenance_criticality_categories")
        .select("id, name, code, description, color")
        .eq("is_active", true)
        .order("display_order");
      if (data) setCriticalityCategories(data);
    };
    fetchCriticalities();
  }, []);

  // Fetch contract-company mapping for logos
  useEffect(() => {
    const fetchCompanyMap = async () => {
      const { data } = await supabase
        .from("contract_companies")
        .select("contract_id, companies!inner(name)")
        .returns<Array<{ contract_id: string, companies: { name: string } }>>();
      if (data) {
        const map: Record<string, string[]> = {};
        data.forEach(row => {
          const cId = row.contract_id;
          const coName = row.companies?.name;
          if (cId && coName) {
            if (!map[cId]) map[cId] = [];
            if (!map[cId].includes(coName)) map[cId].push(coName);
          }
        });
        setContractCompanyMap(map);
      }
    };
    fetchCompanyMap();
  }, []);

  const availableCompanies = useMemo(() => {
    const companies = new Set<string>();
    Object.values(contractCompanyMap).forEach(names => names.forEach(n => companies.add(n)));
    return Array.from(companies).sort();
  }, [contractCompanyMap]);

  const companyFilteredContractIds = useMemo(() => {
    if (companyFilter === "all") return null;
    const ids = new Set<string>();
    for (const [contractId, companies] of Object.entries(contractCompanyMap)) {
      if (companies.some(c => c.toLowerCase().includes(companyFilter.toLowerCase()))) {
        ids.add(contractId);
      }
    }
    return ids;
  }, [companyFilter, contractCompanyMap]);

  const availableYears = useMemo(() => {
    const years = new Set<number>();
    forms.forEach(f => { if (f.year) years.add(f.year); });
    return Array.from(years).sort((a, b) => b - a);
  }, [forms]);

  const contractFilterOptions = useMemo(() => {
    const nameToIds: Record<string, Set<string>> = {};
    forms.forEach(f => {
      if (f.contract_name) {
        if (!nameToIds[f.contract_name]) nameToIds[f.contract_name] = new Set();
        if (f.contract_id) nameToIds[f.contract_name].add(f.contract_id);
      }
    });

    const options: Array<{ key: string; label: string; contractIds: string[]; companyNames: string[] }> = [];

    for (const [name, idSet] of Object.entries(nameToIds)) {
      const ids = Array.from(idSet);
      const companyToIds: Record<string, string[]> = {};
      ids.forEach(id => {
        const companies = contractCompanyMap[id] || [];
        const companyKey = companies.length > 0 ? companies.sort().join(", ") : "__none__";
        if (!companyToIds[companyKey]) companyToIds[companyKey] = [];
        companyToIds[companyKey].push(id);
      });

      const companyGroups = Object.entries(companyToIds);
      if (companyGroups.length <= 1) {
        const companyNames = companyGroups[0]?.[0] === "__none__" ? [] : (companyGroups[0]?.[0]?.split(", ") || []);
        options.push({ key: name, label: name, contractIds: ids, companyNames });
      } else {
        for (const [companyKey, groupIds] of companyGroups) {
          const companyNames = companyKey === "__none__" ? [] : companyKey.split(", ");
          const uniqueKey = `${name}__${companyKey}`;
          options.push({ key: uniqueKey, label: name, contractIds: groupIds, companyNames });
        }
      }
    }

    return options.sort((a, b) => a.label.localeCompare(b.label, "es"));
  }, [forms, contractCompanyMap]);

  const filteredContractOptions = useMemo(() => {
    if (!contractSearch) return contractFilterOptions;
    const s = contractSearch.toLowerCase();
    return contractFilterOptions.filter(c => c.label.toLowerCase().includes(s));
  }, [contractFilterOptions, contractSearch]);

  const toggleContract = (key: string) => {
    setSelectedContracts(prev =>
      prev.includes(key) ? prev.filter(c => c !== key) : [...prev, key]
    );
  };

  const toggleYear = (year: number) => {
    setSelectedYears(prev =>
      prev.includes(year) ? prev.filter(y => y !== year) : [...prev, year]
    );
  };

  const handleSort = useCallback((key: string) => {
    if (sortKey === key) {
      setSortOrder(o => o === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortOrder("asc");
    }
  }, [sortKey]);

  // Build a map for quick criticality name lookup
  const criticalityMap = useMemo(() => {
    const map = new Map<string, CriticalityCategory>();
    criticalityCategories.forEach(c => map.set(c.id, c));
    return map;
  }, [criticalityCategories]);

  const filtered = useMemo(() => {
    let result = forms.filter(f => {
      if (selectedYears.length > 0 && (!f.year || !selectedYears.includes(f.year))) return false;
      if (companyFilteredContractIds !== null) {
        if (!f.contract_id || !companyFilteredContractIds.has(f.contract_id)) return false;
      }
      if (selectedContracts.length > 0) {
        const selectedIds = new Set<string>();
        selectedContracts.forEach(key => {
          const opt = contractFilterOptions.find(o => o.key === key);
          if (opt) opt.contractIds.forEach(id => selectedIds.add(id));
        });
        if (!f.contract_id || !selectedIds.has(f.contract_id)) return false;
      }
      if (statusFilter !== "all" && f.status !== statusFilter) return false;
      if (typeFilter !== "all" && detectMaintenanceType(f) !== typeFilter) return false;
      // Criticality filter
      if (criticalityFilter !== "all") {
        if (criticalityFilter === "none") {
          if (f.criticality_category_id) return false;
        } else {
          if (f.criticality_category_id !== criticalityFilter) return false;
        }
      }
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
        let valA: any;
        let valB: any;

        if (sortKey === "criticality_category_id") {
          valA = (criticalityMap.get(a.criticality_category_id || "")?.name || "zzz").toLowerCase();
          valB = (criticalityMap.get(b.criticality_category_id || "")?.name || "zzz").toLowerCase();
        } else if (sortKey === "created_date") {
          valA = a.created_date ? new Date(a.created_date).getTime() : 0;
          valB = b.created_date ? new Date(b.created_date).getTime() : 0;
        } else {
          valA = ((a as any)[sortKey] ?? "").toString().toLowerCase();
          valB = ((b as any)[sortKey] ?? "").toString().toLowerCase();
        }
        if (valA < valB) return sortOrder === "asc" ? -1 : 1;
        if (valA > valB) return sortOrder === "asc" ? 1 : -1;
        return 0;
      });
    }

    return result;
  }, [forms, statusFilter, typeFilter, criticalityFilter, search, selectedYears, selectedContracts, companyFilteredContractIds, contractFilterOptions, sortKey, sortOrder, criticalityMap]);

  const totalForms = filtered.length;
  const enProceso = filtered.filter(f => f.status === "proceso").length;
  const solucionados = filtered.filter(f => f.status === "solucionado").length;

  // Criticality cards: count "En Proceso" per category across ALL forms (not filtered)
  const criticalityCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    criticalityCategories.forEach(c => { counts[c.id] = 0; });
    forms.forEach(f => {
      if (f.status === "proceso" && f.criticality_category_id && counts[f.criticality_category_id] !== undefined) {
        counts[f.criticality_category_id]++;
      }
    });
    return counts;
  }, [forms, criticalityCategories]);

  const handleCriticalityCardClick = (catId: string) => {
    if (statusFilter === "proceso" && criticalityFilter === catId) {
      // Toggle off
      setStatusFilter("all");
      setCriticalityFilter("all");
    } else {
      setStatusFilter("proceso");
      setCriticalityFilter(catId);
    }
  };

  const handleCriticalityChange = async (formId: string, val: string) => {
    const newVal = val === "none" ? null : val;
    const { error } = await (supabase as any)
      .from("maintenance_forms")
      .update({ criticality_category_id: newVal })
      .eq("id", formId);
    if (error) { console.error(error); return; }
    setForms(prev => prev.map(fm => fm.id === formId ? { ...fm, criticality_category_id: newVal } : fm));
  };

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

      {/* Criticality Quick-Filter Cards */}
      {criticalityCategories.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {criticalityCategories.map(cat => {
            const isActive = statusFilter === "proceso" && criticalityFilter === cat.id;
            return (
              <Card
                key={cat.id}
                className={`cursor-pointer transition-all hover:shadow-md ${isActive ? "ring-2 ring-offset-1" : ""}`}
                style={{
                  borderLeftWidth: 4,
                  borderLeftColor: cat.color || "hsl(var(--border))",
                  ...(isActive ? { ringColor: cat.color || undefined } : {}),
                }}
                onClick={() => handleCriticalityCardClick(cat.id)}
              >
                <CardContent className="p-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Shield className="h-4 w-4" style={{ color: cat.color || undefined }} />
                    <span className="text-sm font-medium">{cat.name}</span>
                  </div>
                  <Badge
                    className="text-xs"
                    style={{ backgroundColor: cat.color || undefined, color: "#fff" }}
                  >
                    {criticalityCounts[cat.id] || 0}
                  </Badge>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

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
        <div>
          <Label className="text-xs text-muted-foreground block mb-1">Contrato</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="w-48 justify-start gap-2 truncate">
                <ListFilter className="h-4 w-4 shrink-0" />
                <span className="truncate">{selectedContracts.length === 0 ? "Todos" : `${selectedContracts.length} seleccionados`}</span>
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-2">
              <div className="space-y-2">
                <div className="relative">
                  <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    placeholder="Buscar contrato..."
                    value={contractSearch}
                    onChange={e => setContractSearch(e.target.value)}
                    className="pl-7 h-8 text-sm"
                  />
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="sm" className="text-xs h-6 px-2" onClick={() => setSelectedContracts(filteredContractOptions.map(o => o.key))}>
                    Todos
                  </Button>
                  <Button variant="ghost" size="sm" className="text-xs h-6 px-2" onClick={() => setSelectedContracts([])}>
                    Ninguno
                  </Button>
                </div>
                <div className="max-h-48 overflow-y-auto space-y-0.5">
                  {filteredContractOptions.map(opt => (
                      <label key={opt.key} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-accent cursor-pointer text-sm">
                        <Checkbox
                          checked={selectedContracts.includes(opt.key)}
                          onCheckedChange={() => toggleContract(opt.key)}
                        />
                        <CompanyLogo companyNames={opt.companyNames} size="sm" className="h-4 w-4" />
                        <span className="truncate">{opt.label}</span>
                      </label>
                  ))}
                  {filteredContractOptions.length === 0 && (
                    <p className="text-xs text-muted-foreground text-center py-2">Sin resultados</p>
                  )}
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Empresa</Label>
          <Select value={companyFilter} onValueChange={setCompanyFilter}>
            <SelectTrigger className="w-40"><SelectValue placeholder="Empresa" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              {availableCompanies.map(c => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
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
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Criticidad</Label>
          <Select value={criticalityFilter} onValueChange={setCriticalityFilter}>
            <SelectTrigger className="w-40"><SelectValue placeholder="Criticidad" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              <SelectItem value="none">Sin criticidad</SelectItem>
              {criticalityCategories.map(c => (
                <SelectItem key={c.id} value={c.id}>
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full inline-block shrink-0" style={{ backgroundColor: c.color || "#6b7280" }} />
                    {c.name}
                  </div>
                </SelectItem>
              ))}
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
            <TooltipProvider delayDuration={200}>
              <Table>
                <TableHeader>
                  <TableRow>
                    <SortableTableHead label="N° FORM" sortKey="form_number" currentSortKey={sortKey} currentSortOrder={sortOrder} onSort={handleSort} className="w-24" />
                    <SortableTableHead label="Estado" sortKey="status" currentSortKey={sortKey} currentSortOrder={sortOrder} onSort={handleSort} className="w-28" />
                    <SortableTableHead label="Sub Estado" sortKey="sub_status" currentSortKey={sortKey} currentSortOrder={sortOrder} onSort={handleSort} className="w-32" />
                    <SortableTableHead label="Criticidad" sortKey="criticality_category_id" currentSortKey={sortKey} currentSortOrder={sortOrder} onSort={handleSort} className="w-36" />
                    <SortableTableHead label="Fecha" sortKey="created_date" currentSortKey={sortKey} currentSortOrder={sortOrder} onSort={handleSort} className="w-28" />
                    <SortableTableHead label="Contrato" sortKey="contract_name" currentSortKey={sortKey} currentSortOrder={sortOrder} onSort={handleSort} />
                    <TableHead className="w-28">Tipo</TableHead>
                    <TableHead>Descripción</TableHead>
                    <TableHead>Comentarios</TableHead>
                    <SortableTableHead label="Proveedor" sortKey="supplier_name" currentSortKey={sortKey} currentSortOrder={sortOrder} onSort={handleSort} className="w-32" />
                    <SortableTableHead label="OC" sortKey="purchase_order_number" currentSortKey={sortKey} currentSortOrder={sortOrder} onSort={handleSort} className="w-32" />
                    <TableHead className="w-28">Evidencia</TableHead>
                    <TableHead className="w-24 text-center">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow><TableCell colSpan={13} className="text-center py-8 text-muted-foreground">Cargando...</TableCell></TableRow>
                  ) : filtered.length === 0 ? (
                    <TableRow><TableCell colSpan={13} className="text-center py-8 text-muted-foreground">No hay FORMs registrados</TableCell></TableRow>
                  ) : (
                    filtered.map(f => {
                      const cat = criticalityMap.get(f.criticality_category_id || "");
                      return (
                        <TableRow key={f.id}>
                          <TableCell className="font-mono text-xs">{f.form_number}</TableCell>
                          <TableCell>
                            <Badge variant={f.status === "solucionado" ? "default" : "secondary"} className="text-xs">
                              {f.status === "solucionado" ? "Solucionado" : "En Proceso"}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-xs">
                              {SUB_STATUS_LABELS[(f.sub_status as SubStatus)] || f.sub_status || "Solicitado"}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <button className="flex items-center h-7 px-1 rounded hover:bg-accent transition-colors w-full text-left">
                                  {cat ? (
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Badge className="text-xs cursor-pointer" style={{ backgroundColor: cat.color || undefined, color: "#fff" }}>
                                          {cat.name}
                                        </Badge>
                                      </TooltipTrigger>
                                      <TooltipContent side="top">
                                        <p className="text-xs font-medium">Código: {cat.code}</p>
                                        {cat.description && <p className="text-xs text-muted-foreground">{cat.description}</p>}
                                      </TooltipContent>
                                    </Tooltip>
                                  ) : (
                                    <span className="text-muted-foreground text-xs">—</span>
                                  )}
                                </button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="start" className="min-w-[160px]">
                                <DropdownMenuItem onClick={() => handleCriticalityChange(f.id, "none")}>
                                  <span className="text-muted-foreground">Sin criticidad</span>
                                </DropdownMenuItem>
                                {criticalityCategories.map(c => (
                                  <DropdownMenuItem key={c.id} onClick={() => handleCriticalityChange(f.id, c.id)}>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <div className="flex items-center gap-2 w-full">
                                          <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: c.color || "#6b7280" }} />
                                          <span>{c.name}</span>
                                        </div>
                                      </TooltipTrigger>
                                      <TooltipContent side="right">
                                        <p className="text-xs font-medium">Código: {c.code}</p>
                                        {c.description && <p className="text-xs text-muted-foreground">{c.description}</p>}
                                      </TooltipContent>
                                    </Tooltip>
                                  </DropdownMenuItem>
                                ))}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                          <TableCell className="text-xs">{f.created_date || "-"}</TableCell>
                          <TableCell className="text-xs">
                            <div className="flex items-center gap-1.5">
                              {f.contract_id && contractCompanyMap[f.contract_id] && (
                                <CompanyLogo companyNames={contractCompanyMap[f.contract_id]} size="sm" className="h-4 w-4 shrink-0" />
                              )}
                              <span className="truncate">{f.contract_name || "-"}</span>
                            </div>
                          </TableCell>
                          <TableCell><Badge variant="outline" className="text-xs">{detectMaintenanceType(f)}</Badge></TableCell>
                          <TableCell className="text-xs max-w-48 truncate">
                            {f.general_description || f.electrical_description || f.civil_description || f.hvac_description || f.fixed_assets_description || "-"}
                          </TableCell>
                          <TableCell className="text-xs max-w-32 truncate">{f.additional_comments || "-"}</TableCell>
                          <TableCell className="text-xs">
                            {f.supplier_name ? (
                              <button onClick={() => navigate("/suppliers")} className="text-primary hover:underline flex items-center gap-1 truncate max-w-28">
                                <span className="truncate">{f.supplier_name}</span>
                                <ExternalLink className="h-3 w-3 shrink-0" />
                              </button>
                            ) : <span className="text-muted-foreground">-</span>}
                          </TableCell>
                          <TableCell className="text-xs">
                            {f.purchase_order_number ? (
                              <button onClick={() => navigate(`/purchase-orders?search=${encodeURIComponent(f.purchase_order_number!)}`)} className="text-primary hover:underline flex items-center gap-1 truncate max-w-28">
                                <span className="truncate">{f.purchase_order_number}</span>
                                <ExternalLink className="h-3 w-3 shrink-0" />
                              </button>
                            ) : <span className="text-muted-foreground">-</span>}
                          </TableCell>
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
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => exportMaintenancePDF(f, f.contract_id ? (contractCompanyMap[f.contract_id] || []).join(", ") : undefined)} title="Descargar PDF">
                                <FileDown className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </TooltipProvider>
          </div>
        </CardContent>
      </Card>

      <MaintenanceExcelUpload open={uploadOpen} onOpenChange={setUploadOpen} onSuccess={fetchForms} />
      <MaintenanceEditDialog form={editForm} open={!!editForm} onOpenChange={v => { if (!v) setEditForm(null); }} onSuccess={fetchForms} />
    </div>
  );
}
