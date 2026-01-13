import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { History, RefreshCw } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { KPIAuditLog as AuditLogType } from "@/hooks/useKPI";
import { supabase } from "@/integrations/supabase/client";

interface Profile {
  id: string;
  email: string;
  full_name: string | null;
}

interface KPIAuditLogProps {
  auditLogs: AuditLogType[];
  onRefresh: () => Promise<any>;
}

export function KPIAuditLog({ auditLogs, onRefresh }: KPIAuditLogProps) {
  const [entityTypeFilter, setEntityTypeFilter] = useState<string>("all");
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadProfiles();
  }, [auditLogs]);

  const loadProfiles = async () => {
    const userIds = [...new Set(auditLogs.map((l) => l.changed_by).filter(Boolean))] as string[];
    if (userIds.length === 0) return;

    const { data } = await supabase
      .from("profiles")
      .select("id, email, full_name")
      .in("id", userIds);

    if (data) {
      const profileMap = data.reduce((acc, p) => ({ ...acc, [p.id]: p }), {});
      setProfiles(profileMap);
    }
  };

  const handleRefresh = async () => {
    setLoading(true);
    await onRefresh();
    setLoading(false);
  };

  const filteredLogs = auditLogs.filter((log) => {
    return entityTypeFilter === "all" || log.entity_type === entityTypeFilter;
  });

  const getActionBadge = (action: string) => {
    switch (action) {
      case "create":
        return <Badge className="bg-green-600">Creación</Badge>;
      case "update":
        return <Badge className="bg-blue-600">Actualización</Badge>;
      case "delete":
        return <Badge variant="destructive">Eliminación</Badge>;
      default:
        return <Badge variant="secondary">{action}</Badge>;
    }
  };

  const getEntityTypeName = (type: string) => {
    switch (type) {
      case "kpi": return "KPI";
      case "kpi_category": return "Categoría";
      case "kpi_measurement": return "Medición";
      default: return type;
    }
  };

  const formatChanges = (oldValues: any, newValues: any) => {
    if (!oldValues && newValues) {
      return `Creado: "${newValues.name || newValues.value || 'Nuevo registro'}"`;
    }
    if (oldValues && !newValues) {
      return `Eliminado: "${oldValues.name || oldValues.value || 'Registro'}"`;
    }
    if (oldValues && newValues) {
      const changes: string[] = [];
      const keys = new Set([...Object.keys(oldValues), ...Object.keys(newValues)]);
      keys.forEach((key) => {
        if (key === "updated_at" || key === "created_at") return;
        if (JSON.stringify(oldValues[key]) !== JSON.stringify(newValues[key])) {
          changes.push(`${key}: "${oldValues[key] ?? '-'}" → "${newValues[key] ?? '-'}"`);
        }
      });
      return changes.slice(0, 3).join("; ") + (changes.length > 3 ? "..." : "");
    }
    return "-";
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-lg flex items-center gap-2">
          <History className="h-5 w-5" />
          Historial de Cambios
        </CardTitle>
        <div className="flex items-center gap-2">
          <Select value={entityTypeFilter} onValueChange={setEntityTypeFilter}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Filtrar por tipo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="kpi">KPIs</SelectItem>
              <SelectItem value="kpi_category">Categorías</SelectItem>
              <SelectItem value="kpi_measurement">Mediciones</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" onClick={handleRefresh} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fecha</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Acción</TableHead>
              <TableHead>Cambios</TableHead>
              <TableHead>Usuario</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredLogs.map((log) => (
              <TableRow key={log.id}>
                <TableCell className="text-sm">
                  {format(new Date(log.changed_at), "dd/MM/yyyy HH:mm", { locale: es })}
                </TableCell>
                <TableCell>
                  <Badge variant="outline">{getEntityTypeName(log.entity_type)}</Badge>
                </TableCell>
                <TableCell>{getActionBadge(log.action)}</TableCell>
                <TableCell className="text-sm text-muted-foreground max-w-md truncate">
                  {formatChanges(log.old_values, log.new_values)}
                </TableCell>
                <TableCell className="text-sm">
                  {log.changed_by && profiles[log.changed_by]
                    ? profiles[log.changed_by].full_name || profiles[log.changed_by].email
                    : "-"}
                </TableCell>
              </TableRow>
            ))}
            {filteredLogs.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                  No hay registros de cambios
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
