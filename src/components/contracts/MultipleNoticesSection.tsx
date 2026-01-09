import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Plus, Trash2 } from "lucide-react";

export interface NoticeEntry {
  id?: string;
  notice_type: "meses" | "fecha";
  notice_value: string;
  notice_bilaterality: "unilateral_gp" | "bilateral";
  description?: string;
}

interface MultipleNoticesSectionProps {
  notices: NoticeEntry[];
  onChange: (notices: NoticeEntry[]) => void;
  durationMonths?: number;
}

export function MultipleNoticesSection({ notices, onChange, durationMonths }: MultipleNoticesSectionProps) {
  const addNotice = () => {
    onChange([
      ...notices,
      {
        notice_type: "meses",
        notice_value: "6",
        notice_bilaterality: "unilateral_gp",
        description: "",
      },
    ]);
  };

  const updateNotice = (index: number, field: keyof NoticeEntry, value: string) => {
    const newNotices = [...notices];
    newNotices[index] = { ...newNotices[index], [field]: value };
    onChange(newNotices);
  };

  const removeNotice = (index: number) => {
    onChange(notices.filter((_, i) => i !== index));
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
