import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { ListFilter, Search, ChevronUp, ChevronDown, X } from "lucide-react";
import { useState, useMemo } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";

interface Contract {
  id: string;
  name: string;
}

interface ContractRowSelectorProps {
  contracts: Contract[];
  /** null = sin personalizar (todos, en el orden de la tabla). Array = orden
   *  de selección elegido a mano — ese es el orden en que se exporta. */
  selectedContractIds: string[] | null;
  onSelectionChange: (ids: string[] | null) => void;
}

export function ContractRowSelector({
  contracts,
  selectedContractIds,
  onSelectionChange,
}: ContractRowSelectorProps) {
  const [searchTerm, setSearchTerm] = useState("");

  const effectiveSelection = selectedContractIds ?? contracts.map(c => c.id);
  const orderIndex = useMemo(() => {
    const m = new Map<string, number>();
    effectiveSelection.forEach((id, i) => m.set(id, i + 1));
    return m;
  }, [effectiveSelection]);

  const filteredContracts = useMemo(() => {
    if (!searchTerm) return contracts;
    const term = searchTerm.toLowerCase();
    return contracts.filter(c => c.name.toLowerCase().includes(term));
  }, [contracts, searchTerm]);

  const handleChange = (id: string, included: boolean) => {
    const current = selectedContractIds ?? contracts.map(c => c.id);
    if (included) {
      if (current.includes(id)) return;
      // Se agrega al final: queda última en el orden de exportación.
      onSelectionChange([...current, id]);
    } else {
      onSelectionChange(current.filter(cid => cid !== id));
    }
  };

  const handleSelectAll = () => {
    onSelectionChange(null);
  };

  const handleDeselectAll = () => {
    onSelectionChange([]);
  };

  const moveSelection = (index: number, direction: -1 | 1) => {
    const current = selectedContractIds ?? contracts.map((c) => c.id);
    const target = index + direction;
    if (target < 0 || target >= current.length) return;
    const next = [...current];
    [next[index], next[target]] = [next[target], next[index]];
    onSelectionChange(next);
  };

  const removeFromSelection = (id: string) => {
    const current = selectedContractIds ?? contracts.map((c) => c.id);
    onSelectionChange(current.filter((cid) => cid !== id));
  };

  const includedCount = effectiveSelection.length;
  const hasCustomSelection = selectedContractIds !== null;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant={hasCustomSelection ? "default" : "outline"}
          size="sm"
          className="gap-2"
        >
          <ListFilter className="h-4 w-4" />
          {hasCustomSelection ? `${includedCount}/${contracts.length}` : "Filas PDF"}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72" align="end">
        <div className="space-y-3">
          <h4 className="font-medium text-sm">Contratos a incluir</h4>
          <p className="text-xs text-muted-foreground">
            💡 El orden en que los marcás es el orden en que se exportan.
          </p>

          {hasCustomSelection && effectiveSelection.length > 0 && (
            <div className="rounded border bg-muted/30 px-2 py-1.5 max-h-36 overflow-y-auto">
              <ol className="text-xs space-y-0.5">
                {effectiveSelection.map((id, i) => {
                  const contract = contracts.find((c) => c.id === id);
                  if (!contract) return null;
                  return (
                    <li key={id} className="flex items-center gap-1">
                      <span className="text-muted-foreground shrink-0 w-4 text-right">{i + 1}.</span>
                      <span className="truncate flex-1" title={contract.name}>{contract.name}</span>
                      <button
                        type="button"
                        disabled={i === 0}
                        onClick={() => moveSelection(i, -1)}
                        className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30 disabled:pointer-events-none"
                        title="Subir"
                      >
                        <ChevronUp className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        disabled={i === effectiveSelection.length - 1}
                        onClick={() => moveSelection(i, 1)}
                        className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30 disabled:pointer-events-none"
                        title="Bajar"
                      >
                        <ChevronDown className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => removeFromSelection(id)}
                        className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        title="Quitar"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </li>
                  );
                })}
              </ol>
            </div>
          )}

          <div className="relative">
            <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 h-3 w-3 text-muted-foreground" />
            <Input
              placeholder="Buscar contrato..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-7 h-8 text-sm"
            />
          </div>

          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="text-xs h-7 px-2"
              onClick={handleSelectAll}
            >
              Todos
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-xs h-7 px-2"
              onClick={handleDeselectAll}
            >
              Ninguno
            </Button>
          </div>

          <ScrollArea className="h-[200px]">
            <div className="space-y-2 pr-2">
              {filteredContracts.map((contract) => {
                const pos = orderIndex.get(contract.id);
                return (
                  <div key={contract.id} className="flex items-center space-x-2">
                    <Checkbox
                      id={`pdf-row-${contract.id}`}
                      checked={pos !== undefined}
                      onCheckedChange={(checked) => handleChange(contract.id, !!checked)}
                    />
                    <Label
                      htmlFor={`pdf-row-${contract.id}`}
                      className="text-sm cursor-pointer truncate flex-1"
                      title={contract.name}
                    >
                      {contract.name}
                    </Label>
                    {pos !== undefined && (
                      <span className="text-[10px] font-medium text-muted-foreground shrink-0 min-w-[1.25rem] text-right">
                        {pos}
                      </span>
                    )}
                  </div>
                );
              })}
              {filteredContracts.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-4">
                  No se encontraron contratos
                </p>
              )}
            </div>
          </ScrollArea>

          <p className="text-xs text-muted-foreground">
            {includedCount} de {contracts.length} contratos seleccionados
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );
}
