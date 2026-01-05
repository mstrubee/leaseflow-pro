import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Plus, LogOut, Shield, Trash2, Bell } from "lucide-react";
import { DashboardStats } from "@/components/dashboard/DashboardStats";
import { SuppliersModule } from "@/components/suppliers/SuppliersModule";
import { useAuth } from "@/hooks/useAuth";
import logosHeader from "@/assets/logos-header.png";

const Dashboard = () => {
  const navigate = useNavigate();
  const {
    user,
    loading,
    isAdmin,
    signOut
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
  if (loading) {
    return <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>;
  }
  return <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-[1536px] mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="items-center justify-between flex flex-row">
            <div className="flex items-center gap-6">
              <img src={logosHeader} alt="AutoPlanet Agroplanet" className="h-10 object-contain" />
              <div>
                <h1 className="text-2xl font-semibold text-sky-950">Gerencia Desarrollo</h1>
                <p className="text-sm text-muted-foreground mt-1">Desarrollo Negocios y Administración Inmobiliaria</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {isAdmin && <>
                  <Button variant="outline" onClick={() => navigate("/alerts")} className="gap-2">
                    <Bell className="h-4 w-4" />
                    Alertas
                  </Button>
                  <Button variant="outline" onClick={() => navigate("/deleted")} className="gap-2">
                    <Trash2 className="h-4 w-4" />
                    Eliminados
                  </Button>
                  <Button variant="outline" onClick={() => navigate("/admin")} className="gap-2">
                    <Shield className="h-4 w-4" />
                    Admin
                  </Button>
                </>}
              <Button onClick={() => navigate("/contracts/new")} className="gap-2">
                <Plus className="h-4 w-4" />
                Nuevo Contrato
              </Button>
              <Button variant="outline" onClick={handleLogout} className="gap-2">
                <LogOut className="h-4 w-4" />
                Salir
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-12xl mx-auto px-0.5 sm:px-6 lg:px-8 py-8 space-y-6">
        <DashboardStats />
        <div className="max-w-7xl mx-auto">
          <SuppliersModule />
        </div>
      </main>
    </div>;
};
export default Dashboard;