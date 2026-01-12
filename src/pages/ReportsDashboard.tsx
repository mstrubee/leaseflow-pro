import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ArrowLeft, FileText, Building2, CheckCircle2, AlertTriangle, Clock, XCircle, FileCheck } from "lucide-react";
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
import { ChevronDown, ChevronRight } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";
import { PRIORITY_CONFIG, PatentPriority } from "@/components/patents/types";

interface ContractPatentData {
  id: string;
  name: string;
  patente_status: string | null;
  contract_companies: Array<{ companies: { name: string } | null }>;
  contract_patents: { priority: PatentPriority } | null;
  patent_documents: Array<{
    id: string;
    status: string;
    end_date: string | null;
  }>;
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

const ReportsDashboard = () => {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [contracts, setContracts] = useState<ContractPatentData[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [patentStatuses, setPatentStatuses] = useState<PatentStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedCompanies, setExpandedCompanies] = useState<Set<string>>(new Set());

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
              contract_patents (priority),
              patent_documents (id, status, end_date)
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

  // Chart data for patente status
  const patenteStatusChartData = useMemo(() => [
    { name: "Definitiva", value: generalStats.definitiveCount, color: "hsl(142, 71%, 45%)" },
    { name: "Provisoria", value: generalStats.provisionalCount, color: "hsl(48, 96%, 53%)" },
    { name: "Sin Patente", value: generalStats.noPatentCount, color: "hsl(0, 84%, 60%)" },
    { name: "Sin Asignar", value: generalStats.totalContracts - generalStats.definitiveCount - generalStats.provisionalCount - generalStats.noPatentCount, color: "hsl(220, 9%, 46%)" },
  ].filter(d => d.value > 0), [generalStats]);

  // Chart data for priority
  const priorityChartData = useMemo(() => 
    Object.entries(generalStats.byPriority)
      .filter(([_, value]) => value > 0)
      .map(([key, value]) => ({
        name: key === "sin_asignar" ? "Sin Asignar" : PRIORITY_CONFIG[key as PatentPriority]?.label || key,
        value,
        color: key === "sin_asignar" ? "hsl(220, 9%, 46%)" : PRIORITY_CONFIG[key as PatentPriority]?.color || "hsl(220, 9%, 46%)",
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
        {/* Reporte de Estado de Patentes */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileCheck className="h-5 w-5" />
              Estado General de Patentes
            </CardTitle>
            <CardDescription>
              Resumen del estado de patentes para todos los contratos firmados
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
              <Card className="bg-muted/50">
                <CardContent className="p-4">
                  <div className="text-2xl font-bold">{generalStats.totalContracts}</div>
                  <div className="text-sm text-muted-foreground">Total Locales</div>
                </CardContent>
              </Card>
              <Card className="bg-green-50 dark:bg-green-950/30">
                <CardContent className="p-4">
                  <div className="text-2xl font-bold text-green-700 dark:text-green-400">{generalStats.definitiveCount}</div>
                  <div className="text-sm text-muted-foreground">Definitiva</div>
                </CardContent>
              </Card>
              <Card className="bg-yellow-50 dark:bg-yellow-950/30">
                <CardContent className="p-4">
                  <div className="text-2xl font-bold text-yellow-700 dark:text-yellow-400">{generalStats.provisionalCount}</div>
                  <div className="text-sm text-muted-foreground">Provisoria</div>
                </CardContent>
              </Card>
              <Card className="bg-red-50 dark:bg-red-950/30">
                <CardContent className="p-4">
                  <div className="text-2xl font-bold text-red-700 dark:text-red-400">{generalStats.noPatentCount}</div>
                  <div className="text-sm text-muted-foreground">Sin Patente</div>
                </CardContent>
              </Card>
              <Card className="bg-green-50 dark:bg-green-950/30">
                <CardContent className="p-4">
                  <div className="text-2xl font-bold text-green-700 dark:text-green-400 flex items-center gap-1">
                    <CheckCircle2 className="h-5 w-5" />
                    {generalStats.okDocs}
                  </div>
                  <div className="text-sm text-muted-foreground">Docs OK</div>
                </CardContent>
              </Card>
              <Card className="bg-orange-50 dark:bg-orange-950/30">
                <CardContent className="p-4">
                  <div className="text-2xl font-bold text-orange-700 dark:text-orange-400 flex items-center gap-1">
                    <Clock className="h-5 w-5" />
                    {generalStats.pendingDocs}
                  </div>
                  <div className="text-sm text-muted-foreground">Pendientes</div>
                </CardContent>
              </Card>
              <Card className="bg-red-50 dark:bg-red-950/30">
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
                        >
                          {patenteStatusChartData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Por Prioridad</CardTitle>
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
                        >
                          {priorityChartData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            </div>

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
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default ReportsDashboard;
