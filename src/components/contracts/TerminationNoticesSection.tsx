import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, FileCheck, FilePlus, ExternalLink, Loader2, Bell } from "lucide-react";
import { format, parseISO } from "date-fns";
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

interface TerminationNotice {
  id: string;
  notice_type: string;
  notice_date: string;
  document_url: string | null;
  storage_provider: string | null;
  issuer_name: string | null;
  created_at: string;
}

interface TerminationNoticesSectionProps {
  contractId: string;
  contractName?: string;
  notices: TerminationNotice[];
  onRefresh: () => void;
}

export function TerminationNoticesSection({ contractId, contractName, notices, onRefresh }: TerminationNoticesSectionProps) {
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [noticeType, setNoticeType] = useState<"sent" | "received">("sent");
  const [noticeDate, setNoticeDate] = useState("");
  const [issuerName, setIssuerName] = useState("");
  const [documentUrl, setDocumentUrl] = useState("");
  const [createAlert, setCreateAlert] = useState(false);
  const [alertDaysBefore, setAlertDaysBefore] = useState("7");
  const [alertRecipientEmail, setAlertRecipientEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleAddNotice = async () => {
    if (!noticeDate) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "La fecha del aviso es requerida",
      });
      return;
    }

    setSaving(true);
    try {
      // Insert the termination notice
      const { data: noticeData, error: noticeError } = await supabase
        .from("termination_notices")
        .insert({
          contract_id: contractId,
          notice_type: noticeType,
          notice_date: noticeDate,
          issuer_name: issuerName || null,
          document_url: documentUrl || null,
        })
        .select()
        .single();

      if (noticeError) throw noticeError;

      // Create alert if requested
      if (createAlert && noticeData) {
        const daysBefore = parseInt(alertDaysBefore) || 7;
        const alertTitle = `Seguimiento aviso de término${contractName ? `: ${contractName}` : ""}`;
        const alertMessage = `Aviso de término ${noticeType === "sent" ? "enviado" : "recibido"}${issuerName ? ` por ${issuerName}` : ""} el ${format(parseISO(noticeDate), "d 'de' MMMM 'de' yyyy", { locale: es })}`;

        const { data: alertData, error: alertError } = await supabase
          .from("alerts")
          .insert({
            contract_id: contractId,
            title: alertTitle,
            message: alertMessage,
            alert_type: "early_termination_notice",
            alert_subtype: noticeType,
            due_date: noticeDate,
            days_before: [daysBefore],
            channels: ["email"],
            is_active: true,
            item_type: "termination_notice",
            item_id: noticeData.id,
          })
          .select()
          .single();

        if (alertError) {
          console.error("Error creating alert:", alertError);
        } else if (alertData && alertRecipientEmail) {
          // Add recipient
          await supabase
            .from("alert_recipients")
            .insert({
              alert_id: alertData.id,
              email: alertRecipientEmail,
            });
        }
      }

      toast({
        title: "Aviso registrado",
        description: `Aviso de término ${noticeType === "sent" ? "enviado" : "recibido"} registrado correctamente${createAlert ? " con alerta configurada" : ""}`,
      });

      setIsDialogOpen(false);
      setNoticeType("sent");
      setNoticeDate("");
      setIssuerName("");
      setDocumentUrl("");
      setCreateAlert(false);
      setAlertDaysBefore("7");
      setAlertRecipientEmail("");
      onRefresh();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "No se pudo registrar el aviso",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteNotice = async (noticeId: string) => {
    setDeletingId(noticeId);
    try {
      // Also delete any associated alerts
      await supabase
        .from("alerts")
        .delete()
        .eq("item_type", "termination_notice")
        .eq("item_id", noticeId);

      const { error } = await supabase
        .from("termination_notices")
        .delete()
        .eq("id", noticeId);

      if (error) throw error;

      toast({
        title: "Aviso eliminado",
        description: "El aviso de término ha sido eliminado",
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

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-lg font-medium">Avisos de Término</CardTitle>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1">
              <Plus className="h-4 w-4" />
              Registrar Aviso
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Registrar Aviso de Término</DialogTitle>
              <DialogDescription>
                Registra un aviso de término enviado o recibido
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Tipo de Aviso</Label>
                <RadioGroup
                  value={noticeType}
                  onValueChange={(v) => setNoticeType(v as "sent" | "received")}
                  className="flex gap-4"
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="sent" id="sent" />
                    <Label htmlFor="sent" className="flex items-center gap-1">
                      <FilePlus className="h-4 w-4" />
                      Aviso Enviado
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="received" id="received" />
                    <Label htmlFor="received" className="flex items-center gap-1">
                      <FileCheck className="h-4 w-4" />
                      Aviso Recibido
                    </Label>
                  </div>
                </RadioGroup>
              </div>
              <div className="space-y-2">
                <Label htmlFor="issuerName">Emisor del Aviso</Label>
                <Input
                  id="issuerName"
                  type="text"
                  placeholder="Nombre del emisor"
                  value={issuerName}
                  onChange={(e) => setIssuerName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="noticeDate">Fecha del Aviso *</Label>
                <Input
                  id="noticeDate"
                  type="date"
                  value={noticeDate}
                  onChange={(e) => setNoticeDate(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="documentUrl">URL del Documento (opcional)</Label>
                <Input
                  id="documentUrl"
                  type="url"
                  placeholder="https://..."
                  value={documentUrl}
                  onChange={(e) => setDocumentUrl(e.target.value)}
                />
              </div>

              {/* Alert configuration */}
              <div className="border-t pt-4 space-y-3">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="createAlert"
                    checked={createAlert}
                    onCheckedChange={(checked) => setCreateAlert(checked as boolean)}
                  />
                  <Label htmlFor="createAlert" className="flex items-center gap-2 cursor-pointer">
                    <Bell className="h-4 w-4" />
                    Crear alerta de seguimiento
                  </Label>
                </div>

                {createAlert && (
                  <div className="pl-6 space-y-3">
                    <div className="space-y-2">
                      <Label htmlFor="alertDaysBefore">Días antes para alertar</Label>
                      <Input
                        id="alertDaysBefore"
                        type="number"
                        min="1"
                        value={alertDaysBefore}
                        onChange={(e) => setAlertDaysBefore(e.target.value)}
                        className="w-24"
                      />
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
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={handleAddNotice} disabled={saving}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Registrar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
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
                className="flex items-center justify-between p-3 rounded-lg border bg-muted/30"
              >
                <div className="flex items-center gap-3">
                  <Badge
                    variant={notice.notice_type === "sent" ? "default" : "secondary"}
                    className="gap-1"
                  >
                    {notice.notice_type === "sent" ? (
                      <><FilePlus className="h-3 w-3" /> Enviado</>
                    ) : (
                      <><FileCheck className="h-3 w-3" /> Recibido</>
                    )}
                  </Badge>
                  <div>
                    <p className="text-sm font-medium">
                      {notice.issuer_name && <span>{notice.issuer_name} - </span>}
                      {format(parseISO(notice.notice_date), "d 'de' MMMM 'de' yyyy", { locale: es })}
                    </p>
                    {notice.document_url && (
                      <a
                        href={notice.document_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-primary hover:underline flex items-center gap-1"
                      >
                        <ExternalLink className="h-3 w-3" />
                        Ver documento
                      </a>
                    )}
                  </div>
                </div>
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
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
