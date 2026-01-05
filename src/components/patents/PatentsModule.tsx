import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileText, AlertTriangle, Settings } from "lucide-react";
import { usePatents } from "@/hooks/usePatents";
import { useAuth } from "@/hooks/useAuth";
import { PatentsList } from "./PatentsList";
import { PatentChecklist } from "./PatentChecklist";
import { CriticalAlertsDashboard } from "./CriticalAlertsDashboard";
import { PatentAdminPanel } from "./PatentAdminPanel";
import { PatentDocStatus } from "./types";
import { toast } from "sonner";

export function PatentsModule() {
  const [searchParams, setSearchParams] = useSearchParams();
  const {
    contracts,
    sections,
    items,
    emitters,
    itemEmitters,
    statuses,
    loading,
    loadData,
    updatePriority,
    updatePatenteStatus,
    updateDocumentStatus,
    updateDocument,
    getCriticalStats
  } = usePatents();
  const {
    user,
    isAdmin
  } = useAuth();
  const [selectedContractId, setSelectedContractId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'list' | 'alerts'>('list');
  const [adminPanelOpen, setAdminPanelOpen] = useState(false);
  const stats = getCriticalStats();
  const selectedContract = contracts.find(c => c.id === selectedContractId);

  // Handle contractId from URL params
  useEffect(() => {
    const contractIdFromUrl = searchParams.get('contractId');
    if (contractIdFromUrl && contracts.length > 0) {
      const contractExists = contracts.find(c => c.id === contractIdFromUrl);
      if (contractExists) {
        setSelectedContractId(contractIdFromUrl);
        // Clear the URL param after selecting
        setSearchParams({}, { replace: true });
      }
    }
  }, [searchParams, contracts, setSearchParams]);
  const handleNavigateToDocument = (contractId: string, itemId: string) => {
    setSelectedContractId(contractId);
    setActiveTab('list');
    // Could scroll to specific item if needed
  };
  const handleStatusChangeFromAlerts = async (contractId: string, itemId: string, status: PatentDocStatus) => {
    if (!user) {
      toast.error("Debes iniciar sesión");
      return;
    }
    try {
      await updateDocumentStatus(contractId, itemId, status, user.id);
      toast.success("Estado actualizado");
    } catch (error) {
      toast.error("Error al actualizar estado");
    }
  };
  if (loading) {
    return <Card>
        <CardContent className="py-8 text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto" />
          <p className="mt-2 text-muted-foreground">Cargando módulo de patentes...</p>
        </CardContent>
      </Card>;
  }

  // Show detail view if a contract is selected
  if (selectedContract) {
    return <PatentChecklist contract={selectedContract} sections={sections} items={items} emitters={emitters} itemEmitters={itemEmitters} statuses={statuses} onBack={() => setSelectedContractId(null)} onUpdatePriority={updatePriority} onUpdatePatenteStatus={updatePatenteStatus} onUpdateDocument={updateDocument} onUpdateDocumentStatus={updateDocumentStatus} />;
  }
  return <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Patentes</h2>
          <p className="text-muted-foreground">Gestión de documentación para patentes comerciales y Recepciones Definitivas DOM</p>
        </div>
        {isAdmin && <Button variant="outline" className="gap-2" onClick={() => setAdminPanelOpen(true)}>
            <Settings className="h-4 w-4" />
            Administrar
          </Button>}
        
        <PatentAdminPanel open={adminPanelOpen} onOpenChange={setAdminPanelOpen} sections={sections} items={items} emitters={emitters} onDataChange={loadData} />
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Locales</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{contracts.length}</div>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:shadow-md transition-shadow border-red-200 bg-red-50 dark:bg-red-950/20" onClick={() => setActiveTab('alerts')}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-red-700 dark:text-red-400">Críticos</CardTitle>
            <AlertTriangle className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-700 dark:text-red-400">{stats.criticalContracts}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Docs Pendientes</CardTitle>
            <FileText className="h-4 w-4 text-yellow-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">{stats.pendingCount}</div>
          </CardContent>
        </Card>

        <Card className="border-red-200 bg-red-50 dark:bg-red-950/20">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-red-700 dark:text-red-400">Vencidos</CardTitle>
            <AlertTriangle className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-700 dark:text-red-400">{stats.overdueCount}</div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={v => setActiveTab(v as 'list' | 'alerts')}>
        <TabsList>
          <TabsTrigger value="list" className="gap-2">
            <FileText className="h-4 w-4" />
            Listado de Locales
          </TabsTrigger>
          <TabsTrigger value="alerts" className="gap-2">
            <AlertTriangle className="h-4 w-4" />
            Alertas Críticas
          </TabsTrigger>
        </TabsList>

        <TabsContent value="list" className="mt-4">
          <PatentsList contracts={contracts} onSelectContract={setSelectedContractId} />
        </TabsContent>

        <TabsContent value="alerts" className="mt-4">
          <CriticalAlertsDashboard contracts={contracts} items={items} sections={sections} onNavigateToDocument={handleNavigateToDocument} onStatusChange={handleStatusChangeFromAlerts} />
        </TabsContent>
      </Tabs>
    </div>;
}