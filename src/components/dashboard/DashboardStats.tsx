import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
interface RegionStats {
  region: string;
  total: number;
  vigentes: number;
  negociacion: number;
  vencidos: number;
}

interface Stats {
  totalContracts: number;
  totalVigentes: number;
  totalNegociacion: number;
  totalVencidos: number;
  byRegion: RegionStats[];
}

export const DashboardStats = () => {
  const navigate = useNavigate();
  const [stats, setStats] = useState<Stats>({
    totalContracts: 0,
    totalVigentes: 0,
    totalNegociacion: 0,
    totalVencidos: 0,
    byRegion: [],
  });

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    const { data: contracts } = await supabase
      .from("contracts")
      .select(`
        id,
        status,
        contract_addresses (region)
      `)
      .is("deleted_at", null);

    const regionMap: Record<string, RegionStats> = {};
    let totalVigentes = 0;
    let totalNegociacion = 0;
    let totalVencidos = 0;

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

      switch (contract.status) {
        case "firmado":
          regionMap[region].vigentes++;
          totalVigentes++;
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

    setStats({
      totalContracts: contracts?.length || 0,
      totalVigentes,
      totalNegociacion,
      totalVencidos,
      byRegion,
    });
  };

  const handleCardClick = (status?: string) => {
    if (status) {
      navigate(`/contracts?status=${status}`);
    } else {
      navigate("/contracts?status=todos");
    }
  };

  return (
    <div className="space-y-6">
      {/* Economic Indicators */}
      <EconomicIndicators />

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card 
          className="cursor-pointer hover:shadow-lg transition-shadow"
          onClick={() => handleCardClick()}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total General</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalContracts}</div>
            <p className="text-xs text-muted-foreground">Contratos totales</p>
          </CardContent>
        </Card>

        <Card 
          className="border-green-500/20 bg-green-500/5 cursor-pointer hover:shadow-lg transition-shadow"
          onClick={() => handleCardClick("firmado")}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-green-600">Vigentes</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{stats.totalVigentes}</div>
            <p className="text-xs text-muted-foreground">Contratos activos</p>
          </CardContent>
        </Card>

        <Card 
          className="border-yellow-500/20 bg-yellow-500/5 cursor-pointer hover:shadow-lg transition-shadow"
          onClick={() => handleCardClick("en_negociacion")}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-yellow-600">En Negociación</CardTitle>
            <Clock className="h-4 w-4 text-yellow-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">{stats.totalNegociacion}</div>
            <p className="text-xs text-muted-foreground">Pendientes de firma</p>
          </CardContent>
        </Card>

        <Card 
          className="border-red-500/20 bg-red-500/5 cursor-pointer hover:shadow-lg transition-shadow"
          onClick={() => handleCardClick("vencido")}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-red-600">Vencidos</CardTitle>
            <AlertTriangle className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{stats.totalVencidos}</div>
            <p className="text-xs text-muted-foreground">Requieren atención</p>
          </CardContent>
        </Card>
      </div>

      {/* Regional Breakdown Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Contratos por Región</CardTitle>
        </CardHeader>
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
                  <TableCell className="font-medium">{row.region}</TableCell>
                  <TableCell className="text-center">{row.total}</TableCell>
                  <TableCell className="text-center text-green-600">{row.vigentes}</TableCell>
                  <TableCell className="text-center text-yellow-600">{row.negociacion}</TableCell>
                  <TableCell className="text-center text-red-600">{row.vencidos}</TableCell>
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
      </Card>

      {/* Patents Module */}
      <PatentsModule />
    </div>
  );
};
