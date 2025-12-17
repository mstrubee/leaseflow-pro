import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, FileCheck, FilePlus, ExternalLink, Loader2 } from "lucide-react";
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
  created_at: string;
}

interface TerminationNoticesSectionProps {
  contractId: string;
  notices: TerminationNotice[];
  onRefresh: () => void;
}

export function TerminationNoticesSection({ contractId, notices, onRefresh }: TerminationNoticesSectionProps) {
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [noticeType, setNoticeType] = useState<"sent" | "received">("sent");
  const [noticeDate, setNoticeDate] = useState("");
  const [documentUrl, setDocumentUrl] = useState("");
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
      const { error } = await supabase
        .from("termination_notices")
        .insert({
          contract_id: contractId,
          notice_type: noticeType,
          notice_date: noticeDate,
          document_url: documentUrl || null,
        });

      if (error) throw error;

      toast({
        title: "Aviso registrado",
        description: `Aviso de término ${noticeType === "sent" ? "enviado" : "recibido"} registrado correctamente`,
      });

      setIsDialogOpen(false);
      setNoticeType("sent");
      setNoticeDate("");
      setDocumentUrl("");
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
          <DialogContent>
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
                <p className="text-xs text-muted-foreground">
                  Enlace al documento escaneado del aviso
                </p>
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
