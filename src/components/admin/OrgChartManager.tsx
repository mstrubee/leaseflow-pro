import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CollapsibleCard } from "@/components/admin/CollapsibleCard";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, Users, Loader2, ChevronDown, ChevronRight, Phone, Mail } from "lucide-react";
import { CompanyLogo } from "@/components/contracts/CompanyLogo";

interface OrgMember {
  id: string;
  company_id: string;
  name: string;
  position: string | null;
  phone: string | null;
  email: string | null;
  parent_id: string | null;
  display_order: number;
  created_at: string;
}

interface CompanyOption {
  id: string;
  name: string;
}

interface ContractOption {
  id: string;
  name: string;
}

interface OrgChartManagerProps {
  defaultCollapsed?: boolean;
}

export const OrgChartManager = ({ defaultCollapsed = false }: OrgChartManagerProps) => {
  const { toast } = useToast();
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>("");
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  // Contracts for selected company
  const [companyContracts, setCompanyContracts] = useState<ContractOption[]>([]);

  // Member contract assignments
  const [memberContractMap, setMemberContractMap] = useState<Record<string, string[]>>({});

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<OrgMember | null>(null);
  const [formName, setFormName] = useState("");
  const [formPosition, setFormPosition] = useState("");
  const [formPhone, setFormPhone] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formParentId, setFormParentId] = useState<string>("none");
  const [formContractIds, setFormContractIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  // Delete dialogs
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [confirmDeleteDialogOpen, setConfirmDeleteDialogOpen] = useState(false);
  const [memberToDelete, setMemberToDelete] = useState<OrgMember | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    loadCompanies();
  }, []);

  useEffect(() => {
    if (selectedCompanyId) {
      loadMembers();
      loadCompanyContracts();
    } else {
      setMembers([]);
      setCompanyContracts([]);
      setMemberContractMap({});
    }
  }, [selectedCompanyId]);

  const loadCompanies = async () => {
    const { data } = await supabase.from("companies").select("id, name").order("name");
    setCompanies(data || []);
  };

  const loadMembers = async () => {
    if (!selectedCompanyId) return;
    setLoading(true);

    const [membersRes, contractsRes] = await Promise.all([
      supabase
        .from("org_members")
        .select("*")
        .eq("company_id", selectedCompanyId)
        .order("display_order"),
      supabase
        .from("org_member_contracts")
        .select("org_member_id, contract_id"),
    ]);

    setMembers((membersRes.data as OrgMember[]) || []);

    // Build member->contracts map filtered to this company's members
    const memberIds = new Set((membersRes.data || []).map((m: any) => m.id));
    const map: Record<string, string[]> = {};
    (contractsRes.data || []).forEach((row: any) => {
      if (memberIds.has(row.org_member_id)) {
        if (!map[row.org_member_id]) map[row.org_member_id] = [];
        map[row.org_member_id].push(row.contract_id);
      }
    });
    setMemberContractMap(map);
    setLoading(false);
  };

  const loadCompanyContracts = async () => {
    if (!selectedCompanyId) return;
    const { data: cc } = await supabase
      .from("contract_companies")
      .select("contract_id")
      .eq("company_id", selectedCompanyId);

    const ids = (cc || []).map((r: any) => r.contract_id);
    if (ids.length === 0) {
      setCompanyContracts([]);
      return;
    }

    const { data } = await supabase
      .from("contracts")
      .select("id, name")
      .in("id", ids)
      .is("deleted_at", null)
      .order("name");

    setCompanyContracts(data || []);
  };

  // Tree helpers
  const getRootMembers = () => members.filter(m => !m.parent_id);
  const getChildren = (parentId: string) => members.filter(m => m.parent_id === parentId);

  const toggleExpand = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // CRUD
  const openCreate = (parentId?: string) => {
    setEditingMember(null);
    setFormName("");
    setFormPosition("");
    setFormPhone("");
    setFormEmail("");
    setFormParentId(parentId || "none");
    setFormContractIds([]);
    setDialogOpen(true);
  };

  const openEdit = (member: OrgMember) => {
    setEditingMember(member);
    setFormName(member.name);
    setFormPosition(member.position || "");
    setFormPhone(member.phone || "");
    setFormEmail(member.email || "");
    setFormParentId(member.parent_id || "none");
    setFormContractIds(memberContractMap[member.id] || []);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formName.trim()) {
      toast({ variant: "destructive", title: "Error", description: "El nombre es requerido" });
      return;
    }

    setSaving(true);
    const parentId = formParentId === "none" ? null : formParentId;

    try {
      if (editingMember) {
        // Update
        const { error } = await supabase
          .from("org_members")
          .update({
            name: formName.trim(),
            position: formPosition.trim() || null,
            phone: formPhone.trim() || null,
            email: formEmail.trim() || null,
            parent_id: parentId,
          })
          .eq("id", editingMember.id);

        if (error) throw error;

        // Sync contracts
        await supabase.from("org_member_contracts").delete().eq("org_member_id", editingMember.id);
        if (formContractIds.length > 0) {
          await supabase.from("org_member_contracts").insert(
            formContractIds.map(cid => ({ org_member_id: editingMember.id, contract_id: cid }))
          );
        }

        toast({ title: "Miembro actualizado" });
      } else {
        // Create
        const { data: newMember, error } = await supabase
          .from("org_members")
          .insert({
            company_id: selectedCompanyId,
            name: formName.trim(),
            position: formPosition.trim() || null,
            phone: formPhone.trim() || null,
            email: formEmail.trim() || null,
            parent_id: parentId,
          })
          .select("id")
          .single();

        if (error) throw error;

        // Assign contracts
        if (formContractIds.length > 0 && newMember) {
          await supabase.from("org_member_contracts").insert(
            formContractIds.map(cid => ({ org_member_id: newMember.id, contract_id: cid }))
          );
        }

        toast({ title: "Miembro creado" });
      }

      setDialogOpen(false);
      loadMembers();
    } catch (err: any) {
      toast({ variant: "destructive", title: "Error", description: err.message });
    } finally {
      setSaving(false);
    }
  };

  const openDelete = (member: OrgMember) => {
    setMemberToDelete(member);
    setDeleteDialogOpen(true);
  };

  const handleFirstDeleteConfirm = () => {
    setDeleteDialogOpen(false);
    setConfirmDeleteDialogOpen(true);
  };

  const handleFinalDelete = async () => {
    if (!memberToDelete) return;
    setDeleting(true);

    const { error } = await supabase.from("org_members").delete().eq("id", memberToDelete.id);
    if (error) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    } else {
      toast({ title: "Miembro eliminado" });
      loadMembers();
    }

    setConfirmDeleteDialogOpen(false);
    setMemberToDelete(null);
    setDeleting(false);
  };

  const toggleContract = (contractId: string) => {
    setFormContractIds(prev =>
      prev.includes(contractId) ? prev.filter(id => id !== contractId) : [...prev, contractId]
    );
  };

  // Render tree row
  const renderMemberRow = (member: OrgMember, level: number) => {
    const children = getChildren(member.id);
    const hasChildren = children.length > 0;
    const isExpanded = expandedIds.has(member.id);
    const contracts = memberContractMap[member.id] || [];
    const contractNames = contracts
      .map(cid => companyContracts.find(c => c.id === cid)?.name)
      .filter(Boolean);

    return (
      <div key={member.id}>
        <div
          className="flex items-center gap-2 py-2 px-3 hover:bg-muted/50 rounded-md group"
          style={{ paddingLeft: `${12 + level * 24}px` }}
        >
          {/* Expand toggle */}
          <button
            className="w-5 h-5 flex items-center justify-center flex-shrink-0"
            onClick={() => hasChildren && toggleExpand(member.id)}
          >
            {hasChildren ? (
              isExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />
            ) : (
              <span className="w-4" />
            )}
          </button>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-medium text-sm">{member.name}</span>
              {member.position && (
                <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{member.position}</span>
              )}
            </div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
              {member.phone && (
                <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{member.phone}</span>
              )}
              {member.email && (
                <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{member.email}</span>
              )}
              {contractNames.length > 0 && (
                <span className="text-xs">📋 {contractNames.join(", ")}</span>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openCreate(member.id)} title="Agregar subordinado">
              <Plus className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(member)}>
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openDelete(member)}>
              <Trash2 className="h-3.5 w-3.5 text-destructive" />
            </Button>
          </div>
        </div>

        {/* Children */}
        {isExpanded && children.map(child => renderMemberRow(child, level + 1))}
      </div>
    );
  };

  // Available parents (exclude self and descendants when editing)
  const getAvailableParents = (): OrgMember[] => {
    if (!editingMember) return members;
    const excludeIds = new Set<string>();
    const collectDescendants = (id: string) => {
      excludeIds.add(id);
      getChildren(id).forEach(c => collectDescendants(c.id));
    };
    collectDescendants(editingMember.id);
    return members.filter(m => !excludeIds.has(m.id));
  };

  return (
    <>
      <CollapsibleCard
        title="Organigrama"
        description="Gestionar gerencias y jefaturas por empresa"
        icon={<Users className="h-5 w-5" />}
        defaultOpen={!defaultCollapsed}
        headerActions={
          selectedCompanyId ? (
            <Button onClick={(e) => { e.stopPropagation(); openCreate(); }} size="sm">
              <Plus className="h-4 w-4 mr-1" />
              Nuevo Miembro
            </Button>
          ) : null
        }
      >
        {/* Company selector */}
        <div className="mb-4">
          <Label>Empresa</Label>
          <Select value={selectedCompanyId} onValueChange={setSelectedCompanyId}>
            <SelectTrigger className="w-full max-w-xs mt-1">
              <SelectValue placeholder="Seleccionar empresa..." />
            </SelectTrigger>
            <SelectContent>
              {companies.map(c => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {!selectedCompanyId ? (
          <p className="text-muted-foreground text-center py-8 text-sm">Selecciona una empresa para ver su organigrama</p>
        ) : loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : members.length === 0 ? (
          <p className="text-muted-foreground text-center py-8 text-sm">No hay miembros en el organigrama</p>
        ) : (
          <div className="space-y-0.5">
            {getRootMembers().map(m => renderMemberRow(m, 0))}
          </div>
        )}
      </CollapsibleCard>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingMember ? "Editar Miembro" : "Nuevo Miembro"}</DialogTitle>
            <DialogDescription>
              {editingMember ? "Modificar datos del miembro" : "Agregar una persona al organigrama"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Nombre *</Label>
              <Input value={formName} onChange={e => setFormName(e.target.value)} placeholder="Nombre completo" />
            </div>
            <div className="space-y-1">
              <Label>Cargo / Posición</Label>
              <Input value={formPosition} onChange={e => setFormPosition(e.target.value)} placeholder="Ej: Gerente Regional" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Teléfono</Label>
                <Input value={formPhone} onChange={e => setFormPhone(e.target.value)} placeholder="+56 9..." />
              </div>
              <div className="space-y-1">
                <Label>Email</Label>
                <Input value={formEmail} onChange={e => setFormEmail(e.target.value)} placeholder="email@ejemplo.com" />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Reporta a (superior)</Label>
              <Select value={formParentId} onValueChange={setFormParentId}>
                <SelectTrigger>
                  <SelectValue placeholder="Sin superior" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sin superior (nivel raíz)</SelectItem>
                  {getAvailableParents().map(m => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.name}{m.position ? ` — ${m.position}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Contract assignment */}
            {companyContracts.length > 0 && (
              <div className="space-y-1">
                <Label>Contratos asignados</Label>
                <div className="max-h-40 overflow-y-auto border rounded-md p-2 space-y-1">
                  {companyContracts.map(c => {
                    const selectedCompanyName = companies.find(co => co.id === selectedCompanyId)?.name;
                    return (
                    <label key={c.id} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-muted/50 px-1 py-0.5 rounded">
                      <Checkbox
                        checked={formContractIds.includes(c.id)}
                        onCheckedChange={() => toggleContract(c.id)}
                      />
                      <CompanyLogo companyName={selectedCompanyName} size="sm" />
                      {c.name}
                    </label>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editingMember ? "Guardar" : "Crear"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* First Delete Confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar miembro?</AlertDialogTitle>
            <AlertDialogDescription>
              Estás a punto de eliminar a "{memberToDelete?.name}" del organigrama. Sus subordinados quedarán sin superior asignado.
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
              ¿Estás completamente seguro? Esta acción eliminará permanentemente a "{memberToDelete?.name}" del organigrama.
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
