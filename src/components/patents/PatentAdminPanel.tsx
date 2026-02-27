import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
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
import { Plus, Pencil, Trash2, Save, X, Palette, GripVertical, Folder, Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { PatentChecklistSection, PatentChecklistItem, PatentEmitter, PatentStatus, PatentItemEmitter, PatentSharedItem } from "./types";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

interface PatentAdminPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sections: PatentChecklistSection[];
  items: PatentChecklistItem[];
  emitters: PatentEmitter[];
  onDataChange: () => void;
}

// Sortable table row component
function SortableTableRow({ 
  id, 
  children,
  disabled = false
}: { 
  id: string; 
  children: React.ReactNode;
  disabled?: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, disabled });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <TableRow ref={setNodeRef} style={style}>
      <TableCell className="w-[40px]">
        <button
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing p-1 hover:bg-muted rounded disabled:opacity-30 disabled:cursor-not-allowed"
          disabled={disabled}
        >
          <GripVertical className="h-4 w-4 text-muted-foreground" />
        </button>
      </TableCell>
      {children}
    </TableRow>
  );
}

export function PatentAdminPanel({
  open,
  onOpenChange,
  sections: initialSections,
  items: initialItems,
  emitters: initialEmitters,
  onDataChange,
}: PatentAdminPanelProps) {
  const [activeTab, setActiveTab] = useState<'items' | 'sections' | 'emitters' | 'statuses' | 'kpi'>('sections');
  
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
  
  // Repository folders state (shared folders with contract_id = NULL)
  const [repositoryFolders, setRepositoryFolders] = useState<{ id: string; name: string; path: string }[]>([]);
  
  // Shared items mappings
  const [sharedItems, setSharedItems] = useState<PatentSharedItem[]>([]);
  
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

  // KPI config state
  const [kpiList, setKpiList] = useState<{ id: string; name: string }[]>([]);
  const [selectedKpiId, setSelectedKpiId] = useState<string | null>(null);
  const [selectedKpiItemId, setSelectedKpiItemId] = useState<string | null>(null);
  const [savingKpiConfig, setSavingKpiConfig] = useState(false);

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

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

  // Load statuses, item emitters, repository folders and KPI config
  useEffect(() => {
    if (open) {
      loadStatuses();
      loadItemEmitters();
      loadRepositoryFolders();
      loadSharedItems();
      loadKpiConfig();
    }
  }, [open]);

  const loadKpiConfig = async () => {
    // Load available KPIs
    const { data: kpis } = await supabase
      .from("kpis")
      .select("id, name")
      .eq("is_active", true)
      .order("name");
    if (kpis) setKpiList(kpis);

    // Load current config
    const { data: config } = await supabase
      .from("patent_kpi_config")
      .select("kpi_id, checklist_item_id")
      .limit(1)
      .single();
    if (config) {
      setSelectedKpiId(config.kpi_id);
      setSelectedKpiItemId(config.checklist_item_id);
    }
  };

  const handleSaveKpiConfig = async () => {
    setSavingKpiConfig(true);
    try {
      const { data: existing } = await supabase
        .from("patent_kpi_config")
        .select("id")
        .limit(1)
        .single();
      
      if (existing) {
        const { error } = await supabase
          .from("patent_kpi_config")
          .update({ kpi_id: selectedKpiId, checklist_item_id: selectedKpiItemId, updated_at: new Date().toISOString() })
          .eq("id", existing.id);
        if (error) throw error;
      }
      toast.success("Configuración KPI guardada");
    } catch (error) {
      console.error("Error saving KPI config:", error);
      toast.error("Error al guardar configuración KPI");
    } finally {
      setSavingKpiConfig(false);
    }
  };

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

  const loadRepositoryFolders = async () => {
    // Load shared folders (contract_id IS NULL = shared repository)
    const { data } = await supabase
      .from("repository_folders")
      .select("id, name, parent_id")
      .is("contract_id", null)
      .order("name");
    
    if (data) {
      // Build folder paths for display
      const folderMap = new Map(data.map(f => [f.id, f]));
      const foldersWithPaths = data.map(folder => {
        let path = folder.name;
        let current = folder;
        while (current.parent_id) {
          const parent = folderMap.get(current.parent_id);
          if (parent) {
            path = `${parent.name} / ${path}`;
            current = parent;
          } else {
            break;
          }
        }
        return { id: folder.id, name: folder.name, path };
      });
      setRepositoryFolders(foldersWithPaths);
    }
  };

  const loadSharedItems = async () => {
    const { data } = await supabase
      .from("patent_shared_items")
      .select("id, checklist_item_id, shared_folder_id");
    if (data) setSharedItems(data as PatentSharedItem[]);
  };

  const handleToggleSharedItem = async (itemId: string, enabled: boolean) => {
    if (enabled) {
      // Default to first folder if available
      const defaultFolder = repositoryFolders[0];
      if (!defaultFolder) {
        toast.error("No hay carpetas en el repositorio compartido");
        return;
      }
      const { data, error } = await supabase
        .from("patent_shared_items")
        .insert({ checklist_item_id: itemId, shared_folder_id: defaultFolder.id })
        .select()
        .single();
      if (error) {
        toast.error("Error al activar repositorio compartido");
        return;
      }
      if (data) setSharedItems(prev => [...prev, data as PatentSharedItem]);
    } else {
      const { error } = await supabase
        .from("patent_shared_items")
        .delete()
        .eq("checklist_item_id", itemId);
      if (error) {
        toast.error("Error al desactivar repositorio compartido");
        return;
      }
      setSharedItems(prev => prev.filter(si => si.checklist_item_id !== itemId));
    }
    onDataChange();
  };

  const handleChangeSharedFolder = async (itemId: string, folderId: string) => {
    const { error } = await supabase
      .from("patent_shared_items")
      .update({ shared_folder_id: folderId })
      .eq("checklist_item_id", itemId);
    if (error) {
      toast.error("Error al actualizar carpeta");
      return;
    }
    setSharedItems(prev => prev.map(si =>
      si.checklist_item_id === itemId ? { ...si, shared_folder_id: folderId } : si
    ));
    onDataChange();
  };

  // --- REORDER HANDLERS ---
  const handleReorderSections = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = localSections.findIndex(s => s.id === active.id);
    const newIndex = localSections.findIndex(s => s.id === over.id);
    
    const reordered = arrayMove(localSections, oldIndex, newIndex);
    const updatedSections = reordered.map((s, i) => ({ ...s, display_order: i }));
    setLocalSections(updatedSections);

    // Update in database
    for (const section of updatedSections) {
      await supabase
        .from("patent_checklist_sections")
        .update({ display_order: section.display_order })
        .eq("id", section.id);
    }
    toast.success("Orden actualizado");
  };

  const handleReorderItems = async (event: DragEndEvent, sectionId: string) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const sectionItems = localItems.filter(i => i.section_id === sectionId).sort((a, b) => a.display_order - b.display_order);
    const oldIndex = sectionItems.findIndex(i => i.id === active.id);
    const newIndex = sectionItems.findIndex(i => i.id === over.id);
    
    const reordered = arrayMove(sectionItems, oldIndex, newIndex);
    const updatedItems = reordered.map((item, i) => ({ ...item, display_order: i }));
    
    setLocalItems(prev => {
      const otherItems = prev.filter(i => i.section_id !== sectionId);
      return [...otherItems, ...updatedItems];
    });

    // Update in database
    for (const item of updatedItems) {
      await supabase
        .from("patent_checklist_items")
        .update({ display_order: item.display_order })
        .eq("id", item.id);
    }
    toast.success("Orden actualizado");
  };

  const handleReorderEmitters = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const sortedEmitters = [...localEmitters].sort((a, b) => (a.display_order || 0) - (b.display_order || 0));
    const oldIndex = sortedEmitters.findIndex(e => e.id === active.id);
    const newIndex = sortedEmitters.findIndex(e => e.id === over.id);
    
    const reordered = arrayMove(sortedEmitters, oldIndex, newIndex);
    const updatedEmitters = reordered.map((e, i) => ({ ...e, display_order: i }));
    setLocalEmitters(updatedEmitters);

    // Update in database
    for (const emitter of updatedEmitters) {
      await supabase
        .from("patent_emitters")
        .update({ display_order: emitter.display_order })
        .eq("id", emitter.id);
    }
    toast.success("Orden actualizado");
  };

  const handleReorderStatuses = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = statuses.findIndex(s => s.id === active.id);
    const newIndex = statuses.findIndex(s => s.id === over.id);
    
    const reordered = arrayMove(statuses, oldIndex, newIndex);
    const updatedStatuses = reordered.map((s, i) => ({ ...s, display_order: i }));
    setStatuses(updatedStatuses);

    // Update in database
    for (const status of updatedStatuses) {
      await supabase
        .from("patent_statuses")
        .update({ display_order: status.display_order })
        .eq("id", status.id);
    }
    toast.success("Orden actualizado");
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
      .update({ name: section.name, code: section.code, repository_folder_id: section.repository_folder_id || null })
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

  const handleUpdateSectionFolder = async (sectionId: string, folderId: string | null) => {
    const { error } = await supabase
      .from("patent_checklist_sections")
      .update({ repository_folder_id: folderId })
      .eq("id", sectionId);

    if (error) {
      toast.error("Error al actualizar carpeta");
      return;
    }

    // Update local state immediately
    setLocalSections(prev => prev.map(s => 
      s.id === sectionId ? { ...s, repository_folder_id: folderId || undefined } : s
    ));
    toast.success("Carpeta actualizada");
    onDataChange();
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

    const maxOrder = Math.max(0, ...localEmitters.map(e => e.display_order || 0));

    const { data: newEmitter, error } = await supabase
      .from("patent_emitters")
      .insert({ 
        name: newEmitterName.trim(),
        section_id: newEmitterSection || null,
        display_order: maxOrder + 1
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

  const sortedSections = [...localSections].sort((a, b) => a.display_order - b.display_order);
  const sortedEmitters = [...localEmitters].sort((a, b) => (a.display_order || 0) - (b.display_order || 0));
  const sortedStatuses = [...statuses].sort((a, b) => a.display_order - b.display_order);

  const handleExportChecklist = () => {
    const emitterLookup: Record<string, string> = {};
    localEmitters.forEach(e => { emitterLookup[e.id] = e.name; });

    const BOM = '\uFEFF';
    const headers = ['Sección', 'Código Sección', 'Documento', 'Emisores Fijos'];
    const rows: string[][] = [];

    sortedSections.forEach(section => {
      const sectionItems = localItems
        .filter(i => i.section_id === section.id)
        .sort((a, b) => a.display_order - b.display_order);

      if (sectionItems.length === 0) {
        rows.push([section.name, section.code, '', '']);
      } else {
        sectionItems.forEach(item => {
          const emitterIds = getItemEmitterIds(item.id);
          const emitterNames = emitterIds.map(id => emitterLookup[id] || '').filter(Boolean).join(', ');
          rows.push([section.name, section.code, item.name, emitterNames]);
        });
      }
    });

    const csvContent = BOM + [
      headers.join(';'),
      ...rows.map(row => row.map(cell => `"${(cell || '').replace(/"/g, '""')}"`).join(';'))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'checklist_patentes.csv';
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
    toast.success("Checklist exportado");
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-5xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader className="flex flex-row items-center justify-between pr-8">
            <DialogTitle>Administrar Checklist de Patentes</DialogTitle>
            <Button variant="outline" size="sm" onClick={handleExportChecklist}>
              <Download className="h-4 w-4 mr-1" />
              Exportar
            </Button>
          </DialogHeader>

          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="flex-1 overflow-hidden flex flex-col">
            <TabsList className="grid w-full grid-cols-5">
              <TabsTrigger value="sections">Secciones</TabsTrigger>
              <TabsTrigger value="items">Ítems</TabsTrigger>
              <TabsTrigger value="statuses">Estado</TabsTrigger>
              <TabsTrigger value="emitters">Emisores</TabsTrigger>
              <TabsTrigger value="kpi">KPI</TabsTrigger>
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
                        {sortedSections.map(section => (
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
                {sortedSections.map(section => {
                  const sectionItems = localItems
                    .filter(i => i.section_id === section.id)
                    .sort((a, b) => a.display_order - b.display_order);
                  
                  return (
                    <Card key={section.id}>
                      <CardHeader className="py-3">
                        <CardTitle className="text-sm font-medium">{section.code}: {section.name}</CardTitle>
                      </CardHeader>
                      <CardContent className="pt-0">
                        <DndContext
                          sensors={sensors}
                          collisionDetection={closestCenter}
                          onDragEnd={(e) => handleReorderItems(e, section.id)}
                        >
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead className="w-[40px]"></TableHead>
                                <TableHead>Nombre</TableHead>
                                <TableHead className="w-[200px]">Emisores Fijos</TableHead>
                                <TableHead className="w-[250px]">Repositorio</TableHead>
                                <TableHead className="w-[100px]">Acciones</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              <SortableContext
                                items={sectionItems.map(i => i.id)}
                                strategy={verticalListSortingStrategy}
                              >
                                {sectionItems.map(item => (
                                  <SortableTableRow 
                                    key={item.id} 
                                    id={item.id}
                                    disabled={!!editingItem || !!managingItemEmitters}
                                  >
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
                                      {(() => {
                                        const shared = sharedItems.find(si => si.checklist_item_id === item.id);
                                        const isShared = !!shared;
                                        return (
                                          <div className="flex items-center gap-2">
                                            <Switch
                                              checked={isShared}
                                              onCheckedChange={(checked) => handleToggleSharedItem(item.id, checked)}
                                            />
                                            {isShared && (
                                              <Select
                                                value={shared.shared_folder_id}
                                                onValueChange={(val) => handleChangeSharedFolder(item.id, val)}
                                              >
                                                <SelectTrigger className="h-7 text-xs w-[160px]">
                                                  <SelectValue placeholder="Carpeta" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                  {repositoryFolders.map(f => (
                                                    <SelectItem key={f.id} value={f.id}>
                                                      <span className="text-xs">{f.path}</span>
                                                    </SelectItem>
                                                  ))}
                                                </SelectContent>
                                              </Select>
                                            )}
                                          </div>
                                        );
                                      })()}
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
                                  </SortableTableRow>
                                ))}
                              </SortableContext>
                            </TableBody>
                          </Table>
                        </DndContext>
                      </CardContent>
                    </Card>
                  );
                })}
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
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleReorderSections}
                  >
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[40px]"></TableHead>
                          <TableHead className="w-[80px]">Código</TableHead>
                          <TableHead>Nombre</TableHead>
                          <TableHead className="w-[200px]">Carpeta Repositorio</TableHead>
                          <TableHead className="w-[100px]">Acciones</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        <SortableContext
                          items={sortedSections.map(s => s.id)}
                          strategy={verticalListSortingStrategy}
                        >
                          {sortedSections.map(section => (
                            <SortableTableRow 
                              key={section.id} 
                              id={section.id}
                              disabled={!!editingSection}
                            >
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
                                <Select 
                                  value={section.repository_folder_id || "none"} 
                                  onValueChange={(value) => handleUpdateSectionFolder(section.id, value === "none" ? null : value)}
                                >
                                  <SelectTrigger className="h-8 text-xs">
                                    <SelectValue placeholder="Sin carpeta" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="none">Sin carpeta</SelectItem>
                                    {repositoryFolders.map(folder => (
                                      <SelectItem key={folder.id} value={folder.id}>
                                        {folder.path}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
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
                            </SortableTableRow>
                          ))}
                        </SortableContext>
                      </TableBody>
                    </Table>
                  </DndContext>
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
                        {sortedSections.map(section => (
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
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleReorderEmitters}
                  >
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[40px]"></TableHead>
                          <TableHead>Nombre</TableHead>
                          <TableHead>Sección</TableHead>
                          <TableHead className="w-[100px]">Acciones</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        <SortableContext
                          items={sortedEmitters.map(e => e.id)}
                          strategy={verticalListSortingStrategy}
                        >
                          {sortedEmitters.map(emitter => (
                            <SortableTableRow 
                              key={emitter.id} 
                              id={emitter.id}
                              disabled={!!editingEmitter}
                            >
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
                                      {sortedSections.map(section => (
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
                            </SortableTableRow>
                          ))}
                        </SortableContext>
                      </TableBody>
                    </Table>
                  </DndContext>
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
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleReorderStatuses}
                  >
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[40px]"></TableHead>
                          <TableHead className="w-[120px]">Código</TableHead>
                          <TableHead>Nombre</TableHead>
                          <TableHead className="w-[120px]">Vista Previa</TableHead>
                          <TableHead className="w-[100px]">Color Fondo</TableHead>
                          <TableHead className="w-[100px]">Color Texto</TableHead>
                          <TableHead className="w-[100px]">Acciones</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        <SortableContext
                          items={sortedStatuses.map(s => s.id)}
                          strategy={verticalListSortingStrategy}
                        >
                          {sortedStatuses.map(status => (
                            <SortableTableRow 
                              key={status.id} 
                              id={status.id}
                              disabled={!!editingStatus}
                            >
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
                            </SortableTableRow>
                          ))}
                        </SortableContext>
                      </TableBody>
                    </Table>
                  </DndContext>
                </CardContent>
              </Card>
            </TabsContent>

            {/* KPI CONFIG TAB */}
            <TabsContent value="kpi" className="flex-1 overflow-auto mt-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Registro automático en KPI</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    Cuando el documento seleccionado se marca como "OK", se registrará automáticamente un ingreso en el KPI con el nombre del contrato y la fecha.
                  </p>
                  <div className="space-y-2">
                    <Label>KPI destino</Label>
                    <Select value={selectedKpiId || "none"} onValueChange={(v) => setSelectedKpiId(v === "none" ? null : v)}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Seleccionar KPI..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Sin KPI vinculado</SelectItem>
                        {kpiList.map((kpi) => (
                          <SelectItem key={kpi.id} value={kpi.id}>{kpi.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Documento que activa el KPI</Label>
                    <Select value={selectedKpiItemId || "none"} onValueChange={(v) => setSelectedKpiItemId(v === "none" ? null : v)}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Seleccionar documento..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Cualquier documento</SelectItem>
                        {localSections.map((section) => {
                          const sectionItems = localItems.filter(i => i.section_id === section.id);
                          return sectionItems.map((item) => (
                            <SelectItem key={item.id} value={item.id}>
                              {section.name} → {item.name}
                            </SelectItem>
                          ));
                        })}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      Si seleccionas un documento específico, solo se registrará el KPI cuando ese documento se marque como "OK".
                    </p>
                  </div>
                  <Button onClick={handleSaveKpiConfig} disabled={savingKpiConfig}>
                    <Save className="h-4 w-4 mr-2" />
                    {savingKpiConfig ? "Guardando..." : "Guardar"}
                  </Button>
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
