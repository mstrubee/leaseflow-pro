import type { CriticalityCategory } from "@/hooks/useRouteBuilder";
import { ArrowUpDown, SlidersHorizontal, X } from "lucide-react";
import { useState } from "react";

const FORM_TYPES = ["Eléctrico", "Obra Civil", "Climatización", "Activos Fijos", "General"];

interface Props {
  sortBy: "priority" | "distance" | "forms";
  onSortBy: (v: "priority" | "distance" | "forms") => void;
  criticalities: CriticalityCategory[];
  filterTypes: Set<string>;
  onToggleType: (t: string) => void;
  filterCriticalities: Set<string>;
  onToggleCriticality: (c: string) => void;
  onClear: () => void;
}

export function ListFilters({
  sortBy, onSortBy, criticalities,
  filterTypes, onToggleType,
  filterCriticalities, onToggleCriticality, onClear,
}: Props) {
  const [open, setOpen] = useState(false);
  const activeCount = filterTypes.size + filterCriticalities.size;

  return (
    <div className="space-y-1.5">
      {/* Sort + toggle filtros */}
      <div className="flex items-center gap-1.5">
        <ArrowUpDown className="w-3 h-3 text-gray-400 shrink-0" />
        <select
          value={sortBy}
          onChange={(e) => onSortBy(e.target.value as Props["sortBy"])}
          className="h-7 text-xs rounded border border-gray-200 px-1.5 bg-white focus:outline-none focus:border-blue-400 flex-1"
        >
          <option value="priority">Prioridad</option>
          <option value="distance">Distancia</option>
          <option value="forms">Nº de forms</option>
        </select>
        <button
          onClick={() => setOpen((o) => !o)}
          className={`h-7 px-2 rounded border text-xs flex items-center gap-1 transition-colors
            ${activeCount > 0 ? "border-blue-300 bg-blue-50 text-blue-700" : "border-gray-200 text-gray-500 hover:bg-gray-50"}`}
        >
          <SlidersHorizontal className="w-3 h-3" />
          {activeCount > 0 ? activeCount : "Filtros"}
        </button>
      </div>

      {/* Panel de filtros */}
      {open && (
        <div className="rounded-lg border border-gray-200 bg-gray-50/60 p-2 space-y-2">
          <div>
            <p className="text-[10px] font-semibold text-gray-500 uppercase mb-1">Tipo de form</p>
            <div className="flex flex-wrap gap-1">
              {FORM_TYPES.map((t) => {
                const active = filterTypes.has(t);
                return (
                  <button key={t} onClick={() => onToggleType(t)}
                    className={`text-[10px] px-1.5 py-0.5 rounded-full border transition-colors
                      ${active ? "bg-blue-500 text-white border-blue-500" : "bg-white text-gray-600 border-gray-200 hover:border-blue-300"}`}>
                    {t}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <p className="text-[10px] font-semibold text-gray-500 uppercase mb-1">Criticidad</p>
            <div className="flex flex-wrap gap-1">
              {criticalities.map((c) => {
                const active = filterCriticalities.has(c.name);
                return (
                  <button key={c.id} onClick={() => onToggleCriticality(c.name)}
                    className="text-[10px] px-1.5 py-0.5 rounded-full border transition-all"
                    style={active
                      ? { background: c.color ?? "#3b82f6", color: "#fff", borderColor: c.color ?? "#3b82f6" }
                      : { background: "#fff", color: "#4b5563", borderColor: "#e5e7eb" }}>
                    {c.name}
                  </button>
                );
              })}
            </div>
          </div>

          {activeCount > 0 && (
            <button onClick={onClear}
              className="flex items-center gap-1 text-[10px] text-red-500 hover:text-red-700">
              <X className="w-3 h-3" /> Limpiar filtros ({activeCount})
            </button>
          )}
        </div>
      )}
    </div>
  );
}
