import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CollapsibleCard } from "@/components/admin/CollapsibleCard";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, Users, Loader2, Phone, Mail } from "lucide-react";
import { CompanyLogo } from "@/components/contracts/CompanyLogo";

interface OrgMember {
  id: string;
  company_id: string | null;
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
  region: string | null;
  commune: string | null;
}

interface OrgChartManagerProps {
  defaultCollapsed?: boolean;
}

export const OrgChartManager = ({ defaultCollapsed = false }: OrgChartManagerProps) => {
  const { toast } = useToast();
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [loading, setLoading] = useState(false);

  // Member -> companies map
  const [memberCompanyMap, setMemberCompanyMap] = useState<Record<string, string[]>>({});

  // All contracts (for assignment)
  const [allContracts, setAllContracts] = useState<ContractOption[]>([]);

  // Member contract assignments
  const [memberContractMap, setMemberContractMap] = useState<Record<string, string[]>>({});

  // Contract filter state
  const [contractFilter, setContractFilter] = useState<"all" | "region" | "commune">("all");
  const [selectedRegions, setSelectedRegions] = useState<string[]>([]);
  const [selectedCommunes, setSelectedCommunes] = useState<string[]>([]);

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<OrgMember | null>(null);
  const [formName, setFormName] = useState("");
  const [formPosition, setFormPosition] = useState("");
  const [formPhone, setFormPhone] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formParentId, setFormParentId] = useState<string>("none");
  const [formContractIds, setFormContractIds] = useState<string[]>([]);
  const [formCompanyIds, setFormCompanyIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  // Delete dialogs
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [confirmDeleteDialogOpen, setConfirmDeleteDialogOpen] = useState(false);
  const [memberToDelete, setMemberToDelete] = useState<OrgMember | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Selected member for detail panel
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);

  useEffect(() => {
    loadAll();
  }, []);

  const loadAll = async () => {
    setLoading(true);
    await Promise.all([loadCompanies(), loadMembers(), loadAllContracts()]);
    setLoading(false);
  };

  const loadCompanies = async () => {
    const { data } = await supabase.from("companies").select("id, name").order("name");
    setCompanies(data || []);
  };

  const loadMembers = async () => {
    const [membersRes, contractsRes, companiesRes] = await Promise.all([
      supabase.from("org_members").select("*").order("display_order"),
      supabase.from("org_member_contracts").select("org_member_id, contract_id"),
      supabase.from("org_member_companies").select("org_member_id, company_id"),
    ]);

    setMembers((membersRes.data as OrgMember[]) || []);

    // Build member->contracts map
    const cMap: Record<string, string[]> = {};
    (contractsRes.data || []).forEach((row: any) => {
      if (!cMap[row.org_member_id]) cMap[row.org_member_id] = [];
      cMap[row.org_member_id].push(row.contract_id);
    });
    setMemberContractMap(cMap);

    // Build member->companies map
    const coMap: Record<string, string[]> = {};
    (companiesRes.data || []).forEach((row: any) => {
      if (!coMap[row.org_member_id]) coMap[row.org_member_id] = [];
      coMap[row.org_member_id].push(row.company_id);
    });
    setMemberCompanyMap(coMap);
  };

  const loadAllContracts = async () => {
    const [contractsResult, addressesResult] = await Promise.all([
      supabase.from("contracts").select("id, name").is("deleted_at", null).order("name"),
      supabase.from("contract_addresses").select("contract_id, region, commune"),
    ]);

    const addressMap: Record<string, { region: string | null; commune: string | null }> = {};
    (addressesResult.data || []).forEach(a => {
      addressMap[a.contract_id] = { region: a.region, commune: a.commune };
    });

    const enriched: ContractOption[] = (contractsResult.data || []).map(c => ({
      id: c.id,
      name: c.name,
      region: addressMap[c.id]?.region || null,
      commune: addressMap[c.id]?.commune || null,
    }));

    setAllContracts(enriched);
  };

  // Tree helpers
  const getRootMembers = () => members.filter(m => !m.parent_id);
  const getChildren = (parentId: string) => members.filter(m => m.parent_id === parentId);

  // Resolve effective companies for a member (inherit from parent if none assigned)
  const getEffectiveCompanyIds = useCallback((memberId: string): string[] => {
    const own = memberCompanyMap[memberId];
    if (own && own.length > 0) return own;

    // Find parent and inherit
    const member = members.find(m => m.id === memberId);
    if (member?.parent_id) {
      return getEffectiveCompanyIds(member.parent_id);
    }
    return [];
  }, [members, memberCompanyMap]);

  const getEffectiveCompanyNames = useCallback((memberId: string): string[] => {
    const ids = getEffectiveCompanyIds(memberId);
    return ids.map(id => companies.find(c => c.id === id)?.name).filter(Boolean) as string[];
  }, [getEffectiveCompanyIds, companies]);

  // CRUD
  const openCreate = (parentId?: string) => {
    setEditingMember(null);
    setFormName("");
    setFormPosition("");
    setFormPhone("");
    setFormEmail("");
    setFormParentId(parentId || "none");
    setFormContractIds([]);
    setFormCompanyIds([]);
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
    setFormCompanyIds(memberCompanyMap[member.id] || []);
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
      let memberId: string;

      if (editingMember) {
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
        memberId = editingMember.id;
      } else {
        const { data: newMember, error } = await supabase
          .from("org_members")
          .insert({
            name: formName.trim(),
            position: formPosition.trim() || null,
            phone: formPhone.trim() || null,
            email: formEmail.trim() || null,
            parent_id: parentId,
          })
          .select("id")
          .single();
        if (error) throw error;
        memberId = newMember.id;
      }

      // Sync contracts
      await supabase.from("org_member_contracts").delete().eq("org_member_id", memberId);
      if (formContractIds.length > 0) {
        await supabase.from("org_member_contracts").insert(
          formContractIds.map(cid => ({ org_member_id: memberId, contract_id: cid }))
        );
      }

      // Sync companies
      await supabase.from("org_member_companies").delete().eq("org_member_id", memberId);
      if (formCompanyIds.length > 0) {
        await supabase.from("org_member_companies").insert(
          formCompanyIds.map(cid => ({ org_member_id: memberId, company_id: cid }))
        );
      }

      toast({ title: editingMember ? "Miembro actualizado" : "Miembro creado" });
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

  const toggleFormCompany = (companyId: string) => {
    setFormCompanyIds(prev =>
      prev.includes(companyId) ? prev.filter(id => id !== companyId) : [...prev, companyId]
    );
  };

  // Render org chart node
  const renderOrgNode = (member: OrgMember) => {
    const children = getChildren(member.id);
    const isSelected = selectedMemberId === member.id;
    const contracts = memberContractMap[member.id] || [];
    const contractNames = contracts
      .map(cid => allContracts.find(c => c.id === cid)?.name)
      .filter(Boolean);

    const effectiveCompanyNames = getEffectiveCompanyNames(member.id);
    const ownCompanies = memberCompanyMap[member.id] || [];
    const isInherited = ownCompanies.length === 0 && effectiveCompanyNames.length > 0;

    return (
      <div key={member.id} className="flex flex-col items-center">
        {/* Node card */}
        <div
          className={`relative border rounded-lg px-4 py-2.5 cursor-pointer transition-all text-center min-w-[140px] max-w-[220px] shadow-sm hover:shadow-md group ${
            isSelected ? "ring-2 ring-primary border-primary bg-primary/5" : "bg-card hover:border-primary/50"
          }`}
          onClick={() => setSelectedMemberId(isSelected ? null : member.id)}
        >
          {/* Company logos */}
          {effectiveCompanyNames.length > 0 && (
            <div className={`flex justify-center gap-1 mb-1 ${isInherited ? "opacity-50" : ""}`}>
              <CompanyLogo companyNames={effectiveCompanyNames} size="sm" />
            </div>
          )}
          <p className="font-medium text-sm truncate">{member.name}</p>
          {member.position && (
            <p className="text-[11px] text-muted-foreground truncate mt-0.5">{member.position}</p>
          )}
          {/* Add subordinate button on hover */}
          <div className="absolute -top-2 -right-2 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button variant="secondary" size="icon" className="h-5 w-5 rounded-full shadow-sm" onClick={(e) => { e.stopPropagation(); openCreate(member.id); }} title="Agregar subordinado">
              <Plus className="h-3 w-3" />
            </Button>
          </div>
        </div>

        {/* Detail panel (shown on click) */}
        {isSelected && (
          <div className="mt-2 border rounded-lg bg-card shadow-lg p-3 w-[280px] text-left z-10 relative">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                {effectiveCompanyNames.length > 0 && (
                  <CompanyLogo companyNames={effectiveCompanyNames} size="sm" />
                )}
                <span className="font-semibold text-sm">{member.name}</span>
              </div>
              <div className="flex gap-1">
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => openEdit(member)}>
                  <Pencil className="h-3 w-3" />
                </Button>
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => openDelete(member)}>
                  <Trash2 className="h-3 w-3 text-destructive" />
                </Button>
              </div>
            </div>
            {member.position && (
              <p className="text-xs text-muted-foreground mb-1.5">{member.position}</p>
            )}
            {isInherited && effectiveCompanyNames.length > 0 && (
              <p className="text-[10px] text-muted-foreground italic mb-1">Empresa heredada del superior</p>
            )}
            {member.phone && (
              <p className="text-xs flex items-center gap-1.5 mb-1"><Phone className="h-3 w-3 text-muted-foreground" />{member.phone}</p>
            )}
            {member.email && (
              <p className="text-xs flex items-center gap-1.5 mb-1"><Mail className="h-3 w-3 text-muted-foreground" />{member.email}</p>
            )}
            {contractNames.length > 0 && (
              <div className="mt-2 pt-2 border-t">
                <p className="text-[11px] font-medium text-muted-foreground mb-1">Contratos ({contractNames.length})</p>
                <div className="max-h-24 overflow-y-auto space-y-0.5">
                  {contractNames.map((name, i) => (
                    <p key={i} className="text-[11px] text-muted-foreground">• {name}</p>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Children */}
        {children.length > 0 && (
          <div className="flex flex-col items-center mt-0">
            <div className="w-px h-4 bg-border" />
            {children.length === 1 ? (
              <div className="flex flex-col items-center">
                {renderOrgNode(children[0])}
              </div>
            ) : (
              <div className="relative">
                <div className="absolute top-0 left-1/2 -translate-x-1/2 flex" style={{ width: "100%" }}>
                  <div className="w-full h-px bg-border" style={{ marginLeft: `${100 / (children.length * 2)}%`, marginRight: `${100 / (children.length * 2)}%` }} />
                </div>
                <div className="flex gap-2 pt-0">
                  {children.map(child => (
                    <div key={child.id} className="flex flex-col items-center">
                      <div className="w-px h-4 bg-border" />
                      {renderOrgNode(child)}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
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
        description="Gestionar gerencias y jefaturas"
        icon={<Users className="h-5 w-5" />}
        defaultOpen={!defaultCollapsed}
        headerActions={
          <Button onClick={(e) => { e.stopPropagation(); openCreate(); }} size="sm">
            <Plus className="h-4 w-4 mr-1" />
            Nuevo Miembro
          </Button>
        }
      >
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : members.length === 0 ? (
          <p className="text-muted-foreground text-center py-8 text-sm">No hay miembros en el organigrama</p>
        ) : (
          <div className="overflow-x-auto pb-4">
            <div className="flex gap-6 justify-center items-start pt-4 min-w-fit">
              {getRootMembers().map(m => renderOrgNode(m))}
            </div>
          </div>
        )}
      </CollapsibleCard>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl">
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

            {/* Company assignment */}
            <div className="space-y-2">
              <Label>Empresas asignadas</Label>
              <p className="text-[11px] text-muted-foreground">Si no se asigna ninguna, se heredan del nivel superior.</p>
              <div className="flex flex-wrap gap-2">
                {companies.map(c => (
                  <label key={c.id} className="flex items-center gap-2 text-sm cursor-pointer bg-muted/60 px-3 py-1.5 rounded-md hover:bg-muted">
                    <Checkbox
                      checked={formCompanyIds.includes(c.id)}
                      onCheckedChange={() => toggleFormCompany(c.id)}
                      className="h-4 w-4"
                    />
                    <CompanyLogo companyName={c.name} size="sm" />
                    <span>{c.name}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Contract assignment */}
            {allContracts.length > 0 && (
              <div className="space-y-2">
                <Label>Contratos asignados</Label>
                {/* Filters */}
                <div className="flex gap-2 flex-wrap items-center">
                  <Select value={contractFilter} onValueChange={(v) => { setContractFilter(v as any); setSelectedRegions([]); setSelectedCommunes([]); }}>
                    <SelectTrigger className="w-[140px] h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos</SelectItem>
                      <SelectItem value="region">Por Región</SelectItem>
                      <SelectItem value="commune">Por Comuna</SelectItem>
                    </SelectContent>
                  </Select>
                  {contractFilter === "region" && (
                    <div className="flex flex-wrap gap-1.5 items-center">
                      {[...new Set(allContracts.map(c => c.region).filter(Boolean))].sort().map(r => (
                        <label key={r!} className="flex items-center gap-1 text-xs cursor-pointer bg-muted/60 px-2 py-1 rounded-md hover:bg-muted">
                          <Checkbox
                            checked={selectedRegions.includes(r!)}
                            onCheckedChange={(checked) => {
                              setSelectedRegions(prev =>
                                checked ? [...prev, r!] : prev.filter(x => x !== r!)
                              );
                            }}
                            className="h-3.5 w-3.5"
                          />
                          {r}
                        </label>
                      ))}
                    </div>
                  )}
                  {contractFilter === "commune" && (
                    <div className="flex flex-wrap gap-1.5 items-center max-h-24 overflow-y-auto">
                      {[...new Set(allContracts.map(c => c.commune).filter(Boolean))].sort().map(c => (
                        <label key={c!} className="flex items-center gap-1 text-xs cursor-pointer bg-muted/60 px-2 py-1 rounded-md hover:bg-muted">
                          <Checkbox
                            checked={selectedCommunes.includes(c!)}
                            onCheckedChange={(checked) => {
                              setSelectedCommunes(prev =>
                                checked ? [...prev, c!] : prev.filter(x => x !== c!)
                              );
                            }}
                            className="h-3.5 w-3.5"
                          />
                          {c}
                        </label>
                      ))}
                    </div>
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs"
                    onClick={() => {
                      const filtered = allContracts
                        .filter(c => {
                          if (contractFilter === "region" && selectedRegions.length > 0) return c.region != null && selectedRegions.includes(c.region);
                          if (contractFilter === "commune" && selectedCommunes.length > 0) return c.commune != null && selectedCommunes.includes(c.commune);
                          return true;
                        })
                        .map(c => c.id);
                      setFormContractIds(prev => [...new Set([...prev, ...filtered])]);
                    }}
                  >
                    Seleccionar filtro
                  </Button>
                  {formContractIds.length > 0 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 text-xs text-muted-foreground"
                      onClick={() => setFormContractIds([])}
                    >
                      Limpiar ({formContractIds.length})
                    </Button>
                  )}
                </div>
                {/* Contract list */}
                <div className="border rounded-md overflow-hidden">
                  <div className="grid grid-cols-[auto_1fr_120px_120px] gap-2 px-2 py-1.5 bg-muted/60 border-b text-[11px] font-medium text-muted-foreground">
                    <span></span>
                    <span>Contrato</span>
                    <span>Región</span>
                    <span>Comuna</span>
                  </div>
                  <div className="max-h-48 overflow-y-auto">
                    {allContracts
                      .filter(c => {
                        if (contractFilter === "region" && selectedRegions.length > 0) return c.region != null && selectedRegions.includes(c.region);
                        if (contractFilter === "commune" && selectedCommunes.length > 0) return c.commune != null && selectedCommunes.includes(c.commune);
                        return true;
                      })
                      .map(c => (
                        <label key={c.id} className="grid grid-cols-[auto_1fr_120px_120px] gap-2 items-center text-sm cursor-pointer hover:bg-muted/50 px-2 py-1 border-b last:border-b-0">
                          <Checkbox
                            checked={formContractIds.includes(c.id)}
                            onCheckedChange={() => toggleContract(c.id)}
                          />
                          <span className="truncate">{c.name}</span>
                          <span className="text-[11px] text-muted-foreground truncate">{c.region || ''}</span>
                          <span className="text-[11px] text-muted-foreground truncate">{c.commune || ''}</span>
                        </label>
                      ))}
                  </div>
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
