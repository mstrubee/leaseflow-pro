import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { ChevronDown } from "lucide-react";
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

interface RegionStats {
  region: string;
  total: number;
  vigentes: number;
  negociacion: number;
  vencidos: number;
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
    totalNegociacion: 0,
    totalVencidos: 0,
    totalAtencionEspecial: 0,
    totalTerminationNotices: 0,
    byRegion: [],
    terminationAlerts: [],
  });
  const [statsLoading, setStatsLoading] = useState(true);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      // Load contracts for stats
      const { data: contracts } = await supabase
        .from("contracts")
        .select(`
          id,
          name,
          status,
          requires_special_attention,
          contract_addresses (region),
          termination_notices (id, notice_type, required_exit_date, issuer_name)
        `)
        .is("deleted_at", null);

      const regionMap: Record<string, RegionStats> = {};
      let totalVigentes = 0;
      let totalNegociacion = 0;
      let totalVencidos = 0;
      let totalAtencionEspecial = 0;
      const terminationAlerts: TerminationAlert[] = [];

      contracts?.forEach((contract: any) => {
        const region = contract.contract_addresses?.[0]?.region || "Sin región";
        
        if (!regionMap[region]) {
          regionMap[region] = {
            region,
            total: 0,
            vigentes: 0,
            negociacion: 0,
            vencidos: 0,
          };
        }

        regionMap[region].total++;

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
            totalVigentes++;
            if (contract.requires_special_attention) {
              totalAtencionEspecial++;
            }
            break;
          case "en_negociacion":
            regionMap[region].negociacion++;
            totalNegociacion++;
            break;
          case "vencido":
            regionMap[region].vencidos++;
            totalVencidos++;
            break;
        }
      });

      const byRegion = Object.values(regionMap).sort((a, b) => 
        a.region.localeCompare(b.region)
      );

      // Sort termination alerts by date
      terminationAlerts.sort((a, b) => 
        new Date(a.required_exit_date).getTime() - new Date(b.required_exit_date).getTime()
      );

      setStats({
        totalContracts: contracts?.length || 0,
        totalVigentes,
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
              </CardHeader>
              <CollapsibleContent>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Región</TableHead>
                        <TableHead className="text-center">General</TableHead>
                        <TableHead className="text-center text-green-600">Vigentes</TableHead>
                        <TableHead className="text-center text-yellow-600">Negociación</TableHead>
                        <TableHead className="text-center text-red-600">Vencidos</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {stats.byRegion.map((row) => (
                        <TableRow key={row.region}>
                          <TableCell 
                            className="font-medium cursor-pointer hover:text-primary hover:underline"
                            onClick={() => navigate(`/contracts?ubicacion=${encodeURIComponent(row.region)}&status=todos`)}
                          >
                            {row.region}
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
                      ))}
                      {stats.byRegion.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                            No hay contratos registrados
                          </TableCell>
                        </TableRow>
                      )}
                      {stats.byRegion.length > 0 && (
                        <TableRow className="bg-muted/50 font-semibold">
                          <TableCell>Total</TableCell>
                          <TableCell className="text-center">{stats.totalContracts}</TableCell>
                          <TableCell className="text-center text-green-600">{stats.totalVigentes}</TableCell>
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
    </div>
  );
};
