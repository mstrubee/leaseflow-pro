import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { ComposableMap, Geographies, Geography, ZoomableGroup } from "react-simple-maps";
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
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";

// GeoJSON URLs for each country (Natural Earth data via GitHub)
const GEOJSON_URLS: Record<Country, string> = {
  Chile: "https://raw.githubusercontent.com/fcortes/Chile-GeoJSON/master/Regional.geojson",
  Peru: "https://raw.githubusercontent.com/juaneladio/peru-geojson/master/peru_departamental_simple.geojson",
  Colombia: "https://gist.githubusercontent.com/john-guerra/43c7656821069d00dcbc/raw/be6a6e239cd5b5b803c6e7c2ec405b793a9f5fd0/colombia.geo.json",
  Ecuador: "https://raw.githubusercontent.com/jpmarindiaz/geo-collection/master/countries/ecuador/ecuador-provinces.geojson"
};

// Map projection settings for each country
const MAP_CONFIG: Record<Country, { center: [number, number]; scale: number; rotate?: [number, number, number] }> = {
  Chile: { center: [-70.6, -35], scale: 800, rotate: [70, 35, -90] }, // Rotated horizontal
  Peru: { center: [-76, -9.5], scale: 1200 },
  Colombia: { center: [-74, 4.5], scale: 1400 },
  Ecuador: { center: [-78.5, -1.5], scale: 4000 }
};

// Region name mappings (GeoJSON property names may differ)
const REGION_MAPPINGS: Record<Country, Record<string, string>> = {
  Chile: {
    "Región de Arica y Parinacota": "Arica y Parinacota",
    "Región de Tarapacá": "Tarapacá",
    "Región de Antofagasta": "Antofagasta",
    "Región de Atacama": "Atacama",
    "Región de Coquimbo": "Coquimbo",
    "Región de Valparaíso": "Valparaíso",
    "Región Metropolitana de Santiago": "Metropolitana de Santiago",
    "Región del Libertador General Bernardo O'Higgins": "O'Higgins",
    "Región del Maule": "Maule",
    "Región de Ñuble": "Ñuble",
    "Región del Biobío": "Biobío",
    "Región de La Araucanía": "La Araucanía",
    "Región de Los Ríos": "Los Ríos",
    "Región de Los Lagos": "Los Lagos",
    "Región de Aysén del General Carlos Ibáñez del Campo": "Aysén",
    "Región de Magallanes y de la Antártica Chilena": "Magallanes y Antártica Chilena"
  },
  Peru: {},
  Colombia: {},
  Ecuador: {}
};

export function InteractiveCountryMap() {
  const [selectedCountry, setSelectedCountry] = useState<Country>("Chile");
  const [selectedRegion, setSelectedRegion] = useState<RegionData | null>(null);
  const [hoveredRegion, setHoveredRegion] = useState<string | null>(null);
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

  const normalizeRegionName = (geoName: string): string => {
    const mappings = REGION_MAPPINGS[selectedCountry];
    return mappings[geoName] || geoName;
  };

  const getRegionFillColor = (geoName: string): string => {
    const normalizedName = normalizeRegionName(geoName);
    const regionData = contractsData[normalizedName];
    const hasContracts = regionData && regionData.count > 0;
    
    if (!hasContracts) return "hsl(220, 10%, 90%)"; // Neutral gray
    
    const countryOrder = COUNTRY_REGIONS[selectedCountry].order as readonly string[];
    const index = countryOrder.indexOf(normalizedName);
    return getRegionColor(index >= 0 ? index : 0, true);
  };

  const mapConfig = MAP_CONFIG[selectedCountry];
  const isChile = selectedCountry === "Chile";

  return (
    <TooltipProvider>
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
                  {/* Political Map */}
                  <Card className="border-border/30">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base flex items-center gap-2">
                        <MapPin className="h-4 w-4" />
                        Mapa de {selectedCountry}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-2">
                      <div 
                        className={`relative bg-gradient-to-br from-sky-50 to-blue-100 dark:from-slate-800 dark:to-slate-900 rounded-lg overflow-hidden ${isChile ? 'h-[250px]' : 'h-[400px]'}`}
                      >
                        <ComposableMap
                          projection="geoMercator"
                          projectionConfig={{
                            center: mapConfig.center,
                            scale: mapConfig.scale,
                            rotate: mapConfig.rotate || [0, 0, 0]
                          }}
                          style={{ width: "100%", height: "100%" }}
                        >
                          <ZoomableGroup>
                            <Geographies geography={GEOJSON_URLS[selectedCountry]}>
                              {({ geographies }) =>
                                geographies.map((geo) => {
                                  const geoName = geo.properties.Region || geo.properties.NOMBDEP || geo.properties.NOMBRE_DPT || geo.properties.DPA_DESPRO || geo.properties.name || "";
                                  const normalizedName = normalizeRegionName(geoName);
                                  const regionData = contractsData[normalizedName];
                                  const hasContracts = regionData && regionData.count > 0;
                                  const isHovered = hoveredRegion === normalizedName;

                                  return (
                                    <Geography
                                      key={geo.rsmKey}
                                      geography={geo}
                                      onMouseEnter={() => setHoveredRegion(normalizedName)}
                                      onMouseLeave={() => setHoveredRegion(null)}
                                      onClick={() => handleRegionClick(normalizedName)}
                                      style={{
                                        default: {
                                          fill: getRegionFillColor(geoName),
                                          stroke: "hsl(220, 20%, 70%)",
                                          strokeWidth: 0.5,
                                          outline: "none",
                                          cursor: hasContracts ? "pointer" : "default"
                                        },
                                        hover: {
                                          fill: hasContracts ? "hsl(var(--primary))" : getRegionFillColor(geoName),
                                          stroke: "hsl(220, 20%, 50%)",
                                          strokeWidth: hasContracts ? 1.5 : 0.5,
                                          outline: "none",
                                          cursor: hasContracts ? "pointer" : "default"
                                        },
                                        pressed: {
                                          fill: "hsl(var(--primary))",
                                          outline: "none"
                                        }
                                      }}
                                    />
                                  );
                                })
                              }
                            </Geographies>
                          </ZoomableGroup>
                        </ComposableMap>

                        {/* Hover tooltip */}
                        {hoveredRegion && (
                          <div className="absolute top-2 left-2 bg-background/95 backdrop-blur-sm border border-border rounded-md px-3 py-2 shadow-lg z-10">
                            <p className="font-medium text-sm">{hoveredRegion}</p>
                            <p className="text-xs text-muted-foreground">
                              {contractsData[hoveredRegion]?.count || 0} locales
                            </p>
                          </div>
                        )}

                        {/* Legend */}
                        <div className="absolute bottom-2 right-2 bg-background/80 backdrop-blur-sm border border-border rounded-md px-2 py-1 text-xs">
                          <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: getRegionColor(0, true) }}></div>
                            <span>Con locales</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-sm bg-slate-200"></div>
                            <span>Sin locales</span>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Contracts by Region List (North to South) */}
                  <Card className="border-border/30">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base flex items-center gap-2">
                        <Building2 className="h-4 w-4" />
                        Contratos por región
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
    </TooltipProvider>
  );
}

export default InteractiveCountryMap;
