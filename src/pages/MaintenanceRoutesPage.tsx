import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { RouteBuilderLayout } from "@/components/maintenance/routes/RouteBuilderLayout";
import { RouteCalendar } from "@/components/maintenance/routes/RouteCalendar";
import { RouteComplianceStats } from "@/components/maintenance/routes/RouteComplianceStats";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Navigation, CalendarDays, BarChart2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

type Tab = "builder" | "calendar" | "stats";

export default function MaintenanceRoutesPage() {
  const { isOperador } = useAuth();
  const navigate = useNavigate();
  // Operadores de terreno van directo al calendario
  const [tab, setTab] = useState<Tab>(isOperador ? "calendar" : "builder");

  const tabs: { id: Tab; label: string; icon: React.ReactNode; hide?: boolean }[] = [
    { id: "builder",  label: "Armar Ruta",    icon: <Navigation className="w-4 h-4" />,   hide: isOperador },
    { id: "calendar", label: "Calendario",    icon: <CalendarDays className="w-4 h-4" /> },
    { id: "stats",    label: "Cumplimiento",  icon: <BarChart2 className="w-4 h-4" />,     hide: isOperador },
  ];

  return (
    <div className="flex flex-col h-[calc(100vh-64px)]">
      {/* Top bar */}
      <div className="flex items-center gap-2 px-4 pt-3 pb-0 shrink-0">
        {!isOperador && (
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
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 p-4">
        {tab === "builder"  && <RouteBuilderLayout />}
        {tab === "calendar" && <RouteCalendar />}
        {tab === "stats"    && <RouteComplianceStats />}
      </div>
    </div>
  );
}
