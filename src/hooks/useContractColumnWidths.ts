import { useUserPreferences } from "./useUserPreferences";
import type { CSSProperties } from "react";

export interface ColumnWidth {
  key: string;
  label: string;
  width: number; // percentage
  minWidth?: number;
}

// Default column widths for contracts table
export const DEFAULT_COLUMN_WIDTHS: Record<string, ColumnWidth> = {
  name: { key: "name", label: "Contrato", width: 15, minWidth: 120 },
  ubicacion: { key: "ubicacion", label: "Ubicación", width: 12, minWidth: 100 },
  categoria: { key: "categoria", label: "Categoría", width: 10, minWidth: 90 },
  clasificacion: { key: "clasificacion", label: "Clasificación", width: 8, minWidth: 80 },
  origen: { key: "origen", label: "Origen", width: 8, minWidth: 80 },
  venta_estimada: { key: "venta_estimada", label: "Venta Est.", width: 10, minWidth: 126 },
  costo_arriendo: { key: "costo_arriendo", label: "Costo Arriendo", width: 12, minWidth: 140 },
  duracion: { key: "duracion", label: "Duración", width: 8, minWidth: 80 },
  termino: { key: "termino", label: "Término", width: 8, minWidth: 80 },
  aviso: { key: "aviso", label: "Aviso", width: 8, minWidth: 80 },
  estado: { key: "estado", label: "Estado", width: 10, minWidth: 100 },
};

export type ColumnWidthsConfig = Record<string, number>;

const PREFERENCE_KEY = "contracts_column_widths";

const getDefaultWidths = (): ColumnWidthsConfig =>
  Object.fromEntries(Object.entries(DEFAULT_COLUMN_WIDTHS).map(([key, config]) => [key, config.width]));

export function useContractColumnWidths() {
  const {
    value: columnWidthsRaw,
    setValue: setColumnWidths,
    loading,
  } = useUserPreferences<ColumnWidthsConfig>({
    preferenceKey: PREFERENCE_KEY,
    defaultValue: getDefaultWidths(),
    localStorageKey: PREFERENCE_KEY,
  });

  const columnWidths: ColumnWidthsConfig =
    columnWidthsRaw && typeof columnWidthsRaw === "object" ? columnWidthsRaw : getDefaultWidths();

  const updateColumnWidth = (columnKey: string, width: number) => {
    setColumnWidths({ ...columnWidths, [columnKey]: width });
  };

  const resetToDefaults = () => {
    setColumnWidths(getDefaultWidths());
  };

  const getColumnStyle = (columnKey: string): CSSProperties => {
    const fallbackWidth = DEFAULT_COLUMN_WIDTHS[columnKey]?.width ?? 10;
    const width = columnWidths?.[columnKey] ?? fallbackWidth;
    const minWidth = DEFAULT_COLUMN_WIDTHS[columnKey]?.minWidth ?? 80;

    return {
      width: `${width}%`,
      minWidth: `${minWidth}px`,
    };
  };

  return {
    columnWidths,
    setColumnWidths,
    updateColumnWidth,
    resetToDefaults,
    getColumnStyle,
    loading,
  };
}

