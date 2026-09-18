import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { RouteBuilderLayout } from "@/components/maintenance/routes/RouteBuilderLayout";
import { RouteCalendar } from "@/components/maintenance/routes/RouteCalendar";
import { RouteComplianceStats } from "@/components/maintenance/routes/RouteComplianceStats";
import { UnscheduledRoutesButton } from "@/components/maintenance/routes/UnscheduledRoutesButton";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Navigation, CalendarDays, BarChart2, Wallet } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

type Tab = "builder" | "calendar" | "stats";

export default function MaintenanceRoutesPage() {
  const { hasPermission } = useAuth();
  const navigate = useNavigate();
  const canArmar       = hasPermission("maintenance_armar_rutas",    "view");
  const canCumplimiento = hasPermission("maintenance_cumplimiento",   "view");
  const canFormularios  = hasPermission("maintenance_formularios",    "view");
  const canExpenseReports = hasPermission("expense_reports", "view");

  const [tab, setTab] = useState<Tab>(canArmar ? "builder" : "calendar");
  const [editRouteId, setEditRouteId] = useState<string | null>(null);

  const tabs: { id: Tab; label: string; icon: React.ReactNode; hide?: boolean }[] = [
    { id: "builder",  label: "Armar Ruta",    icon: <Navigation className="w-4 h-4" />,   hide: !canArmar },
    { id: "calendar", label: "Calendario",    icon: <CalendarDays className="w-4 h-4" /> },
    { id: "stats",    label: "Cumplimiento",  icon: <BarChart2 className="w-4 h-4" />,     hide: !canCumplimiento },
  ];

  return (
    <div className="flex flex-col h-[calc(100vh-64px)]">
      {/* Top bar */}
      <div className="flex items-center gap-2 px-4 pt-3 pb-0 shrink-0">
        {canFormularios && (
          <Button variant="ghost" size="sm" className="h-8 px-2 gap-1 text-xs"
            onClick={() => navigate("/maintenance")}>
            <ArrowLeft className="w-3.5 h-3.5" /> Mantenciones
          </Button>
        )}

        {/* Tabs */}
        <div className="flex gap-1 ml-2">
          {tabs.filter(t => !t.hide).map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors
                ${tab === t.id
                  ? "bg-blue-50 text-blue-700 border border-blue-200"
                  : "text-gray-500 hover:text-gray-700 hover:bg-gray-100"
                }`}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>

        {canArmar && (
          <div className="ml-auto">
            <UnscheduledRoutesButton
              onEdit={(routeId) => { setEditRouteId(routeId); setTab("builder"); }}
            />
          </div>
        )}

        {canExpenseReports && (
          <div className={canArmar ? "" : "ml-auto"}>
            <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={() => navigate("/expense-reports")}>
              <Wallet className="w-3.5 h-3.5" /> Rendición de Gastos
            </Button>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 p-4">
        {tab === "builder"  && (
          <RouteBuilderLayout
            editTourId={editRouteId}
            onExitEdit={() => setEditRouteId(null)}
          />
        )}
        {tab === "calendar" && (
          <RouteCalendar
            onEditRoute={canArmar ? (routeId) => { setEditRouteId(routeId); setTab("builder"); } : undefined}
          />
        )}
        {tab === "stats"    && <RouteComplianceStats />}
      </div>
    </div>
  );
}
