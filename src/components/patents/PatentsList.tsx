import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, ArrowUpDown, Eye, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ContractWithPatent, PatentPriority, PatentDocStatus, PRIORITY_CONFIG } from "./types";
import { PatentPriorityBadge } from "./PatentPriorityBadge";
interface PatentsListProps {
  contracts: ContractWithPatent[];
  onSelectContract: (contractId: string) => void;
  cardFilter?: string | null;
  onClearFilter?: () => void;
}
type SortField = "priority" | "name" | "criticality";
type SortOrder = "asc" | "desc";
export function PatentsList({
  contracts,
  onSelectContract,
  cardFilter,
  onClearFilter
}: PatentsListProps) {
  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState<SortField>("priority");
  const [sortOrder, setSortOrder] = useState<SortOrder>("asc");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // Calculate criticality for a contract
  const getCriticality = (contract: ContractWithPatent): number => {
    const docs = contract.patent_documents || [];
    const pendingCount = docs.filter(d => d.status === 'pendiente').length;
    const today = new Date();
    const overdueCount = docs.filter(d => d.status === 'pendiente' && d.end_date && new Date(d.end_date) < today).length;
    return overdueCount * 10 + pendingCount;
  };
  const priorityOrder: PatentPriority[] = ['priority_1', 'priority_2', 'priority_3', 'vigente'];
  
  const filteredAndSorted = useMemo(() => {
    let result = [...contracts];
    const today = new Date();

    // Apply card filter first
    if (cardFilter) {
      if (cardFilter === 'definitiva') {
        result = result.filter(c => c.patente_status === 'definitiva');
      } else if (cardFilter === 'provisoria') {
        result = result.filter(c => c.patente_status === 'provisoria');
      } else if (cardFilter === 'sin_patente') {
        result = result.filter(c => !c.patente_status || c.patente_status === 'sin_patente');
      } else if (cardFilter === 'critical') {
        // Contracts with overdue docs or high priority with pending docs
        result = result.filter(c => {
          const docs = c.patent_documents || [];
          const hasOverdue = docs.some(d => d.status === 'pendiente' && d.end_date && new Date(d.end_date) < today);
          const priority = c.contract_patents?.priority || 'priority_3';
          const hasPending = docs.some(d => d.status === 'pendiente');
          return hasOverdue || (priority === 'priority_1' && hasPending);
        });
      } else if (cardFilter === 'pending') {
        result = result.filter(c => (c.patent_documents || []).some(d => d.status === 'pendiente'));
      } else if (cardFilter === 'overdue') {
        result = result.filter(c => (c.patent_documents || []).some(d => d.status === 'pendiente' && d.end_date && new Date(d.end_date) < today));
      }
      // 'all' shows everything, no filter needed
    }

    // Filter by search
    if (search) {
      const lower = search.toLowerCase();
      result = result.filter(c => c.name.toLowerCase().includes(lower));
    }

    // Filter by priority
    if (priorityFilter !== "all") {
      result = result.filter(c => (c.contract_patents?.priority || 'priority_3') === priorityFilter);
    }

    // Filter by document status
    if (statusFilter !== "all") {
      result = result.filter(c => (c.patent_documents || []).some(d => d.status === statusFilter));
    }

    // Sort
    result.sort((a, b) => {
      let comparison = 0;
      if (sortField === "priority") {
        const aPriority = a.contract_patents?.priority || 'priority_3';
        const bPriority = b.contract_patents?.priority || 'priority_3';
        comparison = priorityOrder.indexOf(aPriority) - priorityOrder.indexOf(bPriority);
      } else if (sortField === "name") {
        comparison = a.name.localeCompare(b.name);
      } else if (sortField === "criticality") {
        comparison = getCriticality(b) - getCriticality(a);
      }
      return sortOrder === "asc" ? comparison : -comparison;
    });
    return result;
  }, [contracts, search, sortField, sortOrder, priorityFilter, statusFilter, cardFilter]);
  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(prev => prev === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortOrder("asc");
    }
  };
  const getCardFilterLabel = (filter: string | null | undefined): string => {
    const labels: Record<string, string> = {
      'all': 'Todos los Locales',
      'definitiva': 'Patentes Definitivas',
      'provisoria': 'Patentes Provisorias',
      'sin_patente': 'Sin Patente',
      'critical': 'Críticos',
      'pending': 'Docs Pendientes',
      'overdue': 'Vencidos'
    };
    return filter ? labels[filter] || filter : '';
  };

  return <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-lg">Prioridades</CardTitle>
        {cardFilter && (
          <Badge variant="secondary" className="gap-1 text-xs">
            Filtro: {getCardFilterLabel(cardFilter)}
            <button onClick={onClearFilter} className="ml-1 hover:text-destructive">
              <X className="h-3 w-3" />
            </button>
          </Badge>
        )}
      </CardHeader>
      <CardContent className="space-y-1">
        {/* Filters */}
        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar local..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
          </div>
          
          <Select value={priorityFilter} onValueChange={setPriorityFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Filtrar por prioridad" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas las prioridades</SelectItem>
              {Object.entries(PRIORITY_CONFIG).map(([key, config]) => <SelectItem key={key} value={key}>{config.label}</SelectItem>)}
            </SelectContent>
          </Select>

          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Filtrar por estado" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los estados</SelectItem>
              <SelectItem value="pendiente">Pendiente</SelectItem>
              <SelectItem value="en_curso">En Curso</SelectItem>
              <SelectItem value="ok">Ok</SelectItem>
              <SelectItem value="nuevo_doc">Nuevo Doc</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Sort buttons */}
        <div className="flex gap-2">
          <Button variant={sortField === "priority" ? "default" : "outline"} size="sm" onClick={() => toggleSort("priority")} className="gap-1">
            Prioridad
            <ArrowUpDown className="h-3 w-3" />
          </Button>
          <Button variant={sortField === "name" ? "default" : "outline"} size="sm" onClick={() => toggleSort("name")} className="gap-1">
            Nombre
            <ArrowUpDown className="h-3 w-3" />
          </Button>
          <Button variant={sortField === "criticality" ? "default" : "outline"} size="sm" onClick={() => toggleSort("criticality")} className="gap-1">
            Criticidad
            <ArrowUpDown className="h-3 w-3" />
          </Button>
        </div>

        {/* Table */}
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Local</TableHead>
              <TableHead>Región</TableHead>
              <TableHead className="text-center">Prioridad</TableHead>
              <TableHead className="text-center">Docs Pendientes</TableHead>
              <TableHead className="text-center">Vencidos</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredAndSorted.map(contract => {
            const priority = contract.contract_patents?.priority || 'priority_3';
            const docs = contract.patent_documents || [];
            const pendingCount = docs.filter(d => d.status === 'pendiente').length;
            const today = new Date();
            const overdueCount = docs.filter(d => d.status === 'pendiente' && d.end_date && new Date(d.end_date) < today).length;
            const region = contract.contract_addresses?.[0]?.region || 'Sin región';
            return <TableRow key={contract.id}>
                  <TableCell className="font-medium">{contract.name}</TableCell>
                  <TableCell className="text-muted-foreground">{region}</TableCell>
                  <TableCell className="text-center">
                    <PatentPriorityBadge priority={priority} />
                  </TableCell>
                  <TableCell className="text-center">
                    {pendingCount > 0 ? <span className="text-yellow-600 font-medium">{pendingCount}</span> : <span className="text-green-600">0</span>}
                  </TableCell>
                  <TableCell className="text-center">
                    {overdueCount > 0 ? <span className="text-red-600 font-medium">{overdueCount}</span> : <span className="text-green-600">0</span>}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" onClick={() => onSelectContract(contract.id)}>
                      <Eye className="h-4 w-4 mr-1" />
                      Ver detalle
                    </Button>
                  </TableCell>
                </TableRow>;
          })}
            {filteredAndSorted.length === 0 && <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                  No hay locales que coincidan con los filtros
                </TableCell>
              </TableRow>}
          </TableBody>
        </Table>
      </CardContent>
    </Card>;
}