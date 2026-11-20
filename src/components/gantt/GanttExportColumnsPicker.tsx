import { Checkbox } from "@/components/ui/checkbox";
import { GANTT_EXPORT_COLUMNS, GanttExportColumnKey } from "./ganttExportColumns";

interface GanttExportColumnsPickerProps {
  excluded: Set<GanttExportColumnKey>;
  onChange: (next: Set<GanttExportColumnKey>) => void;
}

// Checklist shown inside the PDF export dialog: the checked columns are left out of the PDF.
export function GanttExportColumnsPicker({ excluded, onChange }: GanttExportColumnsPickerProps) {
  const toggle = (key: GanttExportColumnKey, checked: boolean) => {
    const next = new Set(excluded);
    if (checked) next.add(key);
    else next.delete(key);
    onChange(next);
  };

  return (
    <div className="border rounded-lg">
      <div className="p-2 border-b bg-muted/40 flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">Columnas a excluir</span>
        {excluded.size > 0 && (
          <button
            type="button"
            className="text-xs text-blue-600 hover:underline"
            onClick={() => onChange(new Set())}
          >
            Incluir todas
          </button>
        )}
      </div>
      <div className="grid grid-cols-2 gap-x-3 px-3 py-2">
        {GANTT_EXPORT_COLUMNS.map((col) => (
          <label key={col.key} className="flex items-center gap-2.5 py-1.5 cursor-pointer">
            <Checkbox
              checked={excluded.has(col.key)}
              onCheckedChange={(checked) => toggle(col.key, checked === true)}
            />
            <span className="text-sm">{col.label}</span>
          </label>
        ))}
      </div>
      <p className="px-3 pb-2 text-[11px] text-muted-foreground">
        La columna «Tarea» siempre se incluye.
      </p>
    </div>
  );
}
