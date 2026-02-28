import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useAppLogos } from "@/hooks/useAppLogos";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  FileText,
  ShoppingCart,
  Wallet,
  HardHat,
  Bell,
  BarChart3,
  Wrench,
  Shield,
  Users,
  LayoutDashboard,
  LogOut,
} from "lucide-react";

const Welcome = () => {
  const navigate = useNavigate();
  const { user, loading, isAdmin, roleLoaded, hasPermission, signOut } = useAuth();
  const { logos } = useAppLogos();
  const [fullName, setFullName] = useState<string>("");

  useEffect(() => {
    if (!loading && !user) {
      navigate("/auth");
    }
  }, [loading, user, navigate]);

  useEffect(() => {
    if (user) {
      supabase
        .from("profiles")
        .select("full_name")
        .eq("id", user.id)
        .single()
        .then(({ data }) => {
          setFullName(data?.full_name || user.email?.split("@")[0] || "");
        });
    }
  }, [user]);

  const hours = new Date().getHours();
  const greeting =
    hours < 12 ? "Buenos días" : hours < 20 ? "Buenas tardes" : "Buenas noches";

  const modules = [
    { id: "contracts", label: "Contratos", desc: "Gestión de contratos inmobiliarios", icon: FileText, path: "/contracts", resource: "contracts" },
    { id: "patents", label: "Patentes", desc: "Gestión de patentes municipales", icon: Shield, path: "/patents", resource: null },
    { id: "purchase_orders", label: "Órdenes de Compra", desc: "Control de órdenes y presupuestos", icon: ShoppingCart, path: "/purchase-orders", resource: "purchase_orders" },
    { id: "opex", label: "OPEX", desc: "Gastos operacionales", icon: Wallet, path: "/opex", resource: "opex" },
    { id: "capex", label: "CAPEX", desc: "Inversiones de capital", icon: HardHat, path: "/capex", resource: "purchase_orders" },
    { id: "alerts", label: "Alertas", desc: "Notificaciones y vencimientos", icon: Bell, path: "/alerts", resource: "alerts" },
    { id: "reports", label: "Informes", desc: "Reportes y análisis", icon: BarChart3, path: "/reports", resource: "reports" },
    { id: "kpi", label: "KPI", desc: "Indicadores de gestión", icon: BarChart3, path: "/kpi", resource: "kpi" },
    { id: "suppliers", label: "Proveedores", desc: "Gestión de proveedores", icon: Users, path: "/suppliers", resource: "suppliers" },
    { id: "maintenance", label: "Mantenciones", desc: "Mantenciones preventivas y correctivas", icon: Wrench, path: "/maintenance", resource: "maintenance" },
  ];

  const visibleModules = modules.filter((m) => m.resource === null || hasPermission(m.resource, "view"));

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
          <Button variant="ghost" size="sm" onClick={async () => { await signOut(); navigate("/auth"); }} className="gap-2">
            <LogOut className="h-4 w-4" />
            Salir
          </Button>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 max-w-5xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-10 space-y-8">
        {/* Greeting */}
        <div>
          <h1 className="text-3xl font-bold text-foreground">
            {greeting}, {fullName || "…"}
          </h1>
          <p className="text-muted-foreground mt-1">
            ¿En qué te gustaría trabajar hoy?
          </p>
        </div>

        {/* Dashboard button */}
        <Button
          size="lg"
          onClick={() => navigate("/dashboard")}
          className="gap-2"
        >
          <LayoutDashboard className="h-5 w-5" />
          Ir al Dashboard
        </Button>

        {/* Module grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {visibleModules.map((m) => (
            <Card
              key={m.id}
              className="cursor-pointer hover:shadow-md transition-shadow hover:border-primary/40"
              onClick={() => navigate(m.path)}
            >
              <CardContent className="p-5 flex items-start gap-4">
                <div className="rounded-lg bg-primary/10 p-2.5 text-primary">
                  <m.icon className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-medium text-foreground">{m.label}</p>
                  <p className="text-sm text-muted-foreground">{m.desc}</p>
                </div>
              </CardContent>
            </Card>
          ))}

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
    </div>
  );
};

export default Welcome;
