import { useState, useEffect, useMemo, useCallback, startTransition, useRef, memo, Fragment } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import { Upload, Search, ClipboardList, Clock, CheckCircle, Pencil, FileDown, Download, Link, CalendarDays, ListFilter, Building2, ExternalLink, Shield, XCircle, ChevronLeft, ChevronRight, ChevronDown, Link2, MessageSquare, FileText } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { resolveFileUrl } from "@/lib/storageUtils";
import { toast } from "@/hooks/use-toast";
import { MaintenanceForm, detectMaintenanceType } from "./types";
import { ResolutionDialog } from "./ResolutionDialog";
import { useMaintenanceSubStatuses, MaintenanceSubStatus } from "@/hooks/useMaintenanceSubStatuses";
import { CompanyLogo } from "@/components/contracts/CompanyLogo";
import { MaintenanceExcelUpload } from "./MaintenanceExcelUpload";
import { MaintenanceEditDialog } from "./MaintenanceEditDialog";
import { SortableTableHead, SortOrder } from "@/components/contracts/SortableTableHead";
import { exportMaintenanceExcel, exportMaintenancePDF, exportDailyFormsPDF, exportMergedFormAndOT } from "./maintenanceExport";
import { exportOTPDF, downloadBlankOTPDF, downloadBlankOTExcel } from "./otExport";
import { OTDownloadOfferDialog } from "./OTDownloadOfferDialog";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";

/** "Resuelto con Observaciones": subestado dedicado resuelto_obs, o resuelto + observaciones. */
const isResueltoObs = (f: MaintenanceForm) =>
  (f.sub_status === "resuelto" && !!f.resolution_observations?.trim()) || f.sub_status === "resuelto_obs";

/** Valor numérico de un form_number para comparar (el "padre" de una fusión es el más alto). */
const formNumberValue = (s: string | null | undefined): number =>
  parseInt((s ?? "").replace(/\D/g, ""), 10) || 0;

/* ── Isolated CommentCell to prevent table re-renders ── */
const CommentCell = memo(function CommentCell({
  form,
  onSave,
}: {
  form: MaintenanceForm;
  onSave: (formId: string, text: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState("");

  const handleOpen = () => {
    if (form.additional_comments?.trim()) {
      setEditing(false);
      setOpen(true);
    } else {
      setEditText("");
      setEditing(true);
      setOpen(true);
    }
  };

  const startEdit = () => {
    setEditText(form.additional_comments || "");
    setEditing(true);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.ctrlKey && e.key === "Enter") {
      e.preventDefault();
      onSave(form.id, editText);
      setOpen(false);
    }
  };

  const hasObservations = form.sub_status === "resuelto" && !!form.resolution_observations?.trim();

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="w-full min-h-[28px] text-left hover:text-primary transition-colors cursor-pointer truncate block"
          onClick={handleOpen}
        >
          <span className="flex items-center gap-1">
            <span className="truncate">{form.additional_comments?.trim() || "-"}</span>
            {hasObservations && <MessageSquare className="h-3 w-3 text-blue-500 shrink-0" />}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-3 space-y-2 z-50 bg-popover border shadow-md">
        {!editing ? (
          <>
            <p className="text-xs font-semibold text-muted-foreground">Comentarios</p>
            <p className="text-sm whitespace-pre-wrap">{form.additional_comments || <span className="text-muted-foreground italic">Sin comentarios</span>}</p>
            <Button variant="outline" size="sm" className="gap-1.5 mt-2" onClick={startEdit}>
              <Pencil className="h-3.5 w-3.5" /> Editar
            </Button>
            {hasObservations && (
              <>
                <Separator className="my-2" />
                <p className="text-xs font-bold text-muted-foreground">Observaciones - Control de Gestión</p>
                <p className="text-sm whitespace-pre-wrap">{form.resolution_observations}</p>
              </>
            )}
          </>
        ) : (
          <>
            <p className="text-xs font-semibold text-muted-foreground">Editar Comentarios</p>
            <Textarea
              value={editText}
              onChange={e => setEditText(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={4}
              placeholder="Escriba un comentario..."
              autoFocus
            />
            <div className="flex justify-between items-center">
              <p className="text-[10px] text-muted-foreground">Ctrl + Enter para guardar</p>
              <Button size="sm" onClick={() => { onSave(form.id, editText); setOpen(false); }}>
                Guardar
              </Button>
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
});

/* ── DebouncedInput: isolated memo'd input that only re-renders itself ── */
const DebouncedInput = memo(function DebouncedInput({
  value: externalValue,
  onChange,
  delay = 200,
  ...props
}: {
  value: string;
  onChange: (val: string) => void;
  delay?: number;
} & Omit<React.ComponentProps<typeof Input>, "value" | "onChange">) {
  const [local, setLocal] = useState(externalValue);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    const t = setTimeout(() => onChangeRef.current(local), delay);
    return () => clearTimeout(t);
  }, [local, delay]);

  // Sync if parent resets (e.g. "clear filters")
  useEffect(() => { setLocal(externalValue); }, [externalValue]);

  return <Input {...props} value={local} onChange={e => setLocal(e.target.value)} />;
});


/* ── Isolated SubStatusCell for dropdown selection ── */
const SubStatusCell = memo(function SubStatusCell({
  form,
  subStatuses,
  subStatusLabels,
  subStatusInfo,
  subStatusOrder,
  onSubStatusChange,
}: {
  form: MaintenanceForm;
  subStatuses: MaintenanceSubStatus[];
  subStatusLabels: Record<string, string>;
  subStatusInfo: Record<string, { description: string; responsible: string }>;
  subStatusOrder: string[];
  onSubStatusChange: (formId: string, newSubStatus: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const subStatusLower = (form.sub_status || "").toLowerCase();
  const currentSub = subStatuses.find(s => s.name.toLowerCase() === subStatusLower || s.label.toLowerCase() === subStatusLower);
  const currentColor = currentSub?.color;
  const currentInfo = currentSub
    ? subStatusInfo[currentSub.name.toLowerCase()] || subStatusInfo[subStatusLower]
    : subStatusInfo[subStatusLower];

  const isSolicitado = (form.sub_status || "").toLowerCase() === "solicitado";
  // Filter: hide "solicitado" from options when form is no longer in that state
  const availableStatuses = isSolicitado ? subStatuses : subStatuses.filter(s => s.name.toLowerCase() !== "solicitado");

  return (
    <Popover open={isSolicitado ? false : open} onOpenChange={isSolicitado ? undefined : setOpen}>
      <TooltipProvider delayDuration={100}>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <button
                className={`flex items-center h-7 px-1 rounded transition-colors w-full text-left ${isSolicitado ? "cursor-not-allowed opacity-70" : "cursor-pointer hover:bg-accent"}`}
                onClick={isSolicitado ? (e) => { e.preventDefault(); } : undefined}
              >
                <Badge
                  variant="outline"
                  className="text-xs"
                  style={currentColor ? { borderColor: currentColor === 'yellow' ? '#eab308' : currentColor, color: currentColor === 'yellow' ? 'black' : currentColor } : {}}
                >
                  {currentSub?.label || subStatusLabels[subStatusLower] || form.sub_status || "Solicitado"}
                </Badge>
              </button>
            </PopoverTrigger>
          </TooltipTrigger>
          {isSolicitado ? (
            <TooltipContent side="top" className="max-w-xs">
              <p className="text-xs">Asigne criticidad para cambiar el sub-estado</p>
            </TooltipContent>
          ) : (currentInfo?.description || currentInfo?.responsible) ? (
            <TooltipContent side="top" className="max-w-xs">
              {currentInfo.description && <p className="text-xs">{currentInfo.description}</p>}
              {currentInfo.responsible && (
                <p className="text-xs text-muted-foreground mt-0.5">Responsable: {currentInfo.responsible}</p>
              )}
            </TooltipContent>
          ) : null}
        </Tooltip>
      </TooltipProvider>
      <PopoverContent align="start" className="w-52 p-1 z-50 bg-popover border shadow-md">
        <TooltipProvider delayDuration={100}>
          {availableStatuses.map(s => (
            <Tooltip key={s.id}>
              <TooltipTrigger asChild>
                <div
                  className={`flex items-center gap-2 px-2 py-1.5 rounded-sm text-sm cursor-pointer hover:bg-accent ${
                    form.sub_status === s.name ? "bg-accent font-medium" : ""
                  }`}
                  onClick={() => {
                    onSubStatusChange(form.id, s.name);
                    setOpen(false);
                  }}
                >
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: s.color || "#6b7280" }}
                  />
                  <span className="flex-1 truncate">{s.label}</span>
                </div>
              </TooltipTrigger>
              {(s.description || s.responsible) && (
                <TooltipContent side="right" className="max-w-xs">
                  {s.description && <p className="text-xs">{s.description}</p>}
                  {s.responsible && (
                    <p className="text-xs text-muted-foreground mt-0.5">Responsable: {s.responsible}</p>
                  )}
                </TooltipContent>
              )}
            </Tooltip>
          ))}
        </TooltipProvider>
      </PopoverContent>
    </Popover>
  );
});

/* ── Isolated CriticalityCell with controlled popover ── */
const CriticalityCell = memo(function CriticalityCell({
  form,
  cat,
  criticalityCategories,
  onCriticalityChange,
}: {
  form: MaintenanceForm;
  cat: CriticalityCategory | undefined;
  criticalityCategories: CriticalityCategory[];
  onCriticalityChange: (formId: string, value: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);

  const handleSelect = (value: string) => {
    setOpen(false);
    onCriticalityChange(form.id, value);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <TooltipProvider delayDuration={100}>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <button className="flex items-center h-7 px-1 rounded hover:bg-accent transition-colors w-full text-left">
                {cat ? (
                  <Badge className="text-xs cursor-pointer" style={{ backgroundColor: cat.color || undefined, color: "#fff" }}>
                    {cat.name}
                  </Badge>
                ) : (
                  <span className="text-muted-foreground text-xs">—</span>
                )}
              </button>
            </PopoverTrigger>
          </TooltipTrigger>
          {cat && (
            <TooltipContent side="top">
              <p className="text-xs font-medium">Código: {cat.code}</p>
              {cat.description && <p className="text-xs text-muted-foreground">{cat.description}</p>}
            </TooltipContent>
          )}
        </Tooltip>
      </TooltipProvider>
      <PopoverContent align="start" className="w-48 p-1 z-50 bg-popover border shadow-md">
        <TooltipProvider delayDuration={100}>
          <div
            className="flex items-center gap-2 px-2 py-1.5 rounded-sm text-sm cursor-pointer hover:bg-accent"
            onClick={() => handleSelect("none")}
          >
            <span className="text-muted-foreground">Sin criticidad</span>
          </div>
          {criticalityCategories.map(c => (
            <Tooltip key={c.id}>
              <TooltipTrigger asChild>
                <div
                  className="flex items-center gap-2 px-2 py-1.5 rounded-sm text-sm cursor-pointer hover:bg-accent"
                  onClick={() => handleSelect(c.id)}
                >
                  <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: c.color || "#6b7280" }} />
                  <span className="flex-1">{c.name}</span>
                </div>
              </TooltipTrigger>
              <TooltipContent side="right" className="max-w-xs">
                <p className="text-xs font-medium">Código: {c.code}</p>
                {c.description && <p className="text-xs text-muted-foreground">{c.description}</p>}
              </TooltipContent>
            </Tooltip>
          ))}
        </TooltipProvider>
      </PopoverContent>
    </Popover>
  );
});

interface CriticalityCategory {
  id: string;
  name: string;
  code: string;
  description: string | null;
  color: string | null;
}

interface FilterState {
  search: string;
  statusFilter: string;
  subStatusFilter: string;
  typeFilter: string;
  criticalityFilter: string;
  selectedYears: number[];
  selectedContracts: string[];
  companyFilter: string;
  contractSearch: string;
  dateFilter: string | null;
  observationsFilter: boolean;
  zonalFilter: string;
}

const DEFAULT_FILTERS: FilterState = {
  search: "",
  statusFilter: "all",
  subStatusFilter: "all",
  typeFilter: "all",
  criticalityFilter: "all",
  selectedYears: [],
  selectedContracts: [],
  companyFilter: "all",
  contractSearch: "",
  dateFilter: null,
  observationsFilter: false,
  zonalFilter: "all",
};

const PAGE_SIZE = 100;

const CACHE_KEY_FORMS = "maintenance_forms_cache";
const CACHE_KEY_CRITICALITY = "maintenance_criticality_cache";
const CACHE_KEY_COMPANY_MAP = "maintenance_company_map_cache";
const CACHE_KEY_ZONAL_MAP = "maintenance_zonal_map_cache";
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

function readCache<T>(key: string): T | null {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw);
    if (Date.now() - ts > CACHE_TTL_MS) return null;
    return data as T;
  } catch { return null; }
}

function writeCache<T>(key: string, data: T) {
  try {
    sessionStorage.setItem(key, JSON.stringify({ data, ts: Date.now() }));
  } catch { /* quota exceeded, ignore */ }
}

function invalidateCache() {
  sessionStorage.removeItem(CACHE_KEY_FORMS);
  sessionStorage.removeItem(CACHE_KEY_CRITICALITY);
  sessionStorage.removeItem(CACHE_KEY_COMPANY_MAP);
  sessionStorage.removeItem(CACHE_KEY_ZONAL_MAP);
}

export function MaintenanceModule() {
  const navigate = useNavigate();
  const { subStatuses, subStatusLabels, subStatusInfo, subStatusOrder, loading: subStatusLoading } = useMaintenanceSubStatuses();
  const [forms, setForms] = useState<MaintenanceForm[]>(() => readCache<MaintenanceForm[]>(CACHE_KEY_FORMS) || []);
  const [loading, setLoading] = useState(() => !readCache<MaintenanceForm[]>(CACHE_KEY_FORMS));
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [editForm, setEditForm] = useState<MaintenanceForm | null>(null);
  const [sortKey, setSortKey] = useState<string | null>("created_date");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const [contractCompanyMap, setContractCompanyMap] = useState<Record<string, string[]>>(() => readCache<Record<string, string[]>>(CACHE_KEY_COMPANY_MAP) || {});
  const [zonalMap, setZonalMap] = useState<Record<string, string>>(() => readCache<Record<string, string>>(CACHE_KEY_ZONAL_MAP) || {});
  const [criticalityCategories, setCriticalityCategories] = useState<CriticalityCategory[]>(() => readCache<CriticalityCategory[]>(CACHE_KEY_CRITICALITY) || []);
  const [excelDialog, setExcelDialog] = useState(false);
  const [excelIncludeCriticality, setExcelIncludeCriticality] = useState(false);
  const [excelIncludeRevisado, setExcelIncludeRevisado] = useState(false);
  const hasFetchedRef = useRef(false);
  const [currentPage, setCurrentPage] = useState(0);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set()); // grupos de fusión expandidos
  const formsRef = useRef(forms);
  const [resolutionTarget, setResolutionTarget] = useState<string | null>(null);
  const [resolutionOpen, setResolutionOpen] = useState(false);
  const [otOfferTarget, setOtOfferTarget] = useState<string | null>(null);
  const [otOfferOpen, setOtOfferOpen] = useState(false);
  formsRef.current = forms;

  // Comment editing state removed — now handled by CommentCell

  // Date filter card state
  const [dateCardValue, setDateCardValue] = useState(() => format(new Date(), "yyyy-MM-dd"));

  const fetchForms = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
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
    writeCache(CACHE_KEY_FORMS, allData);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!hasFetchedRef.current) {
      hasFetchedRef.current = true;
      const cachedForms = readCache<MaintenanceForm[]>(CACHE_KEY_FORMS);
      if (!cachedForms) {
        fetchForms(true);
      }
      // If cache exists, data is already in state via useState initializer
    }
  }, [fetchForms]);

  useEffect(() => {
    const cached = readCache<CriticalityCategory[]>(CACHE_KEY_CRITICALITY);
    if (cached) return;
    const fetchCriticalities = async () => {
      const { data } = await (supabase as any)
        .from("maintenance_criticality_categories")
        .select("id, name, code, description, color")
        .eq("is_active", true)
        .order("display_order");
      if (data) {
        setCriticalityCategories(data);
        writeCache(CACHE_KEY_CRITICALITY, data);
      }
    };
    fetchCriticalities();
  }, []);

  useEffect(() => {
    const cached = readCache<Record<string, string[]>>(CACHE_KEY_COMPANY_MAP);
    if (cached) return;
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
        writeCache(CACHE_KEY_COMPANY_MAP, map);
      }
    };
    fetchCompanyMap();
  }, []);

  // Fetch zonal manager map
  useEffect(() => {
    const cached = readCache<Record<string, string>>(CACHE_KEY_ZONAL_MAP);
    if (cached) return;
    const fetchZonalMap = async () => {
      const { data } = await supabase
        .from("org_member_contracts")
        .select("contract_id, org_members!inner(name, position)")
        .returns<Array<{ contract_id: string; org_members: { name: string; position: string } }>>();
      if (data) {
        const map: Record<string, string> = {};
        data.forEach(row => {
          if (row.org_members?.position?.toLowerCase().includes("zonal")) {
            map[row.contract_id] = row.org_members.name;
          }
        });
        setZonalMap(map);
        writeCache(CACHE_KEY_ZONAL_MAP, map);
      }
    };
    fetchZonalMap();
  }, []);

  const handleDataChanged = useCallback(() => {
    invalidateCache();
    fetchForms(false);
  }, [fetchForms]);

  const updateFilter = useCallback(<K extends keyof FilterState>(key: K, value: FilterState[K]) => {
    setCurrentPage(0);
    startTransition(() => {
      setFilters(prev => ({ ...prev, [key]: value }));
    });
  }, []);

  // Search callbacks for DebouncedInput (stable refs via useCallback)
  const onSearchChange = useCallback((val: string) => {
    setCurrentPage(0);
    setFilters(prev => ({ ...prev, search: val }));
  }, []);
  const onContractSearchChange = useCallback((val: string) => {
    setCurrentPage(0);
    setFilters(prev => ({ ...prev, contractSearch: val }));
  }, []);

  const availableCompanies = useMemo(() => {
    const companies = new Set<string>();
    Object.values(contractCompanyMap).forEach(names => names.forEach(n => companies.add(n)));
    return Array.from(companies).sort();
  }, [contractCompanyMap]);

  const availableZonals = useMemo(() => {
    const zonals = new Set<string>();
    forms.forEach(f => {
      if (f.contract_id && zonalMap[f.contract_id]) {
        zonals.add(zonalMap[f.contract_id]);
      }
    });
    return Array.from(zonals).sort((a, b) => a.localeCompare(b, "es"));
  }, [forms, zonalMap]);

  const companyFilteredContractIds = useMemo(() => {
    if (filters.companyFilter === "all") return null;
    const ids = new Set<string>();
    for (const [contractId, companies] of Object.entries(contractCompanyMap)) {
      if (companies.some(c => c.toLowerCase().includes(filters.companyFilter.toLowerCase()))) {
        ids.add(contractId);
      }
    }
    return ids;
  }, [filters.companyFilter, contractCompanyMap]);

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
    if (!filters.contractSearch) return contractFilterOptions;
    const s = filters.contractSearch.toLowerCase();
    return contractFilterOptions.filter(c => c.label.toLowerCase().includes(s));
  }, [contractFilterOptions, filters.contractSearch]);

  const toggleContract = (key: string) => {
    setCurrentPage(0);
    startTransition(() => {
      setFilters(prev => ({
        ...prev,
        selectedContracts: prev.selectedContracts.includes(key)
          ? prev.selectedContracts.filter(c => c !== key)
          : [...prev.selectedContracts, key],
      }));
    });
  };

  const toggleYear = (year: number) => {
    setCurrentPage(0);
    startTransition(() => {
      setFilters(prev => ({
        ...prev,
        selectedYears: prev.selectedYears.includes(year)
          ? prev.selectedYears.filter(y => y !== year)
          : [...prev.selectedYears, year],
      }));
    });
  };

  const handleSort = useCallback((key: string) => {
    if (sortKey === key) {
      setSortOrder(o => o === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortOrder("asc");
    }
  }, [sortKey]);

  const criticalityMap = useMemo(() => {
    const map = new Map<string, CriticalityCategory>();
    criticalityCategories.forEach(c => map.set(c.id, c));
    return map;
  }, [criticalityCategories]);

  const filtered = useMemo(() => {
    const { search, statusFilter, subStatusFilter, typeFilter, criticalityFilter, selectedYears, selectedContracts, dateFilter, observationsFilter, zonalFilter } = filters;
    let result = forms.filter(f => {
      if (observationsFilter && !isResueltoObs(f)) return false;
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
      if (subStatusFilter !== "all" && f.sub_status !== subStatusFilter) return false;
      if (typeFilter !== "all" && detectMaintenanceType(f) !== typeFilter) return false;
      if (criticalityFilter !== "all") {
        if (criticalityFilter === "none") {
          if (f.criticality_category_id) return false;
        } else {
          if (f.criticality_category_id !== criticalityFilter) return false;
        }
      }
      if (dateFilter) {
        if (f.created_date !== dateFilter) return false;
      }
      if (zonalFilter !== "all") {
        const zName = f.contract_id ? zonalMap[f.contract_id] : undefined;
        if (zonalFilter === "none") {
          if (zName) return false;
        } else {
          if (zName !== zonalFilter) return false;
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
        } else if (sortKey === "zonalName") {
          valA = (a.contract_id ? zonalMap[a.contract_id] || "zzz" : "zzz").toLowerCase();
          valB = (b.contract_id ? zonalMap[b.contract_id] || "zzz" : "zzz").toLowerCase();
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
  }, [forms, filters, companyFilteredContractIds, contractFilterOptions, sortKey, sortOrder, criticalityMap, zonalMap]);

  // Agrupar forms fusionados: cada grupo es un item (el "padre" = nº más alto;
  // los demás son hijos colapsables). Singles quedan como item suelto.
  const groupedItems = useMemo(() => {
    type Item =
      | { type: "single"; form: MaintenanceForm }
      | { type: "group"; groupId: string; parent: MaintenanceForm; children: MaintenanceForm[] };
    const membersByGroup = new Map<string, MaintenanceForm[]>();
    for (const f of filtered) {
      if (f.merge_group_id) {
        if (!membersByGroup.has(f.merge_group_id)) membersByGroup.set(f.merge_group_id, []);
        membersByGroup.get(f.merge_group_id)!.push(f);
      }
    }
    const items: Item[] = [];
    const seen = new Set<string>();
    for (const f of filtered) {
      if (f.merge_group_id) {
        if (seen.has(f.merge_group_id)) continue;
        seen.add(f.merge_group_id);
        const members = membersByGroup.get(f.merge_group_id)!;
        if (members.length < 2) { items.push({ type: "single", form: members[0] }); continue; }
        const parent = members.reduce((a, b) => formNumberValue(b.form_number) > formNumberValue(a.form_number) ? b : a);
        const children = members.filter((m) => m.id !== parent.id);
        items.push({ type: "group", groupId: f.merge_group_id, parent, children });
      } else {
        items.push({ type: "single", form: f });
      }
    }
    return items;
  }, [filtered]);

  const totalForms = filtered.length;
  const totalItems = groupedItems.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages - 1);
  const paginatedItems = useMemo(() => groupedItems.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE), [groupedItems, safePage]);
  const enProceso = filtered.filter(f => f.status === "proceso").length;
  const solucionados = filtered.filter(f => f.status === "solucionado").length;

  // Date card count
  const dateCount = useMemo(() => {
    return forms.filter(f => f.created_date === dateCardValue).length;
  }, [forms, dateCardValue]);

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

  const noCriticalityCount = useMemo(() => {
    return forms.filter(f => f.status === "proceso" && !f.criticality_category_id).length;
  }, [forms]);

  const criticalityAgeRanges = useMemo(() => {
    const today = new Date();
    const ranges: Record<string, { min: number; max: number } | null> = {};

    const calcRange = (list: MaintenanceForm[]) => {
      const days = list
        .filter(f => f.created_date)
        .map(f => {
          const created = new Date(f.created_date!);
          return Math.max(1, Math.ceil((today.getTime() - created.getTime()) / (1000 * 60 * 60 * 24)));
        });
      if (days.length === 0) return null;
      return { min: Math.min(...days), max: Math.max(...days) };
    };

    criticalityCategories.forEach(c => {
      const catForms = forms.filter(f => f.status === "proceso" && f.criticality_category_id === c.id);
      ranges[c.id] = calcRange(catForms);
    });

    const noCritForms = forms.filter(f => f.status === "proceso" && !f.criticality_category_id);
    ranges["__none__"] = calcRange(noCritForms);

    return ranges;
  }, [forms, criticalityCategories]);

  const handleCriticalityCardClick = (catId: string) => {
    setCurrentPage(0);
    startTransition(() => {
      if (filters.criticalityFilter === catId) {
        setFilters(prev => ({ ...prev, statusFilter: "all", criticalityFilter: "all" }));
      } else {
        setFilters(prev => ({ ...prev, statusFilter: "proceso", criticalityFilter: catId }));
      }
    });
  };

  const handleNoCriticalityCardClick = () => {
    setCurrentPage(0);
    startTransition(() => {
      if (filters.criticalityFilter === "none") {
        setFilters(prev => ({ ...prev, statusFilter: "all", criticalityFilter: "all" }));
      } else {
        setFilters(prev => ({ ...prev, statusFilter: "proceso", criticalityFilter: "none" }));
      }
    });
  };

  const handleCriticalityChange = useCallback(async (formId: string, val: string) => {
    const newVal = val === "none" ? null : val;
    const form = formsRef.current.find(f => f.id === formId);
    const shouldAdvance = !!newVal && !!form;
    const updatePayload: any = { criticality_category_id: newVal };
    if (shouldAdvance) {
      updatePayload.sub_status = "clasificado";
      updatePayload.status = "proceso";
    }
    const { error } = await (supabase as any)
      .from("maintenance_forms")
      .update(updatePayload)
      .eq("id", formId);
    if (error) { console.error(error); return; }
    setForms(prev => {
      const updated = prev.map(fm => fm.id === formId ? { ...fm, criticality_category_id: newVal, ...(shouldAdvance ? { sub_status: "clasificado", status: "proceso" } : {}) } : fm);
      writeCache(CACHE_KEY_FORMS, updated);
      return updated;
    });
  }, []);

  // Comment save handler (called by CommentCell)
  const saveComment = useCallback(async (formId: string, text: string) => {
    const updates: any = { additional_comments: text || null, updated_at: new Date().toISOString() };
    const { error } = await (supabase as any)
      .from("maintenance_forms")
      .update(updates)
      .eq("id", formId);
    if (error) {
      console.error(error);
      toast({ title: "Error", description: "No se pudo guardar el comentario", variant: "destructive" });
    } else {
      setForms(prev => {
        const updated = prev.map(fm => fm.id === formId ? { ...fm, additional_comments: text || null } : fm);
        writeCache(CACHE_KEY_FORMS, updated);
        return updated;
      });
      toast({ title: "Comentario guardado" });
    }
  }, []);

  // Sub-status change handler (called by SubStatusCell)
  const handleSubStatusChange = useCallback(async (formId: string, newSubStatus: string) => {
    const form = formsRef.current.find(f => f.id === formId);
    // Block manual change if currently "solicitado"
    if (form && form.sub_status === "solicitado") {
      toast({ title: "Debe asignar criticidad primero", description: "El sub-estado 'Solicitado' solo cambia al asignar una clasificación de criticidad.", variant: "destructive" });
      return;
    }
    // Block going back to "solicitado"
    if (newSubStatus === "solicitado") {
      toast({ title: "No permitido", description: "No se puede volver al sub-estado 'Solicitado'.", variant: "destructive" });
      return;
    }
    // Intercept "resuelto" to open resolution dialog
    if (newSubStatus === "resuelto") {
      setResolutionTarget(formId);
      setResolutionOpen(true);
      return;
    }
    // Intercept "cotizando" to offer OT download after saving
    if (newSubStatus === "cotizando" || newSubStatus === "Cotización y aviso") {
      const updates: any = { sub_status: newSubStatus, updated_at: new Date().toISOString(), status: 'proceso' };
      const { error } = await (supabase as any)
        .from("maintenance_forms")
        .update(updates)
        .eq("id", formId);
      if (error) {
        console.error(error);
        toast({ title: "Error", description: "No se pudo actualizar el sub-estado", variant: "destructive" });
      } else {
        setForms(prev => {
          const updated = prev.map(fm => fm.id === formId ? { ...fm, ...updates } : fm);
          writeCache(CACHE_KEY_FORMS, updated);
          return updated;
        });
        toast({ title: "Sub-estado actualizado" });
        setOtOfferTarget(formId);
        setOtOfferOpen(true);
      }
      return;
    }
    const updates: any = { sub_status: newSubStatus, updated_at: new Date().toISOString() };
    updates.status = 'proceso';
    const { error } = await (supabase as any)
      .from("maintenance_forms")
      .update(updates)
      .eq("id", formId);
    if (error) {
      console.error(error);
      toast({ title: "Error", description: "No se pudo actualizar el sub-estado", variant: "destructive" });
    } else {
      setForms(prev => {
        const updated = prev.map(fm => fm.id === formId ? { ...fm, ...updates } : fm);
        writeCache(CACHE_KEY_FORMS, updated);
        return updated;
      });
      toast({ title: "Sub-estado actualizado" });
    }
  }, []);

  const handleResolve = useCallback(async (observations: string | null) => {
    if (!resolutionTarget) return;
    const updates: any = {
      sub_status: "resuelto",
      status: "solucionado",
      resolution_observations: observations,
      updated_at: new Date().toISOString(),
    };
    const { error } = await (supabase as any)
      .from("maintenance_forms")
      .update(updates)
      .eq("id", resolutionTarget);
    if (error) {
      console.error(error);
      toast({ title: "Error", description: "No se pudo marcar como resuelto", variant: "destructive" });
    } else {
      setForms(prev => {
        const updated = prev.map(fm => fm.id === resolutionTarget ? { ...fm, ...updates } : fm);
        writeCache(CACHE_KEY_FORMS, updated);
        return updated;
      });
      toast({ title: "FORM marcado como resuelto" });
    }
    setResolutionOpen(false);
    setResolutionTarget(null);
  }, [resolutionTarget]);

  const toggleGroup = (groupId: string) => setExpandedGroups(prev => {
    const n = new Set(prev); n.has(groupId) ? n.delete(groupId) : n.add(groupId); return n;
  });

  // Renderiza una fila de la tabla. opts marca si es el padre de un grupo fusionado
  // (chevron + "F" morada) o un hijo colapsado (indentado).
  const renderFormRow = (
    f: MaintenanceForm,
    opts: { groupId?: string; childCount?: number; expanded?: boolean; isChild?: boolean } = {},
  ) => {
    const cat = criticalityMap.get(f.criticality_category_id || "");
    return (
      <TableRow key={f.id} className={opts.isChild ? "bg-purple-50/40" : undefined}>
        <TableCell className="font-mono text-xs">
          {opts.groupId ? (
            <div className="flex items-center gap-1">
              <button onClick={() => toggleGroup(opts.groupId!)} className="text-purple-600 hover:text-purple-800"
                title={opts.expanded ? "Colapsar forms fusionados" : "Expandir forms fusionados"}>
                {opts.expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
              </button>
              <Badge variant="outline" className="bg-purple-100 text-purple-700 border-purple-200 text-[10px] px-1 py-0 gap-0.5" title="Forms fusionados">
                <Link2 className="h-2.5 w-2.5" />F
              </Badge>
              <span>{f.form_number}</span>
              <span className="text-[10px] text-muted-foreground">+{opts.childCount}</span>
            </div>
          ) : opts.isChild ? (
            <div className="flex items-center gap-1 pl-5 text-muted-foreground">
              <span className="text-purple-400">↳</span>
              <span>{f.form_number}</span>
            </div>
          ) : (
            f.form_number
          )}
        </TableCell>
        <TableCell>
          <Badge variant={f.status === "solucionado" ? "default" : "secondary"} className="text-xs">
            {f.status === "solucionado" ? "Solucionado" : "En Proceso"}
          </Badge>
        </TableCell>
        <TableCell>
          <SubStatusCell
            form={f}
            subStatuses={subStatuses}
            subStatusLabels={subStatusLabels}
            subStatusInfo={subStatusInfo}
            subStatusOrder={subStatusOrder}
            onSubStatusChange={handleSubStatusChange}
          />
        </TableCell>
        <TableCell>
          <CriticalityCell
            form={f}
            cat={cat}
            criticalityCategories={criticalityCategories}
            onCriticalityChange={handleCriticalityChange}
          />
        </TableCell>
        <TableCell className="text-xs">
          <div>{f.created_date ? format(new Date(f.created_date + "T12:00:00"), "dd/MM/yyyy") : "-"}</div>
          {f.created_date && (
            <div className="text-[10px] text-muted-foreground">
              {Math.floor((Date.now() - new Date(f.created_date + "T12:00:00").getTime()) / 86400000)} días
            </div>
          )}
        </TableCell>
        <TableCell className="text-xs">
          <div className="flex items-center gap-1.5">
            {f.contract_id && contractCompanyMap[f.contract_id] && (
              <CompanyLogo companyNames={contractCompanyMap[f.contract_id]} size="sm" className="h-4 w-4 shrink-0" />
            )}
            <span className="truncate">{f.contract_name || "-"}</span>
          </div>
        </TableCell>
        <TableCell className="text-xs truncate max-w-36">
          {f.contract_id && zonalMap[f.contract_id] ? zonalMap[f.contract_id] : <span className="text-muted-foreground">—</span>}
        </TableCell>
        <TableCell><Badge variant="outline" className="text-xs">{detectMaintenanceType(f)}</Badge></TableCell>
        <TableCell className="text-xs max-w-48">
          <Popover>
            <PopoverTrigger asChild>
              <button className="truncate block max-w-48 text-left hover:text-primary transition-colors cursor-pointer">
                {f.general_description || f.electrical_description || f.civil_description || f.hvac_description || f.fixed_assets_description || "-"}
              </button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-80 max-h-64 overflow-y-auto p-3 space-y-2">
              {[
                { label: "Descripción General", value: f.general_description },
                { label: "Req. Eléctrico", value: f.electrical_description },
                { label: "Req. Obra Civil", value: f.civil_description },
                { label: "Req. Climatización", value: f.hvac_description },
                { label: "Req. Activos Fijos", value: f.fixed_assets_description },
              ].filter(d => d.value?.trim()).map((d, i) => (
                <div key={i}>
                  <p className="text-xs font-semibold text-muted-foreground">{d.label}</p>
                  <p className="text-sm whitespace-pre-wrap">{d.value}</p>
                </div>
              ))}
            </PopoverContent>
          </Popover>
        </TableCell>
        <TableCell className="text-xs max-w-32">
          <CommentCell form={f} onSave={saveComment} />
        </TableCell>
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
          {(() => {
            const links = f.evidence_links ?? [];
            if (links.length === 0) return "-";
            const provTag = "[Evidencia Visita] ";
            const provider = links.filter((l) => l.startsWith(provTag)).map((l) => l.slice(provTag.length).trim());
            const normal = links.filter((l) => !l.startsWith(provTag));
            return (
              <div className="flex flex-col gap-0.5">
                {normal.map((link, idx) => (
                  <button key={`n${idx}`} type="button" onClick={async () => { const u = await resolveFileUrl(link); if (u) window.open(u, "_blank", "noopener,noreferrer"); }} className="text-primary hover:underline flex items-center gap-1 text-left">
                    <Link className="h-3 w-3" />Evidencia {idx + 1}
                  </button>
                ))}
                {provider.map((url, idx) => (
                  <button key={`p${idx}`} type="button" onClick={async () => { const u = await resolveFileUrl(url); if (u) window.open(u, "_blank", "noopener,noreferrer"); }} className="text-purple-600 hover:underline flex items-center gap-1 text-left" title="Evidencia del proveedor">
                    <Link className="h-3 w-3" />Evid. Prov {idx + 1}
                  </button>
                ))}
              </div>
            );
          })()}
        </TableCell>
        <TableCell>
          <div className="flex items-center justify-center gap-1">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditForm(f)} title="Editar">
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => {
              const critName = cat?.name;
              if (f.sub_status === "resuelto") {
                exportMergedFormAndOT(f, f.contract_id ? (contractCompanyMap[f.contract_id] || []).join(", ") : undefined, critName);
              } else {
                exportMaintenancePDF(f, f.contract_id ? (contractCompanyMap[f.contract_id] || []).join(", ") : undefined, critName);
              }
            }} title={f.sub_status === "resuelto" ? "Descargar FORM + OT" : "Descargar PDF"}>
              <FileDown className="h-3.5 w-3.5" />
            </Button>
            {(f.sub_status === "cotizando" || f.sub_status === "Cotización y aviso" || f.sub_status === "en_ejecucion" || f.sub_status === "resuelto" || f.sub_status === "resuelto_obs") && (
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => exportOTPDF(f, contractCompanyMap)} title="Descargar OT">
                <FileText className="h-3.5 w-3.5 text-destructive" />
              </Button>
            )}
          </div>
        </TableCell>
      </TableRow>
    );
  };

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total FORMs</CardTitle>
            <ClipboardList className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{totalForms}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Solucionados</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold text-green-600">{solucionados}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">En Proceso</CardTitle>
            <Clock className="h-4 w-4 text-yellow-600" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold text-yellow-600">{enProceso}</div></CardContent>
        </Card>
        <Card
          className={`cursor-pointer transition-all hover:shadow-md ${filters.dateFilter ? "ring-2 ring-primary ring-offset-1" : ""}`}
          onClick={() => {
            if (filters.dateFilter) {
              updateFilter("dateFilter", null);
            } else {
              updateFilter("dateFilter", dateCardValue);
            }
          }}
        >
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Fecha Específica</CardTitle>
            <CalendarDays className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <div className="text-2xl font-bold text-primary">{dateCount}</div>
              <Input
                type="date"
                value={dateCardValue}
                onChange={e => {
                  e.stopPropagation();
                  const newDate = e.target.value;
                  setDateCardValue(newDate);
                  updateFilter("dateFilter", newDate);
                }}
                onClick={e => e.stopPropagation()}
                className="h-7 text-xs w-auto"
              />
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0"
                title="Descargar PDF del día"
                disabled={dateCount === 0}
                onClick={e => {
                  e.stopPropagation();
                  const dateForms = forms.filter(f => f.created_date === dateCardValue);
                  const critMap = new Map<string, string>();
                  criticalityCategories.forEach(c => critMap.set(c.id, c.name));
                  const zMap = new Map<string, string>(Object.entries(zonalMap));
                  exportDailyFormsPDF(dateForms, dateCardValue, critMap, subStatusLabels, zMap);
                }}
              >
                <FileDown className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
        <Card
          className={`cursor-pointer transition-all hover:shadow-md ${filters.observationsFilter ? "ring-2 ring-blue-500 ring-offset-1" : ""}`}
          onClick={() => {
            setCurrentPage(0);
            startTransition(() => {
              setFilters(prev => ({ ...prev, observationsFilter: !prev.observationsFilter }));
            });
          }}
        >
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Resuelto Con Observaciones</CardTitle>
            <MessageSquare className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">
              {forms.filter(isResueltoObs).length}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Criticality Quick-Filter Cards */}
      {criticalityCategories.length > 0 && (
        <div className="flex gap-2 overflow-x-auto">
          {criticalityCategories
            .filter(cat => (criticalityCounts[cat.id] || 0) > 0)
            .map(cat => {
            const isActive = filters.criticalityFilter === cat.id;
            const ageRange = criticalityAgeRanges[cat.id];
            return (
              <Card
                key={cat.id}
                className={`cursor-pointer transition-all flex-1 min-w-0`}
                style={{
                  borderWidth: isActive ? 3 : undefined,
                  borderColor: isActive ? (cat.color || "hsl(var(--primary))") : undefined,
                  borderLeftWidth: isActive ? 5 : 4,
                  borderLeftColor: cat.color || "hsl(var(--border))",
                  ...(isActive
                    ? { background: `${cat.color}10` }
                    : { boxShadow: `0 1px 3px 0 ${cat.color}30, 0 1px 2px -1px ${cat.color}20` }),
                }}
                onClick={() => handleCriticalityCardClick(cat.id)}
              >
                <CardContent className="p-3 flex items-center justify-between">
                  <div className="flex flex-col gap-0.5">
                    <div className="flex items-center gap-2">
                      <Shield className="h-4 w-4" style={{ color: cat.color || undefined }} />
                      <span className="text-sm font-medium">{cat.name}</span>
                    </div>
                    {ageRange && (
                      <span className="text-[10px] text-muted-foreground ml-6">
                        {ageRange.min === ageRange.max
                          ? `${ageRange.min} día${ageRange.min !== 1 ? "s" : ""}`
                          : `${ageRange.min} - ${ageRange.max} días`}
                      </span>
                    )}
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
          {/* Sin Criticidad card */}
          {noCriticalityCount > 0 && (() => {
            const isActive = filters.criticalityFilter === "none";
            const ageRange = criticalityAgeRanges["__none__"];
            return (
              <Card
                className={`cursor-pointer transition-all flex-1 min-w-0`}
                style={{
                  borderWidth: isActive ? 3 : undefined,
                  borderColor: isActive ? '#f59e0b' : undefined,
                  borderLeftWidth: isActive ? 5 : 4,
                  borderLeftColor: '#f59e0b',
                  ...(isActive
                    ? { background: '#f59e0b10' }
                    : { boxShadow: '0 1px 3px 0 #f59e0b30, 0 1px 2px -1px #f59e0b20' }),
                }}
                onClick={handleNoCriticalityCardClick}
              >
                <CardContent className="p-3 flex items-center justify-between">
                  <div className="flex flex-col gap-0.5">
                    <div className="flex items-center gap-2">
                      <XCircle className="h-4 w-4 text-amber-500" />
                      <span className="text-sm font-medium">Sin Criticidad</span>
                    </div>
                    {ageRange && (
                      <span className="text-[10px] text-muted-foreground ml-6">
                        {ageRange.min === ageRange.max
                          ? `${ageRange.min} día${ageRange.min !== 1 ? "s" : ""}`
                          : `${ageRange.min} - ${ageRange.max} días`}
                      </span>
                    )}
                  </div>
                  <Badge className="text-xs bg-amber-500 text-white hover:bg-amber-600">
                    {noCriticalityCount}
                  </Badge>
                </CardContent>
              </Card>
            );
          })()}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-48 space-y-1">
          <Label className="text-xs text-muted-foreground">Buscar</Label>
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <DebouncedInput placeholder="N° FORM, contrato, descripción..." value={filters.search} onChange={onSearchChange} className="pl-8" />
          </div>
        </div>
        <div>
          <Label className="text-xs text-muted-foreground block mb-1">Año</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="w-40 justify-start gap-2">
                <CalendarDays className="h-4 w-4" />
                {filters.selectedYears.length === 0 ? "Todos" : [...filters.selectedYears].sort((a,b) => b-a).join(", ")}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-48 p-2">
              <div className="space-y-1">
                {availableYears.map(year => (
                  <label key={year} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-accent cursor-pointer text-sm">
                    <Checkbox
                      checked={filters.selectedYears.includes(year)}
                      onCheckedChange={() => toggleYear(year)}
                    />
                    {year}
                  </label>
                ))}
                {filters.selectedYears.length > 0 && (
                  <Button variant="ghost" size="sm" className="w-full mt-1 text-xs" onClick={() => updateFilter("selectedYears", [])}>
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
                <span className="truncate">{filters.selectedContracts.length === 0 ? "Todos" : `${filters.selectedContracts.length} seleccionados`}</span>
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-2">
              <div className="space-y-2">
                <div className="relative">
                  <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                  <DebouncedInput
                    placeholder="Buscar contrato..."
                    value={filters.contractSearch}
                    onChange={onContractSearchChange}
                    className="pl-7 h-8 text-sm"
                  />
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="sm" className="text-xs h-6 px-2" onClick={() => updateFilter("selectedContracts", filteredContractOptions.map(o => o.key))}>
                    Todos
                  </Button>
                  <Button variant="ghost" size="sm" className="text-xs h-6 px-2" onClick={() => updateFilter("selectedContracts", [])}>
                    Ninguno
                  </Button>
                </div>
                <div className="max-h-48 overflow-y-auto space-y-0.5">
                  {filteredContractOptions.map(opt => (
                      <label key={opt.key} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-accent cursor-pointer text-sm">
                        <Checkbox
                          checked={filters.selectedContracts.includes(opt.key)}
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
          <Select value={filters.companyFilter} onValueChange={v => updateFilter("companyFilter", v)}>
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
          <Select value={filters.statusFilter} onValueChange={v => updateFilter("statusFilter", v)}>
            <SelectTrigger className="w-40"><SelectValue placeholder="Estado" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="proceso">En Proceso</SelectItem>
              <SelectItem value="solucionado">Solucionado</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs text-muted-foreground">Sub Estado</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="w-40 justify-between text-sm font-normal">
                {filters.subStatusFilter === "all" ? "Todos" : (subStatusLabels[filters.subStatusFilter.toLowerCase()] || filters.subStatusFilter)}
                <svg className="h-4 w-4 opacity-50 shrink-0" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-52 p-1" align="start">
              <TooltipProvider delayDuration={100}>
                <div className="flex flex-col gap-0.5 max-h-64 overflow-y-auto">
                  <Button
                    variant={filters.subStatusFilter === "all" ? "secondary" : "ghost"}
                    size="sm"
                    className="justify-start text-sm h-8"
                    onClick={() => updateFilter("subStatusFilter", "all")}
                  >
                    Todos
                  </Button>
                  {subStatusOrder.map(s => {
                    const info = subStatusInfo[s.toLowerCase()];
                    const hasDetail = info?.description || info?.responsible;
                    const btn = (
                      <Button
                        key={s}
                        variant={filters.subStatusFilter === s ? "secondary" : "ghost"}
                        size="sm"
                        className="justify-start text-sm h-8 w-full"
                        onClick={() => updateFilter("subStatusFilter", s)}
                      >
                        {subStatusLabels[s.toLowerCase()] || s}
                      </Button>
                    );
                    if (!hasDetail) return btn;
                    return (
                      <Tooltip key={s}>
                        <TooltipTrigger asChild>{btn}</TooltipTrigger>
                        <TooltipContent side="right" className="max-w-xs text-xs space-y-1">
                          {info.description && <p>{info.description}</p>}
                          {info.responsible && <p className="italic">Resp: {info.responsible}</p>}
                        </TooltipContent>
                      </Tooltip>
                    );
                  })}
                </div>
              </TooltipProvider>
            </PopoverContent>
          </Popover>
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Tipo</Label>
          <Select value={filters.typeFilter} onValueChange={v => updateFilter("typeFilter", v)}>
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
          <Select value={filters.criticalityFilter} onValueChange={v => updateFilter("criticalityFilter", v)}>
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
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Gerente Zonal</Label>
          <Select value={filters.zonalFilter} onValueChange={v => updateFilter("zonalFilter", v)}>
            <SelectTrigger className="w-44"><SelectValue placeholder="Gerente Zonal" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="none">Sin asignar</SelectItem>
              {availableZonals.map(z => (
                <SelectItem key={z} value={z}>{z}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button onClick={() => setUploadOpen(true)} className="gap-2">
          <Upload className="h-4 w-4" /> Cargar Excel
        </Button>
        <Button variant="outline" onClick={() => setExcelDialog(true)} disabled={filtered.length === 0} className="gap-2">
          <Download className="h-4 w-4" /> Descargar Excel
        </Button>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="gap-2">
              <FileText className="h-4 w-4" /> Descargar OT
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-48 p-2" align="start">
            <div className="flex flex-col gap-1">
              <Button variant="ghost" size="sm" className="justify-start text-sm" onClick={() => downloadBlankOTPDF()}>
                OT en blanco (PDF)
              </Button>
              <Button variant="ghost" size="sm" className="justify-start text-sm" onClick={() => downloadBlankOTExcel()}>
                OT en blanco (Excel)
              </Button>
            </div>
          </PopoverContent>
        </Popover>
        <Button
          variant="outline"
          className="gap-2"
          disabled={filtered.length === 0}
          onClick={() => {
            const critMap = new Map<string, string>();
            criticalityCategories.forEach(c => critMap.set(c.id, c.name));
            const zMap = new Map<string, string>(Object.entries(zonalMap));
            const label = filters.zonalFilter !== "all"
              ? (filters.zonalFilter === "none" ? "Sin Zonal" : filters.zonalFilter)
              : "Todos";
            exportDailyFormsPDF(filtered, `Filtro: ${label}`, critMap, subStatusLabels, zMap);
          }}
        >
          <FileDown className="h-4 w-4" /> Descargar PDF
        </Button>
        {JSON.stringify(filters) !== JSON.stringify(DEFAULT_FILTERS) && (
          <Button
            variant="outline"
            className="gap-2 text-destructive border-destructive/30 hover:bg-destructive/10"
            onClick={() => {
              setCurrentPage(0);
              setFilters(DEFAULT_FILTERS);
            }}
          >
            <XCircle className="h-4 w-4" /> Limpiar filtros
          </Button>
        )}
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-auto">
            <TooltipProvider delayDuration={100}>
              <Table>
                <TableHeader>
                  <TableRow>
                    <SortableTableHead label="N° FORM" sortKey="form_number" currentSortKey={sortKey} currentSortOrder={sortOrder} onSort={handleSort} className="w-24" />
                    <SortableTableHead label="Estado" sortKey="status" currentSortKey={sortKey} currentSortOrder={sortOrder} onSort={handleSort} className="w-28" />
                    <SortableTableHead label="Sub Estado" sortKey="sub_status" currentSortKey={sortKey} currentSortOrder={sortOrder} onSort={handleSort} className="w-32" />
                    <SortableTableHead label="Criticidad" sortKey="criticality_category_id" currentSortKey={sortKey} currentSortOrder={sortOrder} onSort={handleSort} className="w-36" />
                    <SortableTableHead label="Fecha" sortKey="created_date" currentSortKey={sortKey} currentSortOrder={sortOrder} onSort={handleSort} className="w-[8.4rem]" />
                    <SortableTableHead label="Contrato" sortKey="contract_name" currentSortKey={sortKey} currentSortOrder={sortOrder} onSort={handleSort} className="max-w-[10rem]" />
                    <SortableTableHead label="Gerente Zonal" sortKey="zonalName" currentSortKey={sortKey} currentSortOrder={sortOrder} onSort={handleSort} className="w-36" />
                    <TableHead className="w-28">Tipo</TableHead>
                    <TableHead>Descripción</TableHead>
                    <TableHead>Comentarios / Observaciones</TableHead>
                    <SortableTableHead label="Proveedor" sortKey="supplier_name" currentSortKey={sortKey} currentSortOrder={sortOrder} onSort={handleSort} className="w-32" />
                    <SortableTableHead label="OC" sortKey="purchase_order_number" currentSortKey={sortKey} currentSortOrder={sortOrder} onSort={handleSort} className="w-32" />
                    <TableHead className="w-28">Evidencia</TableHead>
                    <TableHead className="w-32 text-center">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow><TableCell colSpan={14} className="text-center py-8 text-muted-foreground">Cargando...</TableCell></TableRow>
                  ) : filtered.length === 0 ? (
                    <TableRow><TableCell colSpan={14} className="text-center py-8 text-muted-foreground">No hay FORMs registrados</TableCell></TableRow>
                  ) : (
                    paginatedItems.map((item) => {
                      if (item.type === "single") return renderFormRow(item.form);
                      const expanded = expandedGroups.has(item.groupId);
                      return (
                        <Fragment key={item.groupId}>
                          {renderFormRow(item.parent, { groupId: item.groupId, childCount: item.children.length, expanded })}
                          {expanded && item.children.map((c) => renderFormRow(c, { isChild: true }))}
                        </Fragment>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </TooltipProvider>
          </div>
        </CardContent>
      </Card>

      {/* Pagination Controls */}
      {totalItems > PAGE_SIZE && (
        <div className="flex items-center justify-between px-2">
          <p className="text-sm text-muted-foreground">
            Mostrando {safePage * PAGE_SIZE + 1}–{Math.min((safePage + 1) * PAGE_SIZE, totalItems)} de {totalItems} filas ({totalForms} forms)
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-1"
              disabled={safePage === 0}
              onClick={() => setCurrentPage(p => Math.max(0, p - 1))}
            >
              <ChevronLeft className="h-4 w-4" /> Anterior
            </Button>
            <span className="text-sm text-muted-foreground">
              Página {safePage + 1} de {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              className="gap-1"
              disabled={safePage >= totalPages - 1}
              onClick={() => setCurrentPage(p => Math.min(totalPages - 1, p + 1))}
            >
              Siguiente <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      <MaintenanceExcelUpload open={uploadOpen} onOpenChange={setUploadOpen} onSuccess={handleDataChanged} />
      <MaintenanceEditDialog form={editForm} open={!!editForm} onOpenChange={v => { if (!v) setEditForm(null); }} onSuccess={handleDataChanged} />
      <ResolutionDialog
        open={resolutionOpen}
        onOpenChange={v => { if (!v) { setResolutionOpen(false); setResolutionTarget(null); } }}
        existingObservations={formsRef.current.find(f => f.id === resolutionTarget)?.resolution_observations ?? null}
        onResolve={handleResolve}
        formId={resolutionTarget}
        formNumber={formsRef.current.find(f => f.id === resolutionTarget)?.form_number || ""}
        onOTUploaded={handleDataChanged}
      />
      <OTDownloadOfferDialog
        open={otOfferOpen}
        onOpenChange={v => { if (!v) { setOtOfferOpen(false); setOtOfferTarget(null); } }}
        onDownload={() => {
          const form = formsRef.current.find(f => f.id === otOfferTarget);
          if (form) exportOTPDF(form, contractCompanyMap);
          setOtOfferOpen(false);
          setOtOfferTarget(null);
        }}
        onSkip={() => {
          setOtOfferOpen(false);
          setOtOfferTarget(null);
        }}
      />

      {/* Excel download dialog with checkboxes */}
      {/* Excel download dialog */}
      {excelDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setExcelDialog(false)}>
          <div className="bg-popover border rounded-lg shadow-lg p-6 w-full max-w-md space-y-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold">Descargar Excel</h3>
            <p className="text-sm text-muted-foreground">Seleccione las opciones para la descarga.</p>
            <div className="space-y-3 py-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox checked={excelIncludeCriticality} onCheckedChange={v => setExcelIncludeCriticality(!!v)} />
                <span className="text-sm">Incluir columna de Criticidad</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox checked={excelIncludeRevisado} onCheckedChange={v => setExcelIncludeRevisado(!!v)} />
                <span className="text-sm">Incluir sub-estado Revisado</span>
              </label>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setExcelDialog(false)}>Cancelar</Button>
              <Button onClick={() => {
                const critMap = excelIncludeCriticality ? new Map<string, string>() : undefined;
                if (critMap) criticalityCategories.forEach(c => critMap.set(c.id, c.name));
                exportMaintenanceExcel(filtered, "mantenciones.xlsx", critMap, excelIncludeRevisado || undefined, subStatusLabels);
                setExcelDialog(false);
                setExcelIncludeCriticality(false);
                setExcelIncludeRevisado(false);
              }}>Descargar</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
