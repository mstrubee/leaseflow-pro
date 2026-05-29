import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface Supplier { id: string; name: string; }

interface Props {
  value: string | null;
  onChange: (supplierId: string | null) => void;
}

/**
 * Combobox de proveedores con búsqueda escribible. Carga la lista de
 * `suppliers` (sin filtrar por columnas inexistentes) y permite limpiar.
 */
export function SupplierCombobox({ value, onChange }: Props) {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from("suppliers")
      .select("id,name")
      .order("name")
      .then(({ data }) => {
        if (data) setSuppliers(data as Supplier[]);
        setLoading(false);
      });
  }, []);

  const selected = suppliers.find((s) => s.id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full h-8 text-xs justify-between font-normal mt-1"
        >
          <span className={cn("truncate", !selected && "text-muted-foreground")}>
            {selected ? selected.name : loading ? "Cargando…" : "Sin asignar"}
          </span>
          <ChevronsUpDown className="h-3.5 w-3.5 opacity-50 shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0 z-[1200]" align="start">
        <Command>
          <CommandInput placeholder="Buscar proveedor…" className="h-8 text-xs" />
          <CommandList>
            <CommandEmpty className="py-3 text-xs text-center text-muted-foreground">
              {loading ? "Cargando…" : "Sin proveedores"}
            </CommandEmpty>
            <CommandGroup>
              <CommandItem
                value="__none__"
                onSelect={() => { onChange(null); setOpen(false); }}
                className="text-xs"
              >
                <Check className={cn("mr-2 h-3.5 w-3.5", !value ? "opacity-100" : "opacity-0")} />
                Sin asignar
              </CommandItem>
              {suppliers.map((s) => (
                <CommandItem
                  key={s.id}
                  value={s.name}
                  onSelect={() => { onChange(s.id); setOpen(false); }}
                  className="text-xs"
                >
                  <Check className={cn("mr-2 h-3.5 w-3.5", value === s.id ? "opacity-100" : "opacity-0")} />
                  {s.name}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
