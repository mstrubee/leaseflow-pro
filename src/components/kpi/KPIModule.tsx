import { TeamKPIDashboard } from "./TeamKPIDashboard";

export function KPIModule() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Control de Gestión & KPI</h2>
        <p className="text-muted-foreground">
          Indicadores de desempeño del equipo de Gerencia Inmobiliaria y Activos
        </p>
      </div>
      <TeamKPIDashboard />
    </div>
  );
}
