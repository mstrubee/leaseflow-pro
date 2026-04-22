import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useAppLogos } from "@/hooks/useAppLogos";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { WelcomeAlertsBar } from "@/components/alerts/WelcomeAlertsBar";

import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  rectSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  FileText, ShoppingCart, Wallet, HardHat, Bell,
  BarChart3, Wrench, Shield, Users, LayoutDashboard,
  LogOut, GripVertical, AlertTriangle, KeyRound,
} from "lucide-react";
import { ChangePasswordDialog } from "@/components/auth/ChangePasswordDialog";
import { SelectableElement } from "@/components/admin/SelectableElement";
import type { LucideIcon } from "lucide-react";

interface ModuleItem {
  id: string;
  label: string;
  desc: string;
  icon: LucideIcon;
  path: string;
  resource: string | null;
  color: string;
}

function SortableModuleCard({ module, onClick }: { module: ModuleItem; onClick: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: module.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : undefined,
  };

  return (
    <div ref={setNodeRef} style={style} className="h-full">
      <SelectableElement elementId={module.id} label={module.label}>
        <Card className="cursor-pointer hover:shadow-md transition-shadow hover:border-primary/40 group h-full">
          <CardContent className="p-5 flex items-start gap-4 h-full" onClick={onClick}>
            <div className={`rounded-lg p-2.5 ${module.color}`}>
              <module.icon className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-foreground">{module.label}</p>
              <p className="text-sm text-muted-foreground">{module.desc}</p>
            </div>
            <div
              {...attributes}
              {...listeners}
              className="opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing p-1 text-muted-foreground hover:text-foreground"
              onClick={(e) => e.stopPropagation()}
            >
              <GripVertical className="h-4 w-4" />
            </div>
          </CardContent>
        </Card>
      </SelectableElement>
    </div>
  );
}

const ALL_MODULES: ModuleItem[] = [
  { id: "contracts", label: "Contratos", desc: "Gestión de contratos inmobiliarios", icon: FileText, path: "/contracts", resource: "contracts", color: "text-blue-600 bg-blue-100" },
  { id: "patents", label: "Patentes", desc: "Gestión de patentes municipales", icon: Shield, path: "/patents", resource: null, color: "text-purple-600 bg-purple-100" },
  { id: "purchase_orders", label: "Órdenes de Compra", desc: "Control de órdenes y presupuestos", icon: ShoppingCart, path: "/purchase-orders", resource: "purchase_orders", color: "text-orange-600 bg-orange-100" },
  { id: "opex", label: "OPEX", desc: "Gastos operacionales", icon: Wallet, path: "/opex", resource: "opex", color: "text-emerald-600 bg-emerald-100" },
  { id: "capex", label: "CAPEX", desc: "Inversiones de capital", icon: HardHat, path: "/capex", resource: "purchase_orders", color: "text-amber-600 bg-amber-100" },
  { id: "alerts", label: "Alertas", desc: "Notificaciones y vencimientos", icon: Bell, path: "/alerts", resource: "alerts", color: "text-red-600 bg-red-100" },
  { id: "reports", label: "Informes", desc: "Reportes y análisis", icon: BarChart3, path: "/reports", resource: "reports", color: "text-cyan-600 bg-cyan-100" },
  { id: "kpi", label: "KPI", desc: "Indicadores de gestión", icon: BarChart3, path: "/kpi", resource: "kpi", color: "text-indigo-600 bg-indigo-100" },
  { id: "suppliers", label: "Proveedores", desc: "Gestión de proveedores", icon: Users, path: "/suppliers", resource: "suppliers", color: "text-teal-600 bg-teal-100" },
  { id: "maintenance", label: "Mantenciones", desc: "Mantenciones preventivas y correctivas", icon: Wrench, path: "/maintenance", resource: "maintenance", color: "text-rose-600 bg-rose-100" },
];

const Welcome = () => {
  const navigate = useNavigate();
  const { user, loading, isAdmin, roleLoaded, hasPermission, signOut } = useAuth();
  const { logos } = useAppLogos();
  const [fullName, setFullName] = useState<string>("");
  const [pwdOpen, setPwdOpen] = useState(false);

  const { value: savedOrder, setValue: setSavedOrder, initialized: orderInitialized } = useUserPreferences<string[]>({
    preferenceKey: "welcome_module_order",
    defaultValue: [],
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  useEffect(() => {
    if (!loading && !user) navigate("/auth");
  }, [loading, user, navigate]);

  useEffect(() => {
    if (user) {
      supabase.from("profiles").select("full_name").eq("id", user.id).single()
        .then(({ data }) => setFullName(data?.full_name || user.email?.split("@")[0] || ""));
    }
  }, [user]);

  const hours = new Date().getHours();
  const greeting = hours < 12 ? "Buenos días" : hours < 20 ? "Buenas tardes" : "Buenas noches";

  const visibleModules = useMemo(() =>
    ALL_MODULES.filter((m) => m.resource === null || hasPermission(m.resource, "view")),
    [hasPermission]
  );

  const sortedModules = useMemo(() => {
    if (!orderInitialized || !savedOrder || savedOrder.length === 0) return visibleModules;
    const ordered: ModuleItem[] = [];
    const visibleIds = new Set(visibleModules.map(m => m.id));
    // Add modules in saved order if visible
    for (const id of savedOrder) {
      const mod = visibleModules.find(m => m.id === id);
      if (mod) ordered.push(mod);
    }
    // Append any new modules not in saved order
    for (const mod of visibleModules) {
      if (!savedOrder.includes(mod.id)) ordered.push(mod);
    }
    return ordered;
  }, [visibleModules, savedOrder, orderInitialized]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = sortedModules.findIndex(m => m.id === active.id);
    const newIndex = sortedModules.findIndex(m => m.id === over.id);
    const reordered = arrayMove(sortedModules, oldIndex, newIndex);
    setSavedOrder(reordered.map(m => m.id));
  };

  if (loading || !roleLoaded) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col pb-14">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <img src={logos.dashboard_header} alt="Logo" className="h-[50px] object-contain" />
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setPwdOpen(true)} className="gap-2">
              <KeyRound className="h-4 w-4" />
              Cambiar contraseña
            </Button>
            <Button variant="ghost" size="sm" onClick={async () => { await signOut(); navigate("/auth"); }} className="gap-2">
              <LogOut className="h-4 w-4" />
              Salir
            </Button>
          </div>
        </div>
      </header>
      <ChangePasswordDialog open={pwdOpen} onOpenChange={setPwdOpen} />

      {/* Main content */}
      <main className="flex-1 max-w-5xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-10 space-y-8">
        <div>
          <h1 className="text-3xl font-bold text-foreground">
            {greeting}, {fullName || "…"}
          </h1>
          <p className="text-muted-foreground mt-1">¿En qué te gustaría trabajar hoy?</p>
        </div>

        <SelectableElement elementId="dashboard" label="Dashboard">
          <Button size="lg" onClick={() => navigate("/dashboard")} className="gap-2">
            <LayoutDashboard className="h-5 w-5" />
            Ir al Dashboard
          </Button>
        </SelectableElement>

        

        {/* Sortable module grid */}
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={sortedModules.map(m => m.id)} strategy={rectSortingStrategy}>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {sortedModules.map((m) => (
                <SortableModuleCard key={m.id} module={m} onClick={() => navigate(m.path)} />
              ))}

              {isAdmin && (
                <SelectableElement elementId="admin" label="Admin">
                  <Card
                    className="cursor-pointer hover:shadow-md transition-shadow hover:border-primary/40 h-full"
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
                </SelectableElement>
              )}

              <SelectableElement elementId="special_attention" label="Atención Especial">
                <Card
                  className="cursor-pointer hover:shadow-md transition-shadow hover:border-primary/40 h-full"
                  onClick={() => navigate("/special-attention")}
                >
                  <CardContent className="p-5 flex items-start gap-4">
                    <div className="rounded-lg p-2.5 text-amber-600 bg-amber-100">
                      <AlertTriangle className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="font-medium text-foreground">Atención Especial</p>
                      <p className="text-sm text-muted-foreground">Contratos que requieren atención</p>
                    </div>
                  </CardContent>
                </Card>
              </SelectableElement>
            </div>
          </SortableContext>
        </DndContext>
      </main>

      <WelcomeAlertsBar />
    </div>
  );
};

export default Welcome;
