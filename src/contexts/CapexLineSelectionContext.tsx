import { createContext, useContext, useMemo, useState, ReactNode } from "react";

interface CapexLineSelectionContextValue {
  /** true mientras el usuario está seleccionando líneas CAPEX adicionales
   *  directamente en la página, para el flujo de "OC Requerida" -- el resto
   *  de la página debe volverse inerte mientras dure. */
  active: boolean;
  setActive: (value: boolean) => void;
}

const CapexLineSelectionContext = createContext<CapexLineSelectionContextValue | null>(null);

export function CapexLineSelectionProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState(false);
  const value = useMemo(() => ({ active, setActive }), [active]);
  return (
    <CapexLineSelectionContext.Provider value={value}>
      {children}
    </CapexLineSelectionContext.Provider>
  );
}

/** Fuera de un CapexLineSelectionProvider (páginas que no lo montan) se
 *  comporta como "nunca activo" -- no rompe nada, solo no hace nada. */
export function useCapexLineSelection(): CapexLineSelectionContextValue {
  const ctx = useContext(CapexLineSelectionContext);
  return ctx ?? { active: false, setActive: () => {} };
}
