import React, { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Pencil, Trash2, Search, Building2, Download, FileSpreadsheet, ShoppingCart, Loader2, ExternalLink, ChevronDown, X, Check } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Supplier } from "./types";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import * as XLSX from "xlsx";

// ── Multi-select filter with searchable popover ────────────────────────────
interface FilterOption { value: string; label: string }

function MultiSelectFilter({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: FilterOption[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
}) {
  const [open, setOpen] = useState(false);

  const toggle = (value: string) => {
    const next = new Set(selected);
    if (next.has(value)) next.delete(value); else next.add(value);
    onChange(next);
  };

  const clear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(new Set());
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-9 gap-1.5 min-w-[140px] max-w-[220px] justify-between">
          <span className="truncate text-left">
            {selected.size === 0
              ? label
              : selected.size === 1
                ? [...selected][0]
                : `${label}: ${selected.size} seleccionados`}
          </span>
          <div className="flex items-center gap-0.5 shrink-0">
            {selected.size > 0 && (
              <span onClick={clear} className="h-4 w-4 rounded-full bg-muted-foreground/20 hover:bg-muted-foreground/40 flex items-center justify-center cursor-pointer">
                <X className="h-2.5 w-2.5" />
              </span>
            )}
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          </div>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0 z-[1200]" align="start">
        <Command>
          <CommandInput placeholder={`Buscar ${label.toLowerCase()}…`} />
          <CommandList>
            <CommandEmpty>Sin resultados</CommandEmpty>
            <CommandGroup>
              {options.map(opt => (
                <CommandItem key={opt.value} value={opt.label} onSelect={() => toggle(opt.value)}>
                  <div className={`mr-2 h-4 w-4 rounded border flex items-center justify-center shrink-0 ${selected.has(opt.value) ? "bg-primary border-primary" : "border-input"}`}>
                    {selected.has(opt.value) && <Check className="h-3 w-3 text-primary-foreground" />}
                  </div>
                  {opt.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

interface SuppliersListProps {
  onEdit: (supplier: Supplier) => void;
  refreshKey: number;
}

interface InfluenceZone { region: string; commune: string | null }

interface SupplierWithEmails extends Omit<Supplier, 'emails'> {
  emails?: { email: string; is_primary: boolean }[];
  influence_zones?: InfluenceZone[];
  category_assignments?: { category: { id: string; name: string } }[];
}

export const SuppliersList = ({ onEdit, refreshKey }: SuppliersListProps) => {
  const navigate = useNavigate();
  const [suppliers, setSuppliers] = useState<SupplierWithEmails[]>([]);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedRubros, setSelectedRubros] = useState<Set<string>>(new Set());
  const [selectedZonas, setSelectedZonas] = useState<Set<string>>(new Set());
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [expandedOCSupplier, setExpandedOCSupplier] = useState<string | null>(null);
  const [supplierOCs, setSupplierOCs] = useState<any[]>([]);
  const [loadingOCs, setLoadingOCs] = useState(false);

  const toggleSupplierOCs = async (supplierId: string) => {
    if (expandedOCSupplier === supplierId) {
      setExpandedOCSupplier(null);
      return;
    }
    setExpandedOCSupplier(supplierId);
    setLoadingOCs(true);
    try {
      const { data } = await supabase
        .from("purchase_orders")
        .select("id, order_number, order_date, amount_uf, contract:contracts(name)")
        .eq("supplier_id", supplierId)
        .is("deleted_at", null)
        .order("order_date", { ascending: false });
      setSupplierOCs(data || []);
    } catch {
      setSupplierOCs([]);
    } finally {
      setLoadingOCs(false);
    }
  };

  useEffect(() => {
    loadSuppliers();
    loadCategories();
  }, [refreshKey]);

  const loadCategories = async () => {
    const { data } = await supabase
      .from("supplier_categories")
      .select("id, name")
      .eq("is_active", true)
      .order("name");
    setCategories(data || []);
  };

  const loadSuppliers = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("suppliers")
        .select(`
          *,
          category:supplier_categories(id, name),
          category_assignments:supplier_category_assignments(
            category:supplier_categories(id, name)
          ),
          emails:supplier_emails(email, is_primary),
          influence_zones:supplier_influence_zones(region, commune)
        `)
        .order("name");

      if (error) throw error;
      setSuppliers((data || []) as unknown as SupplierWithEmails[]);
      setSelectedIds(new Set());
    } catch (error) {
      console.error("Error loading suppliers:", error);
      toast.error("Error al cargar proveedores");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      const { error } = await supabase
        .from("suppliers")
        .delete()
        .eq("id", deleteId);
      if (error) throw error;
      toast.success("Proveedor eliminado");
      loadSuppliers();
    } catch (error) {
      console.error("Error deleting supplier:", error);
      toast.error("Error al eliminar proveedor");
    } finally {
      setDeleteId(null);
    }
  };

  // ── Derive unique zones from all loaded suppliers ──────────────────────────
  const zonaOptions: FilterOption[] = useMemo(() => {
    const seen = new Set<string>();
    const opts: FilterOption[] = [];
    for (const s of suppliers) {
      for (const z of s.influence_zones || []) {
        // Use commune if available, otherwise region
        const label = (z.commune || z.region || "").trim();
        if (label && !seen.has(label)) {
          seen.add(label);
          opts.push({ value: label, label });
        }
      }
    }
    return opts.sort((a, b) => a.label.localeCompare(b.label, "es"));
  }, [suppliers]);

  const rubroOptions: FilterOption[] = useMemo(
    () => categories.map(c => ({ value: c.id, label: c.name })),
    [categories]
  );

  // ── Apply all active filters ────────────────────────────────────────────────
  const filteredSuppliers: SupplierWithEmails[] = useMemo(() => {
    const q = search.toLowerCase();
    return suppliers.filter(s => {
      // Text search
      if (q && !(
        s.name.toLowerCase().includes(q) ||
        (s.rut?.toLowerCase().includes(q)) ||
        (s.category?.name?.toLowerCase().includes(q))
      )) return false;
      // Rubro filter — checks all assigned categories (multi-rubro)
      if (selectedRubros.size > 0) {
        const assignedIds = (s.category_assignments || []).map(a => a.category?.id).filter(Boolean);
        // Fallback to single category_id for suppliers without junction data yet
        if (assignedIds.length === 0 && s.category_id) assignedIds.push(s.category_id);
        if (!assignedIds.some(id => selectedRubros.has(id!))) return false;
      }
      // Zona de influencia filter (at least one zone matches)
      if (selectedZonas.size > 0) {
        const supplierZones = (s.influence_zones || []).map(
          z => (z.commune || z.region || "").trim()
        );
        if (!supplierZones.some(z => selectedZonas.has(z))) return false;
      }
      return true;
    });
  }, [suppliers, search, selectedRubros, selectedZonas]);

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredSuppliers.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredSuppliers.map(s => s.id)));
    }
  };

  const exportToExcel = (suppliersToExport: SupplierWithEmails[]) => {
    if (suppliersToExport.length === 0) {
      toast.error("No hay proveedores para exportar");
      return;
    }

    const data = suppliersToExport.map(s => ({
      "Nombre": s.name,
      "RUT": s.rut || "",
      "Rubro": s.category?.name || "",
      "Tipo": s.is_generic ? "Genérico" : "Específico",
      "Contacto": s.contact_name || "",
      "Teléfono": s.phone || "",
      "Email Principal": (s as any).emails?.find((e: any) => e.is_primary)?.email || 
                         (s as any).emails?.[0]?.email || "",
      "Otros Emails": (s as any).emails?.filter((e: any) => !e.is_primary).map((e: any) => e.email).join(", ") || "",
      "Calle": s.street || "",
      "Número": s.street_number || "",
      "Comuna": s.commune || "",
      "Banco": s.bank_name || "",
      "Tipo Cuenta": s.bank_account_type || "",
      "N° Cuenta": s.bank_account_number || "",
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Proveedores");

    // Auto-width columns
    const colWidths = Object.keys(data[0] || {}).map(key => ({
      wch: Math.max(key.length, ...data.map(row => String((row as any)[key] || "").length)) + 2
    }));
    ws["!cols"] = colWidths;

    const fileName = suppliersToExport.length === 1 
      ? `Proveedor_${suppliersToExport[0].name.replace(/[^a-zA-Z0-9]/g, "_")}.xlsx`
      : `Proveedores_${new Date().toISOString().split("T")[0]}.xlsx`;

    XLSX.writeFile(wb, fileName);
    toast.success(`${suppliersToExport.length} proveedor(es) exportado(s)`);
  };

  const exportSelected = () => {
    const selected = suppliers.filter(s => selectedIds.has(s.id));
    exportToExcel(selected);
  };

  const exportSingle = (supplier: SupplierWithEmails) => {
    exportToExcel([supplier]);
  };

  const handleEdit = (supplier: SupplierWithEmails) => {
    // Convert back to Supplier type for edit handler
    onEdit(supplier as unknown as Supplier);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Search + filters bar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar proveedor..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 h-9"
          />
        </div>

        <MultiSelectFilter
          label="Rubro"
          options={rubroOptions}
          selected={selectedRubros}
          onChange={setSelectedRubros}
        />

        <MultiSelectFilter
          label="Zona de influencia"
          options={zonaOptions}
          selected={selectedZonas}
          onChange={setSelectedZonas}
        />

        {/* Active filter badges */}
        {(selectedRubros.size > 0 || selectedZonas.size > 0) && (
          <Button
            variant="ghost"
            size="sm"
            className="h-9 text-muted-foreground gap-1"
            onClick={() => { setSelectedRubros(new Set()); setSelectedZonas(new Set()); }}
          >
            <X className="h-3.5 w-3.5" />
            Limpiar filtros
          </Button>
        )}

        <div className="ml-auto flex items-center gap-2">
          {selectedIds.size > 0 ? (
            <Button onClick={exportSelected} variant="outline" size="sm" className="gap-2 h-9">
              <FileSpreadsheet className="h-4 w-4" />
              Exportar ({selectedIds.size})
            </Button>
          ) : filteredSuppliers.length > 0 ? (
            <Button onClick={() => exportToExcel(filteredSuppliers)} variant="outline" size="sm" className="gap-2 h-9">
              <Download className="h-4 w-4" />
              Exportar {selectedRubros.size > 0 || selectedZonas.size > 0 || search ? `(${filteredSuppliers.length})` : "todos"}
            </Button>
          ) : null}
        </div>
      </div>

      {/* Active filter summary */}
      {(selectedRubros.size > 0 || selectedZonas.size > 0) && (
        <div className="flex flex-wrap gap-1.5 text-xs text-muted-foreground">
          <span>Filtrando por:</span>
          {[...selectedRubros].map(id => {
            const name = categories.find(c => c.id === id)?.name || id;
            return (
              <span key={id} className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary px-2 py-0.5">
                {name}
                <X className="h-3 w-3 cursor-pointer" onClick={() => setSelectedRubros(p => { const n = new Set(p); n.delete(id); return n; })} />
              </span>
            );
          })}
          {[...selectedZonas].map(z => (
            <span key={z} className="inline-flex items-center gap-1 rounded-full bg-blue-100 text-blue-700 px-2 py-0.5">
              {z}
              <X className="h-3 w-3 cursor-pointer" onClick={() => setSelectedZonas(p => { const n = new Set(p); n.delete(z); return n; })} />
            </span>
          ))}
          <span className="ml-1">— {filteredSuppliers.length} proveedor(es)</span>
        </div>
      )}

      {filteredSuppliers.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <Building2 className="h-12 w-12 mx-auto mb-2 opacity-50" />
          <p>No hay proveedores registrados</p>
        </div>
      ) : (
        <div className="border rounded-md">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[40px]">
                  <Checkbox
                    checked={selectedIds.size === filteredSuppliers.length && filteredSuppliers.length > 0}
                    onCheckedChange={toggleSelectAll}
                  />
                </TableHead>
                <TableHead>Nombre</TableHead>
                <TableHead>RUT</TableHead>
                <TableHead>Rubro</TableHead>
                <TableHead>Contacto</TableHead>
                <TableHead className="text-center">Tipo</TableHead>
                <TableHead className="w-[120px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredSuppliers.map(supplier => (
                <React.Fragment key={supplier.id}>
                <TableRow className={selectedIds.has(supplier.id) ? "bg-muted/50" : ""}>
                  <TableCell>
                    <Checkbox
                      checked={selectedIds.has(supplier.id)}
                      onCheckedChange={() => toggleSelect(supplier.id)}
                    />
                  </TableCell>
                  <TableCell className="font-medium">{supplier.name}</TableCell>
                  <TableCell className="text-muted-foreground">{supplier.rut || "-"}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {(supplier.category_assignments && supplier.category_assignments.length > 0
                        ? supplier.category_assignments
                        : supplier.category ? [{ category: supplier.category }] : []
                      ).map((a, i) => (
                        a.category?.name && (
                          <Badge key={i} variant="outline" className="text-xs">
                            {a.category.name}
                          </Badge>
                        )
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>{supplier.contact_name || "-"}</TableCell>
                  <TableCell className="text-center">
                    {supplier.is_generic ? (
                      <Badge variant="secondary">Genérico</Badge>
                    ) : (
                      <Badge variant="outline">Específico</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => toggleSupplierOCs(supplier.id)}
                        title="Ver OC asociadas"
                        className={expandedOCSupplier === supplier.id ? "text-primary" : ""}
                      >
                        <ShoppingCart className="h-4 w-4" />
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button size="icon" variant="ghost" title="Exportar">
                            <Download className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => exportSingle(supplier)}>
                            <FileSpreadsheet className="h-4 w-4 mr-2" />
                            Exportar a Excel
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => handleEdit(supplier)}
                        title="Editar"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => setDeleteId(supplier.id)}
                        title="Eliminar"
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
                {expandedOCSupplier === supplier.id && (
                  <TableRow>
                    <TableCell colSpan={7} className="bg-muted/30 p-0">
                      <div className="px-6 py-3">
                        {loadingOCs ? (
                          <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Cargando OC...
                          </div>
                        ) : supplierOCs.length === 0 ? (
                          <p className="text-sm text-muted-foreground py-2">Sin órdenes de compra asociadas</p>
                        ) : (
                          <div className="space-y-1">
                            <p className="text-xs font-medium text-muted-foreground mb-2">
                              {supplierOCs.length} OC asociada(s)
                            </p>
                            {supplierOCs.map(oc => (
                              <div key={oc.id} className="flex items-center justify-between text-sm py-1 border-b border-border/50 last:border-0">
                                <div className="flex items-center gap-3">
                                  <span className="font-medium">OC #{oc.order_number}</span>
                                  <span className="text-muted-foreground">
                                    {oc.order_date ? format(new Date(oc.order_date), "dd MMM yyyy", { locale: es }) : "-"}
                                  </span>
                                  {oc.contract?.name && (
                                    <Badge variant="outline" className="text-xs">{oc.contract.name}</Badge>
                                  )}
                                </div>
                                <span className="font-medium">{oc.amount_uf?.toFixed(2)} UF</span>
                              </div>
                            ))}
                            <Button
                              variant="link"
                              size="sm"
                              className="mt-1 px-0"
                              onClick={() => navigate("/purchase-orders")}
                            >
                              <ExternalLink className="h-3 w-3 mr-1" />
                              Ver en Dashboard OC
                            </Button>
                          </div>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                )}
                </React.Fragment>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar proveedor?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. El proveedor será eliminado permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
