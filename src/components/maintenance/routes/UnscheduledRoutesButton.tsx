import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { CalendarClock, Pencil } from "lucide-react";

interface Props {
  onEdit: (routeId: string) => void;
}

interface UnscheduledRoute {
  id: string;
  name: string;
  supplier_name: string | null;
}

// Botón + cajón con las rutas guardadas SIN agendar (scheduled_date null).
export function UnscheduledRoutesButton({ onEdit }: Props) {
  const [open, setOpen] = useState(false);
  const [routes, setRoutes] = useState<UnscheduledRoute[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("maintenance_routes")
      .select("id, name, supplier_id, suppliers ( name )")
      .is("scheduled_date", null)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    // Agrupar por nombre base (las giras comparten nombre, difieren en "— Día N")
    const seen = new Set<string>();
    const list: UnscheduledRoute[] = [];
    for (const r of (data ?? []) as Record<string, unknown>[]) {
      const base = String(r.name ?? "").replace(/\s—\sDía\s.*$/u, "").trim();
      const key = `${base}|${(r.supplier_id as string) ?? ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      list.push({
        id: r.id as string,
        name: base || (r.name as string),
        supplier_name: (r.suppliers as { name: string } | null)?.name ?? null,
      });
    }
    setRoutes(list);
    setLoading(false);
  };

  const openSheet = async () => { setOpen(true); await load(); };

  return (
    <>
      <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5" onClick={openSheet}>
        <CalendarClock className="w-3.5 h-3.5" />
        Rutas Sin Agendar (guardadas)
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2 text-base">
              <CalendarClock className="w-4 h-4 text-gray-500" /> Rutas Sin Agendar (guardadas)
            </SheetTitle>
          </SheetHeader>
          <p className="text-xs text-gray-400 mt-2">
            Rutas guardadas sin fecha. Edítalas para asignarles fecha y calendarizarlas.
          </p>
          <div className="mt-4 space-y-2">
            {loading ? (
              <p className="text-sm text-gray-400 text-center py-8">Cargando…</p>
            ) : routes.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-8">No hay rutas sin agendar</p>
            ) : routes.map((r) => (
              <div key={r.id} className="rounded-lg border border-gray-200 p-2.5 flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{r.name}</div>
                  {r.supplier_name && <div className="text-xs text-gray-400 truncate">{r.supplier_name}</div>}
                </div>
                <Button size="sm" variant="ghost" className="h-7 text-xs gap-1 text-blue-600"
                  onClick={() => { onEdit(r.id); setOpen(false); }}>
                  <Pencil className="w-3.5 h-3.5" /> Editar
                </Button>
              </div>
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
