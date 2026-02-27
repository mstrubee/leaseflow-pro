import { MaintenanceModule } from "@/components/maintenance/MaintenanceModule";
import { Wrench } from "lucide-react";

const MaintenanceDashboard = () => {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-[2112px] mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center gap-3">
            <Wrench className="h-6 w-6 text-primary" />
            <div>
              <h1 className="text-2xl font-semibold text-foreground">Mantenciones</h1>
              <p className="text-sm text-muted-foreground">Control y seguimiento de requerimientos de mantención y activos fijos</p>
            </div>
          </div>
        </div>
      </header>
      <main className="max-w-[2112px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <MaintenanceModule />
      </main>
    </div>
  );
};

export default MaintenanceDashboard;
