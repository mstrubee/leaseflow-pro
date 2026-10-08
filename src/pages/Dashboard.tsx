import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Plus, LogOut, Shield, Trash2, Bell, Upload, ShoppingCart, Wallet, FileText, BarChart3, Wrench, HardHat } from "lucide-react";
import { DashboardStats } from "@/components/dashboard/DashboardStats";
import { useAuth } from "@/hooks/useAuth";
import { ReportsReturnButton } from "@/components/reports/ReportsReturnButton";
import { useAppLogos } from "@/hooks/useAppLogos";
const Dashboard = () => {
  const navigate = useNavigate();
  const {
    user,
    loading,
    isAdmin,
    roleLoaded,
    signOut,
    hasPermission
  } = useAuth();
  useEffect(() => {
    if (!loading && !user) {
      navigate("/auth");
    }
  }, [loading, user, navigate]);
  const handleLogout = async () => {
    await signOut();
    navigate("/auth");
  };
  const { logos } = useAppLogos();
  
  if (loading || !roleLoaded) {
    return <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>;
  }
  return <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-[1536px] mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex flex-col gap-4">
            {/* Primera fila: Logo y título */}
            <div className="flex items-center gap-6">
              <img src={logos.dashboard_header} alt="AutoPlanet Agroplanet" className="h-[62px] object-contain cursor-pointer hover:opacity-80 transition-opacity" onClick={() => navigate("/")} />
              <div>
                <h1 className="text-2xl font-semibold text-sky-950">Gerencia Desarrollo</h1>
                <p className="text-sm text-muted-foreground mt-1">Desarrollo Negocios y Administración Inmobiliaria</p>
              </div>
            </div>
            {/* Segunda fila: Botones organizados */}
            <div className="flex flex-wrap items-center justify-end gap-2">
              {/* Línea 1: Navegación principal */}
              <div className="flex items-center gap-2 flex-wrap">
                {hasPermission("maintenance", "view") && (
                  <Button variant="outline" size="sm" onClick={() => navigate("/maintenance")} className="gap-2">
                    <Wrench className="h-4 w-4" />
                    Mantenciones
                  </Button>
                )}
                {hasPermission("purchase_orders", "view") && (
                  <Button variant="outline" size="sm" onClick={() => navigate("/purchase-orders")} className="gap-2">
                    <ShoppingCart className="h-4 w-4" />
                    Órdenes de Compra
                  </Button>
                )}
                {hasPermission("opex", "view") && (
                  <Button variant="outline" size="sm" onClick={() => navigate("/opex")} className="gap-2">
                    <Wallet className="h-4 w-4" />
                    OPEX
                  </Button>
                )}
                {hasPermission("capex", "view") && (
                  <Button variant="outline" size="sm" onClick={() => navigate("/capex")} className="gap-2">
                    <HardHat className="h-4 w-4" />
                    CAPEX
                  </Button>
                )}
                {hasPermission("alerts", "view") && (
                  <Button variant="outline" size="sm" onClick={() => navigate("/alerts")} className="gap-2">
                    <Bell className="h-4 w-4" />
                    Alertas
                  </Button>
                )}
                {hasPermission("reports", "view") && (
                  <Button variant="outline" size="sm" onClick={() => navigate("/reports")} className="gap-2">
                    <FileText className="h-4 w-4" />
                    Informes
                  </Button>
                )}
                {hasPermission("kpi", "view") && (
                  <Button variant="outline" size="sm" onClick={() => navigate("/kpi")} className="gap-2">
                    <BarChart3 className="h-4 w-4" />
                    KPI
                  </Button>
                )}
                {isAdmin && (
                  <Button variant="outline" size="sm" onClick={() => navigate("/admin")} className="gap-2">
                    <Shield className="h-4 w-4" />
                    Admin
                  </Button>
                )}
                <Button variant="outline" size="sm" onClick={handleLogout} className="gap-2">
                  <LogOut className="h-4 w-4" />
                  Salir
                </Button>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-12xl mx-auto px-0.5 sm:px-6 lg:px-8 py-8 space-y-6">
        <DashboardStats />
      </main>

      {/* Floating return button when coming from Reports */}
      <ReportsReturnButton />
    </div>;
};
export default Dashboard;