import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Trash2, Bell } from "lucide-react";
import { addMonths, format, parseISO } from "date-fns";
import { es } from "date-fns/locale";

export interface NoticeEntry {
  id?: string;
  notice_type: "meses" | "fecha";
  notice_value: string;
  notice_bilaterality: "unilateral_gp" | "bilateral";
  description?: string;
  create_alert?: boolean;
  alert_days_before?: number;
  alert_email?: string;
}

interface MultipleNoticesSectionProps {
  notices: NoticeEntry[];
  onChange: (notices: NoticeEntry[]) => void;
  durationMonths?: number;
  signedDate?: string;
  contractName?: string;
}

export function MultipleNoticesSection({ 
  notices, 
  onChange, 
  durationMonths,
  signedDate,
  contractName
}: MultipleNoticesSectionProps) {
  const addNotice = () => {
    onChange([
      ...notices,
      {
        notice_type: "meses",
        notice_value: "6",
        notice_bilaterality: "unilateral_gp",
        description: "renovacion",
        create_alert: false,
        alert_days_before: 7,
        alert_email: "",
      },
    ]);
  };

  const updateNotice = (index: number, field: keyof NoticeEntry, value: string | boolean | number) => {
    const newNotices = [...notices];
    newNotices[index] = { ...newNotices[index], [field]: value };
    onChange(newNotices);
  };

  const removeNotice = (index: number) => {
    onChange(notices.filter((_, i) => i !== index));
  };

  // Calculate the deadline date for a notice
  const calculateDeadlineDate = (notice: NoticeEntry): string | null => {
    if (!signedDate || !durationMonths) return null;

    try {
      const startDate = parseISO(signedDate);
      const endDate = addMonths(startDate, durationMonths);

      if (notice.notice_type === "fecha") {
        return notice.notice_value;
      } else {
        const monthsBefore = parseInt(notice.notice_value) || 0;
        const deadlineDate = addMonths(endDate, -monthsBefore);
        return format(deadlineDate, "yyyy-MM-dd");
      }
    } catch (e) {
      return null;
    }
  };

  // Format date for display
  const formatDeadlineDisplay = (notice: NoticeEntry): string => {
    const date = calculateDeadlineDate(notice);
    if (!date) return "Fecha no disponible";
    
    try {
      return format(parseISO(date), "d 'de' MMMM 'de' yyyy", { locale: es });
    } catch {
      return "Fecha inválida";
    }
  };

  const getNoticeTypeLabel = (description?: string) => {
    switch (description) {
      case "renovacion":
        return "Aviso de Renovación";
      case "termino":
        return "Aviso de Término";
      default:
        return "Aviso";
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Label className="text-base font-medium">Otros Avisos</Label>
        <Button type="button" variant="outline" size="sm" onClick={addNotice} className="gap-1">
          <Plus className="h-4 w-4" />
          Agregar Aviso
        </Button>
      </div>

      {notices.length === 0 && (
        <p className="text-sm text-muted-foreground py-4 text-center border border-dashed rounded-lg">
          No hay avisos configurados. Haz clic en "Agregar Aviso" para añadir uno.
        </p>
      )}

      <div className="space-y-4">
        {notices.map((notice, index) => (
          <div
            key={notice.id || index}
            className="border border-border rounded-lg p-4 space-y-4 bg-muted/30 relative"
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-muted-foreground">
                Aviso #{index + 1}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => removeNotice(index)}
                className="h-8 w-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Tipo de Aviso</Label>
                <Select
                  value={notice.description || "renovacion"}
                  onValueChange={(value) => updateNotice(index, "description", value)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="renovacion">Fecha tope para aviso de renovación</SelectItem>
                    <SelectItem value="termino">Aviso de Término o Salida Anticipada</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Formato</Label>
                  <Select
                    value={notice.notice_type}
                    onValueChange={(value) => updateNotice(index, "notice_type", value)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="meses">Meses antes del vencimiento</SelectItem>
                      <SelectItem value="fecha">Fecha específica</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>
                    {notice.notice_type === "meses" ? "Número de Meses" : "Fecha"}
                  </Label>
                  {notice.notice_type === "meses" ? (
                    <Input
                      type="number"
                      min="1"
                      max={durationMonths || 999}
                      value={notice.notice_value}
                      onChange={(e) => updateNotice(index, "notice_value", e.target.value)}
                      placeholder="Ej: 6"
                    />
                  ) : (
                    <Input
                      type="date"
                      value={notice.notice_value}
                      onChange={(e) => updateNotice(index, "notice_value", e.target.value)}
                    />
                  )}
                </div>
              </div>

              {/* Show calculated deadline */}
              {signedDate && durationMonths && (
                <div className="bg-background/50 rounded p-2">
                  <p className="text-xs text-muted-foreground">
                    Fecha límite: <span className="font-medium text-foreground">{formatDeadlineDisplay(notice)}</span>
                  </p>
                </div>
              )}

              <div className="space-y-2">
                <Label>Bilateralidad</Label>
                <RadioGroup
                  value={notice.notice_bilaterality}
                  onValueChange={(value) => updateNotice(index, "notice_bilaterality", value)}
                  className="flex gap-4"
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="unilateral_gp" id={`unilateral_${index}`} />
                    <Label htmlFor={`unilateral_${index}`} className="cursor-pointer">
                      Unilateral GP
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="bilateral" id={`bilateral_${index}`} />
                    <Label htmlFor={`bilateral_${index}`} className="cursor-pointer">
                      Bilateral
                    </Label>
                  </div>
                </RadioGroup>
              </div>

              {/* Alert creation section */}
              <div className="border-t border-border pt-4 mt-4">
                <div className="flex items-start space-x-3">
                  <Checkbox
                    id={`create_alert_${index}`}
                    checked={notice.create_alert || false}
                    onCheckedChange={(checked) => updateNotice(index, "create_alert", !!checked)}
                  />
                  <div className="space-y-1">
                    <Label 
                      htmlFor={`create_alert_${index}`} 
                      className="cursor-pointer flex items-center gap-2"
                    >
                      <Bell className="h-4 w-4 text-warning" />
                      Crear alerta para este aviso
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Se creará una alerta basada en la fecha límite de este aviso
                    </p>
                  </div>
                </div>

                {notice.create_alert && (
                  <div className="mt-4 ml-6 space-y-4 p-3 bg-warning/5 border border-warning/20 rounded-lg">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor={`alert_days_${index}`}>Días antes para alertar</Label>
                        <Input
                          id={`alert_days_${index}`}
                          type="number"
                          min="1"
                          max="365"
                          value={notice.alert_days_before || 7}
                          onChange={(e) => updateNotice(index, "alert_days_before", parseInt(e.target.value) || 7)}
                          placeholder="7"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor={`alert_email_${index}`}>Email para notificaciones</Label>
                        <Input
                          id={`alert_email_${index}`}
                          type="email"
                          value={notice.alert_email || ""}
                          onChange={(e) => updateNotice(index, "alert_email", e.target.value)}
                          placeholder="correo@ejemplo.com"
                        />
                      </div>
                    </div>
                    {signedDate && durationMonths && (
                      <p className="text-xs text-muted-foreground">
                        La alerta "{getNoticeTypeLabel(notice.description)}{contractName ? `: ${contractName}` : ""}" 
                        se enviará {notice.alert_days_before || 7} días antes de la fecha límite ({formatDeadlineDisplay(notice)})
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {notices.length > 0 && durationMonths && (
        <p className="text-xs text-muted-foreground">
          Duración del contrato: {durationMonths} meses
        </p>
      )}
    </div>
  );
}

// Helper function to create alerts from notices - to be called when saving the contract
export async function createAlertsFromNotices(
  supabase: any,
  contractId: string,
  contractName: string,
  notices: NoticeEntry[],
  signedDate: string,
  durationMonths: number
): Promise<{ success: boolean; alertsCreated: number; errors: string[] }> {
  const errors: string[] = [];
  let alertsCreated = 0;

  for (const notice of notices) {
    if (!notice.create_alert) continue;

    try {
      const startDate = parseISO(signedDate);
      const endDate = addMonths(startDate, durationMonths);
      
      let deadlineDate: string;
      if (notice.notice_type === "fecha") {
        deadlineDate = notice.notice_value;
      } else {
        const monthsBefore = parseInt(notice.notice_value) || 0;
        deadlineDate = format(addMonths(endDate, -monthsBefore), "yyyy-MM-dd");
      }

      const noticeTypeLabel = notice.description === "renovacion" 
        ? "Aviso de Renovación" 
        : notice.description === "termino" 
          ? "Aviso de Término" 
          : "Aviso";

      const alertTitle = `${noticeTypeLabel}${contractName ? `: ${contractName}` : ""}`;
      const alertMessage = `Fecha límite para ${notice.description === "renovacion" ? "dar aviso de renovación" : "dar aviso de término"} del contrato ${contractName}. Fecha límite: ${format(parseISO(deadlineDate), "d 'de' MMMM 'de' yyyy", { locale: es })}`;

      const { data: alertData, error: alertError } = await supabase
        .from("alerts")
        .insert({
          contract_id: contractId,
          title: alertTitle,
          message: alertMessage,
          alert_type: notice.description === "renovacion" ? "contract_renewal" : "early_termination_notice",
          alert_subtype: notice.description,
          due_date: deadlineDate,
          days_before: [notice.alert_days_before || 7],
          channels: ["email"],
          is_active: true,
          item_type: "notice",
        })
        .select()
        .single();

      if (alertError) {
        errors.push(`Error al crear alerta para aviso: ${alertError.message}`);
        continue;
      }

      // Add recipient if email provided
      if (alertData && notice.alert_email) {
        const { error: recipientError } = await supabase
          .from("alert_recipients")
          .insert({
            alert_id: alertData.id,
            email: notice.alert_email,
          });

        if (recipientError) {
          errors.push(`Error al agregar destinatario: ${recipientError.message}`);
        }
      }

      alertsCreated++;
    } catch (e: any) {
      errors.push(`Error procesando aviso: ${e.message}`);
    }
  }

  return {
    success: errors.length === 0,
    alertsCreated,
    errors
  };
}