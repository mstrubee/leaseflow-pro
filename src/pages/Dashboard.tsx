import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Plus, LogOut, Shield, Trash2 } from "lucide-react";
import { DashboardStats } from "@/components/dashboard/DashboardStats";
import { useAuth } from "@/hooks/useAuth";

const Dashboard = () => {
  const navigate = useNavigate();
  const { user, loading, isAdmin, signOut } = useAuth();

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
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold text-foreground">Gestión de Contratos</h1>
              <p className="text-sm text-muted-foreground mt-1">
                Administra tus contratos de arriendo
              </p>
            </div>
            <div className="flex items-center gap-3">
              {isAdmin && (
                <>
                  <Button variant="outline" onClick={() => navigate("/deleted")} className="gap-2">
                    <Trash2 className="h-4 w-4" />
                    Eliminados
                  </Button>
                  <Button variant="outline" onClick={() => navigate("/admin")} className="gap-2">
                    <Shield className="h-4 w-4" />
                    Admin
                  </Button>
                </>
              )}
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

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <DashboardStats />
      </main>
    </div>
  );
};

export default Dashboard;
