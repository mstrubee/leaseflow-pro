import { useState, useRef, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { useSecureFileAccess } from "@/hooks/useSecureFileAccess";
import { 
  Plus, 
  Trash2, 
  FileCheck, 
  FilePlus, 
  ExternalLink, 
  Loader2, 
  Bell, 
  Upload, 
  Calendar,
  AlertTriangle,
  Pencil
} from "lucide-react";
import { format, parseISO, addMonths } from "date-fns";
import { es } from "date-fns/locale";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { validateFile, sanitizeFileName } from "@/lib/fileValidation";
import { deleteFileFromStorage, isStorageUrl } from "@/lib/storageUtils";
import { useAuth } from "@/hooks/useAuth";

interface TerminationNotice {
  id: string;
  notice_type: string;
  notice_date: string;
  required_exit_date: string | null;
  document_url: string | null;
  storage_provider: string | null;
  issuer_name: string | null;
  created_at: string;
}

interface ConflictingAlert {
  id: string;
  title: string;
  due_date: string;
}

interface TerminationNoticesSectionProps {
  contractId: string;
  contractName?: string;
  notices: TerminationNotice[];
  onRefresh: () => void;
  /** Number of months of notice required by contract (N). Exit = notice_date + N months */
  noticePeriodMonths?: number;
}

const DAYS_BEFORE_OPTIONS = [
  { value: 7, label: "7 días" },
  { value: 14, label: "14 días" },
  { value: 30, label: "30 días" },
  { value: 60, label: "60 días" },
  { value: 90, label: "90 días" },
];

export function TerminationNoticesSection({ contractId, contractName, notices, onRefresh, noticePeriodMonths }: TerminationNoticesSectionProps) {
  const { toast } = useToast();
  const { isAdmin } = useAuth();
  const { openFile } = useSecureFileAccess();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Form state
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingNotice, setEditingNotice] = useState<TerminationNotice | null>(null);
  const [noticeType, setNoticeType] = useState<"sent" | "received">("sent");
  const [noticeDate, setNoticeDate] = useState("");
  const [requiredExitDate, setRequiredExitDate] = useState("");
  const [issuerName, setIssuerName] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [createAlert, setCreateAlert] = useState(false);
  const [alertDaysBefore, setAlertDaysBefore] = useState<number[]>([7]);
  const [alertRecipientEmail, setAlertRecipientEmail] = useState("");
  const [repeatAlertDays, setRepeatAlertDays] = useState<number | null>(null);
  
  // Operation state
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  
  // Conflicting alerts state
  const [conflictingAlerts, setConflictingAlerts] = useState<ConflictingAlert[]>([]);
  const [showConflictDialog, setShowConflictDialog] = useState(false);
  const [pendingNoticeData, setPendingNoticeData] = useState<any>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validation = validateFile(file);
    if (!validation.isValid) {
      toast({
        variant: "destructive",
        title: "Archivo no válido",
        description: validation.error,
      });
      return;
    }

    setSelectedFile(file);
  };

  const uploadFile = async (): Promise<string | null> => {
    if (!selectedFile) return null;

    setUploading(true);
    try {
      const sanitizedName = sanitizeFileName(selectedFile.name);
      const timestamp = Date.now();
      const filePath = `contracts/${contractId}/termination-notices/${timestamp}_${sanitizedName}`;

      const { error: uploadError } = await supabase.storage
        .from("repository-files")
        .upload(filePath, selectedFile);

      if (uploadError) throw uploadError;

      // Store the storage path reference instead of public URL for security
      // The path will be converted to a signed URL when accessed
      return `storage://repository-files/${filePath}`;
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error al subir archivo",
        description: error.message || "No se pudo subir el archivo",
      });
      return null;
    } finally {
      setUploading(false);
    }
  };

  const checkConflictingAlerts = async (exitDate: string): Promise<ConflictingAlert[]> => {
    const { data: alerts } = await supabase
      .from("alerts")
      .select("id, title, due_date")
      .eq("contract_id", contractId)
      .eq("is_active", true)
      .gt("due_date", exitDate);
    
    return alerts || [];
  };

  const handleSaveNotice = async (deactivateConflicting: boolean = false) => {
    if (!noticeDate) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "La fecha del aviso es requerida",
      });
      return;
    }

    if (createAlert && !requiredExitDate) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "La fecha de salida requerida es necesaria para crear alertas",
      });
      return;
    }

    setSaving(true);
    try {
      // Check for conflicting alerts if there's an exit date and we haven't checked yet
      if (requiredExitDate && !showConflictDialog && !deactivateConflicting) {
        const conflicts = await checkConflictingAlerts(requiredExitDate);
        if (conflicts.length > 0) {
          setConflictingAlerts(conflicts);
          setPendingNoticeData({ deactivate: false });
          setShowConflictDialog(true);
          setSaving(false);
          return;
        }
      }

      // Deactivate conflicting alerts if requested
      if (deactivateConflicting && conflictingAlerts.length > 0) {
        const alertIds = conflictingAlerts.map(a => a.id);
        await supabase
          .from("alerts")
          .update({ is_active: false })
          .in("id", alertIds);
      }

      // Upload file if selected
      let documentUrl: string | null = editingNotice?.document_url || null;
      if (selectedFile) {
        documentUrl = await uploadFile();
      }

      let noticeData;

      if (editingNotice) {
        // Update existing notice
        const { data, error } = await supabase
          .from("termination_notices")
          .update({
            notice_type: noticeType,
            notice_date: noticeDate,
            required_exit_date: requiredExitDate || null,
            issuer_name: issuerName || null,
            document_url: documentUrl,
            storage_provider: documentUrl ? "supabase" : null,
          })
          .eq("id", editingNotice.id)
          .select()
          .single();

        if (error) throw error;
        noticeData = data;

        // Update existing alert if exists
        if (requiredExitDate) {
          const { data: existingAlert } = await supabase
            .from("alerts")
            .select("id")
            .eq("item_type", "termination_notice")
            .eq("item_id", editingNotice.id)
            .single();

          if (existingAlert) {
            await supabase
              .from("alerts")
              .update({
                due_date: requiredExitDate,
                title: `Término anticipado${contractName ? `: ${contractName}` : ""}`,
                message: `Aviso de término ${noticeType === "sent" ? "enviado" : "recibido"}${issuerName ? ` por ${issuerName}` : ""} el ${format(parseISO(noticeDate), "d 'de' MMMM 'de' yyyy", { locale: es })}. Fecha de salida: ${format(parseISO(requiredExitDate), "d 'de' MMMM 'de' yyyy", { locale: es })}`,
              })
              .eq("id", existingAlert.id);
          }
        }
      } else {
        // Insert new notice
        const { data, error } = await supabase
          .from("termination_notices")
          .insert({
            contract_id: contractId,
            notice_type: noticeType,
            notice_date: noticeDate,
            required_exit_date: requiredExitDate || null,
            issuer_name: issuerName || null,
            document_url: documentUrl,
            storage_provider: documentUrl ? "supabase" : null,
          })
          .select()
          .single();

        if (error) throw error;
        noticeData = data;

        // Create alert if requested
        if (createAlert && noticeData && requiredExitDate) {
          const alertTitle = `Término anticipado${contractName ? `: ${contractName}` : ""}`;
          const alertMessage = `Aviso de término ${noticeType === "sent" ? "enviado" : "recibido"}${issuerName ? ` por ${issuerName}` : ""} el ${format(parseISO(noticeDate), "d 'de' MMMM 'de' yyyy", { locale: es })}. Fecha de salida: ${format(parseISO(requiredExitDate), "d 'de' MMMM 'de' yyyy", { locale: es })}`;

          const { data: alertData, error: alertError } = await supabase
            .from("alerts")
            .insert({
              contract_id: contractId,
              title: alertTitle,
              message: alertMessage,
              alert_type: "early_termination_notice",
              alert_subtype: noticeType,
              due_date: requiredExitDate,
              days_before: alertDaysBefore,
              channels: ["email"],
              is_active: true,
              item_type: "termination_notice",
              item_id: noticeData.id,
              repeat_every_days: repeatAlertDays,
              priority: 1,
            })
            .select()
            .single();

          if (alertError) {
            console.error("Error creating alert:", alertError);
          } else if (alertData && alertRecipientEmail) {
            await supabase
              .from("alert_recipients")
              .insert({
                alert_id: alertData.id,
                email: alertRecipientEmail,
              });
          }
        }
      }

      const deactivatedCount = deactivateConflicting ? conflictingAlerts.length : 0;
      toast({
        title: editingNotice ? "Aviso actualizado" : "Aviso registrado",
        description: `Aviso de término ${noticeType === "sent" ? "enviado" : "recibido"} ${editingNotice ? "actualizado" : "registrado"} correctamente${createAlert ? " con alerta configurada" : ""}${deactivatedCount > 0 ? `. ${deactivatedCount} alertas posteriores desactivadas.` : ""}`,
      });

      // Reset form
      setIsDialogOpen(false);
      setShowConflictDialog(false);
      setConflictingAlerts([]);
      setPendingNoticeData(null);
      resetForm();
      onRefresh();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "No se pudo guardar el aviso",
      });
    } finally {
      setSaving(false);
    }
  };

  const resetForm = () => {
    setEditingNotice(null);
    setNoticeType("sent");
    setNoticeDate("");
    setRequiredExitDate("");
    setIssuerName("");
    setSelectedFile(null);
    setCreateAlert(false);
    setAlertDaysBefore([7]);
    setAlertRecipientEmail("");
    setRepeatAlertDays(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleEditNotice = (notice: TerminationNotice) => {
    setEditingNotice(notice);
    setNoticeType(notice.notice_type as "sent" | "received");
    setNoticeDate(notice.notice_date);
    setRequiredExitDate(notice.required_exit_date || "");
    setIssuerName(notice.issuer_name || "");
    setSelectedFile(null);
    setCreateAlert(false);
    setIsDialogOpen(true);
  };

  const handleDeleteNotice = async (noticeId: string) => {
    setDeletingId(noticeId);
    try {
      // Delete associated alerts
      await supabase
        .from("alerts")
        .delete()
        .eq("item_type", "termination_notice")
        .eq("item_id", noticeId);

      // Get notice to delete file if exists
      const notice = notices.find(n => n.id === noticeId);
      if (notice?.document_url && notice.storage_provider === "supabase") {
        // Handle both new storage:// format and legacy public URL format
        if (isStorageUrl(notice.document_url)) {
          await deleteFileFromStorage(notice.document_url);
        }
      }

      const { error } = await supabase
        .from("termination_notices")
        .delete()
        .eq("id", noticeId);

      if (error) throw error;

      toast({
        title: "Aviso eliminado",
        description: "El aviso de término y sus alertas asociadas han sido eliminados",
      });

      onRefresh();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "No se pudo eliminar el aviso",
      });
    } finally {
      setDeletingId(null);
    }
  };

  const toggleDaysBefore = (day: number) => {
    if (alertDaysBefore.includes(day)) {
      setAlertDaysBefore(alertDaysBefore.filter(d => d !== day));
    } else {
      setAlertDaysBefore([...alertDaysBefore, day].sort((a, b) => b - a));
    }
  };

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-lg font-medium">Avisos de Término</CardTitle>
          {isAdmin && (
            <Dialog open={isDialogOpen} onOpenChange={(open) => {
              setIsDialogOpen(open);
              if (!open) resetForm();
            }}>
              <DialogTrigger asChild>
                <Button size="sm" className="gap-1">
                  <Plus className="h-4 w-4" />
                  Registrar Aviso
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>
                    {editingNotice ? "Editar Aviso de Término" : "Registrar Aviso de Término"}
                  </DialogTitle>
                  <DialogDescription>
                    {editingNotice 
                      ? "Modifica los datos del aviso de término" 
                      : "Registra un aviso de término enviado o recibido con su documentación"}
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  {/* Notice Type */}
                  <div className="space-y-2">
                    <Label>Tipo de Aviso</Label>
                    <RadioGroup
                      value={noticeType}
                      onValueChange={(v) => setNoticeType(v as "sent" | "received")}
                      className="flex gap-4"
                    >
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="sent" id="sent" />
                        <Label htmlFor="sent" className="flex items-center gap-1 cursor-pointer">
                          <FilePlus className="h-4 w-4" />
                          Aviso Enviado
                        </Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="received" id="received" />
                        <Label htmlFor="received" className="flex items-center gap-1 cursor-pointer">
                          <FileCheck className="h-4 w-4" />
                          Aviso Recibido
                        </Label>
                      </div>
                    </RadioGroup>
                  </div>

                  {/* Issuer Name */}
                  <div className="space-y-2">
                    <Label htmlFor="issuerName">
                      {noticeType === "sent" ? "Destinatario" : "Emisor del Aviso"}
                    </Label>
                    <Input
                      id="issuerName"
                      type="text"
                      placeholder={noticeType === "sent" ? "Nombre del destinatario" : "Nombre del emisor"}
                      value={issuerName}
                      onChange={(e) => setIssuerName(e.target.value)}
                    />
                  </div>

                  {/* Notice Date */}
                  <div className="space-y-2">
                    <Label htmlFor="noticeDate">
                      {noticeType === "sent" ? "Fecha de Envío *" : "Fecha de Recepción *"}
                    </Label>
                    <Input
                      id="noticeDate"
                      type="date"
                      value={noticeDate}
                      onChange={(e) => {
                        const newDate = e.target.value;
                        setNoticeDate(newDate);
                        // Auto-calculate exit date: notice_date + N months
                        if (newDate && noticePeriodMonths && noticePeriodMonths > 0) {
                          try {
                            const calculated = addMonths(parseISO(newDate), noticePeriodMonths);
                            setRequiredExitDate(format(calculated, "yyyy-MM-dd"));
                          } catch { /* ignore parse errors */ }
                        }
                      }}
                      required
                    />
                  </div>

                  {/* Required Exit Date */}
                  <div className="space-y-2">
                    <Label htmlFor="requiredExitDate" className="flex items-center gap-2">
                      <Calendar className="h-4 w-4" />
                      Fecha de Salida Requerida
                    </Label>
                    <Input
                      id="requiredExitDate"
                      type="date"
                      value={requiredExitDate}
                      onChange={(e) => setRequiredExitDate(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">
                      {noticePeriodMonths && noticePeriodMonths > 0
                        ? `Auto-calculada: fecha de aviso + ${noticePeriodMonths} meses. Puedes modificarla manualmente.`
                        : "Fecha en que se ejecutará la salida del contrato"}
                    </p>
                  </div>

                  {/* File Upload */}
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      <Upload className="h-4 w-4" />
                      Documento del Aviso
                    </Label>
                    <div className="flex items-center gap-2">
                      <Input
                        ref={fileInputRef}
                        type="file"
                        onChange={handleFileSelect}
                        className="flex-1"
                        accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                      />
                    </div>
                    {selectedFile && (
                      <p className="text-xs text-muted-foreground">
                        Nuevo archivo: {selectedFile.name}
                      </p>
                    )}
                    {editingNotice?.document_url && !selectedFile && (
                      <p className="text-xs text-muted-foreground">
                        Documento actual: <button type="button" onClick={() => openFile(editingNotice.document_url)} className="text-primary hover:underline">Ver documento</button>
                      </p>
                    )}
                  </div>

                  {/* Alert Configuration - Only for new notices */}
                  {!editingNotice && (
                    <div className="border-t pt-4 space-y-3">
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="createAlert"
                          checked={createAlert}
                          onCheckedChange={(checked) => setCreateAlert(checked as boolean)}
                        />
                        <Label htmlFor="createAlert" className="flex items-center gap-2 cursor-pointer">
                          <Bell className="h-4 w-4" />
                          Crear alerta de término anticipado
                        </Label>
                      </div>

                      {createAlert && (
                        <div className="pl-6 space-y-4 bg-muted/30 p-3 rounded-lg">
                          {!requiredExitDate && (
                            <div className="flex items-center gap-2 text-amber-600 text-sm">
                              <AlertTriangle className="h-4 w-4" />
                              Debes ingresar la fecha de salida requerida para configurar alertas
                            </div>
                          )}

                          <div className="space-y-2">
                            <Label>Días de anticipación para alertar</Label>
                            <div className="flex flex-wrap gap-2">
                              {DAYS_BEFORE_OPTIONS.map((option) => (
                                <Badge
                                  key={option.value}
                                  variant={alertDaysBefore.includes(option.value) ? "default" : "outline"}
                                  className="cursor-pointer"
                                  onClick={() => toggleDaysBefore(option.value)}
                                >
                                  {option.label}
                                </Badge>
                              ))}
                            </div>
                            <p className="text-xs text-muted-foreground">
                              Selecciona múltiples opciones para recibir alertas escalonadas
                            </p>
                          </div>

                          <div className="space-y-2">
                            <Label htmlFor="repeatAlert">Repetir alerta cada (días)</Label>
                            <Select
                              value={repeatAlertDays?.toString() || "none"}
                              onValueChange={(v) => setRepeatAlertDays(v === "none" ? null : parseInt(v))}
                            >
                              <SelectTrigger className="w-40">
                                <SelectValue placeholder="Sin repetición" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">Sin repetición</SelectItem>
                                <SelectItem value="1">Cada día</SelectItem>
                                <SelectItem value="3">Cada 3 días</SelectItem>
                                <SelectItem value="7">Cada 7 días</SelectItem>
                                <SelectItem value="14">Cada 14 días</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>

                          <div className="space-y-2">
                            <Label htmlFor="alertEmail">Email para notificación</Label>
                            <Input
                              id="alertEmail"
                              type="email"
                              placeholder="correo@ejemplo.com"
                              value={alertRecipientEmail}
                              onChange={(e) => setAlertRecipientEmail(e.target.value)}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                    Cancelar
                  </Button>
                  <Button onClick={() => handleSaveNotice(false)} disabled={saving || uploading}>
                    {(saving || uploading) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {uploading ? "Subiendo..." : editingNotice ? "Guardar Cambios" : "Registrar"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </CardHeader>
        <CardContent>
          {notices.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No hay avisos de término registrados
            </p>
          ) : (
            <div className="space-y-3">
              {notices.map((notice) => (
                <div
                  key={notice.id}
                  className="flex items-start justify-between p-3 rounded-lg border bg-muted/30"
                >
                  <div className="flex items-start gap-3 flex-1">
                    <Badge
                      variant={notice.notice_type === "sent" ? "default" : "secondary"}
                      className="gap-1 mt-0.5"
                    >
                      {notice.notice_type === "sent" ? (
                        <><FilePlus className="h-3 w-3" /> Enviado</>
                      ) : (
                        <><FileCheck className="h-3 w-3" /> Recibido</>
                      )}
                    </Badge>
                    <div className="flex-1 space-y-1">
                      <p className="text-sm font-medium">
                        {notice.issuer_name && <span>{notice.issuer_name} - </span>}
                        {format(parseISO(notice.notice_date), "d 'de' MMMM 'de' yyyy", { locale: es })}
                      </p>
                      {notice.required_exit_date && (
                        <div className="flex items-center gap-1 text-sm text-amber-600">
                          <Calendar className="h-3 w-3" />
                          <span>Salida: {format(parseISO(notice.required_exit_date), "d 'de' MMMM 'de' yyyy", { locale: es })}</span>
                        </div>
                      )}
                      {notice.document_url && (
                        <button
                          type="button"
                          onClick={() => openFile(notice.document_url)}
                          className="text-xs text-primary hover:underline flex items-center gap-1"
                        >
                          <ExternalLink className="h-3 w-3" />
                          Ver documento
                        </button>
                      )}
                    </div>
                  </div>
                  {isAdmin && (
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => handleEditNotice(notice)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={() => handleDeleteNotice(notice.id)}
                        disabled={deletingId === notice.id}
                      >
                        {deletingId === notice.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Conflicting Alerts Dialog */}
      <AlertDialog open={showConflictDialog} onOpenChange={setShowConflictDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Alertas posteriores encontradas
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              <p>
                Se encontraron {conflictingAlerts.length} alerta(s) con fecha posterior a la fecha de salida requerida ({requiredExitDate ? format(parseISO(requiredExitDate), "d 'de' MMMM 'de' yyyy", { locale: es }) : ""}):
              </p>
              <div className="max-h-40 overflow-y-auto space-y-2">
                {conflictingAlerts.map((alert) => (
                  <div key={alert.id} className="p-2 bg-muted rounded text-sm">
                    <span className="font-medium">{alert.title}</span>
                    <span className="text-muted-foreground ml-2">
                      ({format(parseISO(alert.due_date), "d MMM yyyy", { locale: es })})
                    </span>
                  </div>
                ))}
              </div>
              <p className="font-medium">¿Deseas desactivar estas alertas?</p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => {
              setShowConflictDialog(false);
              handleSaveNotice(false);
            }}>
              No, mantener alertas
            </AlertDialogCancel>
            <AlertDialogAction onClick={() => handleSaveNotice(true)}>
              Sí, desactivar alertas
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
