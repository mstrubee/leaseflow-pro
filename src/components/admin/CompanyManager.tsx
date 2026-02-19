import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CollapsibleCard } from "@/components/admin/CollapsibleCard";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, Building2, Loader2, ChevronDown, ChevronRight, MapPin } from "lucide-react";
import { CompanyLogo } from "@/components/contracts/CompanyLogo";

interface Company {
  id: string;
  name: string;
  created_at: string;
}

interface CompanyContract {
  id: string;
  name: string;
  status: string;
  codigo: string | null;
  cebe: string | null;
  commune: string | null;
}

interface CompanyManagerProps {
  defaultCollapsed?: boolean;
}

export const CompanyManager = ({ defaultCollapsed = false }: CompanyManagerProps) => {
  const { toast } = useToast();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Create dialog
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newCompanyName, setNewCompanyName] = useState("");
  const [creating, setCreating] = useState(false);
  
  // Edit dialog
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingCompany, setEditingCompany] = useState<Company | null>(null);
  const [editCompanyName, setEditCompanyName] = useState("");
  const [updating, setUpdating] = useState(false);
  
  // Delete dialogs (double confirmation)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [confirmDeleteDialogOpen, setConfirmDeleteDialogOpen] = useState(false);
  const [companyToDelete, setCompanyToDelete] = useState<Company | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Expanded company contracts
  const [expandedCompanyId, setExpandedCompanyId] = useState<string | null>(null);
  const [companyContracts, setCompanyContracts] = useState<CompanyContract[]>([]);
  const [loadingContracts, setLoadingContracts] = useState(false);

  useEffect(() => {
    loadCompanies();
  }, []);

  const loadCompanies = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("companies")
      .select("*")
      .order("name", { ascending: true });
    
    if (error) {
      toast({ variant: "destructive", title: "Error", description: "Error al cargar empresas" });
    } else {
      setCompanies(data || []);
    }
    setLoading(false);
  };

  const toggleCompanyContracts = useCallback(async (companyId: string) => {
    if (expandedCompanyId === companyId) {
      setExpandedCompanyId(null);
      setCompanyContracts([]);
      return;
    }

    setExpandedCompanyId(companyId);
    setLoadingContracts(true);
    setCompanyContracts([]);

    try {
      // Get contracts for this company
      const { data: contractCompanies } = await supabase
        .from("contract_companies")
        .select("contract_id")
        .eq("company_id", companyId);

      const contractIds = (contractCompanies || []).map(cc => cc.contract_id);
      if (contractIds.length === 0) {
        setLoadingContracts(false);
        return;
      }

      // Get contract details and addresses
      const [contractsResult, addressesResult] = await Promise.all([
        supabase
          .from("contracts")
          .select("id, name, status")
          .in("id", contractIds)
          .is("deleted_at", null)
          .order("name"),
        supabase
          .from("contract_addresses")
          .select("contract_id, commune")
          .in("contract_id", contractIds),
      ]);

      // Get custom field IDs for CEBE and Código
      const { data: customFields } = await supabase
        .from("contract_custom_fields")
        .select("id, field_name")
        .eq("is_active", true)
        .or("field_name.ilike.cebe,field_name.ilike.código,field_name.ilike.codigo");

      const cebeField = customFields?.find(f => f.field_name.toLowerCase() === 'cebe');
      const codigoField = customFields?.find(f =>
        f.field_name.toLowerCase() === 'código' || f.field_name.toLowerCase() === 'codigo'
      );

      const fieldIds = [cebeField?.id, codigoField?.id].filter(Boolean) as string[];
      let fieldValuesMap: Record<string, { cebe?: string; codigo?: string }> = {};

      if (fieldIds.length > 0) {
        const { data: fieldValues } = await supabase
          .from("contract_custom_field_values")
          .select("contract_id, field_id, field_value")
          .in("contract_id", contractIds)
          .in("field_id", fieldIds);

        (fieldValues || []).forEach(v => {
          if (!fieldValuesMap[v.contract_id]) fieldValuesMap[v.contract_id] = {};
          if (cebeField && v.field_id === cebeField.id) fieldValuesMap[v.contract_id].cebe = v.field_value || undefined;
          if (codigoField && v.field_id === codigoField.id) fieldValuesMap[v.contract_id].codigo = v.field_value || undefined;
        });
      }

      const addressMap: Record<string, string> = {};
      (addressesResult.data || []).forEach(a => {
        addressMap[a.contract_id] = a.commune;
      });

      const result: CompanyContract[] = (contractsResult.data || []).map(c => ({
        id: c.id,
        name: c.name,
        status: c.status,
        codigo: fieldValuesMap[c.id]?.codigo || null,
        cebe: fieldValuesMap[c.id]?.cebe || null,
        commune: addressMap[c.id] || null,
      }));

      setCompanyContracts(result);
    } catch (err) {
      console.error("Error loading company contracts:", err);
    } finally {
      setLoadingContracts(false);
    }
  }, [expandedCompanyId]);

  const handleCreate = async () => {
    if (!newCompanyName.trim()) {
      toast({ variant: "destructive", title: "Error", description: "El nombre es requerido" });
      return;
    }

    setCreating(true);
    const { error } = await supabase
      .from("companies")
      .insert({ name: newCompanyName.trim() });

    if (error) {
      if (error.code === "23505") {
        toast({ variant: "destructive", title: "Error", description: "Ya existe una empresa con ese nombre" });
      } else {
        toast({ variant: "destructive", title: "Error", description: error.message });
      }
    } else {
      toast({ title: "Empresa creada", description: `"${newCompanyName}" ha sido creada` });
      setNewCompanyName("");
      setCreateDialogOpen(false);
      loadCompanies();
    }
    setCreating(false);
  };

  const openEdit = (company: Company) => {
    setEditingCompany(company);
    setEditCompanyName(company.name);
    setEditDialogOpen(true);
  };

  const handleUpdate = async () => {
    if (!editingCompany || !editCompanyName.trim()) {
      toast({ variant: "destructive", title: "Error", description: "El nombre es requerido" });
      return;
    }

    setUpdating(true);
    const { error } = await supabase
      .from("companies")
      .update({ name: editCompanyName.trim() })
      .eq("id", editingCompany.id);

    if (error) {
      if (error.code === "23505") {
        toast({ variant: "destructive", title: "Error", description: "Ya existe una empresa con ese nombre" });
      } else {
        toast({ variant: "destructive", title: "Error", description: error.message });
      }
    } else {
      toast({ title: "Empresa actualizada" });
      setEditDialogOpen(false);
      setEditingCompany(null);
      loadCompanies();
    }
    setUpdating(false);
  };

  const openDelete = (company: Company) => {
    setCompanyToDelete(company);
    setDeleteDialogOpen(true);
  };

  const handleFirstDeleteConfirm = () => {
    setDeleteDialogOpen(false);
    setConfirmDeleteDialogOpen(true);
  };

  const handleFinalDelete = async () => {
    if (!companyToDelete) return;

    setDeleting(true);
    const { error } = await supabase
      .from("companies")
      .delete()
      .eq("id", companyToDelete.id);

    if (error) {
      toast({ variant: "destructive", title: "Error", description: "No se pudo eliminar. Puede tener contratos asociados." });
    } else {
      toast({ title: "Empresa eliminada" });
      loadCompanies();
    }
    setConfirmDeleteDialogOpen(false);
    setCompanyToDelete(null);
    setDeleting(false);
  };

  return (
    <>
    <CollapsibleCard
      title="Empresas"
      description="Administrar empresas para asignar a contratos"
      icon={<Building2 className="h-5 w-5" />}
      defaultOpen={!defaultCollapsed}
      headerActions={
        <Button onClick={(e) => { e.stopPropagation(); setCreateDialogOpen(true); }} size="sm">
          <Plus className="h-4 w-4 mr-1" />
          Nueva Empresa
        </Button>
      }
    >
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : companies.length === 0 ? (
          <p className="text-muted-foreground text-center py-8">No hay empresas registradas</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead className="w-[120px]">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {companies.map((company) => {
                const isExpanded = expandedCompanyId === company.id;
                return (
                  <>
                    <TableRow key={company.id}>
                      <TableCell
                        className="font-medium cursor-pointer hover:text-primary transition-colors select-none"
                        onClick={() => toggleCompanyContracts(company.id)}
                      >
                        <div className="flex items-center gap-2">
                          {isExpanded ? (
                            <ChevronDown className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                          )}
                          <CompanyLogo companyName={company.name} size="sm" />
                          {company.name}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" onClick={() => openEdit(company)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => openDelete(company)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                    {isExpanded && (
                      <TableRow key={`${company.id}-details`}>
                        <TableCell colSpan={2} className="p-0">
                          <div className="bg-muted/30 border-t px-6 py-3">
                            {loadingContracts ? (
                              <div className="flex items-center gap-2 py-2 text-muted-foreground text-sm">
                                <Loader2 className="h-4 w-4 animate-spin" />
                                Cargando locales...
                              </div>
                            ) : companyContracts.length === 0 ? (
                              <p className="text-muted-foreground text-sm py-2">Sin contratos asociados</p>
                            ) : (
                              <div className="space-y-0">
                                <p className="text-xs font-semibold text-muted-foreground mb-2">
                                  {companyContracts.length} local{companyContracts.length !== 1 ? 'es' : ''} asociado{companyContracts.length !== 1 ? 's' : ''}
                                </p>
                                <Table>
                                  <TableHeader>
                                    <TableRow className="hover:bg-transparent">
                                      <TableHead className="text-xs h-8">Local</TableHead>
                                      <TableHead className="text-xs h-8">Código</TableHead>
                                      <TableHead className="text-xs h-8">CEBE</TableHead>
                                      <TableHead className="text-xs h-8">Comuna</TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {companyContracts.map((c) => (
                                      <TableRow key={c.id} className="hover:bg-muted/50">
                                        <TableCell className="text-sm py-1.5">{c.name}</TableCell>
                                        <TableCell className="text-sm py-1.5 font-mono text-xs">{c.codigo || '—'}</TableCell>
                                        <TableCell className="text-sm py-1.5 font-mono text-xs">{c.cebe || '—'}</TableCell>
                                        <TableCell className="text-sm py-1.5">
                                          {c.commune ? (
                                            <span className="flex items-center gap-1">
                                              <MapPin className="h-3 w-3 text-muted-foreground" />
                                              {c.commune}
                                            </span>
                                          ) : '—'}
                                        </TableCell>
                                      </TableRow>
                                    ))}
                                  </TableBody>
                                </Table>
                              </div>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </>
                );
              })}
            </TableBody>
          </Table>
        )}
    </CollapsibleCard>

      {/* Create Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nueva Empresa</DialogTitle>
            <DialogDescription>Crear una nueva empresa para asignar a contratos</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="newCompanyName">Nombre de la Empresa</Label>
              <Input
                id="newCompanyName"
                value={newCompanyName}
                onChange={(e) => setNewCompanyName(e.target.value)}
                placeholder="Ej: Empresa S.A."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleCreate} disabled={creating}>
              {creating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Crear
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Empresa</DialogTitle>
            <DialogDescription>Modificar el nombre de la empresa</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="editCompanyName">Nombre de la Empresa</Label>
              <Input
                id="editCompanyName"
                value={editCompanyName}
                onChange={(e) => setEditCompanyName(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleUpdate} disabled={updating}>
              {updating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* First Delete Confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar empresa?</AlertDialogTitle>
            <AlertDialogDescription>
              Estás a punto de eliminar la empresa "{companyToDelete?.name}". 
              Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleFirstDeleteConfirm} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Continuar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Second Delete Confirmation */}
      <AlertDialog open={confirmDeleteDialogOpen} onOpenChange={setConfirmDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar eliminación</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Estás completamente seguro? Esta acción eliminará permanentemente 
              la empresa "{companyToDelete?.name}" y no podrá ser recuperada.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleFinalDelete} 
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Eliminar Definitivamente
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
