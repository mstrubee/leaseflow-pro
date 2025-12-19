import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { CalendarIcon, X, Plus, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";

interface PatentAlertDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  documentId: string;
  documentName: string;
  startDate?: string;
  endDate?: string;
}

interface PatentAlert {
  id: string;
  alert_column: string;
  alert_date: string;
  frequency_days: number | null;
  is_active: boolean;
  recipients: string[];
}

const ALERT_COLUMNS = [
  { value: 'start_date', label: 'Fecha Inicio' },
  { value: 'end_date', label: 'Fecha Término' },
];

export function PatentAlertDialog({
  open,
  onOpenChange,
  documentId,
  documentName,
  startDate,
  endDate,
}: PatentAlertDialogProps) {
  const { user } = useAuth();
  const [alerts, setAlerts] = useState<PatentAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [newRecipient, setNewRecipient] = useState("");
  
  // New alert form
  const [newAlert, setNewAlert] = useState({
    alert_column: 'end_date',
    alert_date: '',
    frequency_days: null as number | null,
    recipients: [] as string[],
  });

  useEffect(() => {
    if (open && documentId) {
      loadAlerts();
    }
  }, [open, documentId]);

  const loadAlerts = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("patent_document_alerts")
      .select("*")
      .eq("patent_document_id", documentId);

    if (!error && data) {
      setAlerts(data.map(a => ({ ...a, recipients: a.recipients || [] })));
    }
    setLoading(false);
  };

  const handleAddRecipient = () => {
    if (!newRecipient.trim() || !newRecipient.includes('@')) {
      toast.error("Ingresa un email válido");
      return;
    }
    if (newAlert.recipients.includes(newRecipient.trim())) {
      toast.error("Este email ya está agregado");
      return;
    }
    setNewAlert({
      ...newAlert,
      recipients: [...newAlert.recipients, newRecipient.trim()],
    });
    setNewRecipient("");
  };

  const handleRemoveRecipient = (email: string) => {
    setNewAlert({
      ...newAlert,
      recipients: newAlert.recipients.filter(r => r !== email),
    });
  };

  const handleCreateAlert = async () => {
    if (!newAlert.alert_date) {
      toast.error("Selecciona una fecha de alerta");
      return;
    }
    if (newAlert.recipients.length === 0) {
      toast.error("Agrega al menos un destinatario");
      return;
    }

    const { error } = await supabase
      .from("patent_document_alerts")
      .insert({
        patent_document_id: documentId,
        alert_column: newAlert.alert_column,
        alert_date: newAlert.alert_date,
        frequency_days: newAlert.frequency_days,
        recipients: newAlert.recipients,
        created_by: user?.id,
      });

    if (error) {
      toast.error("Error al crear alerta");
      return;
    }

    toast.success("Alerta creada");
    setNewAlert({
      alert_column: 'end_date',
      alert_date: '',
      frequency_days: null,
      recipients: [],
    });
    loadAlerts();
  };

  const handleToggleAlert = async (alertId: string, isActive: boolean) => {
    const { error } = await supabase
      .from("patent_document_alerts")
      .update({ is_active: isActive })
      .eq("id", alertId);

    if (error) {
      toast.error("Error al actualizar alerta");
      return;
    }

    setAlerts(alerts.map(a => a.id === alertId ? { ...a, is_active: isActive } : a));
  };

  const handleDeleteAlert = async (alertId: string) => {
    const { error } = await supabase
      .from("patent_document_alerts")
      .delete()
      .eq("id", alertId);

    if (error) {
      toast.error("Error al eliminar alerta");
      return;
    }

    toast.success("Alerta eliminada");
    setAlerts(alerts.filter(a => a.id !== alertId));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Alertas: {documentName}</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Reference dates */}
          <div className="grid grid-cols-2 gap-4 p-3 bg-muted rounded-lg text-sm">
            <div>
              <span className="text-muted-foreground">Fecha Inicio:</span>
              <span className="ml-2 font-medium">
                {startDate ? format(new Date(startDate), 'dd/MM/yyyy') : '-'}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground">Fecha Término:</span>
              <span className="ml-2 font-medium">
                {endDate ? format(new Date(endDate), 'dd/MM/yyyy') : '-'}
              </span>
            </div>
          </div>

          {/* New alert form */}
          <div className="border rounded-lg p-4 space-y-4">
            <h4 className="font-medium">Nueva Alerta</h4>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Columna de referencia</Label>
                <Select 
                  value={newAlert.alert_column} 
                  onValueChange={(v) => setNewAlert({ ...newAlert, alert_column: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ALERT_COLUMNS.map(col => (
                      <SelectItem key={col.value} value={col.value}>{col.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Fecha de aviso</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start">
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {newAlert.alert_date 
                        ? format(new Date(newAlert.alert_date), 'dd/MM/yyyy')
                        : 'Seleccionar'
                      }
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={newAlert.alert_date ? new Date(newAlert.alert_date) : undefined}
                      onSelect={(date) => setNewAlert({ 
                        ...newAlert, 
                        alert_date: date ? format(date, 'yyyy-MM-dd') : '' 
                      })}
                      locale={es}
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Frecuencia de repetición (días, opcional)</Label>
              <Input
                type="number"
                placeholder="Ej: 7 para semanal"
                value={newAlert.frequency_days || ''}
                onChange={(e) => setNewAlert({ 
                  ...newAlert, 
                  frequency_days: e.target.value ? parseInt(e.target.value) : null 
                })}
              />
            </div>

            <div className="space-y-2">
              <Label>Destinatarios</Label>
              <div className="flex gap-2">
                <Input
                  type="email"
                  placeholder="email@ejemplo.com"
                  value={newRecipient}
                  onChange={(e) => setNewRecipient(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddRecipient()}
                />
                <Button type="button" variant="outline" onClick={handleAddRecipient}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              {newAlert.recipients.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {newAlert.recipients.map(email => (
                    <Badge key={email} variant="secondary" className="gap-1">
                      {email}
                      <button onClick={() => handleRemoveRecipient(email)}>
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            <Button onClick={handleCreateAlert} className="w-full">
              Crear Alerta
            </Button>
          </div>

          {/* Existing alerts */}
          {alerts.length > 0 && (
            <div className="space-y-3">
              <h4 className="font-medium">Alertas configuradas</h4>
              {alerts.map(alert => (
                <div 
                  key={alert.id} 
                  className={`border rounded-lg p-3 space-y-2 ${!alert.is_active ? 'opacity-50' : ''}`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-medium">
                        {ALERT_COLUMNS.find(c => c.value === alert.alert_column)?.label}
                      </span>
                      <span className="mx-2">•</span>
                      <span>{format(new Date(alert.alert_date), 'dd/MM/yyyy')}</span>
                      {alert.frequency_days && (
                        <span className="ml-2 text-muted-foreground">
                          (cada {alert.frequency_days} días)
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch 
                        checked={alert.is_active}
                        onCheckedChange={(checked) => handleToggleAlert(alert.id, checked)}
                      />
                      <Button 
                        size="icon" 
                        variant="ghost" 
                        className="text-destructive"
                        onClick={() => handleDeleteAlert(alert.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {alert.recipients.map(email => (
                      <Badge key={email} variant="outline" className="text-xs">
                        {email}
                      </Badge>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
