import { Popup } from "react-leaflet";
import type { RouteForm, MaintenanceLocation, RouteStop } from "@/hooks/useRouteBuilder";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Plus, PlusCircle } from "lucide-react";
import logoAutoplanet from "@/assets/logo-autoplanet.png";
import logoAgroplanet from "@/assets/logo-agroplanet.png";

interface Props {
  location: MaintenanceLocation;
  forms: RouteForm[];
  existingStop: RouteStop | undefined;
  onAddStop: (location: MaintenanceLocation, formIds?: string[]) => void;
  onToggleForm: (locationId: string, formId: string) => void;
  onAddAllForms: (locationId: string) => void;
}

export function LocationPopup({ location, forms, existingStop, onAddStop, onToggleForm, onAddAllForms }: Props) {
  const isInRoute = !!existingStop;

  function formTypeLabel(f: RouteForm): string {
    if (f.electrical_description) return "Eléctrico";
    if (f.civil_description) return "Civil";
    if (f.hvac_description) return "Climatización";
    if (f.fixed_assets_description) return "Activos Fijos";
    return "General";
  }

  return (
    <Popup minWidth={280} maxWidth={320}>
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
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {forms.map((f) => {
              const selected = existingStop?.formIds.includes(f.id) ?? false;
              return (
                <div
                  key={f.id}
                  className={`flex items-center gap-2 rounded px-2 py-1 cursor-pointer transition-colors ${
                    selected ? "bg-blue-50 border border-blue-200" : "hover:bg-gray-50 border border-transparent"
                  }`}
                  onClick={() => {
                    if (!isInRoute) {
                      onAddStop(location, [f.id]);
                    } else {
                      onToggleForm(location.id, f.id);
                    }
                  }}
                >
                  <div className="flex-1 min-w-0">
                    <span className="font-mono text-xs text-gray-600">{f.form_number}</span>
                    <span className="ml-1 text-xs text-gray-400">· {formTypeLabel(f)}</span>
                  </div>
                  {f.criticality_name && (
                    <Badge
                      className="text-[10px] px-1 py-0 shrink-0"
                      style={{
                        backgroundColor: f.criticality_color ?? "#6b7280",
                        color: "#fff",
                        border: "none",
                      }}
                    >
                      {f.criticality_name}
                    </Badge>
                  )}
                  {selected && <span className="text-blue-500 text-xs">✓</span>}
                </div>
              );
            })}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 pt-1 border-t">
          {!isInRoute ? (
            <>
              {forms.length > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1 text-xs h-7"
                  onClick={() => onAddStop(location)}
                >
                  <PlusCircle className="w-3 h-3 mr-1" />
                  Agregar todos ({forms.length})
                </Button>
              )}
              <Button
                size="sm"
                className="flex-1 text-xs h-7"
                onClick={() => onAddStop(location, [])}
              >
                <Plus className="w-3 h-3 mr-1" />
                {forms.length === 0 ? "Agregar parada" : "Solo parada"}
              </Button>
            </>
          ) : (
            <Button
              size="sm"
              variant="outline"
              className="flex-1 text-xs h-7"
              onClick={() => onAddAllForms(location.id)}
            >
              <PlusCircle className="w-3 h-3 mr-1" />
              Seleccionar todos
            </Button>
          )}
        </div>
      </div>
    </Popup>
  );
}
