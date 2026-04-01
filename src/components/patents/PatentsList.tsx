import { useState, useMemo } from "react";
import { CompanyLogo } from "@/components/contracts/CompanyLogo";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Search, ArrowUpDown, Eye, X, Download, Loader2, FileText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ContractWithPatent, PatentPriority, PRIORITY_CONFIG } from "./types";
import { PatentPriorityBadge } from "./PatentPriorityBadge";
import { toast } from "sonner";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import logosHeader from "@/assets/logos-header.png";

interface ContractCompany {
  companies?: {
    name: string;
  };
}
interface PatentsListProps {
  contracts: ContractWithPatent[];
  onSelectContract: (contractId: string) => void;
  cardFilter?: string | null;
  onClearFilter?: () => void;
}
type SortField = "priority" | "name" | "criticality";
type SortOrder = "asc" | "desc";

// Helper to get company names from contract
const getCompanyNames = (contract: ContractWithPatent): string[] => {
  const companies = (contract as any).contract_companies as ContractCompany[] | undefined;
  if (companies && companies.length > 0) {
    return companies
      .map(c => c.companies?.name)
      .filter((name): name is string => !!name);
  }
  return [];
};

export function PatentsList({
  contracts,
  onSelectContract,
  cardFilter,
  onClearFilter,
}: PatentsListProps) {
  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState<SortField>("priority");
  const [sortOrder, setSortOrder] = useState<SortOrder>("asc");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [companyFilter, setCompanyFilter] = useState<string>("all");
  const [communeFilter, setCommuneFilter] = useState<string>("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [exporting, setExporting] = useState(false);

  // Extract unique companies and communes for filters
  const { uniqueCompanies, uniqueCommunes } = useMemo(() => {
    const companies = new Set<string>();
    const communes = new Set<string>();
    
    contracts.forEach(contract => {
      const names = getCompanyNames(contract);
      names.forEach(name => companies.add(name));
      const commune = contract.contract_addresses?.[0]?.commune;
      if (commune) {
        communes.add(commune);
      }
    });
    
    return {
      uniqueCompanies: Array.from(companies).sort(),
      uniqueCommunes: Array.from(communes).sort()
    };
  }, [contracts]);

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
          return hasOverdue || priority === 'priority_1' && hasPending;
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
      result = result.filter(c => 
        c.name.toLowerCase().includes(lower) || 
        (c.cebe && c.cebe.toLowerCase().includes(lower)) ||
        (c.codigo && c.codigo.toLowerCase().includes(lower))
      );
    }

    // Filter by priority
    if (priorityFilter !== "all") {
      result = result.filter(c => (c.contract_patents?.priority || 'priority_3') === priorityFilter);
    }

    // Filter by document status
    if (statusFilter !== "all") {
      result = result.filter(c => (c.patent_documents || []).some(d => d.status === statusFilter));
    }

    // Filter by company
    if (companyFilter !== "all") {
      result = result.filter(c => getCompanyNames(c).includes(companyFilter));
    }

    // Filter by commune
    if (communeFilter !== "all") {
      result = result.filter(c => (c.contract_addresses?.[0]?.commune || '') === communeFilter);
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
  }, [contracts, search, sortField, sortOrder, priorityFilter, statusFilter, companyFilter, communeFilter, cardFilter]);
  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(prev => prev === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortOrder("asc");
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredAndSorted.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredAndSorted.map(c => c.id)));
    }
  };

  const generateContractPDF = async (contract: ContractWithPatent) => {
    const doc = new jsPDF({ orientation: 'landscape' });
    const today = new Date().toLocaleDateString('es-CL');

    try {
      const logoImg = new Image();
      logoImg.src = logosHeader;
      await new Promise((resolve, reject) => { logoImg.onload = resolve; logoImg.onerror = reject; });
      doc.addImage(logoImg, 'PNG', 14, 10, 50, 20);
    } catch {}

    doc.setFontSize(18);
    doc.text('Ficha de Patente', 70, 20);
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text('Generado: ' + today, 70, 28);
    doc.setTextColor(0);

    const companyNames = getCompanyNames(contract);
    const addr = contract.contract_addresses?.[0];
    const address = addr ? `${addr.street || ''} ${addr.number || ''}, ${addr.commune || ''}`.trim() : 'Sin dirección';
    const priority = contract.contract_patents?.priority || 'priority_3';

    const headers = ['Local', 'Empresa', 'Dirección', 'Prioridad', 'Comentarios', 'Próximas Acciones'];
    const row = [
      contract.name,
      companyNames.join(', ') || 'Sin Empresa',
      address,
      PRIORITY_CONFIG[priority]?.label || 'Sin Asignar',
      contract.contract_patents?.comments || '-',
      contract.contract_patents?.next_actions || '-',
    ];

    autoTable(doc, {
      startY: 40,
      head: [headers],
      body: [row],
      theme: 'grid',
      headStyles: { fillColor: [220, 38, 38] },
      margin: { left: 14, right: 14 },
      columnStyles: {
        4: { cellWidth: 65 },
        5: { cellWidth: 65 },
      },
      styles: { fontSize: 7, cellPadding: 3, overflow: 'linebreak' },
      bodyStyles: { valign: 'top' },
    });

    return doc;
  };

  const handleExportSelectedPDF = async () => {
    if (selectedIds.size === 0) return;
    setExporting(true);
    try {
      const selected = filteredAndSorted.filter(c => selectedIds.has(c.id));
      if (selected.length === 1) {
        const doc = await generateContractPDF(selected[0]);
        const safeName = selected[0].name.replace(/[^a-zA-Z0-9áéíóúñÁÉÍÓÚÑ\s-]/g, '').trim().replace(/\s+/g, '-');
        doc.save(`patente-${safeName}.pdf`);
      } else {
        // Consolidated PDF with all selected
        const doc = new jsPDF({ orientation: 'landscape' });
        const today = new Date().toLocaleDateString('es-CL');

        try {
          const logoImg = new Image();
          logoImg.src = logosHeader;
          await new Promise((resolve, reject) => { logoImg.onload = resolve; logoImg.onerror = reject; });
          doc.addImage(logoImg, 'PNG', 14, 10, 50, 20);
        } catch {}

        doc.setFontSize(18);
        doc.text('Informe de Patentes', 70, 20);
        doc.setFontSize(10);
        doc.setTextColor(100);
        doc.text(`Generado: ${today} — ${selected.length} locales`, 70, 28);
        doc.setTextColor(0);

        const headers = ['Local', 'Empresa', 'Dirección', 'Prioridad', 'Comentarios', 'Próximas Acciones'];
        const rows = selected.map(c => {
          const names = getCompanyNames(c);
          const addr = c.contract_addresses?.[0];
          const address = addr ? `${addr.street || ''} ${addr.number || ''}, ${addr.commune || ''}`.trim() : 'Sin dirección';
          const pri = c.contract_patents?.priority || 'priority_3';
          return [
            c.name,
            names.join(', ') || 'Sin Empresa',
            address,
            PRIORITY_CONFIG[pri]?.label || 'Sin Asignar',
            c.contract_patents?.comments || '-',
            c.contract_patents?.next_actions || '-',
          ];
        });

        autoTable(doc, {
          startY: 40,
          head: [headers],
          body: rows,
          theme: 'grid',
          headStyles: { fillColor: [220, 38, 38] },
          margin: { left: 14, right: 14 },
          columnStyles: {
            4: { cellWidth: 65 },
            5: { cellWidth: 65 },
          },
          styles: { fontSize: 6.4, cellPadding: 3, overflow: 'linebreak' },
          bodyStyles: { valign: 'top' },
        });

        doc.save(`informe-patentes-${today.replace(/\//g, '-')}.pdf`);
      }
      toast.success(`PDF generado con ${selected.length} local(es)`);
    } catch (err) {
      toast.error("Error al generar PDF");
    } finally {
      setExporting(false);
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
        <CardHeader className="flex flex-row items-center justify-between py-3">
          <div className="flex items-center gap-3">
            <CardTitle className="text-lg">Locales</CardTitle>
            {cardFilter && <Badge variant="secondary" className="gap-1 text-xs">
                Filtro: {getCardFilterLabel(cardFilter)}
                <button onClick={onClearFilter} className="ml-1 hover:text-destructive">
                  <X className="h-3 w-3" />
                </button>
              </Badge>}
          </div>
          {selectedIds.size > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">{selectedIds.size} seleccionado(s)</span>
              <Button variant="outline" size="sm" className="gap-1" onClick={handleExportSelectedPDF} disabled={exporting}>
                {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                Descargar PDF
              </Button>
            </div>
          )}
        </CardHeader>
        <CardContent className="space-y-1">
            {/* Filters */}
            <div className="flex flex-wrap gap-3">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Buscar Local, CEBE o Código" value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
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

              <Select value={companyFilter} onValueChange={setCompanyFilter}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Filtrar por empresa" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas las empresas</SelectItem>
                  {uniqueCompanies.map(company => (
                    <SelectItem key={company} value={company}>{company}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={communeFilter} onValueChange={setCommuneFilter}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Filtrar por comuna" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas las comunas</SelectItem>
                  {uniqueCommunes.map(commune => (
                    <SelectItem key={commune} value={commune}>{commune}</SelectItem>
                  ))}
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
                  <TableHead className="w-10">
                    <Checkbox
                      checked={filteredAndSorted.length > 0 && selectedIds.size === filteredAndSorted.length}
                      onCheckedChange={toggleSelectAll}
                    />
                  </TableHead>
                  <TableHead>Empresa</TableHead>
                  <TableHead>Local</TableHead>
                  <TableHead>Dirección</TableHead>
                  <TableHead>Comuna</TableHead>
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
                const commune = contract.contract_addresses?.[0]?.commune || 'Sin comuna';
                const address = contract.contract_addresses?.[0];
                const fullAddress = address 
                  ? `${address.street || ''}${address.number ? ' ' + address.number : ''}`.trim() || 'Sin dirección'
                  : 'Sin dirección';
                const companyNames = getCompanyNames(contract);
                return <TableRow key={contract.id} className="cursor-pointer hover:bg-muted/50">
                      <TableCell onClick={e => e.stopPropagation()}>
                        <Checkbox
                          checked={selectedIds.has(contract.id)}
                          onCheckedChange={() => toggleSelect(contract.id)}
                        />
                      </TableCell>
                      <TableCell className="text-muted-foreground" onClick={() => onSelectContract(contract.id)}>
                        {companyNames.length > 0 ? (
                          <div className="flex items-center gap-2">
                            <CompanyLogo companyNames={companyNames} size="sm" />
                            <div className="flex flex-col">
                              {companyNames.map((name, idx) => (
                                <span key={idx}>{name}</span>
                              ))}
                            </div>
                          </div>
                        ) : (
                          'Sin empresa'
                        )}
                      </TableCell>
                      <TableCell className="font-medium" onClick={() => onSelectContract(contract.id)}>
                        <div>{contract.name}</div>
                        {(contract.cebe || contract.codigo) && (
                          <div className="text-xs text-muted-foreground mt-0.5">
                            {[contract.cebe, contract.codigo].filter(Boolean).join(' • ')}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm" onClick={() => onSelectContract(contract.id)}>{fullAddress}</TableCell>
                      <TableCell className="text-muted-foreground" onClick={() => onSelectContract(contract.id)}>{commune}</TableCell>
                      <TableCell className="text-muted-foreground" onClick={() => onSelectContract(contract.id)}>{region}</TableCell>
                      <TableCell className="text-center" onClick={() => onSelectContract(contract.id)}>
                        <PatentPriorityBadge priority={priority} />
                      </TableCell>
                      <TableCell className="text-center" onClick={() => onSelectContract(contract.id)}>
                        {pendingCount > 0 ? <span className="text-yellow-600 font-medium">{pendingCount}</span> : <span className="text-green-600">0</span>}
                      </TableCell>
                      <TableCell className="text-center" onClick={() => onSelectContract(contract.id)}>
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
                    <TableCell colSpan={10} className="text-center text-muted-foreground py-8">
                      No hay locales que coincidan con los filtros
                    </TableCell>
                  </TableRow>}
              </TableBody>
            </Table>
        </CardContent>
      </Card>;
}