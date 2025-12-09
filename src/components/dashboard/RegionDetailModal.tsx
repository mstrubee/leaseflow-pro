import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MapPin, Users, Building2, User, TrendingUp, ChevronRight, FileText } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { RegionData, ContractLocation } from "@/hooks/useContractsByRegion";
import { getRegionDemographics, formatPopulation, CHILE_DEMOGRAPHICS } from "@/data/chileRegionsData";

interface RegionDetailModalProps {
  region: RegionData | null;
  regionName: string | null;
  onClose: () => void;
  onCommuneClick?: (commune: string) => void;
}

export function RegionDetailModal({ region, regionName, onClose, onCommuneClick }: RegionDetailModalProps) {
  const navigate = useNavigate();
  const demographics = regionName ? getRegionDemographics(regionName) : null;

  const handleContractClick = (contractId: string) => {
    navigate(`/contracts/${contractId}`);
    onClose();
  };

  const getPoliticalColor = (tendency?: string): string => {
    if (!tendency) return "bg-muted";
    if (tendency.includes("Izquierda")) return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300";
    if (tendency.includes("Derecha")) return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300";
    if (tendency.includes("Centro")) return "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300";
    return "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300";
  };

  if (!regionName) return null;

  const fullRegionData = CHILE_DEMOGRAPHICS[regionName];
  const numeral = {
    "Arica y Parinacota": "XV",
    "Tarapacá": "I",
    "Antofagasta": "II",
    "Atacama": "III",
    "Coquimbo": "IV",
    "Valparaíso": "V",
    "Metropolitana de Santiago": "RM",
    "O'Higgins": "VI",
    "Maule": "VII",
    "Ñuble": "XVI",
    "Biobío": "VIII",
    "La Araucanía": "IX",
    "Los Ríos": "XIV",
    "Los Lagos": "X",
    "Aysén": "XI",
    "Magallanes y Antártica Chilena": "XII"
  }[regionName] || "";

  return (
    <Dialog open={!!regionName} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="flex items-center gap-3 text-xl">
            <MapPin className="h-6 w-6 text-primary" />
            <span>Región de {regionName}</span>
            <Badge variant="secondary" className="text-lg">{numeral}</Badge>
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="contracts" className="flex-1 overflow-hidden flex flex-col">
          <TabsList className="grid grid-cols-2 w-full flex-shrink-0">
            <TabsTrigger value="contracts" className="gap-2">
              <FileText className="h-4 w-4" />
              Contratos ({region?.count || 0})
            </TabsTrigger>
            <TabsTrigger value="demographics" className="gap-2">
              <Users className="h-4 w-4" />
              Demografía
            </TabsTrigger>
          </TabsList>

          <TabsContent value="contracts" className="flex-1 overflow-hidden mt-4">
            <ScrollArea className="h-[55vh] pr-4">
              {region && Object.entries(region.communes).length > 0 ? (
                <div className="space-y-4">
                  {Object.entries(region.communes).map(([commune, contracts]) => (
                    <Card key={commune} className="border-border/50">
                      <CardHeader className="py-3 pb-2">
                        <CardTitle className="text-sm flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Building2 className="h-4 w-4 text-muted-foreground" />
                            <span>{commune}</span>
                          </div>
                          <Badge variant="outline">{contracts.length} locales</Badge>
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="pt-0 pb-3">
                        <div className="space-y-1">
                          {contracts.map((contract: ContractLocation) => (
                            <Button
                              key={contract.contractId}
                              variant="ghost"
                              className="w-full justify-between h-auto py-2 px-3 text-left hover:bg-primary/5"
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
                              <ChevronRight className="h-4 w-4 text-muted-foreground" />
                            </Button>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-[300px] text-muted-foreground">
                  <FileText className="h-12 w-12 mb-4 opacity-50" />
                  <p className="text-lg font-medium">Sin contratos en esta región</p>
                  <p className="text-sm">No hay locales registrados actualmente</p>
                </div>
              )}
            </ScrollArea>
          </TabsContent>

          <TabsContent value="demographics" className="flex-1 overflow-hidden mt-4">
            <ScrollArea className="h-[55vh] pr-4">
              {demographics ? (
                <div className="space-y-6">
                  {/* Summary Stats */}
                  <div className="grid grid-cols-2 gap-4">
                    <Card className="border-border/50">
                      <CardContent className="pt-4">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-primary/10 rounded-lg">
                            <Users className="h-5 w-5 text-primary" />
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Población Total</p>
                            <p className="text-xl font-bold">{formatPopulation(demographics.population)}</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                    <Card className="border-border/50">
                      <CardContent className="pt-4">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-primary/10 rounded-lg">
                            <Building2 className="h-5 w-5 text-primary" />
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Capital Regional</p>
                            <p className="text-xl font-bold">{demographics.capital}</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Communes Table */}
                  <Card className="border-border/50">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base flex items-center gap-2">
                        <TrendingUp className="h-4 w-4" />
                        Comunas ({demographics.communes.length})
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Comuna</TableHead>
                            <TableHead className="text-right">Población</TableHead>
                            <TableHead>Alcalde</TableHead>
                            <TableHead>Tendencia</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {demographics.communes
                            .sort((a, b) => b.population - a.population)
                            .map((commune) => (
                              <TableRow key={commune.name}>
                                <TableCell className="font-medium">{commune.name}</TableCell>
                                <TableCell className="text-right">{formatPopulation(commune.population)}</TableCell>
                                <TableCell>
                                  <div className="flex items-center gap-2">
                                    <User className="h-3 w-3 text-muted-foreground" />
                                    <span className="text-sm">{commune.mayor || "—"}</span>
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <Badge 
                                    variant="secondary" 
                                    className={`text-xs ${getPoliticalColor(commune.politicalTendency)}`}
                                  >
                                    {commune.politicalTendency || "—"}
                                  </Badge>
                                </TableCell>
                              </TableRow>
                            ))}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-[300px] text-muted-foreground">
                  <Users className="h-12 w-12 mb-4 opacity-50" />
                  <p className="text-lg font-medium">Información no disponible</p>
                </div>
              )}
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

export default RegionDetailModal;
