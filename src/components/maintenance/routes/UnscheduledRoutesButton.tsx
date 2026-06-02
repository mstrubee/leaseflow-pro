import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { CalendarClock, Pencil, Trash2, X, CheckSquare, Square } from "lucide-react";
import { toast } from "sonner";

interface Props {
  onEdit: (routeId: string) => void;
}

interface UnscheduledRoute {
  id: string;          // id representativo (primer día) — para editar
  ids: string[];       // todos los ids de la gira (para borrar completa)
  name: string;
  supplier_name: string | null;
}

// Botón + cajón con las rutas guardadas SIN agendar (scheduled_date null).
export function UnscheduledRoutesButton({ onEdit }: Props) {
  const [open, setOpen] = useState(false);
  const [routes, setRoutes] = useState<UnscheduledRoute[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("maintenance_routes")
      .select("id, name, supplier_id, suppliers ( name )")
      .is("scheduled_date", null)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    // Agrupar por nombre base (las giras comparten nombre, difieren en "— Día N")
    const map = new Map<string, UnscheduledRoute>();
    for (const r of (data ?? []) as Record<string, unknown>[]) {
      const base = String(r.name ?? "").replace(/\s—\sDía\s.*$/u, "").trim();
      const key = `${base}|${(r.supplier_id as string) ?? ""}`;
      const id = r.id as string;
      const existing = map.get(key);
      if (existing) {
        existing.ids.push(id);
      } else {
        map.set(key, {
          id,
          ids: [id],
          name: base || (r.name as string),
          supplier_name: (r.suppliers as { name: string } | null)?.name ?? null,
        });
      }
    }
    setRoutes([...map.values()]);
    setLoading(false);
  };

  const openSheet = async () => { setOpen(true); setSelectMode(false); setSelected(new Set()); await load(); };

  const softDelete = async (ids: string[]) => {
    const { error } = await supabase
      .from("maintenance_routes")
      .update({ deleted_at: new Date().toISOString() })
      .in("id", ids);
    if (error) { toast.error(error.message); return false; }
    return true;
  };

  const deleteOne = async (r: UnscheduledRoute) => {
    if (!window.confirm(`¿Eliminar la ruta "${r.name}"? Irá a la papelera.`)) return;
    if (await softDelete(r.ids)) {
      toast.success("Ruta eliminada");
      await load();
    }
  };

  const toggleSel = (key: string) =>
    setSelected((prev) => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });

  const allSelected = routes.length > 0 && routes.every((r) => selected.has(r.id));
  const toggleAll = () =>
    setSelected(allSelected ? new Set() : new Set(routes.map((r) => r.id)));

  const deleteSelected = async () => {
    const groups = routes.filter((r) => selected.has(r.id));
    if (groups.length === 0) return;
    if (!window.confirm(`¿Eliminar ${groups.length} ruta${groups.length === 1 ? "" : "s"} seleccionada${groups.length === 1 ? "" : "s"}? Irán a la papelera.`)) return;
    const ids = groups.flatMap((g) => g.ids);
    if (await softDelete(ids)) {
      toast.success(`${groups.length} ruta(s) eliminada(s)`);
      setSelectMode(false);
      setSelected(new Set());
      await load();
    }
  };

  return (
    <>
      <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5" onClick={openSheet}>
        <CalendarClock className="w-3.5 h-3.5" />
        Rutas Sin Agendar (guardadas)
      </Button>

      <Sheet open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setSelectMode(false); setSelected(new Set()); } }}>
        <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2 text-base">
              <CalendarClock className="w-4 h-4 text-gray-500" /> Rutas Sin Agendar (guardadas)
            </SheetTitle>
          </SheetHeader>
          <p className="text-xs text-gray-400 mt-2">
            Rutas guardadas sin fecha. Edítalas para asignarles fecha y calendarizarlas.
          </p>

          {/* Barra de acciones */}
          {routes.length > 0 && (
            <div className="flex items-center gap-2 mt-3">
              {!selectMode ? (
                <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => setSelectMode(true)}>
                  <CheckSquare className="w-3.5 h-3.5" /> Seleccionar
                </Button>
              ) : (
                <>
                  <button onClick={toggleAll} className="flex items-center gap-1.5 text-xs text-gray-600 hover:text-gray-800">
                    {allSelected ? <CheckSquare className="w-4 h-4 text-blue-600" /> : <Square className="w-4 h-4" />}
                    Seleccionar todas
                  </button>
                  {selected.size > 0 && (
                    <Button variant="destructive" size="sm" className="h-7 text-xs gap-1 ml-auto" onClick={deleteSelected}>
                      <Trash2 className="w-3.5 h-3.5" /> Borrar selección ({selected.size})
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => { setSelectMode(false); setSelected(new Set()); }}>
                    <X className="w-3.5 h-3.5" /> Cancelar
                  </Button>
                </>
              )}
            </div>
          )}

          <div className="mt-3 space-y-2">
            {loading ? (
              <p className="text-sm text-gray-400 text-center py-8">Cargando…</p>
            ) : routes.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-8">No hay rutas sin agendar</p>
            ) : routes.map((r) => (
              <div key={r.id} className="rounded-lg border border-gray-200 p-2.5 flex items-center gap-2">
                {selectMode && (
                  <button onClick={() => toggleSel(r.id)} className="shrink-0">
                    {selected.has(r.id)
                      ? <CheckSquare className="w-4 h-4 text-blue-600" />
                      : <Square className="w-4 h-4 text-gray-400" />}
                  </button>
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{r.name}</div>
                  {r.supplier_name && <div className="text-xs text-gray-400 truncate">{r.supplier_name}</div>}
                </div>
                {!selectMode && (
                  <>
                    <Button size="sm" variant="ghost" className="h-7 text-xs gap-1 text-blue-600"
                      onClick={() => { onEdit(r.id); setOpen(false); }}>
                      <Pencil className="w-3.5 h-3.5" /> Editar
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-500 hover:bg-red-50"
                      onClick={() => deleteOne(r)} title="Eliminar ruta">
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </>
                )}
              </div>
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
