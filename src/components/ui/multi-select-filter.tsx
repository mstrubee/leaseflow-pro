import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export interface MultiSelectFilterOption {
  value: string;
  label: string;
  colorDotClassName?: string;
}

interface MultiSelectFilterProps {
  options: MultiSelectFilterOption[];
  value: string[];
  onChange: (values: string[]) => void;
  placeholder: string;
  searchPlaceholder?: string;
  className?: string;
}

/** Desplegable con checkboxes para elegir más de un valor a la vez (empresa,
 *  clasificación, estado de avance, etc.). El trigger muestra "Todas" cuando
 *  no hay nada elegido, o la cantidad seleccionada. */
export function MultiSelectFilter({
  options,
  value,
  onChange,
  placeholder,
  searchPlaceholder = "Buscar...",
  className,
}: MultiSelectFilterProps) {
  const [open, setOpen] = useState(false);

  const toggle = (v: string) => {
    if (value.includes(v)) onChange(value.filter((x) => x !== v));
    else onChange([...value, v]);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          className={cn("justify-between font-normal", className)}
        >
          <span className="truncate">
            {value.length === 0 ? placeholder : `${placeholder} (${value.length})`}
          </span>
          <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="start">
        <Command>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>Sin resultados</CommandEmpty>
            <CommandGroup>
              {options.map((opt) => {
                const selected = value.includes(opt.value);
                return (
                  <CommandItem key={opt.value} value={opt.label} onSelect={() => toggle(opt.value)}>
                    <div
                      className={cn(
                        "mr-2 h-4 w-4 rounded border flex items-center justify-center shrink-0",
                        selected ? "bg-primary border-primary" : "border-input"
                      )}
                    >
                      {selected && <Check className="h-3 w-3 text-primary-foreground" />}
                    </div>
                    {opt.colorDotClassName && (
                      <span className={cn("w-2 h-2 rounded-full mr-1.5 shrink-0", opt.colorDotClassName)} />
                    )}
                    <span className="truncate">{opt.label}</span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
