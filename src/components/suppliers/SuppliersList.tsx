import React, { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Pencil, Trash2, Search, Building2, Download, FileSpreadsheet, ShoppingCart, Loader2, ExternalLink } from "lucide-react";
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
import * as XLSX from "xlsx";

interface SuppliersListProps {
  onEdit: (supplier: Supplier) => void;
  refreshKey: number;
}

interface SupplierWithEmails extends Omit<Supplier, 'emails'> {
  emails?: { email: string; is_primary: boolean }[];
}

export const SuppliersList = ({ onEdit, refreshKey }: SuppliersListProps) => {
  const navigate = useNavigate();
  const [suppliers, setSuppliers] = useState<SupplierWithEmails[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
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
  }, [refreshKey]);

  const loadSuppliers = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("suppliers")
        .select(`
          *,
          category:supplier_categories(id, name),
          emails:supplier_emails(email, is_primary)
        `)
        .order("name");

      if (error) throw error;
      setSuppliers(data || []);
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

  const filteredSuppliers: SupplierWithEmails[] = suppliers.filter(s =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    s.rut?.toLowerCase().includes(search.toLowerCase()) ||
    s.category?.name?.toLowerCase().includes(search.toLowerCase())
  );

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
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar proveedor..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        
        {selectedIds.size > 0 && (
          <Button onClick={exportSelected} variant="outline" className="gap-2">
            <FileSpreadsheet className="h-4 w-4" />
            Exportar ({selectedIds.size})
          </Button>
        )}
        
        {filteredSuppliers.length > 0 && selectedIds.size === 0 && (
          <Button onClick={() => exportToExcel(filteredSuppliers)} variant="outline" className="gap-2">
            <Download className="h-4 w-4" />
            Exportar todos
          </Button>
        )}
      </div>

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
                    {supplier.category?.name && (
                      <Badge variant="outline">{supplier.category.name}</Badge>
                    )}
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
