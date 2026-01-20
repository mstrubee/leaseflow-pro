import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, Bell, Mail, MessageSquare, Save, X, Tag } from "lucide-react";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAlertCategories } from "@/hooks/useAlertCategories";

const ALERT_TYPES = [
  { value: "contract_expiration", label: "Vencimiento de contrato" },
  { value: "contract_renewal", label: "Renovación de contrato" },
  { value: "early_termination_notice", label: "Aviso de término anticipado" },
  { value: "inspection", label: "Inspección" },
  { value: "maintenance", label: "Mantención" },
  { value: "license", label: "Licencia" },
  { value: "permit", label: "Permiso" },
  { value: "certificate", label: "Certificado" },
  { value: "other", label: "Otro" },
];

// Alert types that should be categorized as "contract_alerts"
const CONTRACT_ALERT_TYPES = ['contract_expiration', 'contract_renewal', 'early_termination_notice'];

const DAYS_BEFORE_OPTIONS = [
  { value: 60, label: "60 días antes" },
  { value: 30, label: "30 días antes" },
  { value: 15, label: "15 días antes" },
  { value: 7, label: "7 días antes" },
  { value: 3, label: "3 días antes" },
  { value: 1, label: "1 día antes" },
  { value: 0, label: "El mismo día" },
];

export interface AlertData {
  id: string;
  title: string;
  message: string | null;
  alert_type: string;
  due_date: string;
  channels: string[];
  days_before: number[];
  repeat_every_days: number | null;
  contract_id: string | null;
  category_id?: string | null;
}

interface AlertFormProps {
  contractId?: string;
  contractName?: string;
  initialDueDate?: Date;
  editingAlert?: AlertData | null;
  forceCategoryId?: string; // Force a specific category (for patent alerts)
  onSuccess?: () => void;
  onCancel?: () => void;
}

export function AlertForm({ contractId, contractName, initialDueDate, editingAlert, forceCategoryId, onSuccess, onCancel }: AlertFormProps) {
  const { toast } = useToast();
  const { categories, getContractCategoryId, getTrackingCategoryId } = useAlertCategories();
  const [loading, setLoading] = useState(false);
  
  const [title, setTitle] = useState(contractName ? `Vencimiento - ${contractName}` : "");
  const [message, setMessage] = useState("");
  const [alertType, setAlertType] = useState("contract_expiration");
  const [dueDate, setDueDate] = useState<Date | undefined>(initialDueDate);
  const [channels, setChannels] = useState<string[]>(["email"]);
  const [daysBefore, setDaysBefore] = useState<number[]>([30, 7, 1]);
  const [repeatEveryDays, setRepeatEveryDays] = useState<number | null>(null);
  const [enableRepeat, setEnableRepeat] = useState(false);
  const [categoryId, setCategoryId] = useState<string | undefined>(forceCategoryId);

  // Load editing alert data
  useEffect(() => {
    if (editingAlert) {
      setTitle(editingAlert.title);
      setMessage(editingAlert.message || "");
      setAlertType(editingAlert.alert_type);
      setDueDate(parseISO(editingAlert.due_date));
      setChannels(editingAlert.channels);
      setDaysBefore(editingAlert.days_before);
      setRepeatEveryDays(editingAlert.repeat_every_days);
      setEnableRepeat(!!editingAlert.repeat_every_days);
      setCategoryId(editingAlert.category_id || undefined);
    }
  }, [editingAlert]);

  // Auto-select category based on alert type (if not forced)
  useEffect(() => {
    if (forceCategoryId) {
      setCategoryId(forceCategoryId);
      return;
    }
    
    if (CONTRACT_ALERT_TYPES.includes(alertType)) {
      setCategoryId(getContractCategoryId());
    } else if (!categoryId) {
      setCategoryId(getTrackingCategoryId());
    }
  }, [alertType, forceCategoryId, getContractCategoryId, getTrackingCategoryId]);

  const handleChannelToggle = (channel: string) => {
    setChannels(prev => 
      prev.includes(channel) 
        ? prev.filter(c => c !== channel)
        : [...prev, channel]
    );
  };

  const handleDaysBeforeToggle = (days: number) => {
    setDaysBefore(prev =>
      prev.includes(days)
        ? prev.filter(d => d !== days)
        : [...prev, days].sort((a, b) => b - a)
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!title || !dueDate || channels.length === 0 || daysBefore.length === 0) {
      toast({
        title: "Error",
        description: "Complete todos los campos requeridos",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      const alertData = {
        title,
        message: message || null,
        alert_type: alertType as "contract_expiration" | "contract_renewal" | "early_termination_notice" | "inspection" | "maintenance" | "license" | "permit" | "certificate" | "other",
        due_date: format(dueDate, "yyyy-MM-dd"),
        channels: channels as ("email" | "whatsapp")[],
        days_before: daysBefore,
        repeat_every_days: enableRepeat ? repeatEveryDays : null,
        contract_id: editingAlert?.contract_id || contractId || null,
        item_type: (editingAlert?.contract_id || contractId) ? "contract" : null,
        is_active: true,
        category_id: categoryId || null,
      };

      if (editingAlert) {
        // Update existing alert
        const { error } = await supabase
          .from("alerts")
          .update(alertData)
          .eq("id", editingAlert.id);

        if (error) throw error;

        toast({
          title: "Alerta actualizada",
          description: "El recordatorio se ha modificado correctamente",
        });
      } else {
        // Create new alert
        const { error } = await supabase.from("alerts").insert([{
          ...alertData,
          created_by: user?.id,
        }]);

        if (error) throw error;

        toast({
          title: "Alerta creada",
          description: "El recordatorio se ha configurado correctamente",
        });
      }

      onSuccess?.();
    } catch (error: any) {
      console.error("Error saving alert:", error);
      toast({
        title: "Error",
        description: error.message || "No se pudo guardar la alerta",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="h-5 w-5" />
          {editingAlert ? "Editar Alerta" : "Configurar Alerta"}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="title">Título del recordatorio *</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ej: Vencimiento contrato local centro"
                required
              />
            </div>

            <div className="space-y-2">
              <Label>Tipo de alerta</Label>
              <Select value={alertType} onValueChange={setAlertType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ALERT_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Category selector - only show if not forced */}
            {!forceCategoryId && categories.length > 0 && (
              <div className="space-y-2">
                <Label className="flex items-center gap-1">
                  <Tag className="h-3 w-3" />
                  Categoría
                </Label>
                <Select value={categoryId || ""} onValueChange={setCategoryId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar categoría" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((cat) => (
                      <SelectItem key={cat.id} value={cat.id}>
                        {cat.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label>Fecha de vencimiento *</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-left font-normal",
                    !dueDate && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {dueDate ? format(dueDate, "PPP", { locale: es }) : "Seleccionar fecha"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={dueDate}
                  onSelect={setDueDate}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>

          <div className="space-y-2">
            <Label htmlFor="message">Mensaje personalizado (opcional)</Label>
            <Textarea
              id="message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Información adicional que desea incluir en el recordatorio..."
              rows={3}
            />
          </div>

          <div className="space-y-3">
            <Label>Canales de notificación *</Label>
            <div className="flex gap-4">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="email"
                  checked={channels.includes("email")}
                  onCheckedChange={() => handleChannelToggle("email")}
                />
                <Label htmlFor="email" className="flex items-center gap-1 cursor-pointer">
                  <Mail className="h-4 w-4" />
                  Email
                </Label>
              </div>
              <div className="flex items-center space-x-2 opacity-50">
                <Checkbox
                  id="whatsapp"
                  checked={channels.includes("whatsapp")}
                  onCheckedChange={() => handleChannelToggle("whatsapp")}
                  disabled
                />
                <Label htmlFor="whatsapp" className="flex items-center gap-1 cursor-pointer">
                  <MessageSquare className="h-4 w-4" />
                  WhatsApp (próximamente)
                </Label>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <Label>Días de aviso previo *</Label>
            <div className="flex flex-wrap gap-2">
              {DAYS_BEFORE_OPTIONS.map((option) => (
                <Button
                  key={option.value}
                  type="button"
                  variant={daysBefore.includes(option.value) ? "default" : "outline"}
                  size="sm"
                  onClick={() => handleDaysBeforeToggle(option.value)}
                >
                  {option.label}
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-3 p-4 bg-muted/50 rounded-lg">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="enableRepeat"
                checked={enableRepeat}
                onCheckedChange={(checked) => setEnableRepeat(!!checked)}
              />
              <Label htmlFor="enableRepeat" className="cursor-pointer">
                Repetir después del vencimiento
              </Label>
            </div>
            {enableRepeat && (
              <div className="flex items-center gap-2 ml-6">
                <span className="text-sm text-muted-foreground">Repetir cada</span>
                <Input
                  type="number"
                  min={1}
                  max={365}
                  value={repeatEveryDays || ""}
                  onChange={(e) => setRepeatEveryDays(parseInt(e.target.value) || null)}
                  className="w-20"
                />
                <span className="text-sm text-muted-foreground">días hasta marcar como revisado</span>
              </div>
            )}
          </div>

          <div className="flex gap-3 justify-end pt-4 border-t">
            {onCancel && (
              <Button type="button" variant="outline" onClick={onCancel}>
                <X className="h-4 w-4 mr-2" />
                Cancelar
              </Button>
            )}
            <Button type="submit" disabled={loading}>
              <Save className="h-4 w-4 mr-2" />
              {loading ? "Guardando..." : (editingAlert ? "Actualizar alerta" : "Guardar alerta")}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
