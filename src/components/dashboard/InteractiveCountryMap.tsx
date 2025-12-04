import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { MapPin, ChevronDown, ChevronRight, Building2, Globe } from "lucide-react";
import { COUNTRY_REGIONS, Country, getRegionColor } from "@/lib/countryRegions";
import { useContractsByRegion, RegionData } from "@/hooks/useContractsByRegion";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export function InteractiveCountryMap() {
  const [selectedCountry, setSelectedCountry] = useState<Country>("Chile");
  const [selectedRegion, setSelectedRegion] = useState<RegionData | null>(null);
  const [isExpanded, setIsExpanded] = useState(true);
  const navigate = useNavigate();

  const { data: contractsData, loading } = useContractsByRegion(selectedCountry);

  const orderedRegions = useMemo(() => {
    const countryData = COUNTRY_REGIONS[selectedCountry];
    return countryData.order
      .filter(region => contractsData[region]?.count > 0)
      .map(region => contractsData[region]);
  }, [selectedCountry, contractsData]);

  const totalContracts = useMemo(() => {
    return Object.values(contractsData).reduce((sum, r) => sum + r.count, 0);
  }, [contractsData]);

  const handleRegionClick = (region: string) => {
    const regionData = contractsData[region];
    if (regionData && regionData.count > 0) {
      setSelectedRegion(regionData);
    }
  };

  const handleContractClick = (contractId: string) => {
    navigate(`/contracts/${contractId}`);
    setSelectedRegion(null);
  };

  return (
    <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
      <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-muted/30 transition-colors">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Globe className="h-5 w-5 text-primary" />
                <CardTitle className="text-lg">Mapa Interactivo de Contratos</CardTitle>
                <Badge variant="secondary">{totalContracts} locales</Badge>
              </div>
              {isExpanded ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
            </div>
          </CardHeader>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <CardContent className="space-y-6">
            {/* Country Selector */}
            <div className="flex items-center gap-4">
              <span className="text-sm font-medium text-muted-foreground">Seleccionar país:</span>
              <Select value={selectedCountry} onValueChange={(v) => setSelectedCountry(v as Country)}>
                <SelectTrigger className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Chile">🇨🇱 Chile</SelectItem>
                  <SelectItem value="Peru">🇵🇪 Perú</SelectItem>
                  <SelectItem value="Colombia">🇨🇴 Colombia</SelectItem>
                  <SelectItem value="Ecuador">🇪🇨 Ecuador</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {loading ? (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Skeleton className="h-[400px]" />
                <Skeleton className="h-[400px]" />
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Map Visualization */}
                <Card className="border-border/30">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      <MapPin className="h-4 w-4" />
                      Mapa de {selectedCountry}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <RegionMapVisualization
                      country={selectedCountry}
                      contractsData={contractsData}
                      onRegionClick={handleRegionClick}
                    />
                  </CardContent>
                </Card>

                {/* Contracts by Region List */}
                <Card className="border-border/30">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Building2 className="h-4 w-4" />
                      Contratos por Región
                      <span className="text-xs text-muted-foreground font-normal">(Norte → Sur)</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="h-[350px] pr-4">
                      {orderedRegions.length === 0 ? (
                        <p className="text-muted-foreground text-sm text-center py-8">
                          No hay contratos en {selectedCountry}
                        </p>
                      ) : (
                        <div className="space-y-2">
                          {orderedRegions.map((regionData, index) => (
                            <Button
                              key={regionData.region}
                              variant="ghost"
                              className="w-full justify-between h-auto py-3 px-4 hover:bg-muted/50"
                              onClick={() => handleRegionClick(regionData.region)}
                            >
                              <div className="flex items-center gap-3">
                                <div
                                  className="w-3 h-3 rounded-full"
                                  style={{ backgroundColor: getRegionColor(index, true) }}
                                />
                                <span className="font-medium">{regionData.region}</span>
                              </div>
                              <Badge variant="outline">{regionData.count} locales</Badge>
                            </Button>
                          ))}
                        </div>
                      )}
                    </ScrollArea>
                  </CardContent>
                </Card>
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Card>

      {/* Region Drill-down Modal */}
      <Dialog open={!!selectedRegion} onOpenChange={(open) => !open && setSelectedRegion(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5 text-primary" />
              {selectedRegion?.region}
              <Badge variant="secondary">{selectedRegion?.count} locales</Badge>
            </DialogTitle>
          </DialogHeader>
          
          {selectedRegion && (
            <ScrollArea className="h-[500px] pr-4">
              <div className="space-y-4">
                {Object.entries(selectedRegion.communes).map(([commune, contracts]) => (
                  <Card key={commune} className="border-border/30">
                    <CardHeader className="py-3">
                      <CardTitle className="text-sm flex items-center justify-between">
                        <span>{commune}</span>
                        <Badge variant="outline" className="text-xs">{contracts.length} locales</Badge>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="py-2">
                      <div className="space-y-2">
                        {contracts.map((contract) => (
                          <Button
                            key={contract.contractId}
                            variant="ghost"
                            className="w-full justify-start h-auto py-2 px-3 text-left hover:bg-primary/10"
                            onClick={() => handleContractClick(contract.contractId)}
                          >
                            <div className="flex items-start gap-3">
                              <MapPin className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                              <div>
                                <p className="font-medium text-sm">{contract.contractName}</p>
                                <p className="text-xs text-muted-foreground">
                                  {contract.street} {contract.number}
                                </p>
                              </div>
                            </div>
                          </Button>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </ScrollArea>
          )}
        </DialogContent>
      </Dialog>
    </Collapsible>
  );
}

// Region Map Visualization Component
function RegionMapVisualization({
  country,
  contractsData,
  onRegionClick
}: {
  country: Country;
  contractsData: { [region: string]: RegionData };
  onRegionClick: (region: string) => void;
}) {
  const countryData = COUNTRY_REGIONS[country];
  const isChile = country === "Chile";
  
  return (
    <div 
      className={`relative w-full ${isChile ? 'h-[200px]' : 'h-[350px]'} bg-gradient-to-br from-muted/30 to-muted/10 rounded-lg overflow-hidden`}
      style={isChile ? { transform: 'rotate(-90deg) scaleX(-1)', transformOrigin: 'center' } : {}}
    >
      <svg 
        viewBox="0 0 100 100" 
        className="w-full h-full"
        style={isChile ? { transform: 'rotate(90deg) scaleX(-1)' } : {}}
      >
        {countryData.order.map((region, index) => {
          const coordsMap = countryData.coordinates as Record<string, { x: number; y: number }>;
          const coords = coordsMap[region];
          if (!coords) return null;
          
          const regionData = contractsData[region];
          const hasContracts = regionData && regionData.count > 0;
          const color = getRegionColor(index, hasContracts);
          
          // Calculate size based on contract count (min 4, max 10)
          const baseSize = hasContracts ? Math.min(4 + regionData.count * 0.8, 10) : 3;
          
          return (
            <Tooltip key={region}>
              <TooltipTrigger asChild>
                <g
                  className={`transition-all duration-200 ${hasContracts ? 'cursor-pointer hover:opacity-80' : ''}`}
                  onClick={() => hasContracts && onRegionClick(region)}
                >
                  {/* Region circle */}
                  <circle
                    cx={coords.x}
                    cy={coords.y}
                    r={baseSize}
                    fill={color}
                    stroke={hasContracts ? "hsl(var(--primary))" : "hsl(220, 10%, 80%)"}
                    strokeWidth={hasContracts ? 0.5 : 0.2}
                    className="drop-shadow-sm"
                  />
                  {/* Contract count label */}
                  {hasContracts && (
                    <text
                      x={coords.x}
                      y={coords.y}
                      textAnchor="middle"
                      dominantBaseline="central"
                      fontSize={baseSize * 0.7}
                      fontWeight="bold"
                      fill="hsl(var(--foreground))"
                      className="pointer-events-none"
                    >
                      {regionData.count}
                    </text>
                  )}
                </g>
              </TooltipTrigger>
              <TooltipContent side="top" className="z-50">
                <div className="text-center">
                  <p className="font-medium">{region}</p>
                  <p className="text-xs text-muted-foreground">
                    {hasContracts ? `${regionData.count} locales` : 'Sin locales'}
                  </p>
                </div>
              </TooltipContent>
            </Tooltip>
          );
        })}
      </svg>
      
      {/* Country outline hint */}
      <div className="absolute bottom-2 right-2 text-xs text-muted-foreground/50">
        Click en una región para ver detalles
      </div>
    </div>
  );
}

export default InteractiveCountryMap;
