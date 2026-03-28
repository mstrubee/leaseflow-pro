import { useState, useEffect, useCallback, useMemo, useRef } from "react";
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
import { Plus, Pencil, Trash2, Users, Loader2, Phone, Mail, GripHorizontal, Download, Search, X } from "lucide-react";
import { toPng } from "html-to-image";
import { CompanyLogo } from "@/components/contracts/CompanyLogo";
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, horizontalListSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

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

// Sortable wrapper for org nodes
const SortableOrgItem = ({ id, children }: { id: string; children: React.ReactNode }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : undefined,
  };
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      {children}
    </div>
  );
};

// Drag handle indicator
const DragHandle = () => (
  <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-60 transition-opacity">
    <GripHorizontal className="h-3 w-3 text-muted-foreground" />
  </div>
);

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

  // Contract search state
  const [searchContract, setSearchContract] = useState("");

  // Auto-scale refs
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<HTMLDivElement>(null);
  const [chartScale, setChartScale] = useState(1);

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

  // contract -> company ids map
  const [contractCompanyMap, setContractCompanyMap] = useState<Record<string, string[]>>({});

  const loadAllContracts = async () => {
    const [contractsResult, addressesResult, ccResult] = await Promise.all([
      supabase.from("contracts").select("id, name").is("deleted_at", null).order("name"),
      supabase.from("contract_addresses").select("contract_id, region, commune"),
      supabase.from("contract_companies").select("contract_id, company_id"),
    ]);

    const addressMap: Record<string, { region: string | null; commune: string | null }> = {};
    (addressesResult.data || []).forEach(a => {
      addressMap[a.contract_id] = { region: a.region, commune: a.commune };
    });

    const ccMap: Record<string, string[]> = {};
    (ccResult.data || []).forEach((row: any) => {
      if (!ccMap[row.contract_id]) ccMap[row.contract_id] = [];
      ccMap[row.contract_id].push(row.company_id);
    });
    setContractCompanyMap(ccMap);

    const enriched: ContractOption[] = (contractsResult.data || []).map(c => ({
      id: c.id,
      name: c.name,
      region: addressMap[c.id]?.region || null,
      commune: addressMap[c.id]?.commune || null,
    }));

    setAllContracts(enriched);
  };

  // Tree helpers
  const getRootMembers = () => members.filter(m => !m.parent_id).sort((a, b) => a.display_order - b.display_order);
  const getChildren = (parentId: string) => members.filter(m => m.parent_id === parentId).sort((a, b) => a.display_order - b.display_order);

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

  // Filter contracts by the member's effective companies
  const filteredContractsByCompany = useMemo(() => {
    let effectiveIds = formCompanyIds.length > 0 ? formCompanyIds : [];
    if (effectiveIds.length === 0 && formParentId && formParentId !== "none") {
      effectiveIds = getEffectiveCompanyIds(formParentId);
    }
    if (effectiveIds.length === 0) return allContracts;
    return allContracts.filter(c => {
      const cCompanies = contractCompanyMap[c.id] || [];
      return cCompanies.some(id => effectiveIds.includes(id));
    });
  }, [allContracts, contractCompanyMap, formCompanyIds, formParentId, getEffectiveCompanyIds]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  // Highlighted members based on contract search
  const highlightedMemberIds = useMemo(() => {
    const q = searchContract.trim().toLowerCase();
    if (!q) return new Set<string>();
    const matchedContractIds = allContracts
      .filter(c => c.name.toLowerCase().includes(q))
      .map(c => c.id);
    if (matchedContractIds.length === 0) return new Set<string>();
    const ids = new Set<string>();
    for (const [memberId, contractIds] of Object.entries(memberContractMap)) {
      if (contractIds.some(cid => matchedContractIds.includes(cid))) {
        ids.add(memberId);
      }
    }
    return ids;
  }, [searchContract, allContracts, memberContractMap]);

  const isSearchActive = searchContract.trim().length > 0;

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const activeId = active.id as string;
    const overId = over.id as string;
    const activeMember = members.find(m => m.id === activeId);
    const overMember = members.find(m => m.id === overId);
    if (!activeMember || !overMember) return;
    if (activeMember.parent_id !== overMember.parent_id) return;

    const siblings = activeMember.parent_id ? getChildren(activeMember.parent_id) : getRootMembers();
    const oldIdx = siblings.findIndex(s => s.id === activeId);
    const newIdx = siblings.findIndex(s => s.id === overId);
    if (oldIdx === -1 || newIdx === -1) return;

    const reordered = [...siblings];
    const [moved] = reordered.splice(oldIdx, 1);
    reordered.splice(newIdx, 0, moved);

    await Promise.all(
      reordered.map((m, i) => supabase.from("org_members").update({ display_order: i }).eq("id", m.id))
    );
    await loadMembers();
  };

  // Auto-scale chart to fit container
  useEffect(() => {
    const updateScale = () => {
      if (!containerRef.current || !chartRef.current) return;
      const containerW = containerRef.current.clientWidth;
      const chartW = chartRef.current.scrollWidth;
      if (chartW > containerW) {
        setChartScale(Math.max(0.55, containerW / chartW));
      } else {
        setChartScale(1);
      }
    };
    updateScale();
    const observer = new ResizeObserver(updateScale);
    if (containerRef.current) observer.observe(containerRef.current);
    const timer = setTimeout(updateScale, 100);
    return () => { observer.disconnect(); clearTimeout(timer); };
  }, [members, selectedMemberId]);

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

  const handleDownloadImage = async () => {
    if (!chartRef.current) return;
    try {
      const dataUrl = await toPng(chartRef.current, {
        backgroundColor: "#ffffff",
        pixelRatio: 2,
        style: { transform: "none" },
      });
      const link = document.createElement("a");
      link.download = "organigrama.png";
      link.href = dataUrl;
      link.click();
    } catch (err) {
      toast({ variant: "destructive", title: "Error al generar imagen" });
    }
  };

  // Render org chart node (wrapped in sortable)
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
      <SortableOrgItem id={member.id}>
        <div className="flex flex-col items-center">
          {/* Node card */}
          <div
            className={`relative border rounded-lg px-2.5 py-1.5 cursor-pointer transition-all text-center min-w-[90px] shadow-sm hover:shadow-md group ${
              isSelected ? "ring-2 ring-primary border-primary bg-primary/5" :
              isSearchActive && highlightedMemberIds.has(member.id) ? "ring-2 ring-yellow-400 border-yellow-400 bg-yellow-50 shadow-lg dark:bg-yellow-900/20" :
              isSearchActive && !highlightedMemberIds.has(member.id) ? "opacity-40 bg-card hover:border-primary/50" :
              "bg-card hover:border-primary/50"
            }`}
            onClick={() => setSelectedMemberId(isSelected ? null : member.id)}
          >
            {/* Company logos */}
            {effectiveCompanyNames.length > 0 && (
              <div className={`flex justify-center gap-1 mb-1 ${isInherited ? "opacity-50" : ""}`}>
                <CompanyLogo companyNames={effectiveCompanyNames} size="sm" />
              </div>
            )}
             <p className="font-medium text-xs whitespace-nowrap">{member.name}</p>
            {member.position && (
              <p className="text-[10px] text-muted-foreground whitespace-nowrap mt-0.5">{member.position}</p>
            )}
            {/* Action buttons on hover */}
            <div className="absolute -top-2 -right-2 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
              <Button variant="secondary" size="icon" className="h-5 w-5 rounded-full shadow-sm" onClick={(e) => { e.stopPropagation(); openCreate(member.id); }} title="Agregar subordinado">
                <Plus className="h-3 w-3" />
              </Button>
            </div>
            {/* Drag handle */}
            <DragHandle />
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
                    {[...contractNames].sort((a, b) => a.localeCompare(b)).map((name, i) => (
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
              <div className="w-[2px] h-5 bg-primary/30" />
              {children.length === 1 ? (
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                  <SortableContext items={children.map(c => c.id)} strategy={horizontalListSortingStrategy}>
                    <div className="flex flex-col items-center">
                      {renderOrgNode(children[0])}
                    </div>
                  </SortableContext>
                </DndContext>
              ) : (
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                  <SortableContext items={children.map(c => c.id)} strategy={horizontalListSortingStrategy}>
                    <div className="relative">
                      {/* Horizontal bar connecting siblings */}
                      <div className="absolute top-0 h-[2px] bg-primary/30 rounded-full" style={{ left: `${100 / (children.length * 2)}%`, right: `${100 / (children.length * 2)}%` }} />
                      <div className="flex gap-3 pt-0">
                        {children.map(child => (
                          <div key={child.id} className="flex flex-col items-center">
                            <div className="w-[2px] h-5 bg-primary/30" />
                            {renderOrgNode(child)}
                          </div>
                        ))}
                      </div>
                    </div>
                  </SortableContext>
                </DndContext>
              )}
            </div>
          )}
        </div>
      </SortableOrgItem>
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
        icon={<Users className="h-5 w-5 text-teal-600" />}
        defaultOpen={!defaultCollapsed}
        headerActions={
          <div className="flex gap-2 items-center" onClick={e => e.stopPropagation()}>
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={searchContract}
                onChange={e => setSearchContract(e.target.value)}
                placeholder="Buscar por local/contrato..."
                className="h-8 w-[220px] pl-7 pr-7 text-xs"
              />
              {searchContract && (
                <button
                  onClick={() => setSearchContract("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            {isSearchActive && (
              <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                {highlightedMemberIds.size} resultado{highlightedMemberIds.size !== 1 ? "s" : ""}
              </span>
            )}
            <Button variant="outline" size="sm" onClick={handleDownloadImage} title="Descargar como imagen">
              <Download className="h-4 w-4 mr-1" />
              Imagen
            </Button>
            <Button onClick={() => openCreate()} size="sm">
              <Plus className="h-4 w-4 mr-1" />
              Nuevo Miembro
            </Button>
          </div>
        }
      >
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : members.length === 0 ? (
          <p className="text-muted-foreground text-center py-8 text-sm">No hay miembros en el organigrama</p>
        ) : (
          <div ref={containerRef} className="overflow-x-auto pb-4">
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={getRootMembers().map(m => m.id)} strategy={horizontalListSortingStrategy}>
                <div
                  ref={chartRef}
                  className="flex gap-3 justify-center items-start pt-4 origin-top min-w-max"
                  style={{
                    transform: `scale(${chartScale})`,
                    transformOrigin: "top left",
                    height: chartRef.current ? `${chartRef.current.scrollHeight * chartScale}px` : 'auto',
                  }}
                >
                  {getRootMembers().map(m => renderOrgNode(m))}
                </div>
              </SortableContext>
            </DndContext>
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
            {filteredContractsByCompany.length > 0 && (
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
                      {[...new Set(filteredContractsByCompany.map(c => c.region).filter(Boolean))].sort().map(r => (
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
                      {[...new Set(filteredContractsByCompany.map(c => c.commune).filter(Boolean))].sort().map(c => (
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
                      const filtered = filteredContractsByCompany
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
                  <div className="grid grid-cols-[auto_auto_1fr_120px_120px] gap-2 px-2 py-1.5 bg-muted/60 border-b text-[11px] font-medium text-muted-foreground">
                    <span></span>
                    <span></span>
                    <span>Contrato</span>
                    <span>Región</span>
                    <span>Comuna</span>
                  </div>
                  <div className="max-h-48 overflow-y-auto">
                    {filteredContractsByCompany
                      .filter(c => {
                        if (contractFilter === "region" && selectedRegions.length > 0) return c.region != null && selectedRegions.includes(c.region);
                        if (contractFilter === "commune" && selectedCommunes.length > 0) return c.commune != null && selectedCommunes.includes(c.commune);
                        return true;
                      })
                      .map(c => {
                        const cCompanyNames = (contractCompanyMap[c.id] || [])
                          .map(id => companies.find(co => co.id === id)?.name)
                          .filter(Boolean) as string[];
                        return (
                          <label key={c.id} className="grid grid-cols-[auto_auto_1fr_120px_120px] gap-2 items-center text-sm cursor-pointer hover:bg-muted/50 px-2 py-1 border-b last:border-b-0">
                            <Checkbox
                              checked={formContractIds.includes(c.id)}
                              onCheckedChange={() => toggleContract(c.id)}
                            />
                            <CompanyLogo companyNames={cCompanyNames} size="sm" />
                            <span className="truncate">{c.name}</span>
                            <span className="text-[11px] text-muted-foreground truncate">{c.region || ''}</span>
                            <span className="text-[11px] text-muted-foreground truncate">{c.commune || ''}</span>
                          </label>
                        );
                      })}
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
