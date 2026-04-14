import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { FileText, CheckCircle, Clock, AlertTriangle, XCircle } from "lucide-react";

interface ContractStats {
  totalContracts: number;
  totalVigentes: number;
  totalNegociacion: number;
  totalRechazados: number;
  totalVencidos: number;
  totalAtencionEspecial: number;
  totalTerminationNotices: number;
}

export function ContractStatsCards() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<ContractStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      const [statsRes, alertsRes] = await Promise.all([
        supabase.rpc("get_dashboard_stats"),
        supabase.rpc("get_termination_alerts"),
      ]);

      const dashData = statsRes.data as any;
      const alertsData = (alertsRes.data as any[]) || [];

      if (dashData?.totals) {
        setStats({
          totalContracts: dashData.totals.total_contracts,
          totalVigentes: dashData.totals.total_vigentes,
          totalNegociacion: dashData.totals.total_negociacion,
          totalVencidos: dashData.totals.total_vencidos,
          totalAtencionEspecial: dashData.totals.total_atencion_especial,
          totalTerminationNotices: alertsData.length,
        });
      }
    } finally {
      setLoading(false);
    }
  };

  const handleCardClick = (status?: string) => {
    if (status) {
      navigate(`/contracts?status=${status}`);
    } else {
      navigate("/contracts?status=todos");
    }
  };

  if (loading) {
    return (
      <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-20 bg-muted/50 rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  if (!stats) return null;

  return (
    <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
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
            <p className="text-[10px] text-muted-foreground">Contratos vencidos</p>
          </div>
          <AlertTriangle className="h-5 w-5 text-red-600" />
        </CardContent>
      </Card>
    </div>
  );
}
