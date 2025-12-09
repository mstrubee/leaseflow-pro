import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { ComposableMap, Geographies, Geography } from "react-simple-maps";
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
import { TooltipProvider } from "@/components/ui/tooltip";

// GeoJSON URLs for each country - Using updated Chile GeoJSON with all 16 regions
const GEOJSON_URLS: Record<Country, string> = {
  Chile: "https://raw.githubusercontent.com/pachamaltese/chilemapas/master/data-raw/regiones.geojson",
  Peru: "https://raw.githubusercontent.com/juaneladio/peru-geojson/master/peru_departamental_simple.geojson",
  Colombia: "https://gist.githubusercontent.com/john-guerra/43c7656821069d00dcbc/raw/be6a6e239cd5b5b803c6e7c2ec405b793a9f5fd0/colombia.geo.json",
  Ecuador: "https://raw.githubusercontent.com/jpmarindiaz/geo-collection/master/countries/ecuador/ecuador-provinces.geojson"
};

// Map projection settings - Chile vertical showing all regions from Arica to Magallanes
const MAP_CONFIG: Record<Country, { center: [number, number]; scale: number; width: number; height: number }> = {
  Chile: { center: [-70.5, -37], scale: 450, width: 200, height: 700 },
  Peru: { center: [-76, -9.5], scale: 1000, width: 400, height: 450 },
  Colombia: { center: [-74, 4.5], scale: 1200, width: 400, height: 450 },
  Ecuador: { center: [-78.5, -1.5], scale: 3500, width: 400, height: 400 }
};

// Chilean regions with official names and Roman numerals (North to South)
const CHILE_REGIONS_FULL: Record<string, { fullName: string; numeral: string }> = {
  "Arica y Parinacota": { fullName: "Región de Arica y Parinacota", numeral: "XV" },
  "Tarapacá": { fullName: "Región de Tarapacá", numeral: "I" },
  "Antofagasta": { fullName: "Región de Antofagasta", numeral: "II" },
  "Atacama": { fullName: "Región de Atacama", numeral: "III" },
  "Coquimbo": { fullName: "Región de Coquimbo", numeral: "IV" },
  "Valparaíso": { fullName: "Región de Valparaíso", numeral: "V" },
  "Metropolitana de Santiago": { fullName: "Región Metropolitana de Santiago", numeral: "RM" },
  "O'Higgins": { fullName: "Región del Libertador General Bernardo O'Higgins", numeral: "VI" },
  "Maule": { fullName: "Región del Maule", numeral: "VII" },
  "Ñuble": { fullName: "Región de Ñuble", numeral: "XVI" },
  "Biobío": { fullName: "Región del Biobío", numeral: "VIII" },
  "La Araucanía": { fullName: "Región de La Araucanía", numeral: "IX" },
  "Los Ríos": { fullName: "Región de Los Ríos", numeral: "XIV" },
  "Los Lagos": { fullName: "Región de Los Lagos", numeral: "X" },
  "Aysén": { fullName: "Región de Aysén del General Carlos Ibáñez del Campo", numeral: "XI" },
  "Magallanes y Antártica Chilena": { fullName: "Región de Magallanes y de la Antártica Chilena", numeral: "XII" }
};

// Region name mappings from GeoJSON to our internal names (supporting multiple GeoJSON formats)
const REGION_MAPPINGS: Record<Country, Record<string, string>> = {
  Chile: {
    // Full names from fcortes GeoJSON
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
    "Región de Magallanes y de la Antártica Chilena": "Magallanes y Antártica Chilena",
    // Short names from pachamaltese GeoJSON
    "Arica y Parinacota": "Arica y Parinacota",
    "Tarapacá": "Tarapacá",
    "Antofagasta": "Antofagasta",
    "Atacama": "Atacama",
    "Coquimbo": "Coquimbo",
    "Valparaíso": "Valparaíso",
    "Metropolitana": "Metropolitana de Santiago",
    "Región Metropolitana": "Metropolitana de Santiago",
    "O'Higgins": "O'Higgins",
    "Maule": "Maule",
    "Ñuble": "Ñuble",
    "Biobío": "Biobío",
    "La Araucanía": "La Araucanía",
    "Los Ríos": "Los Ríos",
    "Los Lagos": "Los Lagos",
    "Aysén": "Aysén",
    "Aysén del General Carlos Ibáñez del Campo": "Aysén",
    "Magallanes": "Magallanes y Antártica Chilena",
    "Magallanes y la Antártica Chilena": "Magallanes y Antártica Chilena",
    "Magallanes y Antártica Chilena": "Magallanes y Antártica Chilena"
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
    
    if (!hasContracts) return "hsl(220, 10%, 88%)";
    
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
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  <Skeleton className="h-[500px] lg:col-span-2" />
                  <Skeleton className="h-[500px]" />
                </div>
              ) : (
                <div className={`grid gap-6 ${isChile ? 'grid-cols-1 lg:grid-cols-3' : 'grid-cols-1 lg:grid-cols-2'}`}>
                  {/* Political Map */}
                  <Card className={`border-border/30 ${isChile ? 'lg:col-span-2' : ''}`}>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base flex items-center gap-2">
                        <MapPin className="h-4 w-4" />
                        Mapa de {selectedCountry}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-2">
                      <div 
                        className="relative bg-gradient-to-br from-sky-50 to-blue-100 dark:from-slate-800 dark:to-slate-900 rounded-lg overflow-hidden flex justify-center"
                        style={{ minHeight: isChile ? '700px' : '450px' }}
                      >
                        <ComposableMap
                          projection="geoMercator"
                          projectionConfig={{
                            center: mapConfig.center,
                            scale: mapConfig.scale
                          }}
                          width={mapConfig.width}
                          height={mapConfig.height}
                          style={{ width: "auto", height: "100%", maxWidth: "100%" }}
                        >
                          <Geographies geography={GEOJSON_URLS[selectedCountry]}>
                            {({ geographies }) =>
                              geographies.map((geo) => {
                                const geoName = geo.properties.Region || geo.properties.region_name || geo.properties.NOM_REG || geo.properties.NOMBDEP || geo.properties.NOMBRE_DPT || geo.properties.DPA_DESPRO || geo.properties.name || geo.properties.NAME || "";
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
                                        fill: isHovered ? "hsl(var(--primary))" : getRegionFillColor(geoName),
                                        stroke: "hsl(220, 20%, 60%)",
                                        strokeWidth: 0.5,
                                        outline: "none",
                                        cursor: hasContracts ? "pointer" : "default",
                                        transition: "fill 0.2s ease"
                                      },
                                      hover: {
                                        fill: hasContracts ? "hsl(var(--primary))" : getRegionFillColor(geoName),
                                        stroke: "hsl(220, 20%, 40%)",
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
                        </ComposableMap>

                        {/* Hover tooltip */}
                        {hoveredRegion && (
                          <div className="absolute top-3 left-3 bg-background/95 backdrop-blur-sm border border-border rounded-lg px-4 py-2 shadow-lg z-10">
                            <p className="font-semibold text-sm">
                              {isChile && CHILE_REGIONS_FULL[hoveredRegion] 
                                ? `${CHILE_REGIONS_FULL[hoveredRegion].fullName} (${CHILE_REGIONS_FULL[hoveredRegion].numeral})`
                                : hoveredRegion
                              }
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {contractsData[hoveredRegion]?.count || 0} locales
                            </p>
                          </div>
                        )}

                        {/* Legend */}
                        <div className="absolute bottom-3 right-3 bg-background/90 backdrop-blur-sm border border-border rounded-lg px-3 py-2 text-xs space-y-1">
                          <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: getRegionColor(0, true) }}></div>
                            <span>Con locales</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: "hsl(220, 10%, 88%)" }}></div>
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
                      <ScrollArea className={`pr-4 ${isChile ? 'h-[620px]' : 'h-[370px]'}`}>
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
                                    className="w-3 h-3 rounded-full flex-shrink-0"
                                    style={{ backgroundColor: getRegionColor(index, true) }}
                                  />
                                  <span className="font-medium text-left text-sm">
                                    {isChile && CHILE_REGIONS_FULL[regionData.region]
                                      ? `${regionData.region} (${CHILE_REGIONS_FULL[regionData.region].numeral})`
                                      : regionData.region
                                    }
                                  </span>
                                </div>
                                <Badge variant="outline" className="flex-shrink-0">{regionData.count}</Badge>
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
