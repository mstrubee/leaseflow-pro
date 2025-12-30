import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2, Save, X, Palette } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { PatentChecklistSection, PatentChecklistItem, PatentEmitter, PatentStatus, PatentItemEmitter } from "./types";

interface PatentAdminPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sections: PatentChecklistSection[];
  items: PatentChecklistItem[];
  emitters: PatentEmitter[];
  onDataChange: () => void;
}

export function PatentAdminPanel({
  open,
  onOpenChange,
  sections: initialSections,
  items: initialItems,
  emitters: initialEmitters,
  onDataChange,
}: PatentAdminPanelProps) {
  const [activeTab, setActiveTab] = useState<'items' | 'sections' | 'emitters' | 'statuses'>('sections');
  
  // Local state copies for immediate UI updates
  const [localSections, setLocalSections] = useState<PatentChecklistSection[]>(initialSections);
  const [localItems, setLocalItems] = useState<PatentChecklistItem[]>(initialItems);
  const [localEmitters, setLocalEmitters] = useState<PatentEmitter[]>(initialEmitters);
  const [editingItem, setEditingItem] = useState<PatentChecklistItem | null>(null);
  const [editingSection, setEditingSection] = useState<PatentChecklistSection | null>(null);
  const [editingEmitter, setEditingEmitter] = useState<PatentEmitter & { section_id?: string } | null>(null);
  const [editingStatus, setEditingStatus] = useState<PatentStatus | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ type: 'item' | 'section' | 'emitter' | 'status'; id: string; name: string } | null>(null);
  
  // Statuses state
  const [statuses, setStatuses] = useState<PatentStatus[]>([]);
  const [itemEmitters, setItemEmitters] = useState<PatentItemEmitter[]>([]);
  
  // Form states
  const [newItemName, setNewItemName] = useState("");
  const [newItemSection, setNewItemSection] = useState("");
  const [newSectionName, setNewSectionName] = useState("");
  const [newSectionCode, setNewSectionCode] = useState("");
  const [newEmitterName, setNewEmitterName] = useState("");
  const [newEmitterSection, setNewEmitterSection] = useState<string>("");
  const [newStatusCode, setNewStatusCode] = useState("");
  const [newStatusName, setNewStatusName] = useState("");
  const [newStatusBgColor, setNewStatusBgColor] = useState("#f3f4f6");
  const [newStatusTextColor, setNewStatusTextColor] = useState("#374151");
  
  // Item emitter management state
  const [managingItemEmitters, setManagingItemEmitters] = useState<string | null>(null);

  // Sync local state when props change
  useEffect(() => {
    setLocalSections(initialSections);
  }, [initialSections]);
  
  useEffect(() => {
    setLocalItems(initialItems);
  }, [initialItems]);
  
  useEffect(() => {
    setLocalEmitters(initialEmitters);
  }, [initialEmitters]);

  // Load statuses and item emitters
  useEffect(() => {
    if (open) {
      loadStatuses();
      loadItemEmitters();
    }
  }, [open]);

  const loadStatuses = async () => {
    const { data } = await supabase
      .from("patent_statuses")
      .select("*")
      .eq("is_active", true)
      .order("display_order");
    if (data) setStatuses(data);
  };

  const loadItemEmitters = async () => {
    const { data } = await supabase
      .from("patent_item_emitters")
      .select("*");
    if (data) setItemEmitters(data);
  };

  // --- ITEMS ---
  const handleAddItem = async () => {
    if (!newItemName.trim() || !newItemSection) {
      toast.error("Nombre y sección son requeridos");
      return;
    }

    const sectionItems = localItems.filter(i => i.section_id === newItemSection);
    const maxOrder = Math.max(0, ...sectionItems.map(i => i.display_order));

    const { data: newItem, error } = await supabase
      .from("patent_checklist_items")
      .insert({
        name: newItemName.trim(),
        section_id: newItemSection,
        display_order: maxOrder + 1,
      })
      .select()
      .single();

    if (error) {
      toast.error("Error al crear ítem");
      return;
    }

    // Update local state immediately
    if (newItem) {
      setLocalItems(prev => [...prev, newItem as PatentChecklistItem]);
    }

    const { data: vigentContracts } = await supabase
      .from("contracts")
      .select("id")
      .eq("status", "firmado")
      .eq("patente_status", "vigente")
      .is("deleted_at", null);

    if (vigentContracts && vigentContracts.length > 0 && newItem) {
      await supabase.from("patent_documents").insert(
        vigentContracts.map(c => ({
          contract_id: c.id,
          checklist_item_id: newItem.id,
          status: 'nuevo_doc' as const,
        }))
      );
    }

    toast.success("Ítem creado correctamente");
    setNewItemName("");
    setNewItemSection("");
  };

  const handleUpdateItem = async (item: PatentChecklistItem) => {
    const { error } = await supabase
      .from("patent_checklist_items")
      .update({ name: item.name, section_id: item.section_id })
      .eq("id", item.id);

    if (error) {
      toast.error("Error al actualizar ítem");
      return;
    }

    // Update local state immediately
    setLocalItems(prev => prev.map(i => i.id === item.id ? item : i));
    toast.success("Ítem actualizado");
    setEditingItem(null);
  };

  const handleDeleteItem = async (id: string) => {
    const { error } = await supabase
      .from("patent_checklist_items")
      .update({ is_active: false })
      .eq("id", id);

    if (error) {
      toast.error("Error al eliminar ítem");
      return;
    }

    // Update local state immediately
    setLocalItems(prev => prev.filter(i => i.id !== id));
    toast.success("Ítem eliminado");
    setDeleteConfirm(null);
  };

  // --- ITEM EMITTERS ---
  const handleToggleItemEmitter = async (itemId: string, emitterId: string, isChecked: boolean) => {
    if (isChecked) {
      const { data, error } = await supabase
        .from("patent_item_emitters")
        .insert({ checklist_item_id: itemId, emitter_id: emitterId })
        .select()
        .single();
      if (error) {
        toast.error("Error al asignar emisor");
        return;
      }
      if (data) {
        setItemEmitters(prev => [...prev, data as PatentItemEmitter]);
      }
    } else {
      const { error } = await supabase
        .from("patent_item_emitters")
        .delete()
        .eq("checklist_item_id", itemId)
        .eq("emitter_id", emitterId);
      if (error) {
        toast.error("Error al quitar emisor");
        return;
      }
      setItemEmitters(prev => prev.filter(ie => !(ie.checklist_item_id === itemId && ie.emitter_id === emitterId)));
    }
  };

  const getItemEmitterIds = (itemId: string) => {
    return itemEmitters.filter(ie => ie.checklist_item_id === itemId).map(ie => ie.emitter_id);
  };

  // --- SECTIONS ---
  const handleAddSection = async () => {
    if (!newSectionName.trim() || !newSectionCode.trim()) {
      toast.error("Nombre y código son requeridos");
      return;
    }

    const maxOrder = Math.max(0, ...localSections.map(s => s.display_order));

    const { data: newSection, error } = await supabase
      .from("patent_checklist_sections")
      .insert({
        name: newSectionName.trim(),
        code: newSectionCode.trim(),
        display_order: maxOrder + 1,
      })
      .select()
      .single();

    if (error) {
      toast.error("Error al crear sección");
      return;
    }

    // Update local state immediately
    if (newSection) {
      setLocalSections(prev => [...prev, newSection as PatentChecklistSection]);
    }

    toast.success("Sección creada correctamente");
    setNewSectionName("");
    setNewSectionCode("");
  };

  const handleUpdateSection = async (section: PatentChecklistSection) => {
    const { error } = await supabase
      .from("patent_checklist_sections")
      .update({ name: section.name, code: section.code })
      .eq("id", section.id);

    if (error) {
      toast.error("Error al actualizar sección");
      return;
    }

    // Update local state immediately
    setLocalSections(prev => prev.map(s => s.id === section.id ? section : s));
    toast.success("Sección actualizada");
    setEditingSection(null);
  };

  const handleDeleteSection = async (id: string) => {
    const sectionItems = localItems.filter(i => i.section_id === id);
    if (sectionItems.length > 0) {
      toast.error("No se puede eliminar una sección con ítems");
      setDeleteConfirm(null);
      return;
    }

    const { error } = await supabase
      .from("patent_checklist_sections")
      .delete()
      .eq("id", id);

    if (error) {
      toast.error("Error al eliminar sección");
      return;
    }

    // Update local state immediately
    setLocalSections(prev => prev.filter(s => s.id !== id));
    toast.success("Sección eliminada");
    setDeleteConfirm(null);
  };

  // --- EMITTERS ---
  const handleAddEmitter = async () => {
    if (!newEmitterName.trim()) {
      toast.error("El nombre es requerido");
      return;
    }

    const { data: newEmitter, error } = await supabase
      .from("patent_emitters")
      .insert({ 
        name: newEmitterName.trim(),
        section_id: newEmitterSection || null
      })
      .select()
      .single();

    if (error) {
      toast.error("Error al crear emisor");
      return;
    }

    // Update local state immediately
    if (newEmitter) {
      setLocalEmitters(prev => [...prev, newEmitter as PatentEmitter]);
    }

    toast.success("Emisor creado correctamente");
    setNewEmitterName("");
    setNewEmitterSection("");
  };

  const handleUpdateEmitter = async (emitter: PatentEmitter & { section_id?: string }) => {
    const { error } = await supabase
      .from("patent_emitters")
      .update({ name: emitter.name, section_id: emitter.section_id || null })
      .eq("id", emitter.id);

    if (error) {
      toast.error("Error al actualizar emisor");
      return;
    }

    // Update local state immediately
    setLocalEmitters(prev => prev.map(e => e.id === emitter.id ? emitter : e));
    toast.success("Emisor actualizado");
    setEditingEmitter(null);
  };

  const handleDeleteEmitter = async (id: string) => {
    const { error } = await supabase
      .from("patent_emitters")
      .update({ is_active: false })
      .eq("id", id);

    if (error) {
      toast.error("Error al eliminar emisor");
      return;
    }

    // Update local state immediately
    setLocalEmitters(prev => prev.filter(e => e.id !== id));
    toast.success("Emisor eliminado");
    setDeleteConfirm(null);
  };

  // --- STATUSES ---
  const handleAddStatus = async () => {
    if (!newStatusCode.trim() || !newStatusName.trim()) {
      toast.error("Código y nombre son requeridos");
      return;
    }

    const maxOrder = Math.max(0, ...statuses.map(s => s.display_order));

    const { data: newStatus, error } = await supabase
      .from("patent_statuses")
      .insert({
        code: newStatusCode.trim().toLowerCase().replace(/\s+/g, '_'),
        name: newStatusName.trim(),
        bg_color: newStatusBgColor,
        text_color: newStatusTextColor,
        display_order: maxOrder + 1,
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        toast.error("Ya existe un estado con ese código");
      } else {
        toast.error("Error al crear estado");
      }
      return;
    }

    // Update local state immediately
    if (newStatus) {
      setStatuses(prev => [...prev, newStatus as PatentStatus]);
    }

    toast.success("Estado creado correctamente");
    setNewStatusCode("");
    setNewStatusName("");
    setNewStatusBgColor("#f3f4f6");
    setNewStatusTextColor("#374151");
  };

  const handleUpdateStatus = async (status: PatentStatus) => {
    const { error } = await supabase
      .from("patent_statuses")
      .update({ 
        name: status.name, 
        bg_color: status.bg_color, 
        text_color: status.text_color 
      })
      .eq("id", status.id);

    if (error) {
      toast.error("Error al actualizar estado");
      return;
    }

    // Update local state immediately
    setStatuses(prev => prev.map(s => s.id === status.id ? status : s));
    toast.success("Estado actualizado");
    setEditingStatus(null);
  };

  const handleDeleteStatus = async (id: string) => {
    const { error } = await supabase
      .from("patent_statuses")
      .update({ is_active: false })
      .eq("id", id);

    if (error) {
      toast.error("Error al eliminar estado");
      return;
    }

    // Update local state immediately
    setStatuses(prev => prev.filter(s => s.id !== id));
    toast.success("Estado eliminado");
    setDeleteConfirm(null);
  };

  // Get section-specific emitters or global emitters
  const getEmittersForSection = (sectionId: string) => {
    return localEmitters.filter(e => !e.section_id || e.section_id === sectionId);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-5xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Administrar Checklist de Patentes</DialogTitle>
          </DialogHeader>

          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="flex-1 overflow-hidden flex flex-col">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="sections">Secciones</TabsTrigger>
              <TabsTrigger value="items">Ítems</TabsTrigger>
              <TabsTrigger value="statuses">Estado</TabsTrigger>
              <TabsTrigger value="emitters">Emisores</TabsTrigger>
            </TabsList>

            {/* ITEMS TAB */}
            <TabsContent value="items" className="flex-1 overflow-auto mt-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Agregar nuevo ítem</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <Input
                        placeholder="Nombre del ítem"
                        value={newItemName}
                        onChange={(e) => setNewItemName(e.target.value)}
                      />
                    </div>
                    <Select value={newItemSection} onValueChange={setNewItemSection}>
                      <SelectTrigger className="w-[200px]">
                        <SelectValue placeholder="Sección" />
                      </SelectTrigger>
                      <SelectContent>
                        {localSections.map(section => (
                          <SelectItem key={section.id} value={section.id}>
                            {section.code}: {section.name.substring(0, 30)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button onClick={handleAddItem}>
                      <Plus className="h-4 w-4 mr-1" />
                      Agregar
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <div className="mt-4 space-y-4">
                {localSections.map(section => (
                  <Card key={section.id}>
                    <CardHeader className="py-3">
                      <CardTitle className="text-sm font-medium">{section.code}: {section.name}</CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Nombre</TableHead>
                            <TableHead className="w-[200px]">Emisores Fijos</TableHead>
                            <TableHead className="w-[100px]">Acciones</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {localItems
                            .filter(i => i.section_id === section.id)
                            .sort((a, b) => a.display_order - b.display_order)
                            .map(item => (
                              <TableRow key={item.id}>
                                <TableCell>
                                  {editingItem?.id === item.id ? (
                                    <Input
                                      value={editingItem.name}
                                      onChange={(e) => setEditingItem({ ...editingItem, name: e.target.value })}
                                    />
                                  ) : (
                                    item.name
                                  )}
                                </TableCell>
                                <TableCell>
                                  {managingItemEmitters === item.id ? (
                                    <div className="space-y-1">
                                      {getEmittersForSection(section.id).map(emitter => (
                                        <div key={emitter.id} className="flex items-center gap-2">
                                          <Checkbox
                                            id={`emitter-${item.id}-${emitter.id}`}
                                            checked={getItemEmitterIds(item.id).includes(emitter.id)}
                                            onCheckedChange={(checked) => 
                                              handleToggleItemEmitter(item.id, emitter.id, !!checked)
                                            }
                                          />
                                          <label htmlFor={`emitter-${item.id}-${emitter.id}`} className="text-xs">
                                            {emitter.name}
                                          </label>
                                        </div>
                                      ))}
                                      <Button size="sm" variant="outline" onClick={() => setManagingItemEmitters(null)}>
                                        Listo
                                      </Button>
                                    </div>
                                  ) : (
                                    <div className="flex flex-wrap gap-1">
                                      {getItemEmitterIds(item.id).length > 0 ? (
                                        getItemEmitterIds(item.id).map(emId => {
                                          const em = localEmitters.find(e => e.id === emId);
                                          return em ? (
                                            <Badge key={emId} variant="secondary" className="text-xs">
                                              {em.name}
                                            </Badge>
                                          ) : null;
                                        })
                                      ) : (
                                        <span className="text-xs text-muted-foreground">Todos</span>
                                      )}
                                      <Button 
                                        size="sm" 
                                        variant="ghost" 
                                        className="h-5 px-1"
                                        onClick={() => setManagingItemEmitters(item.id)}
                                      >
                                        <Pencil className="h-3 w-3" />
                                      </Button>
                                    </div>
                                  )}
                                </TableCell>
                                <TableCell>
                                  {editingItem?.id === item.id ? (
                                    <div className="flex gap-1">
                                      <Button size="icon" variant="ghost" onClick={() => handleUpdateItem(editingItem)}>
                                        <Save className="h-4 w-4" />
                                      </Button>
                                      <Button size="icon" variant="ghost" onClick={() => setEditingItem(null)}>
                                        <X className="h-4 w-4" />
                                      </Button>
                                    </div>
                                  ) : (
                                    <div className="flex gap-1">
                                      <Button size="icon" variant="ghost" onClick={() => setEditingItem(item)}>
                                        <Pencil className="h-4 w-4" />
                                      </Button>
                                      <Button 
                                        size="icon" 
                                        variant="ghost" 
                                        className="text-destructive"
                                        onClick={() => setDeleteConfirm({ type: 'item', id: item.id, name: item.name })}
                                      >
                                        <Trash2 className="h-4 w-4" />
                                      </Button>
                                    </div>
                                  )}
                                </TableCell>
                              </TableRow>
                            ))}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </TabsContent>

            {/* SECTIONS TAB */}
            <TabsContent value="sections" className="flex-1 overflow-auto mt-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Agregar nueva sección</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex gap-2">
                    <Input
                      placeholder="Código (ej: C)"
                      className="w-[100px]"
                      value={newSectionCode}
                      onChange={(e) => setNewSectionCode(e.target.value)}
                    />
                    <div className="flex-1">
                      <Input
                        placeholder="Nombre de la sección"
                        value={newSectionName}
                        onChange={(e) => setNewSectionName(e.target.value)}
                      />
                    </div>
                    <Button onClick={handleAddSection}>
                      <Plus className="h-4 w-4 mr-1" />
                      Agregar
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card className="mt-4">
                <CardContent className="pt-4">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[80px]">Código</TableHead>
                        <TableHead>Nombre</TableHead>
                        <TableHead className="w-[100px]">Acciones</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {localSections.sort((a, b) => a.display_order - b.display_order).map(section => (
                        <TableRow key={section.id}>
                          <TableCell>
                            {editingSection?.id === section.id ? (
                              <Input
                                value={editingSection.code}
                                onChange={(e) => setEditingSection({ ...editingSection, code: e.target.value })}
                              />
                            ) : (
                              section.code
                            )}
                          </TableCell>
                          <TableCell>
                            {editingSection?.id === section.id ? (
                              <Input
                                value={editingSection.name}
                                onChange={(e) => setEditingSection({ ...editingSection, name: e.target.value })}
                              />
                            ) : (
                              section.name
                            )}
                          </TableCell>
                          <TableCell>
                            {editingSection?.id === section.id ? (
                              <div className="flex gap-1">
                                <Button size="icon" variant="ghost" onClick={() => handleUpdateSection(editingSection)}>
                                  <Save className="h-4 w-4" />
                                </Button>
                                <Button size="icon" variant="ghost" onClick={() => setEditingSection(null)}>
                                  <X className="h-4 w-4" />
                                </Button>
                              </div>
                            ) : (
                              <div className="flex gap-1">
                                <Button size="icon" variant="ghost" onClick={() => setEditingSection(section)}>
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button 
                                  size="icon" 
                                  variant="ghost" 
                                  className="text-destructive"
                                  onClick={() => setDeleteConfirm({ type: 'section', id: section.id, name: section.name })}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>

            {/* EMITTERS TAB */}
            <TabsContent value="emitters" className="flex-1 overflow-auto mt-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Agregar nuevo emisor</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <Input
                        placeholder="Nombre del emisor"
                        value={newEmitterName}
                        onChange={(e) => setNewEmitterName(e.target.value)}
                      />
                    </div>
                    <Select value={newEmitterSection} onValueChange={setNewEmitterSection}>
                      <SelectTrigger className="w-[200px]">
                        <SelectValue placeholder="Sección (opcional)" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="global">Global (todas)</SelectItem>
                        {localSections.map(section => (
                          <SelectItem key={section.id} value={section.id}>
                            {section.code}: {section.name.substring(0, 20)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button onClick={handleAddEmitter}>
                      <Plus className="h-4 w-4 mr-1" />
                      Agregar
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card className="mt-4">
                <CardContent className="pt-4">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nombre</TableHead>
                        <TableHead>Sección</TableHead>
                        <TableHead className="w-[100px]">Acciones</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {localEmitters.map(emitter => (
                        <TableRow key={emitter.id}>
                          <TableCell>
                            {editingEmitter?.id === emitter.id ? (
                              <Input
                                value={editingEmitter.name}
                                onChange={(e) => setEditingEmitter({ ...editingEmitter, name: e.target.value })}
                              />
                            ) : (
                              emitter.name
                            )}
                          </TableCell>
                          <TableCell>
                            {editingEmitter?.id === emitter.id ? (
                              <Select 
                                value={editingEmitter.section_id || "global"} 
                                onValueChange={(v) => setEditingEmitter({ ...editingEmitter, section_id: v === "global" ? undefined : v })}
                              >
                                <SelectTrigger className="w-[180px]">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="global">Global</SelectItem>
                                  {localSections.map(section => (
                                    <SelectItem key={section.id} value={section.id}>
                                      {section.code}: {section.name.substring(0, 15)}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            ) : (
                              <Badge variant="outline">
                                {emitter.section_id 
                                  ? localSections.find(s => s.id === emitter.section_id)?.code || 'Sección'
                                  : 'Global'
                                }
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            {editingEmitter?.id === emitter.id ? (
                              <div className="flex gap-1">
                                <Button size="icon" variant="ghost" onClick={() => handleUpdateEmitter(editingEmitter)}>
                                  <Save className="h-4 w-4" />
                                </Button>
                                <Button size="icon" variant="ghost" onClick={() => setEditingEmitter(null)}>
                                  <X className="h-4 w-4" />
                                </Button>
                              </div>
                            ) : (
                              <div className="flex gap-1">
                                <Button size="icon" variant="ghost" onClick={() => setEditingEmitter(emitter)}>
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button 
                                  size="icon" 
                                  variant="ghost" 
                                  className="text-destructive"
                                  onClick={() => setDeleteConfirm({ type: 'emitter', id: emitter.id, name: emitter.name })}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>

            {/* STATUSES TAB */}
            <TabsContent value="statuses" className="flex-1 overflow-auto mt-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Agregar nuevo estado</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex gap-2 items-end">
                    <div className="flex-1">
                      <Label className="text-xs">Código</Label>
                      <Input
                        placeholder="ej: aprobado"
                        value={newStatusCode}
                        onChange={(e) => setNewStatusCode(e.target.value)}
                      />
                    </div>
                    <div className="flex-1">
                      <Label className="text-xs">Nombre</Label>
                      <Input
                        placeholder="ej: Aprobado"
                        value={newStatusName}
                        onChange={(e) => setNewStatusName(e.target.value)}
                      />
                    </div>
                    <div className="w-[100px]">
                      <Label className="text-xs">Color Fondo</Label>
                      <div className="flex gap-1">
                        <Input
                          type="color"
                          className="w-10 h-9 p-1 cursor-pointer"
                          value={newStatusBgColor}
                          onChange={(e) => setNewStatusBgColor(e.target.value)}
                        />
                        <Input
                          value={newStatusBgColor}
                          onChange={(e) => setNewStatusBgColor(e.target.value)}
                          className="flex-1 text-xs"
                        />
                      </div>
                    </div>
                    <div className="w-[100px]">
                      <Label className="text-xs">Color Texto</Label>
                      <div className="flex gap-1">
                        <Input
                          type="color"
                          className="w-10 h-9 p-1 cursor-pointer"
                          value={newStatusTextColor}
                          onChange={(e) => setNewStatusTextColor(e.target.value)}
                        />
                        <Input
                          value={newStatusTextColor}
                          onChange={(e) => setNewStatusTextColor(e.target.value)}
                          className="flex-1 text-xs"
                        />
                      </div>
                    </div>
                    <Button onClick={handleAddStatus}>
                      <Plus className="h-4 w-4 mr-1" />
                      Agregar
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card className="mt-4">
                <CardContent className="pt-4">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[120px]">Código</TableHead>
                        <TableHead>Nombre</TableHead>
                        <TableHead className="w-[120px]">Vista Previa</TableHead>
                        <TableHead className="w-[100px]">Color Fondo</TableHead>
                        <TableHead className="w-[100px]">Color Texto</TableHead>
                        <TableHead className="w-[100px]">Acciones</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {statuses.sort((a, b) => a.display_order - b.display_order).map(status => (
                        <TableRow key={status.id}>
                          <TableCell className="font-mono text-xs">{status.code}</TableCell>
                          <TableCell>
                            {editingStatus?.id === status.id ? (
                              <Input
                                value={editingStatus.name}
                                onChange={(e) => setEditingStatus({ ...editingStatus, name: e.target.value })}
                              />
                            ) : (
                              status.name
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge 
                              style={{ 
                                backgroundColor: editingStatus?.id === status.id ? editingStatus.bg_color : status.bg_color,
                                color: editingStatus?.id === status.id ? editingStatus.text_color : status.text_color 
                              }}
                            >
                              {editingStatus?.id === status.id ? editingStatus.name : status.name}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {editingStatus?.id === status.id ? (
                              <div className="flex gap-1">
                                <Input
                                  type="color"
                                  className="w-8 h-8 p-0.5 cursor-pointer"
                                  value={editingStatus.bg_color}
                                  onChange={(e) => setEditingStatus({ ...editingStatus, bg_color: e.target.value })}
                                />
                              </div>
                            ) : (
                              <div 
                                className="w-6 h-6 rounded border"
                                style={{ backgroundColor: status.bg_color }}
                              />
                            )}
                          </TableCell>
                          <TableCell>
                            {editingStatus?.id === status.id ? (
                              <div className="flex gap-1">
                                <Input
                                  type="color"
                                  className="w-8 h-8 p-0.5 cursor-pointer"
                                  value={editingStatus.text_color}
                                  onChange={(e) => setEditingStatus({ ...editingStatus, text_color: e.target.value })}
                                />
                              </div>
                            ) : (
                              <div 
                                className="w-6 h-6 rounded border"
                                style={{ backgroundColor: status.text_color }}
                              />
                            )}
                          </TableCell>
                          <TableCell>
                            {editingStatus?.id === status.id ? (
                              <div className="flex gap-1">
                                <Button size="icon" variant="ghost" onClick={() => handleUpdateStatus(editingStatus)}>
                                  <Save className="h-4 w-4" />
                                </Button>
                                <Button size="icon" variant="ghost" onClick={() => setEditingStatus(null)}>
                                  <X className="h-4 w-4" />
                                </Button>
                              </div>
                            ) : (
                              <div className="flex gap-1">
                                <Button size="icon" variant="ghost" onClick={() => setEditingStatus(status)}>
                                  <Palette className="h-4 w-4" />
                                </Button>
                                <Button 
                                  size="icon" 
                                  variant="ghost" 
                                  className="text-destructive"
                                  onClick={() => setDeleteConfirm({ type: 'status', id: status.id, name: status.name })}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              ¿Eliminar {deleteConfirm?.type === 'item' ? 'ítem' : 
                deleteConfirm?.type === 'section' ? 'sección' : 
                deleteConfirm?.type === 'emitter' ? 'emisor' : 'estado'}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción eliminará "{deleteConfirm?.name}". 
              {deleteConfirm?.type !== 'status' && ' Los documentos existentes no se eliminarán.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deleteConfirm?.type === 'item') handleDeleteItem(deleteConfirm.id);
                else if (deleteConfirm?.type === 'section') handleDeleteSection(deleteConfirm.id);
                else if (deleteConfirm?.type === 'emitter') handleDeleteEmitter(deleteConfirm.id);
                else if (deleteConfirm?.type === 'status') handleDeleteStatus(deleteConfirm.id);
              }}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
