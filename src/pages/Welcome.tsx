import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useAppLogos } from "@/hooks/useAppLogos";
import { Button } from "@/components/ui/button";
import { WelcomeAlertsBar } from "@/components/alerts/WelcomeAlertsBar";
import { ChangePasswordDialog } from "@/components/auth/ChangePasswordDialog";
import {
  FileText, ShoppingCart, Wallet, HardHat, Bell,
  BarChart3, Wrench, Shield, Users, MapPin, ScanSearch, LogOut, KeyRound,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface ModuleItem {
  id: string;
  label: string;
  desc: string;
  icon: LucideIcon;
  path: string;
  resource: string | null;
  color: string;
  external?: boolean;
}

const ALL_MODULES: ModuleItem[] = [
  { id: "contracts",      label: "Contratos",                desc: "Gestión de contratos inmobiliarios",           icon: FileText,    path: "/contracts",       resource: "contracts",       color: "text-blue-600 bg-blue-100" },
  { id: "patents",        label: "Patentes",                 desc: "Gestión de patentes municipales",              icon: Shield,      path: "/patents",          resource: null,              color: "text-purple-600 bg-purple-100" },
  { id: "purchase_orders",label: "Órdenes de Compra",        desc: "Control de órdenes y presupuestos",            icon: ShoppingCart,path: "/purchase-orders",  resource: "purchase_orders", color: "text-orange-600 bg-orange-100" },
  { id: "opex",           label: "OPEX",                     desc: "Gastos operacionales",                         icon: Wallet,      path: "/opex",             resource: "opex",            color: "text-emerald-600 bg-emerald-100" },
  { id: "capex",          label: "CAPEX",                    desc: "Inversiones de capital",                       icon: HardHat,     path: "/capex",            resource: "capex",           color: "text-amber-600 bg-amber-100" },
  { id: "alerts",         label: "Alertas",                  desc: "Notificaciones y vencimientos",                icon: Bell,        path: "/alerts",           resource: "alerts",          color: "text-red-600 bg-red-100" },
  { id: "reports",        label: "Informes",                  desc: "Reportes y análisis",                          icon: BarChart3,   path: "/reports",          resource: "reports",         color: "text-cyan-600 bg-cyan-100" },
  { id: "kpi",            label: "KPI",                      desc: "Indicadores de gestión",                       icon: BarChart3,   path: "/kpi",              resource: "kpi",             color: "text-indigo-600 bg-indigo-100" },
  { id: "suppliers",      label: "Proveedores",              desc: "Gestión de proveedores",                       icon: Users,       path: "/suppliers",        resource: "suppliers",       color: "text-teal-600 bg-teal-100" },
  { id: "maintenance",    label: "Mantenciones",             desc: "Mantenciones preventivas y correctivas",       icon: Wrench,      path: "/maintenance",      resource: "maintenance",     color: "text-rose-600 bg-rose-100" },
  { id: "geoloc",         label: "GEOLOC",                   desc: "Sistema de información geográfica",            icon: MapPin,      path: "/geoloc",           resource: "geoloc",          color: "text-green-600 bg-green-100" },
  { id: "contract_review",label: "Revisor de Contratos (IA)",desc: "Analiza riesgos de un contrato Word con IA",   icon: ScanSearch,  path: "",                  resource: null,              color: "text-fuchsia-600 bg-fuchsia-100", external: true },
];

const Welcome = () => {
  const navigate = useNavigate();
  const { user, loading, isOperador, roleLoaded, hasPermission, signOut } = useAuth();
  const { logos } = useAppLogos();
  const [fullName, setFullName] = useState<string>("");
  const [pwdOpen, setPwdOpen] = useState(false);

  useEffect(() => {
    if (!loading && !user) navigate("/auth");
  }, [loading, user, navigate]);

  useEffect(() => {
    if (roleLoaded && isOperador) navigate("/maintenance/routes", { replace: true });
  }, [roleLoaded, isOperador, navigate]);

  useEffect(() => {
    if (user) {
      supabase.from("profiles").select("full_name").eq("id", user.id).single()
        .then(({ data }) => setFullName(data?.full_name || user.email?.split("@")[0] || ""));
    }
  }, [user?.id]);

  const hours = new Date().getHours();
  const greeting = hours < 12 ? "Buenos días" : hours < 20 ? "Buenas tardes" : "Buenas noches";

  const visibleModules = useMemo(
    () => ALL_MODULES.filter(m => m.resource === null || hasPermission(m.resource, "view")),
    [hasPermission],
  );

  if (loading || !user) return null;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card px-6 py-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          {logos?.header ? (
            <img src={logos.header} alt="Logo" className="h-8 object-contain" />
          ) : (
            <span className="font-semibold text-lg">LeaseFlow Pro</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => setPwdOpen(true)}>
            <KeyRound className="h-4 w-4 mr-1.5" />
            Contraseña
          </Button>
          <Button variant="ghost" size="sm" onClick={signOut}>
            <LogOut className="h-4 w-4 mr-1.5" />
            Salir
          </Button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8 space-y-6">
        {/* Greeting */}
        <div>
          <h1 className="text-2xl font-semibold">{greeting}{fullName ? `, ${fullName}` : ""}.</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Selecciona un módulo para continuar.</p>
        </div>

        {/* Alerts */}
        <WelcomeAlertsBar />

        {/* Module grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {visibleModules.map(mod => {
            const Icon = mod.icon;
            const isUnconfigured = mod.external && !mod.path;
            return (
              <button
                key={mod.id}
                disabled={isUnconfigured}
                onClick={() => {
                  if (isUnconfigured) return;
                  if (mod.external) window.open(mod.path, "_blank", "noopener,noreferrer");
                  else navigate(mod.path);
                }}
                className="flex flex-col items-start gap-3 rounded-xl border bg-card p-4 text-left transition-all hover:shadow-md hover:border-primary/30 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <span className={`inline-flex items-center justify-center h-10 w-10 rounded-lg ${mod.color}`}>
                  <Icon className="h-5 w-5" />
                </span>
                <div>
                  <p className="font-medium text-sm leading-snug">{mod.label}</p>
                  <p className="text-xs text-muted-foreground leading-snug mt-0.5">{mod.desc}</p>
                </div>
              </button>
            );
          })}
        </div>
      </main>

      <ChangePasswordDialog open={pwdOpen} onOpenChange={setPwdOpen} />
    </div>
  );
};

export default Welcome;
