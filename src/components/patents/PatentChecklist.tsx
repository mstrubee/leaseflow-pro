import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ArrowLeft, CalendarIcon, Save, Bell, Upload, FileText } from "lucide-react";
import { format, addDays, differenceInDays } from "date-fns";
import { es } from "date-fns/locale";
import { 
  ContractWithPatent, 
  PatentChecklistSection, 
  PatentChecklistItem,
  PatentEmitter,
  PatentDocument,
  PatentPriority,
  PatentDocStatus,
  PRIORITY_CONFIG,
  STATUS_CONFIG
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
  onBack: () => void;
  onUpdatePriority: (contractId: string, priority: PatentPriority, userId: string) => Promise<void>;
  onUpdateDocument: (contractId: string, itemId: string, data: Partial<PatentDocument>) => Promise<void>;
  onUpdateDocumentStatus: (contractId: string, itemId: string, status: PatentDocStatus, userId: string) => Promise<void>;
}

export function PatentChecklist({
  contract,
  sections,
  items,
  emitters,
  onBack,
  onUpdatePriority,
  onUpdateDocument,
  onUpdateDocumentStatus,
}: PatentChecklistProps) {
  const { user } = useAuth();
  const [confirmDialog, setConfirmDialog] = useState<{
    type: 'priority' | 'status';
    value: string;
    itemId?: string;
  } | null>(null);
  
  // Local state for document edits
  const [editingDoc, setEditingDoc] = useState<string | null>(null);
  const [docEdits, setDocEdits] = useState<Record<string, Partial<PatentDocument>>>({});
  
  // Upload and alert dialogs
  const [uploadDialog, setUploadDialog] = useState<{ itemId: string; itemName: string } | null>(null);
  const [alertDialog, setAlertDialog] = useState<{ 
    docId: string; 
    itemName: string; 
    startDate?: string;
    endDate?: string;
  } | null>(null);

  const currentPriority = contract.contract_patents?.priority || 'priority_3';

  // Group items by section
  const itemsBySection = useMemo(() => {
    const grouped: Record<string, PatentChecklistItem[]> = {};
    sections.forEach(section => {
      grouped[section.id] = items.filter(item => item.section_id === section.id);
    });
    return grouped;
  }, [sections, items]);

  // Get document for an item
  const getDocument = (itemId: string): PatentDocument | undefined => {
    return (contract.patent_documents || []).find(d => d.checklist_item_id === itemId);
  };

  // Calculate dates based on logic
  const calculateDates = (
    startDate?: string,
    endDate?: string,
    deadlineDays?: number
  ): { start_date?: string; end_date?: string; deadline_days?: number } => {
    if (startDate && deadlineDays && !endDate) {
      const end = addDays(new Date(startDate), deadlineDays);
      return { start_date: startDate, end_date: format(end, 'yyyy-MM-dd'), deadline_days: deadlineDays };
    }
    if (endDate && deadlineDays && !startDate) {
      const start = addDays(new Date(endDate), -deadlineDays);
      return { start_date: format(start, 'yyyy-MM-dd'), end_date: endDate, deadline_days: deadlineDays };
    }
    if (startDate && endDate && !deadlineDays) {
      const days = differenceInDays(new Date(endDate), new Date(startDate));
      return { start_date: startDate, end_date: endDate, deadline_days: days };
    }
    return { start_date: startDate, end_date: endDate, deadline_days: deadlineDays };
  };

  const handlePriorityChange = (priority: PatentPriority) => {
    setConfirmDialog({ type: 'priority', value: priority });
  };

  const handleStatusChange = (itemId: string, status: PatentDocStatus) => {
    setConfirmDialog({ type: 'status', value: status, itemId });
  };

  const confirmChange = async () => {
    if (!confirmDialog || !user) return;

    try {
      if (confirmDialog.type === 'priority') {
        await onUpdatePriority(contract.id, confirmDialog.value as PatentPriority, user.id);
        toast.success("Prioridad actualizada");
      } else if (confirmDialog.type === 'status' && confirmDialog.itemId) {
        await onUpdateDocumentStatus(
          contract.id, 
          confirmDialog.itemId, 
          confirmDialog.value as PatentDocStatus, 
          user.id
        );
        toast.success("Estado actualizado");
      }
    } catch (error) {
      toast.error("Error al actualizar");
    }
    setConfirmDialog(null);
  };

  const handleDocumentFieldChange = (itemId: string, field: keyof PatentDocument, value: any) => {
    const currentEdits = docEdits[itemId] || {};
    const doc = getDocument(itemId);
    
    let updates: Partial<PatentDocument> = { ...currentEdits, [field]: value };

    // Auto-calculate dates
    if (field === 'start_date' || field === 'end_date' || field === 'deadline_days') {
      const newStart = field === 'start_date' ? value : (currentEdits.start_date || doc?.start_date);
      const newEnd = field === 'end_date' ? value : (currentEdits.end_date || doc?.end_date);
      const newDays = field === 'deadline_days' ? value : (currentEdits.deadline_days || doc?.deadline_days);
      
      const calculated = calculateDates(newStart, newEnd, newDays);
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
    <div className="space-y-6">
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

        {/* Priority selector */}
        <div className="flex items-center gap-3">
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

      {/* Checklist by sections */}
      {sections.map(section => (
        <Card key={section.id}>
          <CardHeader>
            <CardTitle className="text-lg">{section.name}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
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

                    return (
                      <TableRow key={item.id} onClick={() => setEditingDoc(item.id)}>
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
                              {Object.entries(STATUS_CONFIG).map(([key, config]) => (
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
                        </TableCell>
                        <TableCell>
                          <Select 
                            value={getDocValue(item.id, 'emitter_id') || ''} 
                            onValueChange={(v) => handleDocumentFieldChange(item.id, 'emitter_id', v)}
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
                        </TableCell>
                        <TableCell>
                          <Input
                            className="h-8"
                            value={getDocValue(item.id, 'responsible') || ''}
                            onChange={(e) => handleDocumentFieldChange(item.id, 'responsible', e.target.value)}
                            placeholder="Responsable"
                          />
                        </TableCell>
                        <TableCell>
                          <Popover>
                            <PopoverTrigger asChild>
                              <Button variant="outline" size="sm" className="h-8 w-full justify-start">
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
                        <TableCell>
                          <Input
                            className="h-8"
                            type="number"
                            value={getDocValue(item.id, 'deadline_days') || ''}
                            onChange={(e) => handleDocumentFieldChange(item.id, 'deadline_days', e.target.value ? parseInt(e.target.value) : undefined)}
                            placeholder="Días"
                          />
                        </TableCell>
                        <TableCell>
                          <Popover>
                            <PopoverTrigger asChild>
                              <Button variant="outline" size="sm" className="h-8 w-full justify-start">
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
                        <TableCell>
                          <Button
                            size="sm"
                            variant={getDocValue(item.id, 'document_url') ? "secondary" : "outline"}
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
                        <TableCell>
                          <Input
                            className="h-8"
                            maxLength={150}
                            value={getDocValue(item.id, 'notes') || ''}
                            onChange={(e) => handleDocumentFieldChange(item.id, 'notes', e.target.value)}
                            placeholder="Notas (máx 150)"
                          />
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            {hasChanges && (
                              <Button size="sm" variant="default" onClick={(e) => {
                                e.stopPropagation();
                                saveDocumentChanges(item.id);
                              }}>
                                <Save className="h-3 w-3" />
                              </Button>
                            )}
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
      ))}

      {/* Confirmation Dialog */}
      <Dialog open={!!confirmDialog} onOpenChange={() => setConfirmDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar cambio</DialogTitle>
            <DialogDescription>
              {confirmDialog?.type === 'priority' 
                ? `¿Cambiar la prioridad a "${PRIORITY_CONFIG[confirmDialog.value as PatentPriority]?.label}"?`
                : `¿Cambiar el estado a "${STATUS_CONFIG[confirmDialog?.value as PatentDocStatus]?.label}"?`
              }
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDialog(null)}>
              Cancelar
            </Button>
            <Button onClick={confirmChange}>
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
