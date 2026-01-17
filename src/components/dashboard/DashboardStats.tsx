import { useEffect, useState, Fragment } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronRight, Download } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { FileText, CheckCircle, Clock, AlertTriangle } from "lucide-react";
import { EconomicIndicators } from "./EconomicIndicators";
import { PatentsModule } from "@/components/patents/PatentsModule";
import { SelectableElement } from "@/components/admin/SelectableElement";
import { useUserPermissions } from "@/hooks/useUserPermissions";
import { CommuneContractsDialog } from "./CommuneContractsDialog";
import * as XLSX from "xlsx";

// Chilean regions ordered geographically from north to south
const REGION_ORDER: string[] = [
  "Arica y Parinacota",
  "Tarapacá",
  "Antofagasta",
  "Atacama",
  "Coquimbo",
  "Valparaíso",
  "Metropolitana de Santiago",
  "O'Higgins",
  "Maule",
  "Ñuble",
  "Biobío",
  "La Araucanía",
  "Los Ríos",
  "Los Lagos",
  "Aysén",
  "Magallanes",
];

const getRegionSortIndex = (region: string): number => {
  const index = REGION_ORDER.findIndex(
    (r) => r.toLowerCase() === region.toLowerCase()
  );
  return index >= 0 ? index : 999; // Unknown regions go to the end
};

interface CommuneStats {
  commune: string;
  total: number;
  vigentes: number;
  vigentesAutoplanet: number;
  vigentesAgroplanet: number;
  vigentesGrupoPlanet: number;
  negociacion: number;
  vencidos: number;
}

interface RegionStats {
  region: string;
  total: number;
  vigentes: number;
  vigentesAutoplanet: number;
  vigentesAgroplanet: number;
  vigentesGrupoPlanet: number;
  negociacion: number;
  vencidos: number;
  communes: Record<string, CommuneStats>;
}

interface TerminationAlert {
  id: string;
  name: string;
  required_exit_date: string;
  notice_type: string;
  issuer_name: string | null;
}

interface Stats {
  totalContracts: number;
  totalVigentes: number;
  totalVigentesAutoplanet: number;
  totalVigentesAgroplanet: number;
  totalVigentesGrupoPlanet: number;
  totalNegociacion: number;
  totalVencidos: number;
  totalAtencionEspecial: number;
  totalTerminationNotices: number;
  byRegion: RegionStats[];
  terminationAlerts: TerminationAlert[];
}

export const DashboardStats = () => {
  const navigate = useNavigate();
  const { isHidden, loading: permissionsLoading } = useUserPermissions();
  const [stats, setStats] = useState<Stats>({
    totalContracts: 0,
    totalVigentes: 0,
    totalVigentesAutoplanet: 0,
    totalVigentesAgroplanet: 0,
    totalVigentesGrupoPlanet: 0,
    totalNegociacion: 0,
    totalVencidos: 0,
    totalAtencionEspecial: 0,
    totalTerminationNotices: 0,
    byRegion: [],
    terminationAlerts: [],
  });
  const [statsLoading, setStatsLoading] = useState(true);
  const [expandedRegions, setExpandedRegions] = useState<Set<string>>(new Set());
  const [communeDialog, setCommuneDialog] = useState<{ open: boolean; region: string; commune: string }>({
    open: false,
    region: "",
    commune: "",
  });

  useEffect(() => {
    loadStats();
  }, []);

  const toggleRegion = (region: string) => {
    setExpandedRegions((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(region)) {
        newSet.delete(region);
      } else {
        newSet.add(region);
      }
      return newSet;
    });
  };

  const loadStats = async () => {
    try {
      // Load contracts for stats with commune info
      const { data: contracts } = await supabase
        .from("contracts")
        .select(`
          id,
          name,
          status,
          requires_special_attention,
          contract_addresses (region, commune),
          termination_notices (id, notice_type, required_exit_date, issuer_name),
          contract_companies (
            company:companies (name)
          )
        `)
        .is("deleted_at", null);

      const regionMap: Record<string, RegionStats> = {};
      let totalVigentes = 0;
      let totalVigentesAutoplanet = 0;
      let totalVigentesAgroplanet = 0;
      let totalVigentesGrupoPlanet = 0;
      let totalNegociacion = 0;
      let totalVencidos = 0;
      let totalAtencionEspecial = 0;
      const terminationAlerts: TerminationAlert[] = [];

      contracts?.forEach((contract: any) => {
        const region = contract.contract_addresses?.[0]?.region || "Sin región";
        const commune = contract.contract_addresses?.[0]?.commune || "Sin comuna";
        
        // Get all companies for this contract
        const companies = contract.contract_companies?.map((cc: any) => cc.company?.name?.toLowerCase() || "") || [];
        
        if (!regionMap[region]) {
          regionMap[region] = {
            region,
            total: 0,
            vigentes: 0,
            vigentesAutoplanet: 0,
            vigentesAgroplanet: 0,
            vigentesGrupoPlanet: 0,
            negociacion: 0,
            vencidos: 0,
            communes: {},
          };
        }

        // Initialize commune if not exists
        if (!regionMap[region].communes[commune]) {
          regionMap[region].communes[commune] = {
            commune,
            total: 0,
            vigentes: 0,
            vigentesAutoplanet: 0,
            vigentesAgroplanet: 0,
            vigentesGrupoPlanet: 0,
            negociacion: 0,
            vencidos: 0,
          };
        }

        regionMap[region].total++;
        regionMap[region].communes[commune].total++;

        // Check for termination notices with exit dates
        const notices = contract.termination_notices || [];
        const noticesWithExitDate = notices.filter((n: any) => n.required_exit_date);
        noticesWithExitDate.forEach((notice: any) => {
          terminationAlerts.push({
            id: contract.id,
            name: contract.name,
            required_exit_date: notice.required_exit_date,
            notice_type: notice.notice_type,
            issuer_name: notice.issuer_name,
          });
        });

        switch (contract.status) {
          case "firmado":
            regionMap[region].vigentes++;
            regionMap[region].communes[commune].vigentes++;
            totalVigentes++;
            
            // Categorize by company - count for EACH company the contract has
            const hasAutoplanet = companies.some((c: string) => c.includes("autoplanet"));
            const hasAgroplanet = companies.some((c: string) => c.includes("agroplanet"));
            const hasGrupoPlanet = companies.some((c: string) => c.includes("grupo planet") || c.includes("grupoplanet"));
            
            if (hasAutoplanet) {
              regionMap[region].vigentesAutoplanet++;
              regionMap[region].communes[commune].vigentesAutoplanet++;
              totalVigentesAutoplanet++;
            }
            if (hasAgroplanet) {
              regionMap[region].vigentesAgroplanet++;
              regionMap[region].communes[commune].vigentesAgroplanet++;
              totalVigentesAgroplanet++;
            }
            if (hasGrupoPlanet) {
              regionMap[region].vigentesGrupoPlanet++;
              regionMap[region].communes[commune].vigentesGrupoPlanet++;
              totalVigentesGrupoPlanet++;
            }
            
            if (contract.requires_special_attention) {
              totalAtencionEspecial++;
            }
            break;
          case "en_negociacion":
            regionMap[region].negociacion++;
            regionMap[region].communes[commune].negociacion++;
            totalNegociacion++;
            break;
          case "vencido":
            regionMap[region].vencidos++;
            regionMap[region].communes[commune].vencidos++;
            totalVencidos++;
            break;
        }
      });

      const byRegion = Object.values(regionMap).sort((a, b) => 
        getRegionSortIndex(a.region) - getRegionSortIndex(b.region)
      );

      // Sort termination alerts by date
      terminationAlerts.sort((a, b) => 
        new Date(a.required_exit_date).getTime() - new Date(b.required_exit_date).getTime()
      );

      setStats({
        totalContracts: contracts?.length || 0,
        totalVigentes,
        totalVigentesAutoplanet,
        totalVigentesAgroplanet,
        totalVigentesGrupoPlanet,
        totalNegociacion,
        totalVencidos,
        totalAtencionEspecial,
        totalTerminationNotices: terminationAlerts.length,
        byRegion,
        terminationAlerts,
      });
    } finally {
      setStatsLoading(false);
    }
  };

  const handleCardClick = (status?: string) => {
    if (status) {
      navigate(`/contracts?status=${status}`);
    } else {
      navigate("/contracts?status=todos");
    }
  };

  const downloadExcel = () => {
    const workbook = XLSX.utils.book_new();
    
    // Create data array with headers
    const data: (string | number)[][] = [
      ["Región", "N° de comunas con presencia", "N° locales Autoplanet", "N° locales Agroplanet", "Total Sucursales"]
    ];
    
    let totalComunas = 0;
    let totalAutoplanet = 0;
    let totalAgroplanet = 0;
    let totalSucursales = 0;
    
    stats.byRegion.forEach((region) => {
      // Only include regions with vigentes contracts (Autoplanet or Agroplanet)
      const autoplanet = region.vigentesAutoplanet;
      const agroplanet = region.vigentesAgroplanet;
      const sucursales = autoplanet + agroplanet;
      
      if (sucursales === 0) return; // Skip regions with no vigentes
      
      // Count only communes that have vigentes contracts
      const comunasConVigentes = Object.values(region.communes).filter(
        (c) => c.vigentesAutoplanet > 0 || c.vigentesAgroplanet > 0
      ).length;
      
      totalComunas += comunasConVigentes;
      totalAutoplanet += autoplanet;
      totalAgroplanet += agroplanet;
      totalSucursales += sucursales;
      
      data.push([region.region, comunasConVigentes, autoplanet, agroplanet, sucursales]);
    });
    
    // Add totals row
    data.push(["Totales", totalComunas, totalAutoplanet, totalAgroplanet, totalSucursales]);
    
    const worksheet = XLSX.utils.aoa_to_sheet(data);
    
    // Set column widths
    worksheet["!cols"] = [
      { wch: 30 },
      { wch: 25 },
      { wch: 18 },
      { wch: 18 },
      { wch: 15 },
    ];
    
    XLSX.utils.book_append_sheet(workbook, worksheet, "Resumen por Región");
    
    // Generate and download
    const excelBuffer = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
    const blob = new Blob([excelBuffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "resumen_contratos_por_region.xlsx";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Wait for permissions to load before showing content to prevent flickering
  if (permissionsLoading || statsLoading) {
    return (
      <div className="space-y-6">
        <div className="h-24 bg-muted/50 rounded-lg animate-pulse" />
        <div className="grid gap-4 md:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-28 bg-muted/50 rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Economic Indicators */}
      {!isHidden("dashboard_economic") && (
        <SelectableElement elementId="dashboard_economic" label="Indicadores Económicos">
          <EconomicIndicators />
        </SelectableElement>
      )}

      {/* Summary Cards - Stats */}
      {!isHidden("dashboard_stats") && (
        <SelectableElement elementId="dashboard_stats" label="Estadísticas de Contratos">
          <div className="grid gap-3 md:grid-cols-4">
            <Card 
              className="cursor-pointer hover:shadow-lg transition-shadow"
              onClick={() => handleCardClick()}
            >
              <CardContent className="flex items-center justify-between py-3 px-4">
                <div>
                  <p className="text-xs text-muted-foreground font-medium">Total General</p>
                  <div className="text-2xl font-bold">{stats.totalContracts}</div>
                  <p className="text-[10px] text-muted-foreground">Contratos totales</p>
                </div>
                <FileText className="h-5 w-5 text-muted-foreground" />
              </CardContent>
            </Card>

            <Card 
              className="border-green-500/20 bg-green-500/5 cursor-pointer hover:shadow-lg transition-shadow"
              onClick={() => handleCardClick("firmado")}
            >
              <CardContent className="flex items-center justify-between py-3 px-4 relative">
                <div className="flex-1">
                  <p className="text-xs text-muted-foreground font-medium text-green-600">Vigentes</p>
                  <div className="text-2xl font-bold text-green-600">{stats.totalVigentes}</div>
                  <p className="text-[10px] text-muted-foreground">Contratos activos</p>
                  {stats.totalAtencionEspecial > 0 && (
                    <div 
                      className="mt-1 cursor-pointer hover:bg-orange-100/50 rounded transition-colors inline-flex items-center gap-1"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate("/contracts?status=firmado&atencion_especial=true");
                      }}
                    >
                      <AlertTriangle className="h-3 w-3 text-orange-500" />
                      <span className="text-[10px] font-medium text-orange-600">
                        Atención Especial: {stats.totalAtencionEspecial}
                      </span>
                    </div>
                  )}
                  {stats.totalTerminationNotices > 0 && (
                    <div 
                      className="absolute right-3 bottom-2 cursor-pointer hover:bg-red-100/50 rounded transition-colors inline-flex items-center gap-1 border-2 border-red-500 px-2 py-1 bg-red-50"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate("/alerts");
                      }}
                    >
                      <Clock className="h-3 w-3 text-red-600" />
                      <span className="text-[10px] font-medium text-red-600">
                        Con aviso de término: {stats.totalTerminationNotices}
                      </span>
                    </div>
                  )}
                </div>
                <CheckCircle className="h-5 w-5 text-green-600" />
              </CardContent>
            </Card>

            <Card 
              className="border-yellow-500/20 bg-yellow-500/5 cursor-pointer hover:shadow-lg transition-shadow"
              onClick={() => handleCardClick("en_negociacion")}
            >
              <CardContent className="flex items-center justify-between py-3 px-4">
                <div>
                  <p className="text-xs text-muted-foreground font-medium text-yellow-600">En Negociación</p>
                  <div className="text-2xl font-bold text-yellow-600">{stats.totalNegociacion}</div>
                  <p className="text-[10px] text-muted-foreground">Pendientes de firma</p>
                </div>
                <Clock className="h-5 w-5 text-yellow-600" />
              </CardContent>
            </Card>

            <Card 
              className="border-red-500/20 bg-red-500/5 cursor-pointer hover:shadow-lg transition-shadow"
              onClick={() => handleCardClick("vencido")}
            >
              <CardContent className="flex items-center justify-between py-3 px-4">
                <div>
                  <p className="text-xs text-muted-foreground font-medium text-red-600">Vencidos</p>
                  <div className="text-2xl font-bold text-red-600">{stats.totalVencidos}</div>
                  <p className="text-[10px] text-muted-foreground">Requieren atención</p>
                </div>
                <AlertTriangle className="h-5 w-5 text-red-600" />
              </CardContent>
            </Card>
          </div>
        </SelectableElement>
      )}

      {/* Regional Breakdown Table - part of map section */}
      {!isHidden("dashboard_map") && (
        <SelectableElement elementId="dashboard_map" label="Mapa / Contratos por Región">
          <Collapsible defaultOpen={false}>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between py-3">
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" className="flex items-center gap-2 p-0 h-auto hover:bg-transparent">
                    <ChevronDown className="h-5 w-5 transition-transform duration-200 [[data-state=closed]>&]:-rotate-90" />
                    <CardTitle className="text-lg">Contratos por Región</CardTitle>
                  </Button>
                </CollapsibleTrigger>
                <Button variant="outline" size="sm" onClick={downloadExcel} className="gap-2">
                  <Download className="h-4 w-4" />
                  Descargar Excel
                </Button>
              </CardHeader>
              <CollapsibleContent>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[200px]">Región</TableHead>
                        <TableHead className="text-center">General</TableHead>
                        <TableHead className="text-center text-green-600">Vigentes</TableHead>
                        <TableHead className="text-center text-green-700">Autoplanet</TableHead>
                        <TableHead className="text-center text-red-600">Agroplanet</TableHead>
                        <TableHead className="text-center text-blue-600">Grupo Planet</TableHead>
                        <TableHead className="text-center text-yellow-600">Negociación</TableHead>
                        <TableHead className="text-center text-red-600">Vencidos</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {stats.byRegion.map((row) => {
                        const isExpanded = expandedRegions.has(row.region);
                        const communesList = Object.values(row.communes).sort((a, b) => 
                          a.commune.localeCompare(b.commune)
                        );
                        const hasCommunes = communesList.length > 0;
                        
                        return (
                          <Fragment key={row.region}>
                            <TableRow className="hover:bg-muted/30">
                              <TableCell className="font-medium">
                                <div className="flex items-center gap-2">
                                  {hasCommunes && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-6 w-6 p-0"
                                      onClick={() => toggleRegion(row.region)}
                                    >
                                      {isExpanded ? (
                                        <ChevronDown className="h-4 w-4" />
                                      ) : (
                                        <ChevronRight className="h-4 w-4" />
                                      )}
                                    </Button>
                                  )}
                                  <span 
                                    className="cursor-pointer hover:text-primary hover:underline"
                                    onClick={() => navigate(`/contracts?ubicacion=${encodeURIComponent(row.region)}&status=todos`)}
                                  >
                                    {row.region}
                                  </span>
                                </div>
                              </TableCell>
                              <TableCell 
                                className="text-center cursor-pointer hover:bg-muted/50"
                                onClick={() => navigate(`/contracts?ubicacion=${encodeURIComponent(row.region)}&status=todos`)}
                              >
                                {row.total}
                              </TableCell>
                              <TableCell 
                                className="text-center text-green-600 cursor-pointer hover:bg-green-100/50"
                                onClick={() => navigate(`/contracts?ubicacion=${encodeURIComponent(row.region)}&status=firmado`)}
                              >
                                {row.vigentes}
                              </TableCell>
                              <TableCell className="text-center text-green-700">
                                {row.vigentesAutoplanet}
                              </TableCell>
                              <TableCell className="text-center text-red-600 font-medium">
                                {row.vigentesAgroplanet}
                              </TableCell>
                              <TableCell className="text-center text-blue-600 font-medium">
                                {row.vigentesGrupoPlanet}
                              </TableCell>
                              <TableCell 
                                className="text-center text-yellow-600 cursor-pointer hover:bg-yellow-100/50"
                                onClick={() => navigate(`/contracts?ubicacion=${encodeURIComponent(row.region)}&status=en_negociacion`)}
                              >
                                {row.negociacion}
                              </TableCell>
                              <TableCell 
                                className="text-center text-red-600 cursor-pointer hover:bg-red-100/50"
                                onClick={() => navigate(`/contracts?ubicacion=${encodeURIComponent(row.region)}&status=vencido`)}
                              >
                                {row.vencidos}
                              </TableCell>
                            </TableRow>
                            {isExpanded && communesList.map((commune) => (
                              <TableRow key={`${row.region}-${commune.commune}`} className="bg-muted/20">
                                <TableCell className="font-normal pl-12">
                                  <span 
                                    className="text-muted-foreground cursor-pointer hover:text-primary hover:underline"
                                    onClick={() => setCommuneDialog({ open: true, region: row.region, commune: commune.commune })}
                                  >
                                    {commune.commune}
                                  </span>
                                </TableCell>
                                <TableCell className="text-center text-muted-foreground">
                                  {commune.total}
                                </TableCell>
                                <TableCell className="text-center text-green-600/70">
                                  {commune.vigentes}
                                </TableCell>
                                <TableCell className="text-center text-green-700/70">
                                  {commune.vigentesAutoplanet}
                                </TableCell>
                                <TableCell className="text-center text-red-600/70">
                                  {commune.vigentesAgroplanet}
                                </TableCell>
                                <TableCell className="text-center text-blue-600/70">
                                  {commune.vigentesGrupoPlanet}
                                </TableCell>
                                <TableCell className="text-center text-yellow-600/70">
                                  {commune.negociacion}
                                </TableCell>
                                <TableCell className="text-center text-red-600/70">
                                  {commune.vencidos}
                                </TableCell>
                              </TableRow>
                            ))}
                          </Fragment>
                        );
                      })}
                      {stats.byRegion.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                            No hay contratos registrados
                          </TableCell>
                        </TableRow>
                      )}
                      {stats.byRegion.length > 0 && (
                        <TableRow className="bg-muted/50 font-semibold">
                          <TableCell>Total</TableCell>
                          <TableCell className="text-center">{stats.totalContracts}</TableCell>
                          <TableCell className="text-center text-green-600">{stats.totalVigentes}</TableCell>
                          <TableCell className="text-center text-green-700">{stats.totalVigentesAutoplanet}</TableCell>
                          <TableCell className="text-center text-red-600 font-medium">{stats.totalVigentesAgroplanet}</TableCell>
                          <TableCell className="text-center text-blue-600 font-medium">{stats.totalVigentesGrupoPlanet}</TableCell>
                          <TableCell className="text-center text-yellow-600">{stats.totalNegociacion}</TableCell>
                          <TableCell className="text-center text-red-600">{stats.totalVencidos}</TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>
        </SelectableElement>
      )}

      {/* Patents Module */}
      {!isHidden("dashboard_patents") && (
        <SelectableElement elementId="dashboard_patents" label="Módulo de Patentes">
          <PatentsModule />
        </SelectableElement>
      )}

      {/* Commune Contracts Dialog */}
      <CommuneContractsDialog
        open={communeDialog.open}
        onOpenChange={(open) => setCommuneDialog((prev) => ({ ...prev, open }))}
        region={communeDialog.region}
        commune={communeDialog.commune}
      />
    </div>
  );
};
