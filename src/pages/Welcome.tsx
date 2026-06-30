import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useAppLogos } from "@/hooks/useAppLogos";
import { Card, CardContent } from "@/components/ui/card";
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
  const { user, loading, isAdmin, isOperador, roleLoaded, hasPermission, signOut } = useAuth();
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

  if (loading || !roleLoaded) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <img
              src={logos.dashboard_header}
              alt="Logo"
              className="h-[50px] object-contain"
            />
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
        </div>
      </header>

      <main className="flex-1 max-w-5xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-10 space-y-8">
        {/* Greeting */}
        <div>
          <h1 className="text-3xl font-bold text-foreground">
            {greeting}{fullName ? `, ${fullName}` : ""}.
          </h1>
          <p className="text-muted-foreground mt-1">¿En qué te gustaría trabajar hoy?</p>
        </div>

        {/* Alerts */}
        <WelcomeAlertsBar />

        {/* Module grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {visibleModules.map(mod => {
            const Icon = mod.icon;
            const isUnconfigured = mod.external && !mod.path;
            return (
              <Card
                key={mod.id}
                className={`transition-shadow ${isUnconfigured ? "opacity-40 cursor-not-allowed" : "cursor-pointer hover:shadow-md hover:border-primary/40"}`}
                onClick={() => {
                  if (isUnconfigured) return;
                  if (mod.external) window.open(mod.path, "_blank", "noopener,noreferrer");
                  else navigate(mod.path);
                }}
              >
                <CardContent className="p-5 flex items-start gap-4">
                  <div className={`rounded-lg p-2.5 ${mod.color}`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-medium text-foreground">{mod.label}</p>
                    <p className="text-sm text-muted-foreground">{mod.desc}</p>
                  </div>
                </CardContent>
              </Card>
            );
          })}

          {isAdmin && (
            <Card
              className="cursor-pointer hover:shadow-md transition-shadow hover:border-primary/40"
              onClick={() => navigate("/admin")}
            >
              <CardContent className="p-5 flex items-start gap-4">
                <div className="rounded-lg bg-primary/10 p-2.5 text-primary">
                  <Shield className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-medium text-foreground">Admin</p>
                  <p className="text-sm text-muted-foreground">Panel de administración</p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </main>

      <ChangePasswordDialog open={pwdOpen} onOpenChange={setPwdOpen} />
    </div>
  );
};

export default Welcome;
