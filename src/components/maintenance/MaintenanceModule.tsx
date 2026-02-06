import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Upload, Search, ClipboardList, Clock, CheckCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { MaintenanceForm, detectMaintenanceType, MaintenanceType } from "./types";
import { MaintenanceExcelUpload } from "./MaintenanceExcelUpload";

export function MaintenanceModule() {
  const [forms, setForms] = useState<MaintenanceForm[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [uploadOpen, setUploadOpen] = useState(false);

  const fetchForms = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("maintenance_forms" as any)
      .select("*")
      .is("deleted_at", null)
      .order("created_date", { ascending: false });

    if (error) {
      console.error(error);
      toast({ title: "Error", description: "No se pudieron cargar los FORMs", variant: "destructive" });
    } else {
      setForms((data as any as MaintenanceForm[]) || []);
    }
    setLoading(false);
  };

  useEffect(() => { fetchForms(); }, []);

  const filtered = useMemo(() => {
    return forms.filter(f => {
      if (statusFilter !== "all" && f.status !== statusFilter) return false;
      
      if (typeFilter !== "all") {
        const type = detectMaintenanceType(f);
        if (type !== typeFilter) return false;
      }

      if (search) {
        const s = search.toLowerCase();
        const matches = [f.form_number, f.contract_name, f.general_description, f.electrical_description, f.civil_description, f.hvac_description, f.fixed_assets_description]
          .some(v => v?.toLowerCase().includes(s));
        if (!matches) return false;
      }
      return true;
    });
  }, [forms, statusFilter, typeFilter, search]);

  const totalForms = forms.length;
  const enProceso = forms.filter(f => f.status === "proceso").length;
  const solucionados = forms.filter(f => f.status === "solucionado").length;

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total FORMs</CardTitle>
            <ClipboardList className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{totalForms}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">En Proceso</CardTitle>
            <Clock className="h-4 w-4 text-yellow-600" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold text-yellow-600">{enProceso}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Solucionados</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold text-green-600">{solucionados}</div></CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar por N° FORM, contrato, descripción..." value={search} onChange={e => setSearch(e.target.value)} className="pl-8" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Estado" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="proceso">En Proceso</SelectItem>
            <SelectItem value="solucionado">Solucionado</SelectItem>
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Tipo" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="Eléctrico">Eléctrico</SelectItem>
            <SelectItem value="Obra Civil">Obra Civil</SelectItem>
            <SelectItem value="Climatización">Climatización</SelectItem>
            <SelectItem value="Activos Fijos">Activos Fijos</SelectItem>
            <SelectItem value="General">General</SelectItem>
            <SelectItem value="Múltiple">Múltiple</SelectItem>
          </SelectContent>
        </Select>
        <Button onClick={() => setUploadOpen(true)} className="gap-2">
          <Upload className="h-4 w-4" /> Cargar Excel
        </Button>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-24">N° FORM</TableHead>
                  <TableHead className="w-28">Estado</TableHead>
                  <TableHead className="w-28">Fecha</TableHead>
                  <TableHead>Contrato</TableHead>
                  <TableHead className="w-28">Tipo</TableHead>
                  <TableHead>Descripción</TableHead>
                  <TableHead>Comentarios</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Cargando...</TableCell></TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No hay FORMs registrados</TableCell></TableRow>
                ) : (
                  filtered.map(f => (
                    <TableRow key={f.id}>
                      <TableCell className="font-mono text-xs">{f.form_number}</TableCell>
                      <TableCell>
                        <Badge variant={f.status === "solucionado" ? "default" : "secondary"} className="text-xs">
                          {f.status === "solucionado" ? "Solucionado" : "En Proceso"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs">{f.created_date || "-"}</TableCell>
                      <TableCell className="text-xs">{f.contract_name || "-"}</TableCell>
                      <TableCell><Badge variant="outline" className="text-xs">{detectMaintenanceType(f)}</Badge></TableCell>
                      <TableCell className="text-xs max-w-48 truncate">
                        {f.general_description || f.electrical_description || f.civil_description || f.hvac_description || f.fixed_assets_description || "-"}
                      </TableCell>
                      <TableCell className="text-xs max-w-32 truncate">{f.additional_comments || "-"}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <MaintenanceExcelUpload open={uploadOpen} onOpenChange={setUploadOpen} onSuccess={fetchForms} />
    </div>
  );
}
