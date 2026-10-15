// Columns of the Gantt PDF export that the user can leave out from the export dialog.
// The task name column ("Tarea") is always included.
export type GanttExportColumnKey =
  | "responsible"
  | "start"
  | "duration"
  | "end"
  | "status"
  | "progress";

export interface GanttExportColumnOption {
  key: GanttExportColumnKey;
  label: string;
  // Only rendered in the "Detalle de Tareas" page of the PDF (not next to the Gantt bars).
  detailOnly?: boolean;
}

export const GANTT_EXPORT_COLUMNS: GanttExportColumnOption[] = [
  { key: "responsible", label: "Responsable" },
  { key: "start", label: "Inicio" },
  { key: "duration", label: "Plazo" },
  { key: "end", label: "Término" },
  { key: "status", label: "Estado", detailOnly: true },
  { key: "progress", label: "Progreso", detailOnly: true },
];
