import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2, Search, Filter, BarChart3 } from "lucide-react";
import { KPI, KPICategory } from "@/hooks/useKPI";

interface KPIListProps {
  kpis: KPI[];
  categories: KPICategory[];
  onCreateKPI: () => void;
  onEditKPI: (kpi: KPI) => void;
  onDeleteKPI: (id: string) => Promise<void>;
  onViewMeasurements: (kpi: KPI) => void;
}

export function KPIList({
  kpis,
  categories,
  onCreateKPI,
  onEditKPI,
  onDeleteKPI,
  onViewMeasurements,
}: KPIListProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  const filteredKPIs = kpis.filter((kpi) => {
    const matchesSearch = kpi.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (kpi.description?.toLowerCase().includes(searchTerm.toLowerCase()) ?? false);
    const matchesCategory = categoryFilter === "all" || kpi.category_id === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  const handleDelete = async (id: string) => {
    if (confirm("¿Está seguro de eliminar este KPI? Se eliminarán también todas las mediciones asociadas.")) {
      await onDeleteKPI(id);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-lg">Indicadores (KPI)</CardTitle>
        <Button onClick={onCreateKPI}>
          <Plus className="h-4 w-4 mr-2" />
          Nuevo KPI
        </Button>
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
              <TableHead>Nombre</TableHead>
              <TableHead>Categoría</TableHead>
              <TableHead>Meta</TableHead>
              <TableHead>Frecuencia</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="w-32">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredKPIs.map((kpi) => (
              <TableRow key={kpi.id}>
                <TableCell>
                  <div>
                    <p className="font-medium">{kpi.name}</p>
                    {kpi.description && (
                      <p className="text-sm text-muted-foreground line-clamp-1">
                        {kpi.description}
                      </p>
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
            ))}
            {filteredKPIs.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
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
