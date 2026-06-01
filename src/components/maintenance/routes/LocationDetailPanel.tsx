import { useState } from "react";
import type { RouteForm, MaintenanceLocation, RouteStop } from "@/hooks/useRouteBuilder";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Plus, PlusCircle, Navigation2, Clock, Link2, Loader2, X, PanelRightClose,
  Star, CalendarClock, CheckSquare, Square, ChevronDown, ChevronRight,
} from "lucide-react";
import logoAutoplanet from "@/assets/logo-autoplanet.png";
import logoAgroplanet from "@/assets/logo-agroplanet.png";
import { MinutesInput } from "./MinutesInput";
import { toast } from "sonner";

interface Props {
  location: MaintenanceLocation;
  forms: RouteForm[];
  existingStop: RouteStop | undefined;
  origin: MaintenanceLocation | null;
  isMultiDay: boolean;
  startTime: string;
  onStartTime: (v: string) => void;
  onAddStop: (location: MaintenanceLocation, formIds?: string[]) => void;
  onToggleForm: (locationId: string, formId: string) => void;
  onAddAllForms: (locationId: string) => void;
  onClearForms: (locationId: string) => void;
  onSetFormMinutes: (locationId: string, formId: string, minutes: number) => void;
  onSetOrigin: (location: MaintenanceLocation) => void;
  onToggleDayBreak: (locationId: string) => void;
  onSetPriorityForm: (locationId: string, formId: string | null) => void;
  onSetStopMinutes?: (stopId: string, minutes: number) => void;
  onMergeForms?: (formIds: string[]) => Promise<void>;
  onUnmergeForms?: (groupId: string) => Promise<void>;
  onClose: () => void;
  onCollapse?: () => void;
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

export function LocationDetailPanel({
  location, forms, existingStop, origin, isMultiDay, startTime, onStartTime,
  onAddStop, onToggleForm, onAddAllForms, onClearForms, onSetFormMinutes, onSetOrigin,
  onToggleDayBreak, onSetPriorityForm, onSetStopMinutes, onMergeForms, onUnmergeForms,
  onClose, onCollapse,
}: Props) {
  const isInRoute = !!existingStop;
  const isOrigin = origin?.id === location.id;
  const isDayStart = !!existingStop?.dayBreak;
  const priorityFormId = existingStop?.priorityFormId ?? null;

  const [mergeMode, setMergeMode] = useState(false);
  const [mergeSel, setMergeSel] = useState<Set<string>>(new Set());
  const [merging, setMerging] = useState(false);
  const [expandedMerge, setExpandedMerge] = useState<Set<string>>(new Set()); // grupos fusionados expandidos
  const toggleExpandMerge = (id: string) => setExpandedMerge((prev) => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n;
  });

  const toggleMergeSel = (id: string) => setMergeSel((prev) => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n;
  });

  const exitMergeMode = () => { setMergeMode(false); setMergeSel(new Set()); };

  const doMerge = async () => {
    if (!onMergeForms || mergeSel.size < 2) return;
    const ids = forms.filter((f) => mergeSel.has(f.id)).flatMap((f) => f.mergedFormIds);
    if (!window.confirm(
      `¿Fusionar ${mergeSel.size} forms en uno solo?\n\nCompartirán un único tiempo y se completarán juntos. ` +
      `Se guardará el historial. Es permanente (puede deshacerse luego).`
    )) return;
    setMerging(true);
    try {
      await onMergeForms(ids);
      toast.success("Forms fusionados");
      exitMergeMode();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudieron fusionar");
    } finally {
      setMerging(false);
    }
  };

  // Mostrar el form prioritario primero (orden coherente con el cronograma)
  const orderedForms = (() => {
    if (!priorityFormId) return forms;
    const idx = forms.findIndex((f) => f.id === priorityFormId);
    if (idx < 0) return forms;
    return [forms[idx], ...forms.filter((f) => f.id !== priorityFormId)];
  })();

  const allSelected = isInRoute && forms.length > 0 && existingStop!.formIds.length === forms.length;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b bg-gray-50 shrink-0">
        <img
          src={location.folder === "Autoplanet" ? logoAutoplanet : logoAgroplanet}
          alt={location.folder}
          className="w-7 h-7 rounded-full object-contain border border-gray-100 bg-white shrink-0"
        />
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wide leading-none mb-0.5">Detalle del local</p>
          <div className="font-semibold text-sm leading-tight truncate">{location.local_name || location.name}</div>
          {location.zona && (
            <div className="text-xs text-gray-400 truncate">{location.zona}{location.gerente_zonal ? ` · ${location.gerente_zonal}` : ""}</div>
          )}
        </div>
        {/* #1 Marcar como inicio (punto de partida) — al costado del nombre */}
        <button
          onClick={() => onSetOrigin(location)}
          title={isOrigin ? "Es el punto de partida" : "Marcar como inicio (punto de partida)"}
          className={`shrink-0 flex items-center gap-1 px-2 h-7 rounded text-[11px] font-medium border transition-colors ${
            isOrigin
              ? "bg-purple-100 border-purple-300 text-purple-700"
              : "bg-white border-gray-200 text-gray-500 hover:border-purple-300 hover:text-purple-600"
          }`}
        >
          <Navigation2 className="w-3.5 h-3.5" />
          {isOrigin ? "Inicio" : "Marcar inicio"}
        </button>
        {onCollapse && (
          <button onClick={onCollapse} className="text-gray-400 hover:text-gray-600 shrink-0" title="Minimizar">
            <PanelRightClose className="w-4 h-4" />
          </button>
        )}
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 shrink-0" title="Cerrar">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Barra de acciones */}
      {(isOrigin || (isInRoute && isMultiDay) || (onMergeForms && forms.length > 1)) && (
        <div className="flex flex-wrap items-center gap-1.5 px-3 py-1.5 border-b bg-white shrink-0">
          {/* #4 Hora de inicio (cuando es punto de partida) */}
          {isOrigin && (
            <div className="flex items-center gap-1 text-[11px] text-purple-700">
              <Clock className="w-3.5 h-3.5" />
              <span>Hora inicio:</span>
              <input type="time" value={startTime} onChange={(e) => onStartTime(e.target.value)}
                className="h-6 border border-gray-200 rounded px-1 text-[11px] focus:outline-none focus:border-purple-400" />
            </div>
          )}

          {/* #2 Inicio de día (solo si la ruta abarca varios días). La hora de cada
              día se edita en la cabecera del día en "Ruta armada". */}
          {isInRoute && isMultiDay && (
            <button
              onClick={() => onToggleDayBreak(location.id)}
              title="Forzar que este local inicie un día nuevo (la hora se ajusta en Ruta armada)"
              className={`flex items-center gap-1 px-2 h-6 rounded text-[11px] font-medium border transition-colors ${
                isDayStart
                  ? "bg-blue-100 border-blue-300 text-blue-700"
                  : "bg-white border-gray-200 text-gray-500 hover:border-blue-300 hover:text-blue-600"
              }`}
            >
              <CalendarClock className="w-3.5 h-3.5" />
              {isDayStart ? "Inicio de día ✓" : "Marcar inicio de día"}
            </button>
          )}

          {/* #6 Fusionar forms — botón que activa las casillas */}
          {onMergeForms && forms.length > 1 && (
            mergeMode ? (
              <>
                <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px] text-gray-500" onClick={exitMergeMode}>
                  Cancelar
                </Button>
                {mergeSel.size >= 2 && (
                  <Button size="sm" className="h-6 px-2 text-[11px] bg-purple-600 hover:bg-purple-700" onClick={doMerge} disabled={merging}>
                    {merging ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Link2 className="w-3 h-3 mr-1" />}
                    Fusionar {mergeSel.size}
                  </Button>
                )}
              </>
            ) : (
              <button
                onClick={() => setMergeMode(true)}
                title="Seleccionar forms para fusionar"
                className="flex items-center gap-1 px-2 h-6 rounded text-[11px] font-medium border bg-white border-gray-200 text-gray-500 hover:border-purple-300 hover:text-purple-600 transition-colors"
              >
                <Link2 className="w-3.5 h-3.5" /> Fusionar forms
              </button>
            )
          )}
        </div>
      )}

      {/* Tiempo de "Solo parada": parada en ruta sin forms seleccionados */}
      {isInRoute && existingStop!.formIds.length === 0 && onSetStopMinutes && (
        <div className="flex items-center gap-2 px-3 py-1.5 border-b bg-amber-50/60">
          <Clock className="w-3.5 h-3.5 text-amber-600 shrink-0" />
          <span className="text-[11px] text-amber-700 flex-1">Solo parada · tiempo:</span>
          <MinutesInput
            value={existingStop!.stopMinutes ?? 30}
            onChange={(m) => onSetStopMinutes(location.id, m)}
            className="w-14 border border-amber-200 rounded px-1 py-0.5 text-[11px] text-center focus:outline-none focus:border-amber-400"
          />
          <span className="text-[10px] text-amber-500">min</span>
        </div>
      )}

      {/* Body scrollable */}
      <div className="flex-1 overflow-y-auto p-2 space-y-2 text-sm">
        {forms.length === 0 ? (
          <p className="text-xs text-gray-400 italic">Sin forms en proceso</p>
        ) : (
          <div className="space-y-1">
            {orderedForms.map((f) => {
              const selected = existingStop?.formIds.includes(f.id) ?? false;
              const descriptions = formDescriptions(f);
              const headline = descriptions[0]?.text ?? "";
              const minutes = existingStop?.formMinutes[f.id] ?? 30;
              const isPriority = priorityFormId === f.id;
              const onRowClick = () => {
                if (mergeMode) { toggleMergeSel(f.id); return; }
                if (!isInRoute) onAddStop(location, [f.id]); else onToggleForm(location.id, f.id);
              };
              return (
                <div key={f.id}
                  className={`rounded px-2 py-1.5 cursor-pointer transition-colors ${
                    isPriority ? "bg-amber-50 border border-amber-200"
                      : selected ? "bg-blue-50 border border-blue-200"
                      : "hover:bg-gray-50 border border-transparent"}`}
                  onClick={onRowClick}
                >
                  <div className="flex items-center gap-2">
                    {mergeMode && (
                      <input type="checkbox" checked={mergeSel.has(f.id)}
                        onChange={() => toggleMergeSel(f.id)} onClick={(e) => e.stopPropagation()}
                        title="Marcar para fusionar" className="shrink-0 rounded border-gray-300" />
                    )}
                    <div className="flex-1 min-w-0">
                      {f.mergedFormNumbers.length > 1 ? (
                        <span className="inline-flex items-center gap-1">
                          <button onClick={(e) => { e.stopPropagation(); toggleExpandMerge(f.id); }}
                            className="text-purple-500 hover:text-purple-700 shrink-0"
                            title={expandedMerge.has(f.id) ? "Colapsar fusionados" : "Ver forms fusionados"}>
                            {expandedMerge.has(f.id) ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                          </button>
                          <span className="inline-flex items-center gap-0.5 rounded bg-purple-100 text-purple-700 text-[9px] font-bold px-1 leading-none py-0.5" title="Forms fusionados">
                            <Link2 className="w-2.5 h-2.5" />F
                          </span>
                          <span className="font-mono text-xs text-purple-700">{f.form_number}</span>
                          <span className="text-[10px] text-gray-400">+{f.mergedFormNumbers.length - 1}</span>
                        </span>
                      ) : (
                        <span className="font-mono text-xs text-gray-600">{f.form_number}</span>
                      )}
                      <span className="ml-1 text-xs text-gray-400">· {formTypeLabel(f)}</span>
                    </div>
                    {/* #3 Form prioritario (solo en ruta y seleccionado) */}
                    {isInRoute && selected && !mergeMode && (
                      <button
                        onClick={(e) => { e.stopPropagation(); onSetPriorityForm(location.id, f.id); }}
                        title={isPriority ? "Quitar prioridad" : "Atender primero (prioritario)"}
                        className="shrink-0">
                        <Star className={`w-3.5 h-3.5 ${isPriority ? "text-amber-500 fill-amber-400" : "text-gray-300 hover:text-amber-400"}`} />
                      </button>
                    )}
                    {f.criticality_name && (
                      <Badge className="text-[10px] px-1 py-0 shrink-0"
                        style={{ backgroundColor: f.criticality_color ?? "#6b7280", color: "#fff", border: "none" }}>
                        {f.criticality_name}
                      </Badge>
                    )}
                    {selected && !mergeMode && <span className="text-blue-500 text-xs shrink-0">✓</span>}
                  </div>

                  {/* Hijos del grupo fusionado (colapsables) */}
                  {f.mergedFormNumbers.length > 1 && expandedMerge.has(f.id) && (
                    <div className="mt-1 ml-5 pl-2 border-l-2 border-purple-100 space-y-0.5">
                      {f.mergedFormNumbers.slice(1).map((num) => (
                        <div key={num} className="font-mono text-[10px] text-purple-600">↳ {num}</div>
                      ))}
                    </div>
                  )}

                  {isPriority && (
                    <div className="mt-0.5 text-[10px] text-amber-600 font-medium">★ Tarea inicial (prioritaria)</div>
                  )}

                  {f.merge_group_id && f.mergedFormNumbers.length > 1 && onUnmergeForms && (
                    <button className="mt-0.5 flex items-center gap-1 text-[10px] text-purple-500 hover:text-red-500"
                      onClick={async (e) => {
                        e.stopPropagation();
                        if (!window.confirm(`¿Deshacer la fusión de ${f.mergedFormNumbers.join(" + ")}?`)) return;
                        try { await onUnmergeForms(f.merge_group_id!); toast.success("Fusión deshecha"); }
                        catch (err) { toast.error(err instanceof Error ? err.message : "Error"); }
                      }}>
                      <Link2 className="w-3 h-3" /> Deshacer fusión
                    </button>
                  )}

                  {headline && (
                    <Popover>
                      <PopoverTrigger asChild>
                        <button className="mt-0.5 text-[11px] text-gray-500 hover:text-blue-600 text-left truncate w-full block"
                          onClick={(e) => e.stopPropagation()} title="Ver descripción completa">
                          {headline}
                        </button>
                      </PopoverTrigger>
                      <PopoverContent align="start" className="w-72 p-3 space-y-2 z-[1200] bg-popover border shadow-lg"
                        onClick={(e) => e.stopPropagation()}>
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

                  {selected && !mergeMode && (
                    <div className="flex items-center gap-1 mt-1 pt-1 border-t border-blue-100" onClick={(e) => e.stopPropagation()}>
                      <Clock className="w-3 h-3 text-gray-400" />
                      <span className="text-[10px] text-gray-500">Tiempo:</span>
                      <MinutesInput value={minutes}
                        onChange={(m) => onSetFormMinutes(location.id, f.id, m)}
                        onClick={(e) => e.stopPropagation()}
                        className="w-14 border border-gray-200 rounded px-1 py-0.5 text-[11px] text-center focus:outline-none focus:border-blue-400" />
                      <span className="text-[10px] text-gray-400">min</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer actions */}
      <div className="flex gap-2 p-2 border-t shrink-0">
        {!isInRoute ? (
          <>
            {forms.length > 0 && (
              <Button size="sm" variant="outline" className="flex-1 text-xs h-8" onClick={() => onAddStop(location)}>
                <PlusCircle className="w-3 h-3 mr-1" /> Agregar todos ({forms.length})
              </Button>
            )}
            <Button size="sm" className="flex-1 text-xs h-8" onClick={() => onAddStop(location, [])}>
              <Plus className="w-3 h-3 mr-1" /> {forms.length === 0 ? "Agregar parada" : "Solo parada"}
            </Button>
          </>
        ) : (
          // #5 Seleccionar / Deseleccionar todos (mismo botón, toggle)
          allSelected ? (
            <Button size="sm" variant="outline" className="flex-1 text-xs h-8" onClick={() => onClearForms(location.id)}>
              <Square className="w-3 h-3 mr-1" /> Deseleccionar todos
            </Button>
          ) : (
            <Button size="sm" variant="outline" className="flex-1 text-xs h-8" onClick={() => onAddAllForms(location.id)}>
              <CheckSquare className="w-3 h-3 mr-1" /> Seleccionar todos
            </Button>
          )
        )}
      </div>
    </div>
  );
}
