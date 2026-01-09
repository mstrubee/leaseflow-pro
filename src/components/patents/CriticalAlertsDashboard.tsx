import { useState, useMemo } from "react";
import { useSingleCollapsible } from "@/hooks/useCollapsibleState";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { AlertTriangle, FileWarning, Clock, CalendarClock, Bell, ExternalLink, User, ChevronDown, ChevronRight } from "lucide-react";
import { differenceInDays, format } from "date-fns";
import { es } from "date-fns/locale";
import { ContractWithPatent, PatentChecklistItem, PatentDocStatus, PRIORITY_CONFIG, STATUS_CONFIG } from "./types";
import { PatentPriorityBadge } from "./PatentPriorityBadge";
import { PatentStatusBadge } from "./PatentStatusBadge";
interface CriticalDocument {
  contractId: string;
  contractName: string;
  region: string;
  priority: string;
  itemId: string;
  itemName: string;
  sectionName: string;
  status: PatentDocStatus;
  endDate?: string;
  daysRemaining?: number;
  responsible?: string;
}
interface CriticalAlertsDashboardProps {
  contracts: ContractWithPatent[];
  items: PatentChecklistItem[];
  sections: Array<{
    id: string;
    name: string;
  }>;
  onNavigateToDocument: (contractId: string, itemId: string) => void;
  onStatusChange: (contractId: string, itemId: string, status: PatentDocStatus) => void;
  overdueThreshold?: number;
}
export function CriticalAlertsDashboard({
  contracts,
  items,
  sections,
  onNavigateToDocument,
  onStatusChange,
  overdueThreshold = 30
}: CriticalAlertsDashboardProps) {
  const { isOpen: isTableOpen, setIsOpen: setIsTableOpen } = useSingleCollapsible("patents-critical-alerts", false);
  const today = new Date();

  // Calculate KPIs and critical documents
  const {
    kpis,
    criticalDocuments
  } = useMemo(() => {
    const criticalContracts = new Set<string>();
    let pendingCount = 0;
    let overdueCount = 0;
    let upcomingCount = 0;
    let activeAlertsCount = 0;
    const criticalDocs: CriticalDocument[] = [];
    contracts.forEach(contract => {
      const priority = contract.contract_patents?.priority || 'priority_3';
      const isCriticalPriority = priority === 'priority_1';
      const region = contract.contract_addresses?.[0]?.region || 'Sin región';
      (contract.patent_documents || []).forEach(doc => {
        if (doc.status === 'pendiente' || doc.status === 'en_curso') {
          const item = items.find(i => i.id === doc.checklist_item_id);
          const section = sections.find(s => s.id === item?.section_id);
          let daysRemaining: number | undefined;
          let isOverdue = false;
          let isUpcoming = false;
          if (doc.end_date) {
            daysRemaining = differenceInDays(new Date(doc.end_date), today);
            isOverdue = daysRemaining < 0;
            isUpcoming = daysRemaining >= 0 && daysRemaining <= overdueThreshold;
          }
          if (doc.status === 'pendiente') {
            pendingCount++;
            if (isOverdue) overdueCount++;
            if (isUpcoming) upcomingCount++;
          }

          // Consider critical if: overdue, upcoming, or from priority_1 contract
          if (isOverdue || isUpcoming || isCriticalPriority) {
            criticalContracts.add(contract.id);
            criticalDocs.push({
              contractId: contract.id,
              contractName: contract.name,
              region,
              priority,
              itemId: doc.checklist_item_id,
              itemName: item?.name || 'Documento',
              sectionName: section?.name || 'Sección',
              status: doc.status,
              endDate: doc.end_date,
              daysRemaining,
              responsible: doc.responsible
            });
          }
        }
      });
    });

    // Sort by criticality: overdue first, then by days remaining
    criticalDocs.sort((a, b) => {
      const aOverdue = (a.daysRemaining ?? 999) < 0;
      const bOverdue = (b.daysRemaining ?? 999) < 0;
      if (aOverdue !== bOverdue) return aOverdue ? -1 : 1;
      return (a.daysRemaining ?? 999) - (b.daysRemaining ?? 999);
    });
    return {
      kpis: {
        criticalContracts: criticalContracts.size,
        pendingCount,
        overdueCount,
        upcomingCount,
        activeAlertsCount
      },
      criticalDocuments: criticalDocs
    };
  }, [contracts, items, sections, overdueThreshold]);
  const getRowBgColor = (doc: CriticalDocument) => {
    if (doc.daysRemaining !== undefined && doc.daysRemaining < 0) {
      return 'bg-red-50 dark:bg-red-950/20';
    }
    if (doc.daysRemaining !== undefined && doc.daysRemaining <= 7) {
      return 'bg-orange-50 dark:bg-orange-950/20';
    }
    if (doc.daysRemaining !== undefined && doc.daysRemaining <= 30) {
      return 'bg-yellow-50 dark:bg-yellow-950/20';
    }
    return '';
  };
  return <div className="space-y-6">
      {/* KPIs */}
      <div className="grid gap-4 md:grid-cols-5">
        <Card className="cursor-pointer hover:shadow-md transition-shadow border-red-200 bg-red-50 dark:bg-red-950/20">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-red-700 dark:text-red-400">Locales Críticos</CardTitle>
            <AlertTriangle className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-700 dark:text-red-400">{kpis.criticalContracts}</div>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Docs Pendientes</CardTitle>
            <FileWarning className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{kpis.pendingCount}</div>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:shadow-md transition-shadow border-red-200 bg-red-50 dark:bg-red-950/20">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-red-700 dark:text-red-400">Docs Vencidos</CardTitle>
            <Clock className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-700 dark:text-red-400">{kpis.overdueCount}</div>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:shadow-md transition-shadow border-orange-200 bg-orange-50 dark:bg-orange-950/20">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-orange-700 dark:text-orange-400">Por Vencer (30d)</CardTitle>
            <CalendarClock className="h-4 w-4 text-orange-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-700 dark:text-orange-400">{kpis.upcomingCount}</div>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Alertas Activas</CardTitle>
            <Bell className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{kpis.activeAlertsCount}</div>
          </CardContent>
        </Card>
      </div>

      {/* Critical Documents Table */}
      <Card>
        <Collapsible open={isTableOpen} onOpenChange={setIsTableOpen}>
          <CardHeader className="py-3">
            <CollapsibleTrigger asChild>
              <Button variant="ghost" className="flex items-center gap-2 p-0 h-auto hover:bg-transparent w-full justify-start">
                {isTableOpen ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
                <CardTitle className="text-lg flex items-center gap-2">
                  Documentación
                  <AlertTriangle className="h-5 w-5 text-red-600" />
                  Alertas Críticas Activas
                </CardTitle>
              </Button>
            </CollapsibleTrigger>
          </CardHeader>
          <CollapsibleContent>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Local</TableHead>
                      <TableHead>Documento</TableHead>
                      <TableHead>Sección</TableHead>
                      <TableHead className="text-center">Estado</TableHead>
                      <TableHead>Fecha Término</TableHead>
                      <TableHead className="text-center">Días</TableHead>
                      <TableHead>Responsable</TableHead>
                      <TableHead className="text-right">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {criticalDocuments.map((doc, idx) => <TableRow key={`${doc.contractId}-${doc.itemId}-${idx}`} className={getRowBgColor(doc)}>
                        <TableCell>
                          <div>
                            <div className="font-medium">{doc.contractName}</div>
                            <div className="text-xs text-muted-foreground">{doc.region}</div>
                          </div>
                        </TableCell>
                        <TableCell className="font-medium">{doc.itemName}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{doc.sectionName}</TableCell>
                        <TableCell className="text-center">
                          <Select value={doc.status} onValueChange={v => onStatusChange(doc.contractId, doc.itemId, v as PatentDocStatus)}>
                            <SelectTrigger className="h-7 w-[110px]">
                              <PatentStatusBadge status={doc.status} size="sm" />
                            </SelectTrigger>
                            <SelectContent>
                              {Object.entries(STATUS_CONFIG).map(([key, config]) => <SelectItem key={key} value={key}>
                                  {config.label}
                                </SelectItem>)}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          {doc.endDate ? format(new Date(doc.endDate), 'dd/MM/yyyy', {
                        locale: es
                      }) : '-'}
                        </TableCell>
                        <TableCell className="text-center">
                          {doc.daysRemaining !== undefined ? <span className={doc.daysRemaining < 0 ? 'text-red-700 font-bold' : doc.daysRemaining <= 7 ? 'text-orange-600 font-medium' : 'text-yellow-600'}>
                              {doc.daysRemaining < 0 ? `${Math.abs(doc.daysRemaining)} atraso` : doc.daysRemaining}
                            </span> : '-'}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <User className="h-3 w-3 text-muted-foreground" />
                            <span className="text-sm">{doc.responsible || '-'}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="sm" onClick={() => onNavigateToDocument(doc.contractId, doc.itemId)}>
                            <ExternalLink className="h-3 w-3 mr-1" />
                            Ver
                          </Button>
                        </TableCell>
                      </TableRow>)}
                    {criticalDocuments.length === 0 && <TableRow>
                        <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                          No hay documentos críticos en este momento
                        </TableCell>
                      </TableRow>}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </CollapsibleContent>
        </Collapsible>
      </Card>

      {/* Legend */}
      <div className="flex gap-4 text-sm text-muted-foreground">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-red-100 dark:bg-red-950/40" />
          <span>Vencido</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-orange-100 dark:bg-orange-950/40" />
          <span>Próximo a vencer (≤7 días)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-yellow-100 dark:bg-yellow-950/40" />
          <span>Por vencer (≤30 días)</span>
        </div>
      </div>
    </div>;
}