import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Settings2, RotateCcw } from "lucide-react";
import { DEFAULT_COLUMN_WIDTHS, ColumnWidthsConfig } from "@/hooks/useContractColumnWidths";

interface ColumnWidthsManagerProps {
  columnWidths: ColumnWidthsConfig;
  onUpdateWidth: (columnKey: string, width: number) => void;
  onReset: () => void;
  visibleColumns: string[];
}

export function ColumnWidthsManager({
  columnWidths,
  onUpdateWidth,
  onReset,
  visibleColumns,
}: ColumnWidthsManagerProps) {
  const [open, setOpen] = useState(false);

  const handleWidthChange = (columnKey: string, values: number[]) => {
    onUpdateWidth(columnKey, values[0]);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Settings2 className="h-4 w-4" />
          Anchos de Columnas
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Configurar Anchos de Columnas</DialogTitle>
          <DialogDescription>
            Ajusta el ancho de cada columna en porcentaje. Los cambios se guardarán automáticamente.
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-6 py-4 max-h-[400px] overflow-y-auto">
          {Object.keys(DEFAULT_COLUMN_WIDTHS)
            .map((columnKey) => {
              const config = DEFAULT_COLUMN_WIDTHS[columnKey];
              const currentWidth = columnWidths?.[columnKey] ?? config.width;
              
              return (
                <div key={columnKey} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-medium">{config.label}</Label>
                    <span className="text-sm text-muted-foreground">{currentWidth}%</span>
                  </div>
                  <Slider
                    value={[currentWidth]}
                    onValueChange={(values) => handleWidthChange(columnKey, values)}
                    min={5}
                    max={30}
                    step={1}
                    className="w-full"
                  />
                </div>
              );
            })}
        </div>

        <DialogFooter className="flex justify-between sm:justify-between">
          <Button
            variant="outline"
            onClick={onReset}
            className="gap-2"
          >
            <RotateCcw className="h-4 w-4" />
            Restablecer
          </Button>
          <Button onClick={() => setOpen(false)}>
            Listo
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
