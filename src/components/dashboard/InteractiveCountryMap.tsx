import { useState, useMemo } from "react";
import { ComposableMap, Geographies, Geography } from "react-simple-maps";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { MapPin, ChevronDown, ChevronRight, Building2, Globe } from "lucide-react";
import { COUNTRY_REGIONS, Country, getRegionColor } from "@/lib/countryRegions";
import { useContractsByRegion, RegionData } from "@/hooks/useContractsByRegion";
import { Skeleton } from "@/components/ui/skeleton";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ChileRegionsMap, CHILE_REGIONS } from "@/components/dashboard/ChileRegionsMap";
import { RegionDetailModal } from "@/components/dashboard/RegionDetailModal";

// GeoJSON URLs for other countries (Chile uses custom SVG)
const GEOJSON_URLS: Record<Exclude<Country, "Chile">, string> = {
  Peru: "https://raw.githubusercontent.com/juaneladio/peru-geojson/master/peru_departamental_simple.geojson",
  Colombia: "https://gist.githubusercontent.com/john-guerra/43c7656821069d00dcbc/raw/be6a6e239cd5b5b803c6e7c2ec405b793a9f5fd0/colombia.geo.json",
  Ecuador: "https://raw.githubusercontent.com/jpmarindiaz/geo-collection/master/countries/ecuador/ecuador-provinces.geojson"
};

// Map projection settings for other countries
const MAP_CONFIG: Record<Exclude<Country, "Chile">, { center: [number, number]; scale: number; width: number; height: number }> = {
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

// Region name mappings from GeoJSON (for non-Chile countries)
const REGION_MAPPINGS: Record<Exclude<Country, "Chile">, Record<string, string>> = {
  Peru: {},
  Colombia: {},
  Ecuador: {}
};

export function InteractiveCountryMap() {
  const [selectedCountry, setSelectedCountry] = useState<Country>("Chile");
  const [selectedRegion, setSelectedRegion] = useState<RegionData | null>(null);
  const [selectedRegionName, setSelectedRegionName] = useState<string | null>(null);
  const [hoveredRegion, setHoveredRegion] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(true);

  const { data: contractsData, loading } = useContractsByRegion(selectedCountry);

  // For Chile, use CHILE_REGIONS order; for others use COUNTRY_REGIONS
  const orderedRegions = useMemo(() => {
    if (selectedCountry === "Chile") {
      return CHILE_REGIONS
        .filter(region => contractsData[region.name]?.count > 0)
        .map(region => contractsData[region.name]);
    }
    const countryData = COUNTRY_REGIONS[selectedCountry];
    return countryData.order
      .filter(region => contractsData[region]?.count > 0)
      .map(region => contractsData[region]);
  }, [selectedCountry, contractsData]);

  const totalContracts = useMemo(() => {
    return Object.values(contractsData).reduce((sum, r) => sum + r.count, 0);
  }, [contractsData]);

  // Create contractsByRegion format for ChileRegionsMap
  const chileContractsByRegion = useMemo(() => {
    const result: Record<string, { count: number }> = {};
    Object.entries(contractsData).forEach(([region, data]) => {
      result[region] = { count: data.count };
    });
    return result;
  }, [contractsData]);

  const handleRegionClick = (region: string) => {
    const regionData = contractsData[region];
    setSelectedRegionName(region);
    setSelectedRegion(regionData || null);
  };

  const handleCloseModal = () => {
    setSelectedRegion(null);
    setSelectedRegionName(null);
  };

  const normalizeRegionName = (geoName: string): string => {
    if (selectedCountry === "Chile") return geoName;
    const mappings = REGION_MAPPINGS[selectedCountry as Exclude<Country, "Chile">];
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
                        className="relative bg-gradient-to-br from-sky-50 to-blue-100 dark:from-slate-800 dark:to-slate-900 rounded-lg overflow-hidden flex justify-center items-center"
                        style={{ height: isChile ? '520px' : '450px' }}
                      >
                        {isChile ? (
                          <ChileRegionsMap
                            contractsByRegion={chileContractsByRegion}
                            onRegionClick={handleRegionClick}
                            selectedRegion={selectedRegionName}
                          />
                        ) : (
                          <>
                            <ComposableMap
                              projection="geoMercator"
                              projectionConfig={{
                                center: MAP_CONFIG[selectedCountry as Exclude<Country, "Chile">].center,
                                scale: MAP_CONFIG[selectedCountry as Exclude<Country, "Chile">].scale
                              }}
                              width={MAP_CONFIG[selectedCountry as Exclude<Country, "Chile">].width}
                              height={MAP_CONFIG[selectedCountry as Exclude<Country, "Chile">].height}
                              style={{ width: "auto", height: "100%", maxHeight: "100%" }}
                            >
                              <Geographies geography={GEOJSON_URLS[selectedCountry as Exclude<Country, "Chile">]}>
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

                            {/* Hover tooltip for non-Chile */}
                            {hoveredRegion && (
                              <div className="absolute top-3 left-3 bg-background/95 backdrop-blur-sm border border-border rounded-lg px-4 py-2 shadow-lg z-10">
                                <p className="font-semibold text-sm">{hoveredRegion}</p>
                                <p className="text-xs text-muted-foreground">
                                  {contractsData[hoveredRegion]?.count || 0} locales
                                </p>
                              </div>
                            )}

                            {/* Legend for non-Chile */}
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
                          </>
                        )}
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
                      <ScrollArea className={`pr-4 ${isChile ? 'h-[470px]' : 'h-[370px]'}`}>
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

        {/* Region Detail Modal with Demographics */}
        <RegionDetailModal
          region={selectedRegion}
          regionName={selectedRegionName}
          onClose={handleCloseModal}
        />
      </Collapsible>
    </TooltipProvider>
  );
}

export default InteractiveCountryMap;
