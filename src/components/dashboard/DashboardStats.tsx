import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileText, DollarSign, MapPin } from "lucide-react";

interface Stats {
  totalContracts: number;
  totalByRegion: { [key: string]: number };
  totalRentByRegion: { [key: string]: number };
}

export const DashboardStats = () => {
  const [stats, setStats] = useState<Stats>({
    totalContracts: 0,
    totalByRegion: {},
    totalRentByRegion: {},
  });

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    // Get total contracts
    const { count: totalContracts } = await supabase
      .from("contracts")
      .select("*", { count: "exact", head: true });

    // Get contracts with addresses and versions
    const { data: contracts } = await supabase
      .from("contracts")
      .select(`
        id,
        contract_addresses (region),
        contract_versions (regime_rent, is_current)
      `);

    const byRegion: { [key: string]: number } = {};
    const rentByRegion: { [key: string]: number } = {};

    contracts?.forEach((contract: any) => {
      const region = contract.contract_addresses?.[0]?.region || "Sin región";
      byRegion[region] = (byRegion[region] || 0) + 1;

      const currentVersion = contract.contract_versions?.find(
        (v: any) => v.is_current
      );
      if (currentVersion) {
        rentByRegion[region] =
          (rentByRegion[region] || 0) + parseFloat(currentVersion.regime_rent || 0);
      }
    });

    setStats({
      totalContracts: totalContracts || 0,
      totalByRegion: byRegion,
      totalRentByRegion: rentByRegion,
    });
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("es-CL", {
      style: "currency",
      currency: "CLP",
    }).format(amount);
  };

  return (
    <div className="grid gap-4 md:grid-cols-3">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Total Contratos</CardTitle>
          <FileText className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{stats.totalContracts}</div>
          <p className="text-xs text-muted-foreground mt-1">
            Contratos activos y en negociación
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Por Región</CardTitle>
          <MapPin className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="space-y-1">
            {Object.entries(stats.totalByRegion).map(([region, count]) => (
              <div key={region} className="flex justify-between text-sm">
                <span className="text-muted-foreground">{region}</span>
                <span className="font-medium">{count}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Monto Total Arriendo</CardTitle>
          <DollarSign className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="space-y-1">
            {Object.entries(stats.totalRentByRegion).map(([region, amount]) => (
              <div key={region} className="flex justify-between text-sm">
                <span className="text-muted-foreground">{region}</span>
                <span className="font-medium">{formatCurrency(amount)}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
