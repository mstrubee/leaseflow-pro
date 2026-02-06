import { useState, useEffect, useMemo } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ArrowLeft, FileText, Building2, CheckCircle2, AlertTriangle, Clock, XCircle, FileCheck, ExternalLink, ChevronDown, ChevronUp, ChevronRight, X, Download, Filter, MessageSquare, ArrowUpDown, Settings2, Check } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { MaintenanceReports } from "@/components/maintenance/MaintenanceReports";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";
import { PRIORITY_CONFIG, PatentPriority } from "@/components/patents/types";
import { useSingleCollapsible } from "@/hooks/useCollapsibleState";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import logosHeader from "@/assets/logos-header.png";

interface ContractPatentData {
  id: string;
  name: string;
  patente_status: string | null;
  contract_companies: Array<{ companies: { name: string } | null }>;
  contract_patents: { 
    priority: PatentPriority; 
    comments?: string | null;
    next_actions?: string | null;
  } | null;
  patent_documents: Array<{
    id: string;
    status: string;
    end_date: string | null;
  }>;
  contract_addresses?: Array<{ street?: string; number?: string; commune?: string }>;
}

interface Company {
  id: string;
  name: string;
}

interface PatentStatus {
  code: string;
  name: string;
  bg_color: string;
  text_color: string;
}

interface CompanyStats {
  companyId: string;
  companyName: string;
  totalContracts: number;
  byPatenteStatus: Record<string, number>;
  byPriority: Record<string, number>;
  pendingDocs: number;
  overdueDocs: number;
  okDocs: number;
}

interface ChartFilter {
  type: "patente_status" | "priority" | "card";
  value: string;
  label: string;
}

const ReportsDashboard = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, loading: authLoading } = useAuth();
  const [contracts, setContracts] = useState<ContractPatentData[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [patentStatuses, setPatentStatuses] = useState<PatentStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedCompanies, setExpandedCompanies] = useState<Set<string>>(new Set());
  const [chartFilter, setChartFilter] = useState<ChartFilter | null>(null);
  
  // Collapsible state for main section
  const { isOpen: isPatentSectionOpen, setIsOpen: setPatentSectionOpen } = useSingleCollapsible(
    "reports-patent-section",
    true
  );
  
  // Collapsible state for "Sin Patente" sub-section
  const { isOpen: isSinPatenteSectionOpen, setIsOpen: setSinPatenteSectionOpen } = useSingleCollapsible(
    "reports-sin-patente-section",
    false
  );
  
  // Filter for "Sin Patente" section
  const [sinPatenteStatusFilter, setSinPatenteStatusFilter] = useState<string>("all");
  
  // Sorting for "Sin Patente" section
  const [sinPatenteSortField, setSinPatenteSortField] = useState<"empresa" | "prioridad" | null>(null);
  const [sinPatenteSortOrder, setSinPatenteSortOrder] = useState<"asc" | "desc">("asc");
  
  // Column selection for PDF export
  const [showPdfColumnSelector, setShowPdfColumnSelector] = useState(false);
  const [selectedPdfColumns, setSelectedPdfColumns] = useState<string[]>([
    "local", "empresa", "direccion", "prioridad", "comentarios", "proximas_acciones"
  ]);
  
  const availablePdfColumns = [
    { key: "local", label: "Local" },
    { key: "empresa", label: "Empresa" },
    { key: "direccion", label: "Dirección" },
    { key: "prioridad", label: "Prioridad" },
    { key: "comentarios", label: "Comentarios" },
    { key: "proximas_acciones", label: "Próximas Acciones" },
  ];

  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/auth");
    }
  }, [authLoading, user, navigate]);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        const [contractsRes, companiesRes, statusesRes] = await Promise.all([
          supabase
            .from("contracts")
            .select(`
              id,
              name,
              patente_status,
              contract_companies (companies (name)),
              contract_patents (priority, comments, next_actions),
              patent_documents (id, status, end_date),
              contract_addresses (street, number, commune)
            `)
            .eq("status", "firmado")
            .is("deleted_at", null),
          supabase
            .from("companies")
            .select("id, name")
            .order("name"),
          supabase
            .from("patent_statuses")
            .select("code, name, bg_color, text_color")
            .eq("is_active", true)
            .order("display_order")
        ]);

        setContracts((contractsRes.data as any[]) || []);
        setCompanies(companiesRes.data || []);
        setPatentStatuses(statusesRes.data || []);
      } catch (error) {
        console.error("Error loading report data:", error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  // Calculate general statistics
  const generalStats = useMemo(() => {
    const today = new Date();
    let totalContracts = contracts.length;
    let definitiveCount = 0;
    let provisionalCount = 0;
    let noPatentCount = 0;
    let pendingDocs = 0;
    let overdueDocs = 0;
    let okDocs = 0;
    
    const byPriority: Record<string, number> = {
      priority_1: 0,
      priority_2: 0,
      priority_3: 0,
      vigente: 0,
      sin_asignar: 0,
    };

    contracts.forEach(contract => {
      // By patente_status
      if (contract.patente_status === "definitiva") definitiveCount++;
      else if (contract.patente_status === "provisoria") provisionalCount++;
      else if (contract.patente_status === "sin_patente") noPatentCount++;

      // By priority
      const priority = contract.contract_patents?.priority;
      if (priority) {
        byPriority[priority] = (byPriority[priority] || 0) + 1;
      } else {
        byPriority.sin_asignar++;
      }

      // Document stats
      (contract.patent_documents || []).forEach(doc => {
        if (doc.status === "ok") {
          okDocs++;
        } else if (doc.status === "pendiente") {
          pendingDocs++;
          if (doc.end_date && new Date(doc.end_date) < today) {
            overdueDocs++;
          }
        }
      });
    });

    return {
      totalContracts,
      definitiveCount,
      provisionalCount,
      noPatentCount,
      byPriority,
      pendingDocs,
      overdueDocs,
      okDocs,
    };
  }, [contracts]);

  // Calculate statistics by company
  const companyStats = useMemo((): CompanyStats[] => {
    const today = new Date();
    const statsMap = new Map<string, CompanyStats>();

    // Initialize with all companies
    companies.forEach(company => {
      statsMap.set(company.name, {
        companyId: company.id,
        companyName: company.name,
        totalContracts: 0,
        byPatenteStatus: {},
        byPriority: {},
        pendingDocs: 0,
        overdueDocs: 0,
        okDocs: 0,
      });
    });

    // Add "Sin Empresa" for contracts without company
    statsMap.set("Sin Empresa", {
      companyId: "none",
      companyName: "Sin Empresa",
      totalContracts: 0,
      byPatenteStatus: {},
      byPriority: {},
      pendingDocs: 0,
      overdueDocs: 0,
      okDocs: 0,
    });

    contracts.forEach(contract => {
      const companyName = contract.contract_companies?.[0]?.companies?.name || "Sin Empresa";
      const stats = statsMap.get(companyName);
      if (!stats) return;

      stats.totalContracts++;

      // By patente_status
      const patenteStatus = contract.patente_status || "sin_asignar";
      stats.byPatenteStatus[patenteStatus] = (stats.byPatenteStatus[patenteStatus] || 0) + 1;

      // By priority
      const priority = contract.contract_patents?.priority || "sin_asignar";
      stats.byPriority[priority] = (stats.byPriority[priority] || 0) + 1;

      // Document stats
      (contract.patent_documents || []).forEach(doc => {
        if (doc.status === "ok") {
          stats.okDocs++;
        } else if (doc.status === "pendiente") {
          stats.pendingDocs++;
          if (doc.end_date && new Date(doc.end_date) < today) {
            stats.overdueDocs++;
          }
        }
      });
    });

    // Filter out companies with no contracts and sort by total
    return Array.from(statsMap.values())
      .filter(s => s.totalContracts > 0)
      .sort((a, b) => b.totalContracts - a.totalContracts);
  }, [contracts, companies]);

  // Filter contracts based on chart or card selection
  const filteredContracts = useMemo(() => {
    if (!chartFilter) return [];
    
    const today = new Date();
    
    return contracts.filter(contract => {
      if (chartFilter.type === "patente_status") {
        const status = contract.patente_status || "sin_asignar";
        return status === chartFilter.value || 
          (chartFilter.value === "sin_asignar" && !contract.patente_status);
      } else if (chartFilter.type === "priority") {
        const priority = contract.contract_patents?.priority || "sin_asignar";
        return priority === chartFilter.value;
      } else if (chartFilter.type === "card") {
        switch (chartFilter.value) {
          case "all":
            return true;
          case "definitiva":
            return contract.patente_status === "definitiva";
          case "provisoria":
            return contract.patente_status === "provisoria";
          case "sin_patente":
            return !contract.patente_status || contract.patente_status === "sin_patente";
          case "docs_ok":
            return (contract.patent_documents || []).some(d => d.status === "ok");
          case "pending":
            return (contract.patent_documents || []).some(d => d.status === "pendiente");
          case "overdue":
            return (contract.patent_documents || []).some(d => 
              d.status === "pendiente" && d.end_date && new Date(d.end_date) < today
            );
          default:
            return false;
        }
      }
      return false;
    });
  }, [contracts, chartFilter]);

  // Chart data for patente status
  const patenteStatusChartData = useMemo(() => [
    { name: "Definitiva", value: generalStats.definitiveCount, color: "hsl(142, 71%, 45%)", filterValue: "definitiva" },
    { name: "Provisoria", value: generalStats.provisionalCount, color: "hsl(48, 96%, 53%)", filterValue: "provisoria" },
    { name: "Sin Patente", value: generalStats.noPatentCount, color: "hsl(0, 84%, 60%)", filterValue: "sin_patente" },
    { name: "Sin Asignar", value: generalStats.totalContracts - generalStats.definitiveCount - generalStats.provisionalCount - generalStats.noPatentCount, color: "hsl(220, 9%, 46%)", filterValue: "sin_asignar" },
  ].filter(d => d.value > 0), [generalStats]);

  // Chart data for priority
  const priorityChartData = useMemo(() => 
    Object.entries(generalStats.byPriority)
      .filter(([_, value]) => value > 0)
      .map(([key, value]) => ({
        name: key === "sin_asignar" ? "Sin Asignar" : PRIORITY_CONFIG[key as PatentPriority]?.label || key,
        value,
        color: key === "sin_asignar" ? "hsl(220, 9%, 46%)" : PRIORITY_CONFIG[key as PatentPriority]?.color || "hsl(220, 9%, 46%)",
        filterValue: key,
      }))
  , [generalStats]);

  const toggleCompany = (companyName: string) => {
    setExpandedCompanies(prev => {
      const next = new Set(prev);
      if (next.has(companyName)) {
        next.delete(companyName);
      } else {
        next.add(companyName);
      }
      return next;
    });
  };

  const getPatenteStatusLabel = (status: string) => {
    const statusMap: Record<string, string> = {
      definitiva: "Definitiva",
      provisoria: "Provisoria",
      sin_patente: "Sin Patente",
      sin_asignar: "Sin Asignar",
    };
    return statusMap[status] || status;
  };

  const handlePatenteStatusClick = (data: any) => {
    if (data && data.filterValue) {
      setChartFilter({
        type: "patente_status",
        value: data.filterValue,
        label: data.name,
      });
    }
  };

  const handlePriorityClick = (data: any) => {
    if (data && data.filterValue) {
      setChartFilter({
        type: "priority",
        value: data.filterValue,
        label: data.name,
      });
    }
  };

  const handleNavigateToPatent = (contractId: string) => {
    // Store return URL and navigate to Dashboard with patent module focused on this contract
    sessionStorage.setItem("reports_return_url", location.pathname + location.search);
    navigate(`/?contractId=${contractId}`);
  };

  // Handle card clicks for filtering
  const handleCardClick = (filterType: string, label: string) => {
    if (chartFilter?.type === "card" && chartFilter.value === filterType) {
      // Clear filter if clicking same card
      setChartFilter(null);
    } else {
      setChartFilter({
        type: "card",
        value: filterType,
        label,
      });
    }
  };

  const clearFilter = () => {
    setChartFilter(null);
  };

  // Get "Sin Patente" contracts with optional priority filter and sorting
  const sinPatenteContracts = useMemo(() => {
    let sinPatente = contracts.filter(c => 
      !c.patente_status || c.patente_status === "sin_patente"
    );
    
    // Apply priority filter
    if (sinPatenteStatusFilter !== "all") {
      sinPatente = sinPatente.filter(c => {
        const priority = c.contract_patents?.priority;
        if (sinPatenteStatusFilter === "sin_asignar") {
          return !priority;
        }
        return priority === sinPatenteStatusFilter;
      });
    }
    
    // Apply sorting
    if (sinPatenteSortField) {
      sinPatente.sort((a, b) => {
        let valA: string;
        let valB: string;
        
        if (sinPatenteSortField === "empresa") {
          valA = a.contract_companies?.map(cc => cc.companies?.name).filter(Boolean).join(', ') || "ZZZ";
          valB = b.contract_companies?.map(cc => cc.companies?.name).filter(Boolean).join(', ') || "ZZZ";
        } else {
          // priority order: priority_1 < priority_2 < priority_3 < vigente < sin_asignar
          const priorityOrder: Record<string, number> = {
            priority_1: 1,
            priority_2: 2,
            priority_3: 3,
            vigente: 4,
            sin_asignar: 5,
          };
          valA = String(priorityOrder[a.contract_patents?.priority || "sin_asignar"] || 5);
          valB = String(priorityOrder[b.contract_patents?.priority || "sin_asignar"] || 5);
        }
        
        const comparison = valA.localeCompare(valB);
        return sinPatenteSortOrder === "asc" ? comparison : -comparison;
      });
    }
    
    return sinPatente;
  }, [contracts, sinPatenteStatusFilter, sinPatenteSortField, sinPatenteSortOrder]);

  // Toggle sort for sin patente table
  const handleSinPatenteSort = (field: "empresa" | "prioridad") => {
    if (sinPatenteSortField === field) {
      setSinPatenteSortOrder(prev => prev === "asc" ? "desc" : "asc");
    } else {
      setSinPatenteSortField(field);
      setSinPatenteSortOrder("asc");
    }
  };

  // Export PDF function for Sin Patente section (respects current filter, sort, and column selection)
  const exportSinPatentePDF = async () => {
    const doc = new jsPDF({ orientation: 'landscape' });
    const today = new Date().toLocaleDateString('es-CL');
    
    // Add logo
    try {
      const logoImg = new Image();
      logoImg.src = logosHeader;
      await new Promise((resolve, reject) => {
        logoImg.onload = resolve;
        logoImg.onerror = reject;
      });
      doc.addImage(logoImg, 'PNG', 14, 10, 50, 20);
    } catch (error) {
      console.log('Error loading logo:', error);
    }
    
    // Title
    doc.setFontSize(18);
    doc.text('Detalle: Locales Sin Patente', 70, 20);
    doc.setFontSize(10);
    doc.setTextColor(100);
    
    // Show current filter and sort in PDF - using plain text
    let subtitleParts: string[] = [];
    subtitleParts.push('Generado: ' + today);
    if (sinPatenteStatusFilter !== "all") {
      const filterLabel = sinPatenteStatusFilter === "sin_asignar" 
        ? "Sin Asignar" 
        : PRIORITY_CONFIG[sinPatenteStatusFilter as PatentPriority]?.label || sinPatenteStatusFilter;
      subtitleParts.push('Filtro: ' + filterLabel);
    }
    if (sinPatenteSortField) {
      const sortLabel = sinPatenteSortField === "empresa" ? "Empresa" : "Prioridad";
      const orderLabel = sinPatenteSortOrder === "asc" ? "Ascendente" : "Descendente";
      subtitleParts.push('Ordenado por: ' + sortLabel + ' (' + orderLabel + ')');
    }
    doc.text(subtitleParts.join(' | '), 70, 28);
    doc.text('Total: ' + sinPatenteContracts.length + ' locales', 14, 40);
    
    if (sinPatenteContracts.length === 0) {
      doc.setFontSize(12);
      doc.setTextColor(0);
      doc.text('No hay locales sin patente con los filtros seleccionados.', 14, 55);
    } else {
      // Build headers and data based on selected columns
      const columnMapping: Record<string, { header: string; getValue: (c: ContractPatentData) => string; width: number | 'auto' }> = {
        local: {
          header: 'Local',
          getValue: (c) => c.name,
          width: 35,
        },
        empresa: {
          header: 'Empresa',
          getValue: (c) => c.contract_companies?.map(cc => cc.companies?.name).filter(Boolean).join(', ') || 'Sin Empresa',
          width: 35,
        },
        direccion: {
          header: 'Direccion',
          getValue: (c) => {
            const address = c.contract_addresses?.[0];
            return address 
              ? ((address.street || '') + ' ' + (address.number || '') + ', ' + (address.commune || '')).trim()
              : 'Sin direccion';
          },
          width: 40,
        },
        prioridad: {
          header: 'Prioridad',
          getValue: (c) => c.contract_patents?.priority 
            ? PRIORITY_CONFIG[c.contract_patents.priority]?.label || 'Sin Asignar'
            : 'Sin Asignar',
          width: 25,
        },
        comentarios: {
          header: 'Comentarios',
          getValue: (c) => c.contract_patents?.comments || '-',
          width: 'auto' as const,
        },
        proximas_acciones: {
          header: 'Proximas Acciones',
          getValue: (c) => c.contract_patents?.next_actions || '-',
          width: 'auto' as const,
        },
      };
      
      // Filter only selected columns
      const activeColumns = selectedPdfColumns.filter(key => columnMapping[key]);
      const headers = activeColumns.map(key => columnMapping[key].header);
      const sinPatenteData = sinPatenteContracts.map(c => 
        activeColumns.map(key => columnMapping[key].getValue(c))
      );
      
      // Build column styles
      const columnStyles: Record<number, { cellWidth: number | 'auto' }> = {};
      activeColumns.forEach((key, index) => {
        columnStyles[index] = { cellWidth: columnMapping[key].width };
      });
      
      autoTable(doc, {
        startY: 46,
        head: [headers],
        body: sinPatenteData,
        theme: 'grid',
        headStyles: { fillColor: [220, 38, 38] },
        margin: { left: 14, right: 14 },
        columnStyles,
        styles: { 
          fontSize: 8,
          cellPadding: 3,
          overflow: 'linebreak',
        },
        bodyStyles: {
          valign: 'top',
        },
      });
    }
    
    doc.save('locales-sin-patente-' + today.replace(/\//g, '-') + '.pdf');
  };

  // Export PDF function for general report
  const exportToPDF = async () => {
    const doc = new jsPDF({ orientation: 'landscape' });
    const today = new Date().toLocaleDateString('es-CL');
    
    // Add logo
    try {
      const logoImg = new Image();
      logoImg.src = logosHeader;
      await new Promise((resolve, reject) => {
        logoImg.onload = resolve;
        logoImg.onerror = reject;
      });
      doc.addImage(logoImg, 'PNG', 14, 10, 50, 20);
    } catch (error) {
      console.log('Error loading logo:', error);
    }
    
    // Title
    doc.setFontSize(18);
    doc.text('Estado General de Patentes', 70, 20);
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text('Generado: ' + today, 70, 28);
    
    // Summary stats
    doc.setFontSize(12);
    doc.setTextColor(0);
    doc.text('Resumen General', 14, 45);
    
    const summaryData = [
      ['Total Locales', generalStats.totalContracts.toString()],
      ['Definitiva', generalStats.definitiveCount.toString()],
      ['Provisoria', generalStats.provisionalCount.toString()],
      ['Sin Patente', generalStats.noPatentCount.toString()],
      ['Docs OK', generalStats.okDocs.toString()],
      ['Pendientes', generalStats.pendingDocs.toString()],
      ['Vencidos', generalStats.overdueDocs.toString()],
    ];
    
    autoTable(doc, {
      startY: 50,
      head: [['Indicador', 'Valor']],
      body: summaryData,
      theme: 'grid',
      headStyles: { fillColor: [59, 130, 246] },
      margin: { left: 14 },
      tableWidth: 80,
    });
    
    // Company breakdown table
    const companyTableY = (doc as any).lastAutoTable?.finalY + 15 || 105;
    doc.text('Desglose por Empresa', 14, companyTableY);
    
    const companyData = companyStats.map(s => [
      s.companyName,
      s.totalContracts.toString(),
      (s.byPatenteStatus.definitiva || 0).toString(),
      (s.byPatenteStatus.provisoria || 0).toString(),
      (s.byPatenteStatus.sin_patente || 0).toString(),
      s.okDocs.toString(),
      s.pendingDocs.toString(),
      s.overdueDocs.toString(),
    ]);
    
    autoTable(doc, {
      startY: companyTableY + 5,
      head: [['Empresa', 'Locales', 'Definitiva', 'Provisoria', 'Sin Patente', 'Docs OK', 'Pendientes', 'Vencidos']],
      body: companyData,
      theme: 'grid',
      headStyles: { fillColor: [59, 130, 246] },
      margin: { left: 14 },
    });
    
    // "Sin Patente" details - new page (uses current filter and sort)
    if (sinPatenteContracts.length > 0) {
      doc.addPage();
      
      // Add logo to second page
      try {
        const logoImg = new Image();
        logoImg.src = logosHeader;
        await new Promise((resolve, reject) => {
          logoImg.onload = resolve;
          logoImg.onerror = reject;
        });
        doc.addImage(logoImg, 'PNG', 14, 10, 50, 20);
      } catch (error) {
        console.log('Error loading logo:', error);
      }
      
      doc.setFontSize(14);
      doc.text('Detalle: Locales Sin Patente', 70, 20);
      
      doc.setFontSize(10);
      doc.setTextColor(100);
      let detailSubtitleParts: string[] = [];
      detailSubtitleParts.push('Total: ' + sinPatenteContracts.length + ' locales');
      if (sinPatenteStatusFilter !== "all") {
        const filterLabel = sinPatenteStatusFilter === "sin_asignar" 
          ? "Sin Asignar" 
          : PRIORITY_CONFIG[sinPatenteStatusFilter as PatentPriority]?.label || sinPatenteStatusFilter;
        detailSubtitleParts.push('Filtro: ' + filterLabel);
      }
      if (sinPatenteSortField) {
        const sortLabel = sinPatenteSortField === "empresa" ? "Empresa" : "Prioridad";
        const orderLabel = sinPatenteSortOrder === "asc" ? "Ascendente" : "Descendente";
        detailSubtitleParts.push('Ordenado por: ' + sortLabel + ' (' + orderLabel + ')');
      }
      doc.text(detailSubtitleParts.join(' | '), 70, 28);
      doc.setTextColor(0);
      
      const sinPatenteData = sinPatenteContracts.map(c => {
        const companies = c.contract_companies?.map(cc => cc.companies?.name).filter(Boolean).join(', ') || 'Sin Empresa';
        const address = c.contract_addresses?.[0];
        const fullAddress = address 
          ? (address.street || '') + ' ' + (address.number || '') + ', ' + (address.commune || '')
          : 'Sin direccion';
        const priority = c.contract_patents?.priority 
          ? PRIORITY_CONFIG[c.contract_patents.priority]?.label || 'Sin Asignar'
          : 'Sin Asignar';
        const comments = c.contract_patents?.comments || '-';
        const nextActions = c.contract_patents?.next_actions || '-';
        
        return [c.name, companies, fullAddress.trim(), priority, comments, nextActions];
      });
      
      autoTable(doc, {
        startY: 35,
        head: [['Local', 'Empresa', 'Direccion', 'Prioridad', 'Comentarios', 'Proximas Acciones']],
        body: sinPatenteData,
        theme: 'grid',
        headStyles: { fillColor: [220, 38, 38] },
        margin: { left: 14, right: 14 },
        columnStyles: {
          0: { cellWidth: 35 },
          1: { cellWidth: 35 },
          2: { cellWidth: 40 },
          3: { cellWidth: 25 },
          4: { cellWidth: 'auto' },
          5: { cellWidth: 'auto' },
        },
        styles: { 
          fontSize: 8,
          cellPadding: 3,
          overflow: 'linebreak',
        },
        bodyStyles: {
          valign: 'top',
        },
      });
    }
    
    doc.save('estado-patentes-' + today.replace(/\//g, '-') + '.pdf');
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-[1536px] mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button variant="outline" size="sm" onClick={() => navigate("/")}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Volver
              </Button>
              <div>
                <h1 className="text-2xl font-semibold text-foreground flex items-center gap-2">
                  <FileText className="h-6 w-6" />
                  Informes y Reportes
                </h1>
                <p className="text-sm text-muted-foreground">Visualización consolidada de datos</p>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-[1536px] mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Reporte de Estado de Patentes - Collapsible */}
        <Collapsible open={isPatentSectionOpen} onOpenChange={setPatentSectionOpen}>
          <Card>
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between">
                <div 
                  className="flex-1 cursor-pointer"
                  onClick={() => setPatentSectionOpen(!isPatentSectionOpen)}
                >
                  <CardTitle className="flex items-center gap-2">
                    <FileCheck className="h-5 w-5" />
                    Estado General de Patentes
                  </CardTitle>
                  <CardDescription>
                    Resumen del estado de patentes para todos los contratos firmados
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      exportToPDF();
                    }}
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Exportar PDF
                  </Button>
                  <CollapsibleTrigger asChild>
                    <Button 
                      variant="ghost" 
                      size="icon"
                      className="h-8 w-8"
                      onClick={(e) => {
                        e.stopPropagation();
                        setPatentSectionOpen(!isPatentSectionOpen);
                      }}
                    >
                      {isPatentSectionOpen ? (
                        <ChevronUp className="h-4 w-4" />
                      ) : (
                        <ChevronDown className="h-4 w-4" />
                      )}
                    </Button>
                  </CollapsibleTrigger>
                </div>
              </div>
            </CardHeader>
            <CollapsibleContent>
              <CardContent className="space-y-6">
                {/* Summary Cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
                  <Card 
                    className={`cursor-pointer hover:shadow-md transition-shadow bg-muted/50 ${
                      chartFilter?.type === "card" && chartFilter.value === "all" ? "ring-2 ring-primary" : ""
                    }`}
                    onClick={() => handleCardClick("all", "Total Locales")}
                  >
                    <CardContent className="p-4">
                      <div className="text-2xl font-bold">{generalStats.totalContracts}</div>
                      <div className="text-sm text-muted-foreground">Total Locales</div>
                    </CardContent>
                  </Card>
                  <Card 
                    className={`cursor-pointer hover:shadow-md transition-shadow bg-green-50 dark:bg-green-950/30 ${
                      chartFilter?.type === "card" && chartFilter.value === "definitiva" ? "ring-2 ring-green-500" : ""
                    }`}
                    onClick={() => handleCardClick("definitiva", "Definitiva")}
                  >
                    <CardContent className="p-4">
                      <div className="text-2xl font-bold text-green-700 dark:text-green-400">{generalStats.definitiveCount}</div>
                      <div className="text-sm text-muted-foreground">Definitiva</div>
                    </CardContent>
                  </Card>
                  <Card 
                    className={`cursor-pointer hover:shadow-md transition-shadow bg-yellow-50 dark:bg-yellow-950/30 ${
                      chartFilter?.type === "card" && chartFilter.value === "provisoria" ? "ring-2 ring-yellow-500" : ""
                    }`}
                    onClick={() => handleCardClick("provisoria", "Provisoria")}
                  >
                    <CardContent className="p-4">
                      <div className="text-2xl font-bold text-yellow-700 dark:text-yellow-400">{generalStats.provisionalCount}</div>
                      <div className="text-sm text-muted-foreground">Provisoria</div>
                    </CardContent>
                  </Card>
                  <Card 
                    className={`cursor-pointer hover:shadow-md transition-shadow bg-red-50 dark:bg-red-950/30 ${
                      chartFilter?.type === "card" && chartFilter.value === "sin_patente" ? "ring-2 ring-red-500" : ""
                    }`}
                    onClick={() => handleCardClick("sin_patente", "Sin Patente")}
                  >
                    <CardContent className="p-4">
                      <div className="text-2xl font-bold text-red-700 dark:text-red-400">{generalStats.noPatentCount}</div>
                      <div className="text-sm text-muted-foreground">Sin Patente</div>
                    </CardContent>
                  </Card>
                  <Card 
                    className={`cursor-pointer hover:shadow-md transition-shadow bg-green-50 dark:bg-green-950/30 ${
                      chartFilter?.type === "card" && chartFilter.value === "docs_ok" ? "ring-2 ring-green-500" : ""
                    }`}
                    onClick={() => handleCardClick("docs_ok", "Docs OK")}
                  >
                    <CardContent className="p-4">
                      <div className="text-2xl font-bold text-green-700 dark:text-green-400 flex items-center gap-1">
                        <CheckCircle2 className="h-5 w-5" />
                        {generalStats.okDocs}
                      </div>
                      <div className="text-sm text-muted-foreground">Docs OK</div>
                    </CardContent>
                  </Card>
                  <Card 
                    className={`cursor-pointer hover:shadow-md transition-shadow bg-orange-50 dark:bg-orange-950/30 ${
                      chartFilter?.type === "card" && chartFilter.value === "pending" ? "ring-2 ring-orange-500" : ""
                    }`}
                    onClick={() => handleCardClick("pending", "Pendientes")}
                  >
                    <CardContent className="p-4">
                      <div className="text-2xl font-bold text-orange-700 dark:text-orange-400 flex items-center gap-1">
                        <Clock className="h-5 w-5" />
                        {generalStats.pendingDocs}
                      </div>
                      <div className="text-sm text-muted-foreground">Pendientes</div>
                    </CardContent>
                  </Card>
                  <Card 
                    className={`cursor-pointer hover:shadow-md transition-shadow bg-red-50 dark:bg-red-950/30 ${
                      chartFilter?.type === "card" && chartFilter.value === "overdue" ? "ring-2 ring-red-500" : ""
                    }`}
                    onClick={() => handleCardClick("overdue", "Vencidos")}
                  >
                    <CardContent className="p-4">
                      <div className="text-2xl font-bold text-red-700 dark:text-red-400 flex items-center gap-1">
                        <AlertTriangle className="h-5 w-5" />
                        {generalStats.overdueDocs}
                      </div>
                      <div className="text-sm text-muted-foreground">Vencidos</div>
                    </CardContent>
                  </Card>
                </div>

                {/* Charts */}
                <div className="grid md:grid-cols-2 gap-6">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">Por Estado de Patente</CardTitle>
                      <CardDescription className="text-xs">Haz clic en el gráfico o leyenda para filtrar</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="h-[250px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={patenteStatusChartData}
                              dataKey="value"
                              nameKey="name"
                              cx="50%"
                              cy="50%"
                              outerRadius={80}
                              label={({ name, value }) => `${name}: ${value}`}
                              onClick={handlePatenteStatusClick}
                              style={{ cursor: "pointer" }}
                            >
                              {patenteStatusChartData.map((entry, index) => (
                                <Cell 
                                  key={`cell-${index}`} 
                                  fill={entry.color}
                                  stroke={chartFilter?.type === "patente_status" && chartFilter.value === entry.filterValue ? "hsl(var(--primary))" : undefined}
                                  strokeWidth={chartFilter?.type === "patente_status" && chartFilter.value === entry.filterValue ? 3 : 1}
                                />
                              ))}
                            </Pie>
                            <Tooltip />
                            <Legend 
                              onClick={(e) => {
                                const item = patenteStatusChartData.find(d => d.name === e.value);
                                if (item) handlePatenteStatusClick(item);
                              }}
                              wrapperStyle={{ cursor: "pointer" }}
                            />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">Por Prioridad</CardTitle>
                      <CardDescription className="text-xs">Haz clic en el gráfico o leyenda para filtrar</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="h-[250px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={priorityChartData}
                              dataKey="value"
                              nameKey="name"
                              cx="50%"
                              cy="50%"
                              outerRadius={80}
                              label={({ name, value }) => `${name}: ${value}`}
                              onClick={handlePriorityClick}
                              style={{ cursor: "pointer" }}
                            >
                              {priorityChartData.map((entry, index) => (
                                <Cell 
                                  key={`cell-${index}`} 
                                  fill={entry.color}
                                  stroke={chartFilter?.type === "priority" && chartFilter.value === entry.filterValue ? "hsl(var(--primary))" : undefined}
                                  strokeWidth={chartFilter?.type === "priority" && chartFilter.value === entry.filterValue ? 3 : 1}
                                />
                              ))}
                            </Pie>
                            <Tooltip />
                            <Legend 
                              onClick={(e) => {
                                const item = priorityChartData.find(d => d.name === e.value);
                                if (item) handlePriorityClick(item);
                              }}
                              wrapperStyle={{ cursor: "pointer" }}
                            />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Filtered Contracts List */}
                {chartFilter && (
                  <Card className="border-primary/50 bg-primary/5">
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-base flex items-center gap-2">
                          <Building2 className="h-4 w-4" />
                          Locales con: {chartFilter.label}
                          <span className="text-muted-foreground font-normal">
                            ({filteredContracts.length} {filteredContracts.length === 1 ? "local" : "locales"})
                          </span>
                        </CardTitle>
                        <Button variant="ghost" size="sm" onClick={clearFilter}>
                          <X className="h-4 w-4 mr-1" />
                          Limpiar filtro
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="max-h-[400px] overflow-y-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Local</TableHead>
                              <TableHead>Empresa</TableHead>
                              <TableHead className="text-center">Estado Patente</TableHead>
                              <TableHead className="text-center">Prioridad</TableHead>
                              <TableHead className="text-center">Documentos</TableHead>
                              <TableHead className="text-right">Acciones</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {filteredContracts.map(contract => {
                              const companyName = contract.contract_companies?.[0]?.companies?.name || "Sin Empresa";
                              const priority = contract.contract_patents?.priority;
                              const docsOk = contract.patent_documents?.filter(d => d.status === "ok").length || 0;
                              const docsPending = contract.patent_documents?.filter(d => d.status === "pendiente").length || 0;
                              const totalDocs = contract.patent_documents?.length || 0;
                              
                              return (
                                <TableRow key={contract.id}>
                                  <TableCell className="font-medium">{contract.name}</TableCell>
                                  <TableCell className="text-muted-foreground">{companyName}</TableCell>
                                  <TableCell className="text-center">
                                    <span className={`px-2 py-1 rounded text-xs font-medium ${
                                      contract.patente_status === "definitiva" 
                                        ? "bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300"
                                        : contract.patente_status === "provisoria"
                                        ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300"
                                        : contract.patente_status === "sin_patente"
                                        ? "bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300"
                                        : "bg-muted text-muted-foreground"
                                    }`}>
                                      {getPatenteStatusLabel(contract.patente_status || "sin_asignar")}
                                    </span>
                                  </TableCell>
                                  <TableCell className="text-center">
                                    {priority ? (
                                      <span 
                                        className="px-2 py-1 rounded text-xs font-medium"
                                        style={{ 
                                          backgroundColor: PRIORITY_CONFIG[priority]?.color + "20",
                                          color: PRIORITY_CONFIG[priority]?.color
                                        }}
                                      >
                                        {PRIORITY_CONFIG[priority]?.label}
                                      </span>
                                    ) : (
                                      <span className="text-muted-foreground text-xs">Sin asignar</span>
                                    )}
                                  </TableCell>
                                  <TableCell className="text-center">
                                    <div className="flex items-center justify-center gap-2 text-xs">
                                      <span className="text-green-600">{docsOk} OK</span>
                                      <span className="text-muted-foreground">/</span>
                                      <span className="text-orange-600">{docsPending} Pend.</span>
                                    </div>
                                  </TableCell>
                                  <TableCell className="text-right">
                                    <Button 
                                      variant="outline" 
                                      size="sm"
                                      onClick={() => handleNavigateToPatent(contract.id)}
                                    >
                                      <ExternalLink className="h-4 w-4 mr-1" />
                                      Ver Patentes
                                    </Button>
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* By Company Table */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Building2 className="h-4 w-4" />
                      Desglose por Empresa
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[40px]"></TableHead>
                          <TableHead>Empresa</TableHead>
                          <TableHead className="text-center">Locales</TableHead>
                          <TableHead className="text-center">Definitiva</TableHead>
                          <TableHead className="text-center">Provisoria</TableHead>
                          <TableHead className="text-center">Sin Patente</TableHead>
                          <TableHead className="text-center">Docs OK</TableHead>
                          <TableHead className="text-center">Pendientes</TableHead>
                          <TableHead className="text-center">Vencidos</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {companyStats.map((stats) => (
                          <Collapsible key={stats.companyId} asChild>
                            <>
                              <TableRow className="cursor-pointer hover:bg-muted/50" onClick={() => toggleCompany(stats.companyName)}>
                                <TableCell>
                                  <CollapsibleTrigger asChild>
                                    <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                                      {expandedCompanies.has(stats.companyName) ? (
                                        <ChevronDown className="h-4 w-4" />
                                      ) : (
                                        <ChevronRight className="h-4 w-4" />
                                      )}
                                    </Button>
                                  </CollapsibleTrigger>
                                </TableCell>
                                <TableCell className="font-medium">{stats.companyName}</TableCell>
                                <TableCell className="text-center">{stats.totalContracts}</TableCell>
                                <TableCell className="text-center">
                                  <span className="px-2 py-1 rounded bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300">
                                    {stats.byPatenteStatus.definitiva || 0}
                                  </span>
                                </TableCell>
                                <TableCell className="text-center">
                                  <span className="px-2 py-1 rounded bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300">
                                    {stats.byPatenteStatus.provisoria || 0}
                                  </span>
                                </TableCell>
                                <TableCell className="text-center">
                                  <span className="px-2 py-1 rounded bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300">
                                    {stats.byPatenteStatus.sin_patente || 0}
                                  </span>
                                </TableCell>
                                <TableCell className="text-center text-green-600 dark:text-green-400">
                                  {stats.okDocs}
                                </TableCell>
                                <TableCell className="text-center text-orange-600 dark:text-orange-400">
                                  {stats.pendingDocs}
                                </TableCell>
                                <TableCell className="text-center text-red-600 dark:text-red-400 font-medium">
                                  {stats.overdueDocs > 0 && (
                                    <span className="flex items-center justify-center gap-1">
                                      <AlertTriangle className="h-4 w-4" />
                                      {stats.overdueDocs}
                                    </span>
                                  )}
                                  {stats.overdueDocs === 0 && "-"}
                                </TableCell>
                              </TableRow>
                              {expandedCompanies.has(stats.companyName) && (
                                <TableRow>
                                  <TableCell colSpan={9} className="bg-muted/30 p-4">
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                      <div>
                                        <h4 className="text-sm font-medium mb-2">Por Estado de Patente</h4>
                                        <ul className="space-y-1 text-sm">
                                          {Object.entries(stats.byPatenteStatus).map(([status, count]) => (
                                            <li key={status} className="flex justify-between">
                                              <span>{getPatenteStatusLabel(status)}</span>
                                              <span className="font-medium">{count}</span>
                                            </li>
                                          ))}
                                        </ul>
                                      </div>
                                      <div>
                                        <h4 className="text-sm font-medium mb-2">Por Prioridad</h4>
                                        <ul className="space-y-1 text-sm">
                                          {Object.entries(stats.byPriority).map(([priority, count]) => (
                                            <li key={priority} className="flex justify-between">
                                              <span>
                                                {priority === "sin_asignar" 
                                                  ? "Sin Asignar" 
                                                  : PRIORITY_CONFIG[priority as PatentPriority]?.label || priority}
                                              </span>
                                              <span className="font-medium">{count}</span>
                                            </li>
                                          ))}
                                        </ul>
                                      </div>
                                    </div>
                                  </TableCell>
                                </TableRow>
                              )}
                            </>
                          </Collapsible>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>

                {/* Sin Patente Detail Section */}
                <Collapsible open={isSinPatenteSectionOpen} onOpenChange={setSinPatenteSectionOpen}>
                  <Card className="border-red-200 dark:border-red-800/50 bg-red-50/30 dark:bg-red-950/10">
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <div 
                          className="flex-1 cursor-pointer"
                          onClick={() => setSinPatenteSectionOpen(!isSinPatenteSectionOpen)}
                        >
                          <CardTitle className="text-base flex items-center gap-2 text-red-700 dark:text-red-400">
                            <XCircle className="h-4 w-4" />
                            Detalle: Locales Sin Patente
                            <span className="text-muted-foreground font-normal text-sm">
                              ({sinPatenteContracts.length} {sinPatenteContracts.length === 1 ? 'local' : 'locales'})
                            </span>
                          </CardTitle>
                          <CardDescription className="flex items-center gap-1">
                            <MessageSquare className="h-3 w-3" />
                            Incluye comentarios y próximas acciones
                          </CardDescription>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="flex items-center border rounded-md overflow-hidden">
                            <Popover>
                              <PopoverTrigger asChild>
                                <Button 
                                  variant="ghost" 
                                  size="sm"
                                  className="rounded-none border-r"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <Settings2 className="h-3 w-3 mr-1" />
                                  Columnas
                                </Button>
                              </PopoverTrigger>
                              <PopoverContent className="w-56" align="end">
                                <div className="space-y-3">
                                  <h4 className="font-medium text-sm">Columnas del PDF</h4>
                                  <div className="space-y-2">
                                    {availablePdfColumns.map((col) => (
                                      <div key={col.key} className="flex items-center space-x-2">
                                        <Checkbox
                                          id={`pdf-col-${col.key}`}
                                          checked={selectedPdfColumns.includes(col.key)}
                                          onCheckedChange={(checked) => {
                                            if (checked) {
                                              setSelectedPdfColumns(prev => [...prev, col.key]);
                                            } else {
                                              setSelectedPdfColumns(prev => prev.filter(k => k !== col.key));
                                            }
                                          }}
                                        />
                                        <Label 
                                          htmlFor={`pdf-col-${col.key}`}
                                          className="text-sm cursor-pointer"
                                        >
                                          {col.label}
                                        </Label>
                                      </div>
                                    ))}
                                  </div>
                                  <p className="text-xs text-muted-foreground">
                                    {selectedPdfColumns.length} columnas seleccionadas
                                  </p>
                                </div>
                              </PopoverContent>
                            </Popover>
                            <Button 
                              variant="ghost" 
                              size="sm"
                              className="rounded-none"
                              disabled={selectedPdfColumns.length === 0}
                              onClick={(e) => {
                                e.stopPropagation();
                                exportSinPatentePDF();
                              }}
                            >
                              <Download className="h-3 w-3 mr-1" />
                              PDF
                            </Button>
                          </div>
                          <Select value={sinPatenteStatusFilter} onValueChange={setSinPatenteStatusFilter}>
                            <SelectTrigger className="w-[180px] h-8">
                              <Filter className="h-3 w-3 mr-2" />
                              <SelectValue placeholder="Filtrar por prioridad" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="all">Todas las prioridades</SelectItem>
                              <SelectItem value="priority_1">Prioridad 1</SelectItem>
                              <SelectItem value="priority_2">Prioridad 2</SelectItem>
                              <SelectItem value="priority_3">Prioridad 3</SelectItem>
                              <SelectItem value="vigente">Vigente</SelectItem>
                              <SelectItem value="sin_asignar">Sin Asignar</SelectItem>
                            </SelectContent>
                          </Select>
                          <CollapsibleTrigger asChild>
                            <Button 
                              variant="ghost" 
                              size="icon"
                              className="h-8 w-8"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSinPatenteSectionOpen(!isSinPatenteSectionOpen);
                              }}
                            >
                              {isSinPatenteSectionOpen ? (
                                <ChevronUp className="h-4 w-4" />
                              ) : (
                                <ChevronDown className="h-4 w-4" />
                              )}
                            </Button>
                          </CollapsibleTrigger>
                        </div>
                      </div>
                    </CardHeader>
                    <CollapsibleContent>
                      <CardContent>
                        {sinPatenteContracts.length === 0 ? (
                          <div className="text-center py-8 text-muted-foreground">
                            No hay locales sin patente{sinPatenteStatusFilter !== "all" ? " con el filtro seleccionado" : ""}
                          </div>
                        ) : (
                          <div className="max-h-[500px] overflow-y-auto">
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead className="w-[180px]">Local</TableHead>
                                  <TableHead className="w-[150px]">
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-auto p-0 font-medium hover:bg-transparent"
                                      onClick={() => handleSinPatenteSort("empresa")}
                                    >
                                      Empresa
                                      <ArrowUpDown className={`ml-1 h-3 w-3 ${sinPatenteSortField === "empresa" ? "text-primary" : "text-muted-foreground"}`} />
                                    </Button>
                                  </TableHead>
                                  <TableHead className="w-[180px]">Dirección</TableHead>
                                  <TableHead className="text-center w-[100px]">
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-auto p-0 font-medium hover:bg-transparent"
                                      onClick={() => handleSinPatenteSort("prioridad")}
                                    >
                                      Prioridad
                                      <ArrowUpDown className={`ml-1 h-3 w-3 ${sinPatenteSortField === "prioridad" ? "text-primary" : "text-muted-foreground"}`} />
                                    </Button>
                                  </TableHead>
                                  <TableHead>Comentarios</TableHead>
                                  <TableHead>Próximas Acciones</TableHead>
                                  <TableHead className="text-right w-[100px]">Acciones</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {sinPatenteContracts.map(contract => {
                                  const companies = contract.contract_companies?.map(cc => cc.companies?.name).filter(Boolean);
                                  const companyDisplay = companies && companies.length > 0 
                                    ? companies.join(', ') 
                                    : 'Sin Empresa';
                                  const address = contract.contract_addresses?.[0];
                                  const fullAddress = address 
                                    ? `${address.street || ''} ${address.number || ''}, ${address.commune || ''}`.trim()
                                    : 'Sin dirección';
                                  const priority = contract.contract_patents?.priority;
                                  const comments = contract.contract_patents?.comments || '';
                                  const nextActions = contract.contract_patents?.next_actions || '';

                                  return (
                                    <TableRow key={contract.id}>
                                      <TableCell className="font-medium">{contract.name}</TableCell>
                                      <TableCell className="text-muted-foreground text-sm">{companyDisplay}</TableCell>
                                      <TableCell className="text-muted-foreground text-sm">{fullAddress}</TableCell>
                                      <TableCell className="text-center">
                                        {priority ? (
                                          <span 
                                            className="px-2 py-1 rounded text-xs font-medium"
                                            style={{ 
                                              backgroundColor: PRIORITY_CONFIG[priority]?.color + "20",
                                              color: PRIORITY_CONFIG[priority]?.color
                                            }}
                                          >
                                            {PRIORITY_CONFIG[priority]?.label}
                                          </span>
                                        ) : (
                                          <span className="text-muted-foreground text-xs">Sin asignar</span>
                                        )}
                                      </TableCell>
                                      <TableCell className="max-w-[200px]">
                                        {comments ? (
                                          <p className="text-sm text-muted-foreground line-clamp-2" title={comments}>
                                            {comments}
                                          </p>
                                        ) : (
                                          <span className="text-xs text-muted-foreground/50 italic">Sin comentarios</span>
                                        )}
                                      </TableCell>
                                      <TableCell className="max-w-[200px]">
                                        {nextActions ? (
                                          <p className="text-sm text-muted-foreground line-clamp-2" title={nextActions}>
                                            {nextActions}
                                          </p>
                                        ) : (
                                          <span className="text-xs text-muted-foreground/50 italic">Sin acciones</span>
                                        )}
                                      </TableCell>
                                      <TableCell className="text-right">
                                        <Button 
                                          variant="outline" 
                                          size="sm"
                                          onClick={() => handleNavigateToPatent(contract.id)}
                                        >
                                          <ExternalLink className="h-3 w-3 mr-1" />
                                          Ver
                                        </Button>
                                      </TableCell>
                                    </TableRow>
                                  );
                                })}
                              </TableBody>
                            </Table>
                          </div>
                        )}
                      </CardContent>
                    </CollapsibleContent>
                  </Card>
                </Collapsible>
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>

        {/* Maintenance Reports Section */}
        <Card className="mt-6">
          <CardContent className="pt-6">
            <MaintenanceReports />
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default ReportsDashboard;
