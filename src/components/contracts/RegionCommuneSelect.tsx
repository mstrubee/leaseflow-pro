import { useMemo, useState } from "react";
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
import { CHILE_DEMOGRAPHICS, getRegionByCommune } from "@/data/chileRegionsData";
import { Label } from "@/components/ui/label";

interface RegionCommuneSelectProps {
  region: string;
  commune: string;
  onRegionChange: (region: string) => void;
  onCommuneChange: (commune: string) => void;
  regionLabel?: string;
  communeLabel?: string;
  regionRequired?: boolean;
  communeRequired?: boolean;
  className?: string;
}

export const RegionCommuneSelect = ({
  region,
  commune,
  onRegionChange,
  onCommuneChange,
  regionLabel = "Región",
  communeLabel = "Comuna",
  regionRequired = false,
  communeRequired = false,
  className,
}: RegionCommuneSelectProps) => {
  const [regionOpen, setRegionOpen] = useState(false);
  const [communeOpen, setCommuneOpen] = useState(false);

  // Get all regions sorted
  const availableRegions = useMemo(() => {
    return Object.keys(CHILE_DEMOGRAPHICS).sort();
  }, []);

  // Get communes for selected region
  const availableCommunes = useMemo(() => {
    if (!region || !CHILE_DEMOGRAPHICS[region]) return [];
    return CHILE_DEMOGRAPHICS[region].communes.map((c) => c.name).sort();
  }, [region]);

  const handleRegionSelect = (selectedRegion: string) => {
    onRegionChange(selectedRegion);
    // Reset commune when region changes
    if (selectedRegion !== region) {
      onCommuneChange("");
    }
    setRegionOpen(false);
  };

  const handleCommuneSelect = (selectedCommune: string) => {
    onCommuneChange(selectedCommune);
    
    // Auto-select region if commune is selected and region is empty
    if (!region) {
      const detectedRegion = getRegionByCommune(selectedCommune);
      if (detectedRegion) {
        onRegionChange(detectedRegion);
      }
    }
    setCommuneOpen(false);
  };

  // Get all communes for search when no region selected
  const allCommunes = useMemo(() => {
    const communes: { name: string; region: string }[] = [];
    for (const [regionName, regionData] of Object.entries(CHILE_DEMOGRAPHICS)) {
      for (const communeData of regionData.communes) {
        communes.push({ name: communeData.name, region: regionName });
      }
    }
    return communes.sort((a, b) => a.name.localeCompare(b.name));
  }, []);

  return (
    <div className={cn("grid grid-cols-1 md:grid-cols-2 gap-4", className)}>
      {/* Region Select */}
      <div className="space-y-2">
        <Label>{regionLabel}{regionRequired && " *"}</Label>
        <Popover open={regionOpen} onOpenChange={setRegionOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              aria-expanded={regionOpen}
              className="w-full justify-between font-normal"
            >
              {region || "Seleccionar región..."}
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
            <Command>
              <CommandInput placeholder="Buscar región..." />
              <CommandList>
                <CommandEmpty>No se encontró la región.</CommandEmpty>
                <CommandGroup>
                  {availableRegions.map((r) => (
                    <CommandItem
                      key={r}
                      value={r}
                      onSelect={() => handleRegionSelect(r)}
                    >
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4",
                          region === r ? "opacity-100" : "opacity-0"
                        )}
                      />
                      {r}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>

      {/* Commune Select */}
      <div className="space-y-2">
        <Label>{communeLabel}{communeRequired && " *"}</Label>
        <Popover open={communeOpen} onOpenChange={setCommuneOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              aria-expanded={communeOpen}
              className="w-full justify-between font-normal"
            >
              {commune || (region ? "Seleccionar comuna..." : "Seleccione región primero")}
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
            <Command>
              <CommandInput placeholder="Buscar comuna..." />
              <CommandList>
                <CommandEmpty>No se encontró la comuna.</CommandEmpty>
                <CommandGroup>
                  {region ? (
                    // Show communes for selected region
                    availableCommunes.map((c) => (
                      <CommandItem
                        key={c}
                        value={c}
                        onSelect={() => handleCommuneSelect(c)}
                      >
                        <Check
                          className={cn(
                            "mr-2 h-4 w-4",
                            commune === c ? "opacity-100" : "opacity-0"
                          )}
                        />
                        {c}
                      </CommandItem>
                    ))
                  ) : (
                    // Show all communes grouped by region when no region selected
                    allCommunes.map((c) => (
                      <CommandItem
                        key={`${c.region}-${c.name}`}
                        value={`${c.name} ${c.region}`}
                        onSelect={() => handleCommuneSelect(c.name)}
                      >
                        <Check
                          className={cn(
                            "mr-2 h-4 w-4",
                            commune === c.name ? "opacity-100" : "opacity-0"
                          )}
                        />
                        <span>{c.name}</span>
                        <span className="ml-2 text-xs text-muted-foreground">
                          ({c.region})
                        </span>
                      </CommandItem>
                    ))
                  )}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
};
