import { MaintenanceModule } from "@/components/maintenance/MaintenanceModule";
import { SelectableElement } from "@/components/admin/SelectableElement";
import { Wrench, Navigation } from "lucide-react";
import { useNavigate, Navigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";

const MaintenanceDashboard = () => {
  const navigate = useNavigate();
  const { isOperador, roleLoaded } = useAuth();

  // El operador de terreno no accede al módulo completo de mantenciones, solo rutas
  if (roleLoaded && isOperador) return <Navigate to="/maintenance/routes" replace />;

  return (
    <div className="min-h-screen bg-background">
      <SelectableElement elementId="maintenance" label="Mantenciones">
        <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
          <div className="max-w-[2112px] mx-auto px-4 sm:px-6 lg:px-8 py-4">
            <div className="flex items-center gap-3">
              <Wrench className="h-6 w-6 text-primary" />
              <div>
                <h1 className="text-2xl font-semibold text-foreground">Mantenciones</h1>
                <p className="text-sm text-muted-foreground">Control y seguimiento de requerimientos de mantención y activos fijos</p>
              </div>
              <div className="ml-auto">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigate("/maintenance/routes")}
                  className="gap-2"
                >
                  <Navigation className="w-4 h-4" />
                  Armar Ruta
                </Button>
              </div>
            </div>
          </div>
        </header>
        <main className="max-w-[2112px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <MaintenanceModule />
        </main>
      </SelectableElement>
    </div>
  );
};

export default MaintenanceDashboard;
