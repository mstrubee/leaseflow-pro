import { useState, useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarChart3, Settings, History, Activity } from "lucide-react";
import { useKPI, KPI } from "@/hooks/useKPI";
import { supabase } from "@/integrations/supabase/client";
import { KPIDashboard } from "./KPIDashboard";
import { KPIList } from "./KPIList";
import { KPIForm } from "./KPIForm";
import { KPICategoryManager } from "./KPICategoryManager";
import { KPIGoalTypeManager } from "./KPIGoalTypeManager";
import { KPIMeasurementsDialog } from "./KPIMeasurementsDialog";
import { KPIAuditLog } from "./KPIAuditLog";

interface Profile {
  id: string;
  email: string;
  full_name: string | null;
}

export function KPIModule() {
  const {
    categories,
    goalTypes,
    frequencies,
    kpis,
    measurements,
    auditLogs,
    loading,
    loadData,
    createCategory,
    updateCategory,
    deleteCategory,
    createKPI,
    updateKPI,
    deleteKPI,
    createGoalType,
    updateGoalType,
    deleteGoalType,
    createMeasurement,
    loadMeasurements,
    loadAuditLogs,
    getKPIStatus,
  } = useKPI();

  const [users, setUsers] = useState<Profile[]>([]);
  const [isKPIFormOpen, setIsKPIFormOpen] = useState(false);
  const [editingKPI, setEditingKPI] = useState<KPI | null>(null);
  const [measurementsDialogKPI, setMeasurementsDialogKPI] = useState<KPI | null>(null);

  useEffect(() => {
    loadUsers();
    loadMeasurements();
    loadAuditLogs();
  }, []);

  const loadUsers = async () => {
    const { data } = await supabase.from("profiles").select("id, email, full_name");
    if (data) setUsers(data);
  };

  const handleCreateKPI = () => {
    setEditingKPI(null);
    setIsKPIFormOpen(true);
  };

  const handleCreateSubKPI = (parentKPI: KPI) => {
    // Create a new KPI with parent reference
    setEditingKPI({
      ...parentKPI,
      id: '', // Will be new
      name: `${parentKPI.name} - Sub`,
      parent_kpi_id: parentKPI.id,
      description: `Sub-KPI de ${parentKPI.name}`,
    } as KPI);
    setIsKPIFormOpen(true);
  };

  const handleEditKPI = (kpi: KPI) => {
    setEditingKPI(kpi);
    setIsKPIFormOpen(true);
  };

  const handleSaveKPI = async (data: Partial<KPI>) => {
    if (editingKPI && editingKPI.id) {
      await updateKPI(editingKPI.id, data);
    } else {
      await createKPI(data);
    }
  };

  const handleViewMeasurements = (kpi: KPI) => {
    setMeasurementsDialogKPI(kpi);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Control de Gestión & KPI</h2>
        <p className="text-muted-foreground">
          Sistema de indicadores clave para el área de Gerencia Inmobiliaria y Activos
        </p>
      </div>

      <Tabs defaultValue="dashboard" className="space-y-4">
        <TabsList>
          <TabsTrigger value="dashboard" className="gap-2">
            <Activity className="h-4 w-4" />
            Dashboard
          </TabsTrigger>
          <TabsTrigger value="kpis" className="gap-2">
            <BarChart3 className="h-4 w-4" />
            KPIs
          </TabsTrigger>
          <TabsTrigger value="config" className="gap-2">
            <Settings className="h-4 w-4" />
            Configuración
          </TabsTrigger>
          <TabsTrigger value="audit" className="gap-2">
            <History className="h-4 w-4" />
            Auditoría
          </TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard">
          <KPIDashboard
            kpis={kpis}
            categories={categories}
            measurements={measurements}
            getKPIStatus={getKPIStatus}
          />
        </TabsContent>

        <TabsContent value="kpis">
          <KPIList
            kpis={kpis}
            categories={categories}
            onCreateKPI={handleCreateKPI}
            onEditKPI={handleEditKPI}
            onDeleteKPI={deleteKPI}
            onViewMeasurements={handleViewMeasurements}
            onCreateSubKPI={handleCreateSubKPI}
          />
        </TabsContent>

        <TabsContent value="config" className="space-y-6">
          <KPICategoryManager
            categories={categories}
            onCreateCategory={createCategory}
            onUpdateCategory={updateCategory}
            onDeleteCategory={deleteCategory}
          />
          <KPIGoalTypeManager
            goalTypes={goalTypes}
            onCreateGoalType={createGoalType}
            onUpdateGoalType={updateGoalType}
            onDeleteGoalType={deleteGoalType}
          />
        </TabsContent>

        <TabsContent value="audit">
          <KPIAuditLog
            auditLogs={auditLogs}
            onRefresh={loadAuditLogs}
          />
        </TabsContent>
      </Tabs>

      {/* KPI Form Dialog */}
      <KPIForm
        open={isKPIFormOpen}
        onOpenChange={setIsKPIFormOpen}
        kpi={editingKPI}
        categories={categories}
        goalTypes={goalTypes}
        frequencies={frequencies}
        users={users}
        onSave={handleSaveKPI}
      />

      {/* Measurements Dialog */}
      <KPIMeasurementsDialog
        open={!!measurementsDialogKPI}
        onOpenChange={(open) => !open && setMeasurementsDialogKPI(null)}
        kpi={measurementsDialogKPI}
        onCreateMeasurement={createMeasurement}
      />
    </div>
  );
}
