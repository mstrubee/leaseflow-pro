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

const DAYS_BEFORE_OPTIONS = [
  { value: 60, label: "60 días antes" },
  { value: 30, label: "30 días antes" },
  { value: 15, label: "15 días antes" },
  { value: 7, label: "7 días antes" },
  { value: 3, label: "3 días antes" },
  { value: 1, label: "1 día antes" },
  { value: 0, label: "El mismo día" },
];

export interface NoticeEntry {
  id?: string;
  months_before: number; // Meses antes del término anticipado principal
  notice_bilaterality: "unilateral_gp" | "bilateral";
  create_alert?: boolean;
  alert_days_before?: number[];
  alert_channels?: string[];
  alert_repeat_enabled?: boolean;
  alert_repeat_days?: number;
  // Legacy fields for backward compatibility
  notice_type?: "meses" | "fecha" | "desde_mes";
  notice_value?: string;
  description?: string;
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
        months_before: 6,
        notice_bilaterality: "unilateral_gp",
        create_alert: false,
        alert_days_before: [30, 7, 1],
        alert_channels: ["email"],
        alert_repeat_enabled: false,
        alert_repeat_days: 7,
      },
    ]);
  };

  const updateNotice = (index: number, field: keyof NoticeEntry, value: string | boolean | number | number[] | string[]) => {
    const newNotices = [...notices];
    newNotices[index] = { ...newNotices[index], [field]: value };
    onChange(newNotices);
  };

  const removeNotice = (index: number) => {
    onChange(notices.filter((_, i) => i !== index));
  };

  // Get months_before value, supporting legacy notice_value for backward compatibility
  const getMonthsBefore = (notice: NoticeEntry): number => {
    if (notice.months_before !== undefined) {
      return notice.months_before;
    }
    // Legacy: parse from notice_value if it was a "meses" type
    if (notice.notice_value) {
      return parseInt(notice.notice_value) || 6;
    }
    return 6;
  };

  // Format the notice label
  const getNoticeLabel = (notice: NoticeEntry): string => {
    const months = getMonthsBefore(notice);
    return `${months} ${months === 1 ? 'mes' : 'meses'} antes`;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Label className="text-base font-medium">Avisos de Término Anticipado</Label>
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
                Aviso #{index + 1} - {getNoticeLabel(notice)}
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
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Meses antes del término anticipado *</Label>
                  <Input
                    type="number"
                    min="1"
                    max={durationMonths || 999}
                    value={getMonthsBefore(notice)}
                    onChange={(e) => updateNotice(index, "months_before", parseInt(e.target.value) || 6)}
                    placeholder="Ej: 6"
                  />
                  <p className="text-xs text-muted-foreground">
                    El aviso debe darse {getMonthsBefore(notice)} {getMonthsBefore(notice) === 1 ? 'mes' : 'meses'} antes de la fecha de término anticipado
                  </p>
                </div>

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
                      Se creará una alerta {getMonthsBefore(notice)} {getMonthsBefore(notice) === 1 ? 'mes' : 'meses'} antes de la fecha de término anticipado
                    </p>
                  </div>
                </div>

                {notice.create_alert && (
                  <div className="mt-4 ml-6 space-y-4 p-4 bg-warning/5 border border-warning/20 rounded-lg">
                    {/* Days before options */}
                    <div className="space-y-2">
                      <Label>Días de aviso previo *</Label>
                      <div className="flex flex-wrap gap-2">
                        {DAYS_BEFORE_OPTIONS.map((option) => {
                          const currentDays = notice.alert_days_before || [30, 7, 1];
                          const isSelected = currentDays.includes(option.value);
                          return (
                            <Button
                              key={option.value}
                              type="button"
                              variant={isSelected ? "default" : "outline"}
                              size="sm"
                              onClick={() => {
                                const newDays = isSelected
                                  ? currentDays.filter((d) => d !== option.value)
                                  : [...currentDays, option.value].sort((a, b) => b - a);
                                updateNotice(index, "alert_days_before", newDays);
                              }}
                            >
                              {option.label}
                            </Button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Channels */}
                    <div className="space-y-2">
                      <Label>Canales de notificación *</Label>
                      <div className="flex gap-4">
                        <div className="flex items-center space-x-2">
                          <Checkbox
                            id={`channel_email_${index}`}
                            checked={(notice.alert_channels || ["email"]).includes("email")}
                            onCheckedChange={(checked) => {
                              const currentChannels = notice.alert_channels || ["email"];
                              const newChannels = checked
                                ? [...currentChannels, "email"]
                                : currentChannels.filter((c) => c !== "email");
                              updateNotice(index, "alert_channels", newChannels);
                            }}
                          />
                          <Label htmlFor={`channel_email_${index}`} className="flex items-center gap-1 cursor-pointer">
                            <Bell className="h-4 w-4" />
                            Email
                          </Label>
                        </div>
                        <div className="flex items-center space-x-2 opacity-50">
                          <Checkbox
                            id={`channel_whatsapp_${index}`}
                            disabled
                          />
                          <Label htmlFor={`channel_whatsapp_${index}`} className="flex items-center gap-1 cursor-pointer">
                            WhatsApp (próximamente)
                          </Label>
                        </div>
                      </div>
                    </div>

                    {/* Repeat option */}
                    <div className="space-y-3 p-3 bg-muted/50 rounded-lg">
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id={`repeat_${index}`}
                          checked={notice.alert_repeat_enabled || false}
                          onCheckedChange={(checked) => updateNotice(index, "alert_repeat_enabled", !!checked)}
                        />
                        <Label htmlFor={`repeat_${index}`} className="cursor-pointer">
                          Repetir después del vencimiento
                        </Label>
                      </div>
                      {notice.alert_repeat_enabled && (
                        <div className="flex items-center gap-2 ml-6">
                          <span className="text-sm text-muted-foreground">Repetir cada</span>
                          <Input
                            type="number"
                            min={1}
                            max={365}
                            value={notice.alert_repeat_days || 7}
                            onChange={(e) => updateNotice(index, "alert_repeat_days", parseInt(e.target.value) || 7)}
                            className="w-20"
                          />
                          <span className="text-sm text-muted-foreground">días hasta marcar como revisado</span>
                        </div>
                      )}
                    </div>
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
// The earlyTerminationDate is the deadline from the main "Tipo de Término Anticipado" configuration
export async function createAlertsFromNotices(
  supabase: any,
  contractId: string,
  contractName: string,
  notices: NoticeEntry[],
  earlyTerminationDate: string // The calculated date from the main notice type (meses, fecha, desde_mes, rangos)
): Promise<{ success: boolean; alertsCreated: number; errors: string[] }> {
  const errors: string[] = [];
  let alertsCreated = 0;

  for (const notice of notices) {
    if (!notice.create_alert) continue;

    try {
      // Calculate deadline: N months before the early termination date
      const monthsBefore = notice.months_before || 6;
      const terminationDate = parseISO(earlyTerminationDate);
      const deadlineDate = format(addMonths(terminationDate, -monthsBefore), "yyyy-MM-dd");

      const alertTitle = `Aviso de Término Anticipado: ${contractName}`;
      const alertMessage = `Se debe dar aviso de término anticipado ${monthsBefore} ${monthsBefore === 1 ? 'mes' : 'meses'} antes de la fecha de término. Fecha límite: ${format(parseISO(deadlineDate), "d 'de' MMMM 'de' yyyy", { locale: es })}`;

      const { error: alertError } = await supabase
        .from("alerts")
        .insert({
          contract_id: contractId,
          title: alertTitle,
          message: alertMessage,
          alert_type: "early_termination_notice",
          alert_subtype: "termino_anticipado",
          due_date: deadlineDate,
          days_before: notice.alert_days_before || [30, 7, 1],
          channels: (notice.alert_channels || ["email"]) as ("email" | "whatsapp")[],
          repeat_every_days: notice.alert_repeat_enabled ? (notice.alert_repeat_days || 7) : null,
          is_active: true,
          item_type: "notice",
        })
        .select()
        .single();

      if (alertError) {
        errors.push(`Error al crear alerta para aviso: ${alertError.message}`);
        continue;
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