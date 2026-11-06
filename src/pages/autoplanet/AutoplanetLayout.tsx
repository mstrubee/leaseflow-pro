import { useCallback, useRef } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { Car, Briefcase } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

// Secciones del sidebar de Autoplanet Servicios. Para sumar una sección nueva basta
// con agregarla aquí y registrar su ruta en App.tsx (hija de /autoplanet).
export const AUTOPLANET_SECTIONS: { id: string; label: string; icon: LucideIcon; path: string }[] = [
  { id: "casos-de-negocio", label: "Casos de negocio", icon: Briefcase, path: "/autoplanet/casos-de-negocio" },
];

export interface AutoplanetOutletContext {
  /** Los editores informan si hay cambios sin guardar para avisar antes de salir. */
  setDirty: (dirty: boolean) => void;
}

const AutoplanetLayout = () => {
  const dirtyRef = useRef(false);
  const setDirty = useCallback((dirty: boolean) => { dirtyRef.current = dirty; }, []);

  const confirmLeave = (e: React.MouseEvent) => {
    if (dirtyRef.current && !window.confirm("Hay cambios sin guardar. ¿Salir de todos modos?")) e.preventDefault();
  };

  return (
    <div className="min-h-screen bg-background flex flex-col md:flex-row">
      {/* pt-16: deja libre el botón flotante "Inicio" de MainLayout */}
      <aside className="md:w-60 md:min-h-screen border-b md:border-b-0 md:border-r border-border bg-card/50 px-3 pt-16 pb-3 md:pb-6 shrink-0">
        <div className="flex items-center gap-2 px-2 mb-3">
          <div className="rounded-lg p-2 text-sky-600 bg-sky-100"><Car className="h-4 w-4" /></div>
          <div>
            <p className="font-semibold leading-tight">Autoplanet Servicios</p>
            <p className="text-[11px] text-muted-foreground leading-tight">Servicios automotrices B2C</p>
          </div>
        </div>
        <nav className="flex md:flex-col gap-1">
          {AUTOPLANET_SECTIONS.map((s) => (
            <NavLink
              key={s.id}
              to={s.path}
              onClick={confirmLeave}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
                  isActive ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:bg-accent hover:text-foreground",
                )
              }
            >
              <s.icon className="h-4 w-4" />
              {s.label}
            </NavLink>
          ))}
        </nav>
      </aside>

      <main className="flex-1 min-w-0 px-4 sm:px-6 lg:px-8 pt-6 md:pt-16 pb-10">
        <Outlet context={{ setDirty } satisfies AutoplanetOutletContext} />
      </main>
    </div>
  );
};

export default AutoplanetLayout;
