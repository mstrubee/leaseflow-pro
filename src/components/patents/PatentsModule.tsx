import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileText, AlertTriangle, Settings, CheckCircle, FolderOpen } from "lucide-react";
import { usePatents } from "@/hooks/usePatents";
import { useAuth } from "@/hooks/useAuth";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

import { PatentsList } from "./PatentsList";
import { PatentChecklist } from "./PatentChecklist";
import { CriticalAlertsDashboard } from "./CriticalAlertsDashboard";
import { PatentAdminPanel } from "./PatentAdminPanel";
import { PatentSharedRepository } from "./PatentSharedRepository";
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
    sharedItems,
    loading,
    loadData,
    updatePriority,
    updatePatenteStatus,
    updateComments,
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
  const [sharedRepoOpen, setSharedRepoOpen] = useState(false);
  const [cardFilter, setCardFilter] = useState<string | null>(null);
  

  const stats = getCriticalStats();
  const selectedContract = contracts.find(c => c.id === selectedContractId);

  const handleCardFilterClick = (filter: string) => {
    setCardFilter(prev => prev === filter ? null : filter);
    
    // Cards related to documentation alerts go to alerts tab, others to list tab
    const alertsFilters = ['critical', 'overdue'];
    if (alertsFilters.includes(filter)) {
      setActiveTab('alerts');
    } else {
      setActiveTab('list');
    }
    
  };

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
    return <PatentChecklist contract={selectedContract} sections={sections} items={items} emitters={emitters} itemEmitters={itemEmitters} statuses={statuses} sharedItems={sharedItems} onBack={() => setSelectedContractId(null)} onUpdatePriority={updatePriority} onUpdatePatenteStatus={updatePatenteStatus} onUpdateComments={updateComments} onUpdateDocument={updateDocument} onUpdateDocumentStatus={updateDocumentStatus} />;
  }
  return <Card>
        <CardHeader className="flex flex-row items-center justify-between py-3">
          <CardTitle className="text-lg">Patentes</CardTitle>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="gap-2" onClick={() => setSharedRepoOpen(true)}>
              <FolderOpen className="h-4 w-4" />
              Repositorio
            </Button>
            {isAdmin && <Button variant="outline" size="sm" className="gap-2" onClick={() => setAdminPanelOpen(true)}>
                <Settings className="h-4 w-4" />
                Administrar
              </Button>}
          </div>
          <PatentAdminPanel open={adminPanelOpen} onOpenChange={setAdminPanelOpen} sections={sections} items={items} emitters={emitters} onDataChange={loadData} />
          <PatentSharedRepository open={sharedRepoOpen} onOpenChange={setSharedRepoOpen} />
        </CardHeader>
        <CardContent className="space-y-4">
            {/* Summary Cards */}
            <div className="grid gap-2 md:grid-cols-4 lg:grid-cols-7">
              <Card 
                className={`cursor-pointer hover:shadow-md transition-shadow ${cardFilter === 'all' ? 'ring-2 ring-primary' : ''}`}
                onClick={() => handleCardFilterClick('all')}
              >
                <CardContent className="p-3 flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">Total Locales</p>
                    <p className="text-xl font-bold">{contracts.length}</p>
                  </div>
                  <FileText className="h-4 w-4 text-muted-foreground" />
                </CardContent>
              </Card>

              <Card 
                className={`cursor-pointer hover:shadow-md transition-shadow border-green-200 bg-green-50 dark:bg-green-950/20 ${cardFilter === 'definitiva' ? 'ring-2 ring-green-500' : ''}`}
                onClick={() => handleCardFilterClick('definitiva')}
              >
                <CardContent className="p-3 flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium text-green-700 dark:text-green-400">Patentes Definitivas</p>
                    <p className="text-xl font-bold text-green-700 dark:text-green-400">
                      {contracts.filter(c => c.patente_status === 'definitiva').length}
                    </p>
                  </div>
                  <CheckCircle className="h-4 w-4 text-green-600" />
                </CardContent>
              </Card>

              <Card 
                className={`cursor-pointer hover:shadow-md transition-shadow border-yellow-200 bg-yellow-50 dark:bg-yellow-950/20 ${cardFilter === 'provisoria' ? 'ring-2 ring-yellow-500' : ''}`}
                onClick={() => handleCardFilterClick('provisoria')}
              >
                <CardContent className="p-3 flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium text-yellow-700 dark:text-yellow-400">Patentes Provisorias</p>
                    <p className="text-xl font-bold text-yellow-700 dark:text-yellow-400">
                      {contracts.filter(c => c.patente_status === 'provisoria').length}
                    </p>
                  </div>
                  <FileText className="h-4 w-4 text-yellow-600" />
                </CardContent>
              </Card>

              <Card 
                className={`cursor-pointer hover:shadow-md transition-shadow border-gray-200 bg-gray-50 dark:bg-gray-950/20 ${cardFilter === 'sin_patente' ? 'ring-2 ring-gray-500' : ''}`}
                onClick={() => handleCardFilterClick('sin_patente')}
              >
                <CardContent className="p-3 flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium text-gray-700 dark:text-gray-400">Sin Patente</p>
                    <p className="text-xl font-bold text-gray-700 dark:text-gray-400">
                      {contracts.filter(c => !c.patente_status || c.patente_status === 'sin_patente').length}
                    </p>
                  </div>
                  <FileText className="h-4 w-4 text-gray-500" />
                </CardContent>
              </Card>

              <Card 
                className={`cursor-pointer hover:shadow-md transition-shadow border-red-200 bg-red-50 dark:bg-red-950/20 ${cardFilter === 'critical' ? 'ring-2 ring-red-500' : ''}`}
                onClick={() => handleCardFilterClick('critical')}
              >
                <CardContent className="p-3 flex items-center justify-between">
                  <div>
                    <p className="text-[10px] text-red-500 dark:text-red-400 uppercase tracking-wide">Documentación</p>
                    <p className="text-xs font-medium text-red-700 dark:text-red-400">Críticos</p>
                    <p className="text-xl font-bold text-red-700 dark:text-red-400">{stats.criticalContracts}</p>
                  </div>
                  <AlertTriangle className="h-4 w-4 text-red-600" />
                </CardContent>
              </Card>

              <Card 
                className={`cursor-pointer hover:shadow-md transition-shadow ${cardFilter === 'pending' ? 'ring-2 ring-yellow-500' : ''}`}
                onClick={() => handleCardFilterClick('pending')}
              >
                <CardContent className="p-3 flex items-center justify-between">
                  <div>
                    <p className="text-[10px] text-yellow-600 uppercase tracking-wide">Documentación</p>
                    <p className="text-xs font-medium">Docs Pendientes</p>
                    <p className="text-xl font-bold text-yellow-600">{stats.pendingCount}</p>
                  </div>
                  <FileText className="h-4 w-4 text-yellow-600" />
                </CardContent>
              </Card>

              <Card 
                className={`cursor-pointer hover:shadow-md transition-shadow border-red-200 bg-red-50 dark:bg-red-950/20 ${cardFilter === 'overdue' ? 'ring-2 ring-red-500' : ''}`}
                onClick={() => handleCardFilterClick('overdue')}
              >
                <CardContent className="p-3 flex items-center justify-between">
                  <div>
                    <p className="text-[10px] text-red-500 dark:text-red-400 uppercase tracking-wide">Documentación</p>
                    <p className="text-xs font-medium text-red-700 dark:text-red-400">Vencidos</p>
                    <p className="text-xl font-bold text-red-700 dark:text-red-400">{stats.overdueCount}</p>
                  </div>
                  <AlertTriangle className="h-4 w-4 text-red-600" />
                </CardContent>
              </Card>
            </div>

            {/* Tabs for List and Alerts */}
            <Tabs value={activeTab} onValueChange={v => setActiveTab(v as 'list' | 'alerts')}>
              <TabsList>
                <TabsTrigger value="list" className="gap-2">
                  <FileText className="h-4 w-4" />
                  Locales
                </TabsTrigger>
                <TabsTrigger value="alerts" className="gap-2">
                  <AlertTriangle className="h-4 w-4" />
                  Alertas Críticas
                </TabsTrigger>
              </TabsList>

              <TabsContent value="list" className="mt-4">
                <PatentsList contracts={contracts} onSelectContract={setSelectedContractId} cardFilter={cardFilter} onClearFilter={() => setCardFilter(null)} sections={sections} items={items} emitters={emitters} itemEmitters={itemEmitters} />
              </TabsContent>

              <TabsContent value="alerts" className="mt-4">
                <CriticalAlertsDashboard contracts={contracts} items={items} sections={sections} onNavigateToDocument={handleNavigateToDocument} onStatusChange={handleStatusChangeFromAlerts} />
              </TabsContent>
            </Tabs>
        </CardContent>
      </Card>;
}