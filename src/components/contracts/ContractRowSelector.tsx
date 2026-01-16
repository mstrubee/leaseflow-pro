import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { ListFilter, Search } from "lucide-react";
import { useState, useMemo } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";

interface Contract {
  id: string;
  name: string;
}

interface ContractRowSelectorProps {
  contracts: Contract[];
  excludedContractIds: string[];
  onExclusionChange: (excludedIds: string[]) => void;
}

export function ContractRowSelector({
  contracts,
  excludedContractIds,
  onExclusionChange,
}: ContractRowSelectorProps) {
  const [searchTerm, setSearchTerm] = useState("");

  const filteredContracts = useMemo(() => {
    if (!searchTerm) return contracts;
    const term = searchTerm.toLowerCase();
    return contracts.filter(c => c.name.toLowerCase().includes(term));
  }, [contracts, searchTerm]);

  const handleChange = (id: string, included: boolean) => {
    if (included) {
      // Remove from excluded
      onExclusionChange(excludedContractIds.filter(eid => eid !== id));
    } else {
      // Add to excluded
      onExclusionChange([...excludedContractIds, id]);
    }
  };

  const handleSelectAll = () => {
    onExclusionChange([]);
  };

  const handleDeselectAll = () => {
    onExclusionChange(contracts.map(c => c.id));
  };

  const includedCount = contracts.length - excludedContractIds.length;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button 
          variant="outline" 
          size="sm"
          className="gap-2"
        >
          <ListFilter className="h-4 w-4" />
          Filas PDF
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72" align="end">
        <div className="space-y-3">
          <h4 className="font-medium text-sm">Contratos a incluir</h4>
          
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
              {filteredContracts.map((contract) => (
                <div key={contract.id} className="flex items-center space-x-2">
                  <Checkbox
                    id={`pdf-row-${contract.id}`}
                    checked={!excludedContractIds.includes(contract.id)}
                    onCheckedChange={(checked) => handleChange(contract.id, !!checked)}
                  />
                  <Label 
                    htmlFor={`pdf-row-${contract.id}`}
                    className="text-sm cursor-pointer truncate flex-1"
                    title={contract.name}
                  >
                    {contract.name}
                  </Label>
                </div>
              ))}
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
