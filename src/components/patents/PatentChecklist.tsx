import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TextareaWithAI } from "@/components/ui/textarea-with-ai";
import { SyncedTextareas } from "./SyncedTextareas";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ArrowLeft, CalendarIcon, Save, Bell, Upload, FileText, Download, CheckSquare, Square, X, ChevronDown, FolderOpen, FolderCog } from "lucide-react";
import { DialogFooter } from "@/components/ui/dialog";
import { FolderDestinationPicker } from "@/components/budget/FolderDestinationPicker";

import { Checkbox } from "@/components/ui/checkbox";
import { exportPatentsToExcel } from "./exportPatentsExcel";
import { exportPatentsWithFiles } from "./exportPatentsZip";
import { addDays, differenceInDays } from "date-fns";

// Parse "yyyy-MM-dd" as local date (avoids UTC shift)
function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

// Format Date to "yyyy-MM-dd" using local components
function formatLocalDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// Format Date to "dd/MM/yyyy" for display
function formatDisplayDate(date: Date): string {
  const d = String(date.getDate()).padStart(2, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const y = date.getFullYear();
  return `${d}/${m}/${y}`;
}
import { es } from "date-fns/locale";
import { useCollapsibleState } from "@/hooks/useCollapsibleState";
import { 
  ContractWithPatent, 
  PatentChecklistSection, 
  PatentChecklistItem,
  PatentEmitter,
  PatentItemEmitter,
  PatentStatus,
  PatentDocument,
  PatentPriority,
  PatentDocStatus,
  PatentSharedItem,
  PRIORITY_CONFIG
} from "./types";
import { PatentPriorityBadge } from "./PatentPriorityBadge";
import { PatentStatusBadge } from "./PatentStatusBadge";
import { PatentDocumentUpload } from "./PatentDocumentUpload";
import { PatentAlertDialog } from "./PatentAlertDialog";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface PatentChecklistProps {
  contract: ContractWithPatent;
  sections: PatentChecklistSection[];
  items: PatentChecklistItem[];
  emitters: PatentEmitter[];
  itemEmitters: PatentItemEmitter[];
  statuses: PatentStatus[];
  sharedItems: PatentSharedItem[];
  onBack: () => void;
  onUpdatePriority: (contractId: string, priority: PatentPriority, userId: string) => Promise<void>;
  onUpdatePatenteStatus: (contractId: string, patenteStatus: string) => Promise<void>;
  onUpdateComments: (contractId: string, comments: string, nextActions: string) => Promise<void>;
  onUpdateDocument: (contractId: string, itemId: string, data: Partial<PatentDocument>) => Promise<void>;
  onUpdateDocumentStatus: (contractId: string, itemId: string, status: PatentDocStatus, userId: string) => Promise<void>;
}

export function PatentChecklist({
  contract,
  sections,
  items,
  emitters,
  itemEmitters,
  statuses,
  sharedItems,
  onBack,
  onUpdatePriority,
  onUpdatePatenteStatus,
  onUpdateComments,
  onUpdateDocument,
  onUpdateDocumentStatus,
}: PatentChecklistProps) {
  const { user, isAdmin } = useAuth();
  
  // File destination settings - hierarchical: section-level and item-level
  const [fileDestContext, setFileDestContext] = useState<{ type: 'section' | 'item'; id: string; label: string } | null>(null);
  const [tempPatentFolder, setTempPatentFolder] = useState("");
  const [savingFileDest, setSavingFileDest] = useState(false);
  const [sectionFolders, setSectionFolders] = useState<Record<string, string>>({});
  const [itemFolders, setItemFolders] = useState<Record<string, string>>({});

  // Load all patent folder destination settings
  useEffect(() => {
    const loadPatentFolderSettings = async () => {
      const { data } = await supabase
        .from("file_destination_settings")
        .select("setting_key, folder_name")
        .like("setting_key", "patent_%");
      
      const secFolders: Record<string, string> = {};
      const itmFolders: Record<string, string> = {};
      (data || []).forEach(row => {
        if (row.setting_key.startsWith("patent_section_")) {
          const sectionId = row.setting_key.replace("patent_section_", "");
          secFolders[sectionId] = row.folder_name;
        } else if (row.setting_key.startsWith("patent_item_")) {
          const itemId = row.setting_key.replace("patent_item_", "");
          itmFolders[itemId] = row.folder_name;
        }
      });
      setSectionFolders(secFolders);
      setItemFolders(itmFolders);
    };
    loadPatentFolderSettings();
  }, []);

  const openFolderDestDialog = (type: 'section' | 'item', id: string, label: string) => {
    const currentValue = type === 'section' ? (sectionFolders[id] || '') : (itemFolders[id] || '');
    setTempPatentFolder(currentValue);
    setFileDestContext({ type, id, label });
  };

  const saveFolderDest = async () => {
    if (!fileDestContext) return;
    setSavingFileDest(true);
    try {
      const settingKey = fileDestContext.type === 'section' 
        ? `patent_section_${fileDestContext.id}` 
        : `patent_item_${fileDestContext.id}`;
      
      const { data: existing } = await supabase
        .from("file_destination_settings")
        .select("id")
        .eq("setting_key", settingKey)
        .single();

      if (existing) {
        await supabase
          .from("file_destination_settings")
          .update({ folder_name: tempPatentFolder.trim(), updated_at: new Date().toISOString() })
          .eq("setting_key", settingKey);
      } else {
        await supabase
          .from("file_destination_settings")
          .insert({ setting_key: settingKey, folder_name: tempPatentFolder.trim() });
      }

      if (fileDestContext.type === 'section') {
        setSectionFolders(prev => ({ ...prev, [fileDestContext.id]: tempPatentFolder.trim() }));
      } else {
        setItemFolders(prev => ({ ...prev, [fileDestContext.id]: tempPatentFolder.trim() }));
      }
      
      toast.success("Configuración de carpetas actualizada");
      setFileDestContext(null);
    } catch (err: any) {
      toast.error("Error al guardar: " + (err?.message || "Error desconocido"));
    } finally {
      setSavingFileDest(false);
    }
  };
  
  // Shared items lookup: itemId -> folderId
  const sharedItemLookup = useMemo(() => {
    const map: Record<string, string> = {};
    sharedItems.forEach(si => { map[si.checklist_item_id] = si.shared_folder_id; });
    return map;
  }, [sharedItems]);
  
  // Shared files cache: folderId -> files
  const [sharedFilesCache, setSharedFilesCache] = useState<Record<string, { id: string; name: string; url: string }[]>>({});
  
  // Load shared files for all shared items
  useEffect(() => {
    const folderIds = [...new Set(sharedItems.map(si => si.shared_folder_id))];
    if (folderIds.length === 0) return;
    
    const loadSharedFiles = async () => {
      const { data } = await (await import("@/integrations/supabase/client")).supabase
        .from("repository_files")
        .select("id, name, url, folder_id")
        .in("folder_id", folderIds);
      
      const cache: Record<string, { id: string; name: string; url: string }[]> = {};
      (data || []).forEach((f: any) => {
        if (!cache[f.folder_id]) cache[f.folder_id] = [];
        cache[f.folder_id].push({ id: f.id, name: f.name, url: f.url });
      });
      setSharedFilesCache(cache);
    };
    loadSharedFiles();
  }, [sharedItems]);
  
  // Section collapsible state - collapsed by default
  const { isExpanded, toggle: toggleSection, expandAll, collapseAll } = useCollapsibleState('patent-checklist-sections', []);
  
  // Local state for document edits
  const [editingDoc, setEditingDoc] = useState<string | null>(null);
  const [docEdits, setDocEdits] = useState<Record<string, Partial<PatentDocument>>>({});
  const [savingItems, setSavingItems] = useState<Set<string>>(new Set());
  const saveTimeoutsRef = useRef<Record<string, NodeJS.Timeout>>({});
  
  // Comments and next actions state
  const [comments, setComments] = useState(contract.contract_patents?.comments || '');
  const [nextActions, setNextActions] = useState(contract.contract_patents?.next_actions || '');
  const [savingComments, setSavingComments] = useState(false);
  
  // Bulk selection state
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [bulkStatusDialogOpen, setBulkStatusDialogOpen] = useState(false);
  
  // Unsaved changes confirmation dialog
  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false);
  
  // Upload and alert dialogs
  const [uploadDialog, setUploadDialog] = useState<{ itemId: string; itemName: string } | null>(null);
  const [alertDialog, setAlertDialog] = useState<{ 
    docId: string; 
    itemName: string; 
    startDate?: string;
    endDate?: string;
  } | null>(null);
  const [includeFiles, setIncludeFiles] = useState(false);

  const currentPriority = contract.contract_patents?.priority || 'priority_3';
  const currentPatenteStatus = contract.patente_status || 'sin_patente';

  // Toggle item selection
  const toggleItemSelection = (itemId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedItems(prev => {
      const newSet = new Set(prev);
      if (newSet.has(itemId)) {
        newSet.delete(itemId);
      } else {
        newSet.add(itemId);
      }
      return newSet;
    });
  };

  // Select all items in a section
  const toggleSectionSelection = (sectionId: string) => {
    const sectionItems = itemsBySection[sectionId] || [];
    const allSelected = sectionItems.every(item => selectedItems.has(item.id));
    
    setSelectedItems(prev => {
      const newSet = new Set(prev);
      sectionItems.forEach(item => {
        if (allSelected) {
          newSet.delete(item.id);
        } else {
          newSet.add(item.id);
        }
      });
      return newSet;
    });
  };

  // Bulk status change
  const handleBulkStatusChange = async (status: PatentDocStatus) => {
    if (!user || selectedItems.size === 0) return;
    
    try {
      const promises = Array.from(selectedItems).map(itemId => 
        onUpdateDocumentStatus(contract.id, itemId, status, user.id)
      );
      await Promise.all(promises);
      toast.success(`${selectedItems.size} documentos actualizados`);
      setSelectedItems(new Set());
      setBulkStatusDialogOpen(false);
    } catch (error) {
      toast.error("Error al actualizar documentos");
    }
  };

  // Clear selection
  const clearSelection = () => {
    setSelectedItems(new Set());
  };

  // Select all items from all sections
  const selectAllItems = () => {
    const allItemIds = items.map(item => item.id);
    setSelectedItems(new Set(allItemIds));
    // Expand all sections to show selection
    expandAll(sections.map(s => s.id));
  };

  // Check if all items are selected
  const allItemsSelected = items.length > 0 && items.every(item => selectedItems.has(item.id));

  // Group items by section
  const itemsBySection = useMemo(() => {
    const grouped: Record<string, PatentChecklistItem[]> = {};
    sections.forEach(section => {
      grouped[section.id] = items.filter(item => item.section_id === section.id);
    });
    return grouped;
  }, [sections, items]);

  // Build fixed emitter lookup (item_id -> emitter_id)
  const fixedEmitterLookup = useMemo(() => {
    const lookup: Record<string, string> = {};
    itemEmitters.forEach(ie => {
      lookup[ie.checklist_item_id] = ie.emitter_id;
    });
    return lookup;
  }, [itemEmitters]);

  // Get fixed emitter name for an item
  const getFixedEmitterName = (itemId: string): string | null => {
    const emitterId = fixedEmitterLookup[itemId];
    if (!emitterId) return null;
    const emitter = emitters.find(e => e.id === emitterId);
    return emitter?.name || null;
  };

  // Get document for an item
  const getDocument = (itemId: string): PatentDocument | undefined => {
    return (contract.patent_documents || []).find(d => d.checklist_item_id === itemId);
  };

  // Calculate dates based on logic - fixed to properly detect which fields to calculate
  const calculateDates = (
    startDate?: string,
    endDate?: string,
    deadlineDays?: number,
    changedField?: 'start_date' | 'end_date' | 'deadline_days'
  ): { start_date?: string; end_date?: string; deadline_days?: number } => {
    // If we have start + days, calculate end
    if (changedField === 'start_date' && startDate && deadlineDays && deadlineDays > 0) {
      const end = addDays(parseLocalDate(startDate), deadlineDays);
      return { start_date: startDate, end_date: formatLocalDate(end), deadline_days: deadlineDays };
    }
    // If we have end + days, calculate start
    if (changedField === 'end_date' && endDate && deadlineDays && deadlineDays > 0) {
      const start = addDays(parseLocalDate(endDate), -deadlineDays);
      return { start_date: formatLocalDate(start), end_date: endDate, deadline_days: deadlineDays };
    }
    // If we have days and already have start, calculate end
    if (changedField === 'deadline_days' && deadlineDays && deadlineDays > 0 && startDate) {
      const end = addDays(parseLocalDate(startDate), deadlineDays);
      return { start_date: startDate, end_date: formatLocalDate(end), deadline_days: deadlineDays };
    }
    // If we have days and already have end but no start, calculate start
    if (changedField === 'deadline_days' && deadlineDays && deadlineDays > 0 && endDate && !startDate) {
      const start = addDays(parseLocalDate(endDate), -deadlineDays);
      return { start_date: formatLocalDate(start), end_date: endDate, deadline_days: deadlineDays };
    }
    // If we have start + end, calculate days
    if (startDate && endDate && !deadlineDays) {
      const days = differenceInDays(new Date(endDate), new Date(startDate));
      return { start_date: startDate, end_date: endDate, deadline_days: days > 0 ? days : undefined };
    }
    return { start_date: startDate, end_date: endDate, deadline_days: deadlineDays };
  };

  const handlePriorityChange = async (priority: PatentPriority) => {
    if (!user) return;
    try {
      await onUpdatePriority(contract.id, priority, user.id);
      toast.success("Prioridad actualizada");
    } catch (error) {
      toast.error("Error al actualizar prioridad");
    }
  };

  const handlePatenteStatusChange = async (patenteStatus: string) => {
    try {
      await onUpdatePatenteStatus(contract.id, patenteStatus);
      
      // If setting to "definitiva", automatically set priority to "vigente"
      if (patenteStatus === 'definitiva' && user) {
        await onUpdatePriority(contract.id, 'vigente', user.id);
      }
      
      toast.success("Estado de patente actualizado");
    } catch (error) {
      toast.error("Error al actualizar estado de patente");
    }
  };

  const handleSaveComments = async () => {
    try {
      setSavingComments(true);
      await onUpdateComments(contract.id, comments, nextActions);
      toast.success("Guardado correctamente");
    } catch (error) {
      toast.error("Error al guardar");
    } finally {
      setSavingComments(false);
    }
  };

  const hasCommentsChanged = comments !== (contract.contract_patents?.comments || '') || 
                              nextActions !== (contract.contract_patents?.next_actions || '');

  // Handle back with unsaved changes check
  const handleBack = () => {
    if (hasCommentsChanged) {
      setShowUnsavedDialog(true);
    } else {
      onBack();
    }
  };

  const handleConfirmLeave = () => {
    setShowUnsavedDialog(false);
    onBack();
  };

  const handleSaveAndLeave = async () => {
    await handleSaveComments();
    setShowUnsavedDialog(false);
    onBack();
  };

  const handleStatusChange = async (itemId: string, status: PatentDocStatus) => {
    if (!user) return;
    try {
      await onUpdateDocumentStatus(contract.id, itemId, status, user.id);
      toast.success("Estado actualizado");

      // Auto-register KPI entry when status changes to "ok"
      if (status === 'ok') {
        try {
          const { supabase: sb } = await import("@/integrations/supabase/client");
          const { data: config } = await sb
            .from("patent_kpi_config")
            .select("kpi_id, checklist_item_id")
            .limit(1)
            .single();
          
          if (config?.kpi_id && (!config.checklist_item_id || config.checklist_item_id === itemId)) {
            const item = items.find(i => i.id === itemId);
            const entryName = `${contract.name} - ${item?.name || 'Documento'}`;
            await sb.from("kpi_empresa_entries").insert({
              kpi_id: config.kpi_id,
              name: entryName,
              description: `Documento marcado como OK en módulo de Patentes`,
              entry_date: new Date().toISOString().split('T')[0],
              created_by: user.id,
            });
            toast.success("Ingreso KPI registrado automáticamente");
          }
        } catch (kpiError) {
          console.error("Error registering KPI entry:", kpiError);
        }
      }
    } catch (error) {
      toast.error("Error al actualizar estado");
    }
  };

  // Auto-save function with debounce
  const autoSaveDocument = useCallback(async (itemId: string, updates: Partial<PatentDocument>) => {
    if (Object.keys(updates).length === 0) return;
    
    setSavingItems(prev => new Set(prev).add(itemId));
    try {
      await onUpdateDocument(contract.id, itemId, updates);
      setDocEdits(prev => {
        const newEdits = { ...prev };
        delete newEdits[itemId];
        return newEdits;
      });
    } catch (error) {
      toast.error("Error al guardar");
    } finally {
      setSavingItems(prev => {
        const newSet = new Set(prev);
        newSet.delete(itemId);
        return newSet;
      });
    }
  }, [contract.id, onUpdateDocument]);

  const handleDocumentFieldChange = (itemId: string, field: keyof PatentDocument, value: any, immediatelySave = false) => {
    const currentEdits = docEdits[itemId] || {};
    const doc = getDocument(itemId);
    
    let updates: Partial<PatentDocument> = { ...currentEdits, [field]: value };

    // Auto-calculate dates when changing date-related fields
    if (field === 'start_date' || field === 'end_date' || field === 'deadline_days') {
      const newStart = field === 'start_date' ? value : (currentEdits.start_date || doc?.start_date);
      const newEnd = field === 'end_date' ? value : (currentEdits.end_date || doc?.end_date);
      const newDays = field === 'deadline_days' ? value : (currentEdits.deadline_days || doc?.deadline_days);
      
      const calculated = calculateDates(newStart, newEnd, newDays, field as 'start_date' | 'end_date' | 'deadline_days');
      updates = { ...updates, ...calculated };
    }

    setDocEdits(prev => ({ ...prev, [itemId]: updates }));

    // Clear existing timeout for this item
    if (saveTimeoutsRef.current[itemId]) {
      clearTimeout(saveTimeoutsRef.current[itemId]);
      delete saveTimeoutsRef.current[itemId];
    }

    // For text fields (notes, responsible), don't auto-save — wait for Enter/blur
    const textFields: (keyof PatentDocument)[] = ['notes', 'responsible'];
    if (textFields.includes(field) && !immediatelySave) {
      return;
    }

    // For non-text fields, auto-save with short debounce
    saveTimeoutsRef.current[itemId] = setTimeout(() => {
      autoSaveDocument(itemId, updates);
      delete saveTimeoutsRef.current[itemId];
    }, 400);
  };

  const commitTextField = (itemId: string) => {
    const edits = docEdits[itemId];
    if (edits && Object.keys(edits).length > 0) {
      if (saveTimeoutsRef.current[itemId]) {
        clearTimeout(saveTimeoutsRef.current[itemId]);
        delete saveTimeoutsRef.current[itemId];
      }
      autoSaveDocument(itemId, edits);
    }
  };

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      Object.values(saveTimeoutsRef.current).forEach(clearTimeout);
    };
  }, []);

  // Convenience function for date changes
  const handleDateChange = (itemId: string, field: 'start_date' | 'end_date', value: string) => {
    handleDocumentFieldChange(itemId, field, value);
  };

  // Convenience function for deadline days changes
  const handleDeadlineDaysChange = (itemId: string, days: number) => {
    handleDocumentFieldChange(itemId, 'deadline_days', days > 0 ? days : null);
  };

  const getDocValue = (itemId: string, field: keyof PatentDocument): any => {
    const edits = docEdits[itemId];
    const doc = getDocument(itemId);
    if (edits && field in edits) return edits[field];
    return doc?.[field];
  };

  return (
    <div className="space-y-6 w-full">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={handleBack}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Volver
          </Button>
          <div>
            <h2 className="text-xl font-semibold">{contract.name}</h2>
            {contract.contract_companies && contract.contract_companies.length > 0 && (
              <p className="text-sm font-medium text-foreground">
                {contract.contract_companies.map((cc: any) => cc.companies?.name).filter(Boolean).join(', ')}
              </p>
            )}
            <p className="text-sm text-muted-foreground">
              {contract.contract_addresses?.[0]?.street} {contract.contract_addresses?.[0]?.number}, {contract.contract_addresses?.[0]?.commune}
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="gap-2">
                <Download className="h-4 w-4" />
                Descargar
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-2">
              <div className="space-y-1">
                <div className="flex items-center gap-2 px-2 py-1.5 border-b mb-1">
                  <Checkbox id="include-files" checked={includeFiles} onCheckedChange={(checked) => setIncludeFiles(!!checked)} />
                  <label htmlFor="include-files" className="text-xs font-medium text-muted-foreground cursor-pointer select-none">
                    Incluir archivos (ZIP)
                  </label>
                </div>
                <Button 
                  variant="ghost" 
                  className="w-full justify-start text-sm"
                  onClick={() => {
                    if (includeFiles) {
                      toast.promise(
                        exportPatentsWithFiles(contract, sections, items, emitters, itemEmitters),
                        { loading: "Preparando ZIP con archivos...", success: "ZIP descargado", error: "Error al generar ZIP" }
                      );
                    } else {
                      exportPatentsToExcel(contract, sections, items, emitters, itemEmitters);
                    }
                  }}
                >
                  <FileText className="h-4 w-4 mr-2" />
                  Todas las secciones
                </Button>
                {sections.map(section => (
                  <Button 
                    key={section.id}
                    variant="ghost" 
                    className="w-full justify-start text-sm"
                    onClick={() => {
                      if (includeFiles) {
                        toast.promise(
                          exportPatentsWithFiles(contract, sections, items, emitters, itemEmitters, section.id),
                          { loading: "Preparando ZIP...", success: "ZIP descargado", error: "Error al generar ZIP" }
                        );
                      } else {
                        exportPatentsToExcel(contract, sections, items, emitters, itemEmitters, section.id);
                      }
                    }}
                  >
                    <FileText className="h-4 w-4 mr-2" />
                    {section.name}
                  </Button>
                ))}
              </div>
            </PopoverContent>
          </Popover>
          
          <span className="text-sm text-muted-foreground">Estado Patente:</span>
          <Select value={currentPatenteStatus} onValueChange={handlePatenteStatusChange}>
            <SelectTrigger className="w-[130px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="sin_patente">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-red-500" />
                  Sin Patente
                </div>
              </SelectItem>
              <SelectItem value="provisoria">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-yellow-500" />
                  Provisoria
                </div>
              </SelectItem>
              <SelectItem value="definitiva">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-green-500" />
                  Definitiva
                </div>
              </SelectItem>
            </SelectContent>
          </Select>

          <span className="text-sm text-muted-foreground">Prioridad:</span>
          <Select value={currentPriority} onValueChange={(v) => handlePriorityChange(v as PatentPriority)}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(PRIORITY_CONFIG).map(([key, config]) => (
                <SelectItem key={key} value={key}>
                  <div className="flex items-center gap-2">
                    <div 
                      className="w-3 h-3 rounded-full" 
                      style={{ backgroundColor: config.color }}
                    />
                    {config.label}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Comments and Next Actions Section */}
      <SyncedTextareas
        comments={comments}
        nextActions={nextActions}
        onCommentsChange={setComments}
        onNextActionsChange={setNextActions}
      />

      {/* Save button for both textareas */}
      {hasCommentsChanged && (
        <div className="flex justify-end">
          <Button 
            onClick={handleSaveComments}
            disabled={savingComments}
          >
            <Save className="h-4 w-4 mr-2" />
            {savingComments ? 'Guardando...' : 'Guardar Comentarios'}
          </Button>
        </div>
      )}

      {/* Floating Bulk actions bar - fixed at bottom */}
      {selectedItems.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-auto max-w-[90vw]">
          <Card className="border-primary bg-background shadow-lg">
            <CardContent className="py-3 px-6 flex items-center gap-6">
              <div className="flex items-center gap-2">
                <Badge variant="default" className="bg-primary">{selectedItems.size} seleccionados</Badge>
                <Button variant="ghost" size="sm" onClick={clearSelection}>
                  <X className="h-4 w-4 mr-1" />
                  Limpiar
                </Button>
              </div>
              <div className="h-6 w-px bg-border" />
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground whitespace-nowrap">Cambiar estado a:</span>
                {statuses.map(statusItem => (
                  <Button
                    key={statusItem.code}
                    variant="outline"
                    size="sm"
                    className="gap-1"
                    style={{ 
                      backgroundColor: statusItem.bg_color + '20',
                      borderColor: statusItem.bg_color,
                      color: statusItem.text_color
                    }}
                    onClick={() => handleBulkStatusChange(statusItem.code as PatentDocStatus)}
                  >
                    {statusItem.name}
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Global select all button */}
      <div className="flex items-center gap-2">
        <Button
          variant={allItemsSelected ? "default" : "outline"}
          size="sm"
          onClick={() => {
            if (allItemsSelected) {
              clearSelection();
            } else {
              selectAllItems();
            }
          }}
          className="gap-1"
        >
          {allItemsSelected ? (
            <><CheckSquare className="h-4 w-4" /> Deseleccionar todos los documentos</>
          ) : (
            <><Square className="h-4 w-4" /> Seleccionar todos los documentos</>
          )}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => expandAll(sections.map(s => s.id))}
          className="gap-1"
        >
          Expandir todo
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => collapseAll()}
          className="gap-1"
        >
          Colapsar todo
        </Button>
      </div>

      {/* Checklist by sections */}
      {sections.map(section => {
        const sectionItems = itemsBySection[section.id] || [];
        const allSectionSelected = sectionItems.length > 0 && sectionItems.every(item => selectedItems.has(item.id));
        const someSectionSelected = sectionItems.some(item => selectedItems.has(item.id));
        const isSectionExpanded = isExpanded(section.id);
        
        return (
        <Collapsible key={section.id} open={isSectionExpanded} onOpenChange={() => toggleSection(section.id)}>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between py-3">
              <CollapsibleTrigger asChild>
                <Button variant="ghost" className="flex items-center gap-2 p-0 h-auto hover:bg-transparent">
                  <ChevronDown className={`h-5 w-5 transition-transform duration-200 ${isSectionExpanded ? '' : '-rotate-90'}`} />
                  <CardTitle className="text-lg">{section.name}</CardTitle>
                  {someSectionSelected && (
                    <Badge variant="secondary" className="ml-2">
                      {sectionItems.filter(i => selectedItems.has(i.id)).length} seleccionados
                    </Badge>
                  )}
                </Button>
              </CollapsibleTrigger>
              <div className="flex items-center gap-1">
                {isAdmin && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      openFolderDestDialog('section', section.id, section.name);
                    }}
                    title="Configurar carpetas de destino"
                    className="h-8 w-8 p-0"
                  >
                    <FolderCog className={`h-4 w-4 ${sectionFolders[section.id] ? 'text-primary' : 'text-muted-foreground'}`} />
                  </Button>
                )}
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleSectionSelection(section.id);
                  }}
                  className="gap-1"
                >
                  {allSectionSelected ? (
                    <><CheckSquare className="h-4 w-4" /> Deseleccionar</>
                  ) : (
                    <><Square className="h-4 w-4" /> Seleccionar todos</>
                  )}
                </Button>
              </div>
            </CardHeader>
            <CollapsibleContent>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table className="min-w-[1400px]">
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[40px]"></TableHead>
                        <TableHead className="min-w-[200px]">Documento</TableHead>
                        <TableHead className="min-w-[120px]">Estado</TableHead>
                        <TableHead className="min-w-[150px]">Emisor</TableHead>
                        <TableHead className="min-w-[150px]">Responsable</TableHead>
                        <TableHead className="min-w-[130px]">Fecha Inicio</TableHead>
                        <TableHead className="min-w-[100px]">Plazo (días)</TableHead>
                        <TableHead className="min-w-[130px]">Fecha Término</TableHead>
                        <TableHead className="min-w-[100px]">Archivo</TableHead>
                        <TableHead className="min-w-[200px]">Notas</TableHead>
                        <TableHead className="min-w-[120px]">Acciones</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(itemsBySection[section.id] || []).map(item => {
                      const doc = getDocument(item.id);
                        const sharedFolderId = sharedItemLookup[item.id];
                        const hasSharedFiles = sharedFolderId && (sharedFilesCache[sharedFolderId]?.length || 0) > 0;
                        const rawStatus = getDocValue(item.id, 'status') as PatentDocStatus || 'pendiente';
                        const status: PatentDocStatus = hasSharedFiles ? 'ok' : rawStatus;
                        const isSaving = savingItems.has(item.id);

                        // Determine which fields to disable based on status
                        const isNoAplica = status === 'no_aplica';
                        const isOk = status === 'ok';
                        const disableEmitter = isNoAplica;
                        const disableOtherFields = isNoAplica || isOk;
                        const disabledCellClass = "opacity-40 pointer-events-none";

                        const isSelected = selectedItems.has(item.id);

                        return (
                          <TableRow 
                            key={item.id} 
                            onClick={() => setEditingDoc(item.id)}
                            className={isSelected ? "bg-primary/5" : ""}
                          >
                            <TableCell onClick={(e) => e.stopPropagation()}>
                              <Checkbox 
                                checked={isSelected}
                                onCheckedChange={() => toggleItemSelection(item.id, { stopPropagation: () => {} } as React.MouseEvent)}
                              />
                            </TableCell>
                            <TableCell className="font-medium">{item.name}</TableCell>
                            <TableCell>
                              <Select 
                                value={status} 
                                onValueChange={(v) => handleStatusChange(item.id, v as PatentDocStatus)}
                              >
                                <SelectTrigger className="h-8">
                                  <PatentStatusBadge status={status} size="sm" />
                                </SelectTrigger>
                                <SelectContent>
                                  {statuses.map((statusItem) => (
                                    <SelectItem key={statusItem.code} value={statusItem.code}>
                                      <div className="flex items-center gap-2">
                                        <div 
                                          className="w-3 h-3 rounded-full" 
                                          style={{ backgroundColor: statusItem.bg_color }}
                                        />
                                        {statusItem.name}
                                      </div>
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </TableCell>
                            <TableCell className={disableEmitter ? disabledCellClass : ""}>
                              {getFixedEmitterName(item.id) ? (
                                <span className="text-muted-foreground">{getFixedEmitterName(item.id)}</span>
                              ) : (
                                <Select 
                                  value={getDocValue(item.id, 'emitter_id') || ''} 
                                  onValueChange={(v) => handleDocumentFieldChange(item.id, 'emitter_id', v)}
                                  disabled={disableEmitter}
                                >
                                  <SelectTrigger className="h-8">
                                    <SelectValue placeholder="Emisor" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {emitters.map((emitter) => (
                                      <SelectItem key={emitter.id} value={emitter.id}>
                                        {emitter.name}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              )}
                            </TableCell>
                            <TableCell className={disableOtherFields ? disabledCellClass : ""}>
                              <Input
                                className="h-8"
                                value={getDocValue(item.id, 'responsible') || ''}
                                onChange={(e) => handleDocumentFieldChange(item.id, 'responsible', e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Enter') { e.currentTarget.blur(); } }}
                                onBlur={() => commitTextField(item.id)}
                                placeholder="Responsable"
                                disabled={disableOtherFields}
                              />
                            </TableCell>
                            <TableCell className={disableOtherFields ? disabledCellClass : ""}>
                              <Popover>
                                <PopoverTrigger asChild>
                                  <Button variant="outline" size="sm" className="h-8 w-full justify-start" disabled={disableOtherFields}>
                                    <CalendarIcon className="h-3 w-3 mr-1" />
                                    {getDocValue(item.id, 'start_date') 
                                      ? formatDisplayDate(parseLocalDate(getDocValue(item.id, 'start_date') as string))
                                      : '-'}
                                  </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0" align="start">
                                  <Calendar
                                    mode="single"
                                    selected={getDocValue(item.id, 'start_date') ? parseLocalDate(getDocValue(item.id, 'start_date') as string) : undefined}
                                    onSelect={(date) => {
                                      if (date) {
                                        handleDateChange(item.id, 'start_date', formatLocalDate(date));
                                      }
                                    }}
                                    locale={es}
                                    className="pointer-events-auto"
                                  />
                                </PopoverContent>
                              </Popover>
                            </TableCell>
                            <TableCell className={disableOtherFields ? disabledCellClass : ""}>
                              <Input
                                className="h-8 w-20"
                                type="number"
                                value={getDocValue(item.id, 'deadline_days') || ''}
                                onChange={(e) => {
                                  const days = parseInt(e.target.value) || 0;
                                  handleDeadlineDaysChange(item.id, days);
                                }}
                                placeholder="Días"
                                disabled={disableOtherFields}
                              />
                            </TableCell>
                            <TableCell className={disableOtherFields ? disabledCellClass : ""}>
                              <Popover>
                                <PopoverTrigger asChild>
                                  <Button variant="outline" size="sm" className="h-8 w-full justify-start" disabled={disableOtherFields}>
                                    <CalendarIcon className="h-3 w-3 mr-1" />
                                    {getDocValue(item.id, 'end_date') 
                                      ? formatDisplayDate(parseLocalDate(getDocValue(item.id, 'end_date') as string))
                                      : '-'}
                                  </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0" align="start">
                                  <Calendar
                                    mode="single"
                                    selected={getDocValue(item.id, 'end_date') ? parseLocalDate(getDocValue(item.id, 'end_date') as string) : undefined}
                                    onSelect={(date) => {
                                      if (date) {
                                        handleDateChange(item.id, 'end_date', formatLocalDate(date));
                                      }
                                    }}
                                    locale={es}
                                    className="pointer-events-auto"
                                  />
                                </PopoverContent>
                              </Popover>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1">
                                {/* Shared item: show files from shared repository */}
                                {sharedItemLookup[item.id] ? (() => {
                                  const folderId = sharedItemLookup[item.id];
                                  const sharedFiles = sharedFilesCache[folderId] || [];
                                  return (
                                    <>
                                      {sharedFiles.length > 0 ? (
                                        sharedFiles.length > 1 ? (
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-8 text-primary hover:text-primary/80"
                                            onClick={async (e) => {
                                              e.stopPropagation();
                                              // Open first file, show count
                                              const { getSignedUrl } = await import('@/lib/storageUtils');
                                              const signedUrl = await getSignedUrl(sharedFiles[0].url);
                                              if (signedUrl) window.open(signedUrl, '_blank');
                                            }}
                                            title={`${sharedFiles.length} archivos compartidos`}
                                          >
                                            <FolderOpen className="h-3 w-3" />
                                            <span className="ml-1 text-xs">{sharedFiles.length}</span>
                                          </Button>
                                        ) : (
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-8 text-primary hover:text-primary/80"
                                            onClick={async (e) => {
                                              e.stopPropagation();
                                              const { getSignedUrl } = await import('@/lib/storageUtils');
                                              const signedUrl = await getSignedUrl(sharedFiles[0].url);
                                              if (signedUrl) window.open(signedUrl, '_blank');
                                              else toast.error("No se pudo acceder al archivo");
                                            }}
                                            title={`Archivo compartido: ${sharedFiles[0].name}`}
                                          >
                                            <FolderOpen className="h-3 w-3" />
                                          </Button>
                                        )
                                      ) : null}
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-8"
                                        onClick={async (e) => {
                                          e.stopPropagation();
                                          // Upload to shared folder
                                          const input = document.createElement('input');
                                          input.type = 'file';
                                          input.accept = '.pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png';
                                          input.multiple = true;
                                          input.onchange = async () => {
                                            if (!input.files?.length) return;
                                            const { sanitizeFileName } = await import('@/lib/fileValidation');
                                            const { supabase } = await import('@/integrations/supabase/client');
                                            for (const file of Array.from(input.files)) {
                                              const sanitized = sanitizeFileName(file.name);
                                              const path = `shared-patents/${folderId}/${Date.now()}_${sanitized}`;
                                              const { error } = await supabase.storage.from('repository-files').upload(path, file, { upsert: true });
                                              if (error) { toast.error(`Error al subir ${file.name}`); continue; }
                                              await supabase.from('repository_files').insert({
                                                folder_id: folderId, name: file.name,
                                                url: `storage://repository-files/${path}`, file_type: file.type || null,
                                              });
                                            }
                                            toast.success("Archivo(s) subido(s) al repositorio común");
                                            // Refresh shared files
                                            const { data } = await supabase.from('repository_files').select('id, name, url, folder_id').eq('folder_id', folderId);
                                            setSharedFilesCache(prev => ({ ...prev, [folderId]: (data || []).map((f: any) => ({ id: f.id, name: f.name, url: f.url })) }));
                                          };
                                          input.click();
                                        }}
                                        title="Subir al repositorio común"
                                      >
                                        <Upload className="h-3 w-3" />
                                      </Button>
                                    </>
                                  );
                                })() : (
                                  <>
                                    {/* Regular (non-shared) item: existing logic */}
                                    {getDocValue(item.id, 'document_url') && (() => {
                                      const urls = (getDocValue(item.id, 'document_url') as string).split('|||').filter(Boolean);
                                      return urls.length > 1 ? (
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          className="h-8 text-primary hover:text-primary/80"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setUploadDialog({ itemId: item.id, itemName: item.name });
                                          }}
                                          title={`${urls.length} archivos - click para ver`}
                                        >
                                          <FileText className="h-3 w-3" />
                                          <span className="ml-1 text-xs">{urls.length}</span>
                                        </Button>
                                      ) : (
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          className="h-8 text-primary hover:text-primary/80"
                                          onClick={async (e) => {
                                            e.stopPropagation();
                                            const url = urls[0];
                                            if (url.startsWith('storage://') || url.includes('/repository-files/')) {
                                              const { getSignedUrl } = await import('@/lib/storageUtils');
                                              const signedUrl = await getSignedUrl(url);
                                              if (signedUrl) {
                                                window.open(signedUrl, '_blank');
                                              } else {
                                                toast.error("No se pudo acceder al archivo");
                                              }
                                            } else {
                                              window.open(url, '_blank');
                                            }
                                          }}
                                          title="Ver archivo"
                                        >
                                          <FileText className="h-3 w-3" />
                                        </Button>
                                      );
                                    })()}
                                    {(status === "ok" || !getDocValue(item.id, 'document_url')) && (
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className={`h-8 ${status !== "ok" && disableOtherFields ? disabledCellClass : ""}`}
                                        disabled={status !== "ok" && disableOtherFields}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setUploadDialog({ itemId: item.id, itemName: item.name });
                                        }}
                                        title={getDocValue(item.id, 'document_url') ? "Agregar otro archivo" : "Subir archivo"}
                                      >
                                        <Upload className="h-3 w-3" />
                                      </Button>
                                    )}
                                    {isAdmin && (
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-8 w-8 p-0"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          openFolderDestDialog('item', item.id, item.name);
                                        }}
                                        title="Configurar carpetas adicionales para este documento"
                                      >
                                        <FolderCog className={`h-3 w-3 ${itemFolders[item.id] ? 'text-primary' : 'text-muted-foreground'}`} />
                                      </Button>
                                    )}
                                  </>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className={disableOtherFields ? disabledCellClass : ""}>
                              <Input
                                className="h-8"
                                maxLength={150}
                                value={getDocValue(item.id, 'notes') || ''}
                                onChange={(e) => handleDocumentFieldChange(item.id, 'notes', e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Enter') { e.currentTarget.blur(); } }}
                                onBlur={() => commitTextField(item.id)}
                                placeholder="Notas (máx 150)"
                                disabled={disableOtherFields}
                              />
                            </TableCell>
                            <TableCell className={disableOtherFields ? disabledCellClass : ""}>
                              <div className="flex gap-1 items-center">
                                {savingItems.has(item.id) && (
                                  <span className="text-xs text-muted-foreground animate-pulse">Guardando...</span>
                                )}
                                {!disableOtherFields && (
                                  <Button 
                                    size="sm" 
                                    variant="ghost"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      const d = getDocument(item.id);
                                      if (d?.id) {
                                        setAlertDialog({
                                          docId: d.id,
                                          itemName: item.name,
                                          startDate: getDocValue(item.id, 'start_date'),
                                          endDate: getDocValue(item.id, 'end_date'),
                                        });
                                      } else {
                                        toast.error("Primero debe existir un documento para crear alertas");
                                      }
                                    }}
                                  >
                                    <Bell className="h-3 w-3" />
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>
        );
      })}

  

      {/* Document Upload Dialog */}
      {uploadDialog && (
        <PatentDocumentUpload
          open={!!uploadDialog}
          onOpenChange={() => setUploadDialog(null)}
          contractId={contract.id}
          itemId={uploadDialog.itemId}
          itemName={uploadDialog.itemName}
          currentUrl={getDocValue(uploadDialog.itemId, 'document_url') as string}
          onSave={async (url) => {
            // Save document URL immediately (no debounce for file uploads)
            await onUpdateDocument(contract.id, uploadDialog.itemId, { document_url: url });
          }}
        />
      )}

      {/* Alert Dialog */}
      {alertDialog && (
        <PatentAlertDialog
          open={!!alertDialog}
          onOpenChange={() => setAlertDialog(null)}
          documentId={alertDialog.docId}
          documentName={alertDialog.itemName}
          contractId={contract.id}
          contractName={contract.name}
          startDate={alertDialog.startDate}
          endDate={alertDialog.endDate}
        />
      )}

      {/* Unsaved changes confirmation dialog */}
      <AlertDialog open={showUnsavedDialog} onOpenChange={setShowUnsavedDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cambios sin guardar</AlertDialogTitle>
            <AlertDialogDescription>
              Tiene comentarios o acciones sin guardar. ¿Desea guardar los cambios antes de salir?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleConfirmLeave}>
              Salir sin guardar
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleSaveAndLeave}>
              Guardar y salir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {/* File Destination Dialog */}
      <Dialog open={!!fileDestContext} onOpenChange={(open) => { if (!open) setFileDestContext(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FolderCog className="h-5 w-5 text-primary" />
              {fileDestContext?.type === 'section' 
                ? `Carpetas de Destino - ${fileDestContext?.label}`
                : `Carpeta Adicional - ${fileDestContext?.label}`}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              {fileDestContext?.type === 'section' 
                ? "Seleccione las carpetas de destino para todos los documentos de esta sección. Aplica a todos los ítems de la sección."
                : "Seleccione carpetas adicionales solo para este documento. No afecta a la sección ni a los demás ítems."}
            </p>
            <FolderDestinationPicker
              icon={<FileText className="h-4 w-4 text-orange-500" />}
              label={fileDestContext?.type === 'section' ? "Carpetas de la sección" : "Carpetas adicionales del ítem"}
              description={fileDestContext?.type === 'section' 
                ? "Todos los documentos de esta sección se guardarán aquí"
                : "Carpetas adicionales solo para este documento"}
              value={tempPatentFolder}
              onChange={setTempPatentFolder}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFileDestContext(null)} disabled={savingFileDest}>
              Cancelar
            </Button>
            <Button
              disabled={savingFileDest}
              onClick={saveFolderDest}
            >
              {savingFileDest ? "Guardando..." : (
                <>
                  <Save className="h-4 w-4 mr-1" />
                  Guardar
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
