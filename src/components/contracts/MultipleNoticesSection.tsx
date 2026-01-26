import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Trash2, Bell, Calendar } from "lucide-react";
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

export interface NoticeRange {
  id?: string;
  start_month: number;
  end_month: number;
}

export interface NoticeEntry {
  id?: string;
  months_before: number; // Meses antes del término anticipado principal
  notice_bilaterality: "unilateral_gp" | "bilateral";
  create_alert?: boolean;
  alert_days_before?: number[];
  alert_channels?: string[];
  alert_repeat_enabled?: boolean;
  alert_repeat_days?: number;
  // New: indices of which ranges this notice applies to (for "rangos" type)
  selected_range_indices?: number[];
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
  // New props for range support
  noticeType?: string;
  noticeRanges?: NoticeRange[];
}

export function MultipleNoticesSection({ 
  notices, 
  onChange, 
  durationMonths,
  signedDate,
  contractName,
  noticeType,
  noticeRanges = []
}: MultipleNoticesSectionProps) {
  const hasRanges = noticeType === "rangos" && noticeRanges.length > 0;
  
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
        // By default, select all ranges
        selected_range_indices: hasRanges ? noticeRanges.map((_, i) => i) : undefined,
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

  const toggleRangeSelection = (noticeIndex: number, rangeIndex: number) => {
    const notice = notices[noticeIndex];
    const currentSelection = notice.selected_range_indices || [];
    const isSelected = currentSelection.includes(rangeIndex);
    
    const newSelection = isSelected
      ? currentSelection.filter(i => i !== rangeIndex)
      : [...currentSelection, rangeIndex].sort((a, b) => a - b);
    
    updateNotice(noticeIndex, "selected_range_indices", newSelection);
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

  // Calculate notice deadline for a specific range (based on END of range)
  const calculateNoticeDeadlineForRange = (notice: NoticeEntry, range: NoticeRange, startDate?: string): string | null => {
    if (!startDate) return null;
    try {
      const start = parseISO(startDate);
      // Use end_month for the deadline calculation (notice is X months before the END of the range)
      const rangeEndDate = addMonths(start, range.end_month - 1);
      const monthsBefore = getMonthsBefore(notice);
      const deadlineDate = addMonths(rangeEndDate, -monthsBefore);
      return format(deadlineDate, "d 'de' MMMM yyyy", { locale: es });
    } catch {
      return null;
    }
  };

  // Calculate the month number for notice deadline for a range (based on END of range)
  const getNoticeDeadlineMonth = (notice: NoticeEntry, range: NoticeRange): number => {
    const monthsBefore = getMonthsBefore(notice);
    // Notice deadline is X months before the END of the range
    return range.end_month - monthsBefore;
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

              {/* Range selection section - only show when there are ranges */}
              {hasRanges && (
                <div className="border-t border-border pt-4 mt-4">
                  <div className="space-y-3">
                    <Label className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-primary" />
                      Aplicar a rangos de término *
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Selecciona los rangos de término anticipado a los que aplica este aviso. Se creará una alerta para cada rango seleccionado.
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                      {noticeRanges.map((range, rangeIndex) => {
                        const isSelected = (notice.selected_range_indices || []).includes(rangeIndex);
                        const deadlineMonth = getNoticeDeadlineMonth(notice, range);
                        const deadlineDate = calculateNoticeDeadlineForRange(notice, range, signedDate);
                        
                        return (
                          <div
                            key={rangeIndex}
                            onClick={() => toggleRangeSelection(index, rangeIndex)}
                            className={`
                              cursor-pointer border rounded-lg p-3 transition-all
                              ${isSelected 
                                ? 'border-primary bg-primary/5 ring-1 ring-primary' 
                                : 'border-border hover:border-muted-foreground/50'
                              }
                            `}
                          >
                            <div className="flex items-start gap-2">
                              <Checkbox
                                checked={isSelected}
                                onCheckedChange={() => toggleRangeSelection(index, rangeIndex)}
                                onClick={(e) => e.stopPropagation()}
                              />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium">
                                  Rango {rangeIndex + 1}: M{range.start_month} - M{range.end_month}
                                </p>
                                <p className="text-xs text-muted-foreground mt-1">
                                  Aviso tope: <span className="font-medium text-foreground">Mes {deadlineMonth}</span>
                                </p>
                                {deadlineDate && (
                                  <p className="text-xs text-muted-foreground">
                                    ({deadlineDate})
                                  </p>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    {(notice.selected_range_indices?.length || 0) === 0 && (
                      <p className="text-xs text-destructive">
                        Debes seleccionar al menos un rango
                      </p>
                    )}
                  </div>
                </div>
              )}

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
                      {hasRanges && (notice.selected_range_indices?.length || 0) > 0 ? (
                        <>Se crearán {notice.selected_range_indices?.length} alerta{(notice.selected_range_indices?.length || 0) > 1 ? 's' : ''} (una por cada rango seleccionado)</>
                      ) : (
                        <>Se creará una alerta {getMonthsBefore(notice)} {getMonthsBefore(notice) === 1 ? 'mes' : 'meses'} antes de la fecha de término anticipado</>
                      )}
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
// For "rangos" type, we now support creating multiple alerts based on selected_range_indices
export async function createAlertsFromNotices(
  supabase: any,
  contractId: string,
  contractName: string,
  notices: NoticeEntry[],
  earlyTerminationDate: string, // The calculated date from the main notice type (meses, fecha, desde_mes, rangos)
  noticeType?: string,
  noticeRanges?: NoticeRange[],
  contractStartDate?: string
): Promise<{ success: boolean; alertsCreated: number; errors: string[] }> {
  const errors: string[] = [];
  let alertsCreated = 0;

  for (const notice of notices) {
    if (!notice.create_alert) continue;

    try {
      const monthsBefore = notice.months_before || 6;
      
      // Check if this is a "rangos" type with selected ranges
      if (noticeType === "rangos" && noticeRanges && noticeRanges.length > 0 && contractStartDate) {
        const selectedIndices = notice.selected_range_indices || noticeRanges.map((_, i) => i);
        
        if (selectedIndices.length === 0) continue;
        
        // Create an alert for each selected range
        for (const rangeIndex of selectedIndices) {
          const range = noticeRanges[rangeIndex];
          if (!range) continue;
          
          // Calculate the notice deadline for this specific range (based on END of range)
          const startDate = parseISO(contractStartDate);
          // Use end_month: the notice is X months before the END of the range
          const rangeEndDate = addMonths(startDate, range.end_month - 1);
          const deadlineDate = format(addMonths(rangeEndDate, -monthsBefore), "yyyy-MM-dd");
          
          const alertTitle = `Aviso de Término Anticipado (Rango M${range.start_month}-M${range.end_month}): ${contractName}`;
          const alertMessage = `Se debe dar aviso de término anticipado ${monthsBefore} ${monthsBefore === 1 ? 'mes' : 'meses'} antes del vencimiento del rango M${range.start_month}-M${range.end_month}. Fecha límite: ${format(parseISO(deadlineDate), "d 'de' MMMM 'de' yyyy", { locale: es })}`;

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
            errors.push(`Error al crear alerta para rango M${range.start_month}: ${alertError.message}`);
            continue;
          }

          alertsCreated++;
        }
      } else {
        // Original logic for non-range types
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
      }
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