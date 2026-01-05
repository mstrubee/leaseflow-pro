import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ArrowLeft, CalendarIcon, Save, Bell, Upload, FileText, Download, CheckSquare, Square, X } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { exportPatentsToExcel } from "./exportPatentsExcel";
import { format, addDays, differenceInDays } from "date-fns";
import { es } from "date-fns/locale";
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
  PRIORITY_CONFIG
} from "./types";
import { PatentPriorityBadge } from "./PatentPriorityBadge";
import { PatentStatusBadge } from "./PatentStatusBadge";
import { PatentDocumentUpload } from "./PatentDocumentUpload";
import { PatentAlertDialog } from "./PatentAlertDialog";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

interface PatentChecklistProps {
  contract: ContractWithPatent;
  sections: PatentChecklistSection[];
  items: PatentChecklistItem[];
  emitters: PatentEmitter[];
  itemEmitters: PatentItemEmitter[];
  statuses: PatentStatus[];
  onBack: () => void;
  onUpdatePriority: (contractId: string, priority: PatentPriority, userId: string) => Promise<void>;
  onUpdatePatenteStatus: (contractId: string, patenteStatus: string) => Promise<void>;
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
  onBack,
  onUpdatePriority,
  onUpdatePatenteStatus,
  onUpdateDocument,
  onUpdateDocumentStatus,
}: PatentChecklistProps) {
  const { user } = useAuth();
  
  // Local state for document edits
  const [editingDoc, setEditingDoc] = useState<string | null>(null);
  const [docEdits, setDocEdits] = useState<Record<string, Partial<PatentDocument>>>({});
  
  // Bulk selection state
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [bulkStatusDialogOpen, setBulkStatusDialogOpen] = useState(false);
  
  // Upload and alert dialogs
  const [uploadDialog, setUploadDialog] = useState<{ itemId: string; itemName: string } | null>(null);
  const [alertDialog, setAlertDialog] = useState<{ 
    docId: string; 
    itemName: string; 
    startDate?: string;
    endDate?: string;
  } | null>(null);

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
      const end = addDays(new Date(startDate), deadlineDays);
      return { start_date: startDate, end_date: format(end, 'yyyy-MM-dd'), deadline_days: deadlineDays };
    }
    // If we have end + days, calculate start
    if (changedField === 'end_date' && endDate && deadlineDays && deadlineDays > 0) {
      const start = addDays(new Date(endDate), -deadlineDays);
      return { start_date: format(start, 'yyyy-MM-dd'), end_date: endDate, deadline_days: deadlineDays };
    }
    // If we have days and already have start, calculate end
    if (changedField === 'deadline_days' && deadlineDays && deadlineDays > 0 && startDate) {
      const end = addDays(new Date(startDate), deadlineDays);
      return { start_date: startDate, end_date: format(end, 'yyyy-MM-dd'), deadline_days: deadlineDays };
    }
    // If we have days and already have end but no start, calculate start
    if (changedField === 'deadline_days' && deadlineDays && deadlineDays > 0 && endDate && !startDate) {
      const start = addDays(new Date(endDate), -deadlineDays);
      return { start_date: format(start, 'yyyy-MM-dd'), end_date: endDate, deadline_days: deadlineDays };
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

  const handleStatusChange = async (itemId: string, status: PatentDocStatus) => {
    if (!user) return;
    try {
      await onUpdateDocumentStatus(contract.id, itemId, status, user.id);
      toast.success("Estado actualizado");
    } catch (error) {
      toast.error("Error al actualizar estado");
    }
  };

  const handleDocumentFieldChange = (itemId: string, field: keyof PatentDocument, value: any) => {
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
  };

  const saveDocumentChanges = async (itemId: string) => {
    const edits = docEdits[itemId];
    if (!edits) return;

    try {
      await onUpdateDocument(contract.id, itemId, edits);
      setDocEdits(prev => {
        const newEdits = { ...prev };
        delete newEdits[itemId];
        return newEdits;
      });
      setEditingDoc(null);
      toast.success("Cambios guardados");
    } catch (error) {
      toast.error("Error al guardar");
    }
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
          <Button variant="ghost" onClick={onBack}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Volver
          </Button>
          <div>
            <h2 className="text-xl font-semibold">{contract.name}</h2>
            <p className="text-sm text-muted-foreground">
              {contract.contract_addresses?.[0]?.region} - {contract.contract_addresses?.[0]?.commune}
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="gap-2">
                <Download className="h-4 w-4" />
                Descargar Excel
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-56 p-2">
              <div className="space-y-1">
                <Button 
                  variant="ghost" 
                  className="w-full justify-start text-sm"
                  onClick={() => exportPatentsToExcel(contract, sections, items, emitters, itemEmitters)}
                >
                  Todas las secciones
                </Button>
                <div className="border-t my-1" />
                {sections.map(section => (
                  <Button 
                    key={section.id}
                    variant="ghost" 
                    className="w-full justify-start text-sm"
                    onClick={() => exportPatentsToExcel(contract, sections, items, emitters, itemEmitters, section.id)}
                  >
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

      {/* Checklist by sections */}
      {sections.map(section => {
        const sectionItems = itemsBySection[section.id] || [];
        const allSectionSelected = sectionItems.length > 0 && sectionItems.every(item => selectedItems.has(item.id));
        const someSectionSelected = sectionItems.some(item => selectedItems.has(item.id));
        
        return (
        <Card key={section.id}>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg">{section.name}</CardTitle>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => toggleSectionSelection(section.id)}
              className="gap-1"
            >
              {allSectionSelected ? (
                <><CheckSquare className="h-4 w-4" /> Deseleccionar</>
              ) : (
                <><Square className="h-4 w-4" /> Seleccionar todos</>
              )}
            </Button>
          </CardHeader>
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
                    const status = getDocValue(item.id, 'status') as PatentDocStatus || 'pendiente';
                    const isEditing = editingDoc === item.id;
                    const hasChanges = !!docEdits[item.id];

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
                            <span className="text-sm px-2 py-1 bg-muted rounded">
                              {getFixedEmitterName(item.id)}
                            </span>
                          ) : (
                            <Select 
                              value={getDocValue(item.id, 'emitter_id') || ''} 
                              onValueChange={(v) => handleDocumentFieldChange(item.id, 'emitter_id', v)}
                              disabled={disableEmitter}
                            >
                              <SelectTrigger className="h-8">
                                <SelectValue placeholder="Seleccionar" />
                              </SelectTrigger>
                              <SelectContent>
                                {emitters.map(emitter => (
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
                            placeholder="Responsable"
                            disabled={disableOtherFields}
                          />
                        </TableCell>
                        <TableCell className={disableOtherFields ? disabledCellClass : ""}>
                          <Popover>
                            <PopoverTrigger asChild>
                              <Button variant="outline" size="sm" className="h-8 w-full justify-start" disabled={disableOtherFields}>
                                <CalendarIcon className="mr-2 h-3 w-3" />
                                {getDocValue(item.id, 'start_date') 
                                  ? format(new Date(getDocValue(item.id, 'start_date')), 'dd/MM/yyyy')
                                  : 'Seleccionar'
                                }
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0">
                              <Calendar
                                mode="single"
                                selected={getDocValue(item.id, 'start_date') ? new Date(getDocValue(item.id, 'start_date')) : undefined}
                                onSelect={(date) => handleDocumentFieldChange(item.id, 'start_date', date ? format(date, 'yyyy-MM-dd') : undefined)}
                                locale={es}
                              />
                            </PopoverContent>
                          </Popover>
                        </TableCell>
                        <TableCell className={disableOtherFields ? disabledCellClass : ""}>
                          <Input
                            className="h-8"
                            type="number"
                            value={getDocValue(item.id, 'deadline_days') || ''}
                            onChange={(e) => handleDocumentFieldChange(item.id, 'deadline_days', e.target.value ? parseInt(e.target.value) : undefined)}
                            placeholder="Días"
                            disabled={disableOtherFields}
                          />
                        </TableCell>
                        <TableCell className={disableOtherFields ? disabledCellClass : ""}>
                          <Popover>
                            <PopoverTrigger asChild>
                              <Button variant="outline" size="sm" className="h-8 w-full justify-start" disabled={disableOtherFields}>
                                <CalendarIcon className="mr-2 h-3 w-3" />
                                {getDocValue(item.id, 'end_date') 
                                  ? format(new Date(getDocValue(item.id, 'end_date')), 'dd/MM/yyyy')
                                  : 'Seleccionar'
                                }
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0">
                              <Calendar
                                mode="single"
                                selected={getDocValue(item.id, 'end_date') ? new Date(getDocValue(item.id, 'end_date')) : undefined}
                                onSelect={(date) => handleDocumentFieldChange(item.id, 'end_date', date ? format(date, 'yyyy-MM-dd') : undefined)}
                                locale={es}
                              />
                            </PopoverContent>
                          </Popover>
                        </TableCell>
                        <TableCell className={isNoAplica ? disabledCellClass : ""}>
                          <Button
                            size="sm"
                            variant={getDocValue(item.id, 'document_url') ? "secondary" : "outline"}
                            disabled={isNoAplica}
                            onClick={(e) => {
                              e.stopPropagation();
                              setUploadDialog({ itemId: item.id, itemName: item.name });
                            }}
                          >
                            {getDocValue(item.id, 'document_url') ? (
                              <FileText className="h-3 w-3" />
                            ) : (
                              <Upload className="h-3 w-3" />
                            )}
                          </Button>
                        </TableCell>
                        <TableCell className={disableOtherFields ? disabledCellClass : ""}>
                          <Input
                            className="h-8"
                            maxLength={150}
                            value={getDocValue(item.id, 'notes') || ''}
                            onChange={(e) => handleDocumentFieldChange(item.id, 'notes', e.target.value)}
                            placeholder="Notas (máx 150)"
                            disabled={disableOtherFields}
                          />
                        </TableCell>
                        <TableCell className={disableOtherFields ? disabledCellClass : ""}>
                          <div className="flex gap-1">
                            {hasChanges && !disableOtherFields && (
                              <Button size="sm" variant="default" onClick={(e) => {
                                e.stopPropagation();
                                saveDocumentChanges(item.id);
                              }}>
                                <Save className="h-3 w-3" />
                              </Button>
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
                                    toast.error("Guarda primero los cambios del documento");
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
        </Card>
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
          onSave={(url) => {
            handleDocumentFieldChange(uploadDialog.itemId, 'document_url', url);
            saveDocumentChanges(uploadDialog.itemId);
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
          startDate={alertDialog.startDate}
          endDate={alertDialog.endDate}
        />
      )}
    </div>
  );
}
