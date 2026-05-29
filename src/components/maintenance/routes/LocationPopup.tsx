import { useState } from "react";
import { Popup } from "react-leaflet";
import type { RouteForm, MaintenanceLocation, RouteStop } from "@/hooks/useRouteBuilder";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Plus, PlusCircle, Navigation2, Clock, Link2, Loader2 } from "lucide-react";
import logoAutoplanet from "@/assets/logo-autoplanet.png";
import logoAgroplanet from "@/assets/logo-agroplanet.png";
import { MinutesInput } from "./MinutesInput";
import { toast } from "sonner";

interface Props {
  location: MaintenanceLocation;
  forms: RouteForm[];
  existingStop: RouteStop | undefined;
  onAddStop: (location: MaintenanceLocation, formIds?: string[]) => void;
  onToggleForm: (locationId: string, formId: string) => void;
  onAddAllForms: (locationId: string) => void;
  onSetFormMinutes?: (locationId: string, formId: string, minutes: number) => void;
  onSetOrigin?: (location: MaintenanceLocation) => void;
  onMergeForms?: (formIds: string[]) => Promise<void>;
}

function formTypeLabel(f: RouteForm): string {
  if (f.electrical_description) return "Eléctrico";
  if (f.civil_description) return "Obra Civil";
  if (f.hvac_description) return "Climatización";
  if (f.fixed_assets_description) return "Activos Fijos";
  return "General";
}

function formDescriptions(f: RouteForm): { label: string; text: string }[] {
  return [
    { label: "Eléctrico", text: f.electrical_description },
    { label: "Obra Civil", text: f.civil_description },
    { label: "Climatización", text: f.hvac_description },
    { label: "Activos Fijos", text: f.fixed_assets_description },
    { label: "General", text: f.general_description },
  ].filter((i) => i.text?.trim()).map((i) => ({ label: i.label, text: i.text!.trim() }));
}

export function LocationPopup({
  location, forms, existingStop,
  onAddStop, onToggleForm, onAddAllForms, onSetFormMinutes, onSetOrigin, onMergeForms,
}: Props) {
  const isInRoute = !!existingStop;
  const [mergeSel, setMergeSel] = useState<Set<string>>(new Set());
  const [merging, setMerging] = useState(false);

  const toggleMergeSel = (id: string) => setMergeSel((prev) => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n;
  });

  const doMerge = async () => {
    if (!onMergeForms || mergeSel.size < 2) return;
    // Solo se fusionan forms NO fusionados; expandir a sus IDs base
    const ids = forms.filter((f) => mergeSel.has(f.id)).flatMap((f) => f.mergedFormIds);
    if (!window.confirm(
      `¿Fusionar ${mergeSel.size} forms en uno solo?\n\n` +
      `Compartirán un único tiempo y se completarán juntos. ` +
      `Se guardará el historial de la fusión. Esta acción es permanente (puede deshacerse luego).`
    )) return;
    setMerging(true);
    try {
      await onMergeForms(ids);
      toast.success("Forms fusionados");
      setMergeSel(new Set());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudieron fusionar");
    } finally {
      setMerging(false);
    }
  };

  return (
    <Popup minWidth={300} maxWidth={620} className="lf-resizable-popup">
      <div className="text-sm space-y-2">
        {/* Header */}
        <div className="flex items-center gap-2">
          <img
            src={location.folder === "Autoplanet" ? logoAutoplanet : logoAgroplanet}
            alt={location.folder}
            className="w-7 h-7 rounded-full object-contain border border-gray-100 bg-white shrink-0"
          />
          <div>
            <div className="font-semibold text-sm leading-tight">{location.local_name || location.name}</div>
            {location.zona && (
              <div className="text-xs text-gray-400">{location.zona}{location.gerente_zonal ? ` · ${location.gerente_zonal}` : ""}</div>
            )}
          </div>
        </div>

        {/* Forms */}
        {forms.length === 0 ? (
          <p className="text-xs text-gray-400 italic">Sin forms en proceso</p>
        ) : (
          <div className="space-y-1">
            {forms.map((f) => {
              const selected = existingStop?.formIds.includes(f.id) ?? false;
              const descriptions = formDescriptions(f);
              const headline = descriptions[0]?.text ?? "";
              const minutes = existingStop?.formMinutes[f.id] ?? 30;

              return (
                <div
                  key={f.id}
                  className={`rounded px-2 py-1.5 cursor-pointer transition-colors ${
                    selected ? "bg-blue-50 border border-blue-200" : "hover:bg-gray-50 border border-transparent"
                  }`}
                  onClick={() => {
                    if (!isInRoute) onAddStop(location, [f.id]);
                    else onToggleForm(location.id, f.id);
                  }}
                >
                  {/* Top row: checkbox fusión + form number + type + criticality + check */}
                  <div className="flex items-center gap-2">
                    {onMergeForms && (
                      <input
                        type="checkbox"
                        checked={mergeSel.has(f.id)}
                        onChange={() => toggleMergeSel(f.id)}
                        onClick={(e) => e.stopPropagation()}
                        title="Marcar para fusionar"
                        className="shrink-0 rounded border-gray-300"
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      {f.mergedFormNumbers.length > 1 ? (
                        <span className="inline-flex items-center gap-1">
                          <Link2 className="w-3 h-3 text-purple-500 shrink-0" />
                          <span className="font-mono text-xs text-purple-700">{f.mergedFormNumbers.join(" + ")}</span>
                        </span>
                      ) : (
                        <span className="font-mono text-xs text-gray-600">{f.form_number}</span>
                      )}
                      <span className="ml-1 text-xs text-gray-400">· {formTypeLabel(f)}</span>
                    </div>
                    {f.criticality_name && (
                      <Badge className="text-[10px] px-1 py-0 shrink-0"
                        style={{ backgroundColor: f.criticality_color ?? "#6b7280", color: "#fff", border: "none" }}>
                        {f.criticality_name}
                      </Badge>
                    )}
                    {selected && <span className="text-blue-500 text-xs shrink-0">✓</span>}
                  </div>

                  {/* Description headline → click opens full description popover */}
                  {headline && (
                    <Popover>
                      <PopoverTrigger asChild>
                        <button
                          className="mt-0.5 text-[11px] text-gray-500 hover:text-blue-600 text-left truncate w-full block transition-colors"
                          onClick={(e) => e.stopPropagation()}
                          title="Ver descripción completa"
                        >
                          {headline}
                        </button>
                      </PopoverTrigger>
                      <PopoverContent
                        align="start"
                        className="w-72 p-3 space-y-2 z-[1200] bg-popover border shadow-lg"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex items-center gap-1.5 border-b pb-1.5">
                          <span className="font-mono text-xs font-semibold">{f.form_number}</span>
                          {f.criticality_name && (
                            <Badge className="text-[10px] px-1 py-0"
                              style={{ backgroundColor: f.criticality_color ?? "#6b7280", color: "#fff", border: "none" }}>
                              {f.criticality_name}
                            </Badge>
                          )}
                        </div>
                        {descriptions.map((d) => (
                          <div key={d.label}>
                            <p className="text-[10px] font-semibold text-muted-foreground uppercase">{d.label}</p>
                            <p className="text-xs whitespace-pre-wrap leading-relaxed">{d.text}</p>
                          </div>
                        ))}
                      </PopoverContent>
                    </Popover>
                  )}

                  {/* Minutes input — only when form is selected in the route */}
                  {selected && onSetFormMinutes && (
                    <div className="flex items-center gap-1 mt-1 pt-1 border-t border-blue-100"
                      onClick={(e) => e.stopPropagation()}>
                      <Clock className="w-3 h-3 text-gray-400" />
                      <span className="text-[10px] text-gray-500">Tiempo:</span>
                      <MinutesInput
                        value={minutes}
                        onChange={(m) => onSetFormMinutes(location.id, f.id, m)}
                        onClick={(e) => e.stopPropagation()}
                        className="w-14 border border-gray-200 rounded px-1 py-0.5 text-[11px] text-center focus:outline-none focus:border-blue-400"
                      />
                      <span className="text-[10px] text-gray-400">min</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Botón fusionar (aparece con 2+ marcados) */}
        {onMergeForms && mergeSel.size >= 2 && (
          <Button
            size="sm"
            className="w-full text-xs h-7 bg-purple-600 hover:bg-purple-700"
            onClick={doMerge}
            disabled={merging}
          >
            {merging ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Link2 className="w-3 h-3 mr-1" />}
            Fusionar {mergeSel.size} forms
          </Button>
        )}

        {/* Set as origin */}
        {onSetOrigin && (
          <button
            className="flex items-center gap-1 text-[11px] text-purple-600 hover:text-purple-800 font-medium"
            onClick={() => onSetOrigin(location)}
          >
            <Navigation2 className="w-3 h-3" />
            Fijar como punto de partida
          </button>
        )}

        {/* Actions */}
        <div className="flex gap-2 pt-1 border-t">
          {!isInRoute ? (
            <>
              {forms.length > 0 && (
                <Button size="sm" variant="outline" className="flex-1 text-xs h-7"
                  onClick={() => onAddStop(location)}>
                  <PlusCircle className="w-3 h-3 mr-1" />
                  Agregar todos ({forms.length})
                </Button>
              )}
              <Button size="sm" className="flex-1 text-xs h-7"
                onClick={() => onAddStop(location, [])}>
                <Plus className="w-3 h-3 mr-1" />
                {forms.length === 0 ? "Agregar parada" : "Solo parada"}
              </Button>
            </>
          ) : (
            <Button size="sm" variant="outline" className="flex-1 text-xs h-7"
              onClick={() => onAddAllForms(location.id)}>
              <PlusCircle className="w-3 h-3 mr-1" />
              Seleccionar todos
            </Button>
          )}
        </div>
      </div>
    </Popup>
  );
}
