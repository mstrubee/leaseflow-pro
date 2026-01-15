import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Settings2 } from "lucide-react";

export interface Column {
  key: string;
  label: string;
}

interface ColumnSelectorProps {
  availableColumns: Column[];
  selectedColumns: string[];
  onSelectionChange: (columns: string[]) => void;
  label?: string;
}

export function ColumnSelector({
  availableColumns,
  selectedColumns,
  onSelectionChange,
  label = "Columnas PDF"
}: ColumnSelectorProps) {
  const handleChange = (key: string, checked: boolean) => {
    if (checked) {
      onSelectionChange([...selectedColumns, key]);
    } else {
      onSelectionChange(selectedColumns.filter(k => k !== key));
    }
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button 
          variant="outline" 
          size="sm"
          className="gap-2"
        >
          <Settings2 className="h-4 w-4" />
          {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56" align="end">
        <div className="space-y-3">
          <h4 className="font-medium text-sm">Columnas del PDF</h4>
          <div className="space-y-2">
            {availableColumns.map((col) => (
              <div key={col.key} className="flex items-center space-x-2">
                <Checkbox
                  id={`pdf-col-${col.key}`}
                  checked={selectedColumns.includes(col.key)}
                  onCheckedChange={(checked) => handleChange(col.key, !!checked)}
                />
                <Label 
                  htmlFor={`pdf-col-${col.key}`}
                  className="text-sm cursor-pointer"
                >
                  {col.label}
                </Label>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            {selectedColumns.length} columnas seleccionadas
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );
}
