import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2, Search, Filter, BarChart3, Download, ChevronRight, Users } from "lucide-react";
import { KPI, KPICategory } from "@/hooks/useKPI";
import { generateKPIListPDF } from "./KPIPDFExport";

interface KPIListProps {
  kpis: KPI[];
  categories: KPICategory[];
  onCreateKPI: () => void;
  onEditKPI: (kpi: KPI) => void;
  onDeleteKPI: (id: string) => Promise<void>;
  onViewMeasurements: (kpi: KPI) => void;
  onCreateSubKPI?: (parentKPI: KPI) => void;
}

export function KPIList({
  kpis,
  categories,
  onCreateKPI,
  onEditKPI,
  onDeleteKPI,
  onViewMeasurements,
  onCreateSubKPI,
}: KPIListProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [expandedKPIs, setExpandedKPIs] = useState<Set<string>>(new Set());

  // Separate parent KPIs and sub-KPIs
  const parentKPIs = kpis.filter((kpi) => !(kpi as any).parent_kpi_id);
  const subKPIsMap = new Map<string, KPI[]>();
  kpis.forEach((kpi) => {
    const parentId = (kpi as any).parent_kpi_id;
    if (parentId) {
      if (!subKPIsMap.has(parentId)) {
        subKPIsMap.set(parentId, []);
      }
      subKPIsMap.get(parentId)!.push(kpi);
    }
  });

  const filteredKPIs = parentKPIs.filter((kpi) => {
    const matchesSearch = kpi.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (kpi.description?.toLowerCase().includes(searchTerm.toLowerCase()) ?? false);
    const matchesCategory = categoryFilter === "all" || kpi.category_id === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  const toggleExpand = (kpiId: string) => {
    const newExpanded = new Set(expandedKPIs);
    if (newExpanded.has(kpiId)) {
      newExpanded.delete(kpiId);
    } else {
      newExpanded.add(kpiId);
    }
    setExpandedKPIs(newExpanded);
  };

  const handleDownloadPDF = () => {
    generateKPIListPDF(kpis, categories);
  };

  const handleDelete = async (id: string) => {
    if (confirm("¿Está seguro de eliminar este KPI? Se eliminarán también todas las mediciones asociadas.")) {
      await onDeleteKPI(id);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-lg">Indicadores (KPI)</CardTitle>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleDownloadPDF} className="gap-2">
            <Download className="h-4 w-4" />
            Descargar PDF
          </Button>
          <Button onClick={onCreateKPI}>
            <Plus className="h-4 w-4 mr-2" />
            Nuevo KPI
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex gap-4 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar KPI..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-64">
              <Filter className="h-4 w-4 mr-2" />
              <SelectValue placeholder="Filtrar por categoría" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas las categorías</SelectItem>
              {categories.map((cat) => (
                <SelectItem key={cat.id} value={cat.id}>
                  {cat.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8"></TableHead>
              <TableHead>Nombre</TableHead>
              <TableHead>Categoría</TableHead>
              <TableHead>Meta</TableHead>
              <TableHead>Frecuencia</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="w-40">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredKPIs.map((kpi) => {
              const subKPIs = subKPIsMap.get(kpi.id) || [];
              const hasSubKPIs = subKPIs.length > 0;
              const isExpanded = expandedKPIs.has(kpi.id);

              return (
                <>
                  <TableRow key={kpi.id}>
                    <TableCell className="w-8">
                      {hasSubKPIs && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => toggleExpand(kpi.id)}
                        >
                          <ChevronRight className={`h-4 w-4 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                        </Button>
                      )}
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className="font-medium">{kpi.name}</p>
                        {kpi.description && (
                          <p className="text-sm text-muted-foreground line-clamp-1">
                            {kpi.description}
                          </p>
                        )}
                        {hasSubKPIs && (
                          <Badge variant="secondary" className="mt-1 text-xs gap-1">
                            <Users className="h-3 w-3" />
                            {subKPIs.length} Sub-KPI{subKPIs.length > 1 ? 's' : ''}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {kpi.category?.name || "Sin categoría"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {kpi.goal_value != null ? (
                        <span>
                          {kpi.goal_value} {kpi.unit || ""}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {kpi.frequency?.name || <span className="text-muted-foreground">-</span>}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={kpi.is_active ? "default" : "secondary"}
                        className={kpi.is_active ? "bg-green-600" : ""}
                      >
                        {kpi.is_active ? "Activo" : "Inactivo"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => onViewMeasurements(kpi)}
                          title="Ver mediciones"
                        >
                          <BarChart3 className="h-4 w-4" />
                        </Button>
                        {onCreateSubKPI && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => onCreateSubKPI(kpi)}
                            title="Crear Sub-KPI"
                          >
                            <Users className="h-4 w-4 text-blue-600" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => onEditKPI(kpi)}
                          title="Editar"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDelete(kpi.id)}
                          title="Eliminar"
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                  {/* Sub-KPIs */}
                  {isExpanded && subKPIs.map((subKpi) => (
                    <TableRow key={subKpi.id} className="bg-muted/30">
                      <TableCell className="w-8"></TableCell>
                      <TableCell>
                        <div className="pl-6 border-l-2 border-primary/30">
                          <p className="font-medium text-sm">{subKpi.name}</p>
                          {(subKpi as any).assigned_user_id && (
                            <Badge variant="outline" className="mt-1 text-xs">
                              Usuario asignado
                            </Badge>
                          )}
                          {subKpi.description && (
                            <p className="text-xs text-muted-foreground line-clamp-1">
                              {subKpi.description}
                            </p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {subKpi.category?.name || "Sin categoría"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">
                        {subKpi.goal_value != null ? (
                          <span>
                            {subKpi.goal_value} {subKpi.unit || ""}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">
                        {subKpi.frequency?.name || <span className="text-muted-foreground">-</span>}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={subKpi.is_active ? "default" : "secondary"}
                          className={`text-xs ${subKpi.is_active ? "bg-green-600" : ""}`}
                        >
                          {subKpi.is_active ? "Activo" : "Inactivo"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => onViewMeasurements(subKpi)}
                            title="Ver mediciones"
                          >
                            <BarChart3 className="h-3 w-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => onEditKPI(subKpi)}
                            title="Editar"
                          >
                            <Pencil className="h-3 w-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => handleDelete(subKpi.id)}
                            title="Eliminar"
                          >
                            <Trash2 className="h-3 w-3 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </>
              );
            })}
            {filteredKPIs.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                  {searchTerm || categoryFilter !== "all"
                    ? "No se encontraron KPIs con los filtros aplicados"
                    : "No hay KPIs definidos. Cree el primero haciendo clic en 'Nuevo KPI'."}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
