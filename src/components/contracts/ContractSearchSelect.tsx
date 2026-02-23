import * as React from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { CompanyLogo } from "./CompanyLogo";

export interface ContractOption {
  id: string;
  name: string;
  cebe?: string | null;
  company_names?: string[];
}

interface ContractSearchSelectProps {
  value: string;
  onValueChange: (value: string) => void;
  contracts: ContractOption[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  triggerClassName?: string;
  /** Show "Todos" option at the top */
  showAllOption?: boolean;
  allOptionLabel?: string;
  allOptionValue?: string;
}

export function ContractSearchSelect({
  value,
  onValueChange,
  contracts,
  placeholder = "Seleccionar contrato...",
  disabled = false,
  className,
  triggerClassName,
  showAllOption = false,
  allOptionLabel = "Todos los contratos",
  allOptionValue = "todos",
}: ContractSearchSelectProps) {
  const [open, setOpen] = React.useState(false);

  const selectedContract = contracts.find((c) => c.id === value);
  const isAllSelected = showAllOption && value === allOptionValue;

  const renderContractItem = (contract: ContractOption) => (
    <span className="flex items-center gap-2 min-w-0">
      <CompanyLogo companyNames={contract.company_names} size="sm" />
      <span className="truncate">{contract.name}</span>
      {contract.cebe && (
        <span className="text-xs text-muted-foreground flex-shrink-0">({contract.cebe})</span>
      )}
    </span>
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            "w-full justify-between font-normal",
            !value && "text-muted-foreground",
            triggerClassName,
          )}
        >
          <span className="truncate">
            {isAllSelected ? allOptionLabel : selectedContract ? renderContractItem(selectedContract) : placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className={cn("p-0", className)} align="start">
        <Command>
          <CommandInput placeholder="Buscar contrato..." />
          <CommandList>
            <CommandEmpty>Sin resultados.</CommandEmpty>
            <CommandGroup>
              {showAllOption && (
                <CommandItem
                  value={allOptionLabel}
                  onSelect={() => {
                    onValueChange(allOptionValue);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4 flex-shrink-0",
                      value === allOptionValue ? "opacity-100" : "opacity-0",
                    )}
                  />
                  {allOptionLabel}
                </CommandItem>
              )}
              {contracts.map((contract) => (
                <CommandItem
                  key={contract.id}
                  value={`${contract.name} ${contract.cebe || ""}`}
                  onSelect={() => {
                    onValueChange(contract.id);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4 flex-shrink-0",
                      value === contract.id ? "opacity-100" : "opacity-0",
                    )}
                  />
                  {renderContractItem(contract)}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
