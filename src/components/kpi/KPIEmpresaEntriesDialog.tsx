import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Plus, CheckCircle2, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { KPI, KPIEmpresaEntry } from "@/hooks/useKPI";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";

interface KPIEmpresaEntriesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kpi: KPI | null;
}

export function KPIEmpresaEntriesDialog({
  open,
  onOpenChange,
  kpi,
}: KPIEmpresaEntriesDialogProps) {
  const { user } = useAuth();
  const [entries, setEntries] = useState<KPIEmpresaEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newEntry, setNewEntry] = useState({
    name: "",
    description: "",
    entry_date: format(new Date(), "yyyy-MM-dd"),
  });

  useEffect(() => {
    if (open && kpi) {
      loadEntries();
    }
  }, [open, kpi]);

  const loadEntries = async () => {
    if (!kpi) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("kpi_empresa_entries")
        .select("*")
        .eq("kpi_id", kpi.id)
        .order("entry_date", { ascending: false });

      if (error) throw error;
      setEntries((data as KPIEmpresaEntry[]) || []);
    } catch (error) {
      console.error("Error loading entries:", error);
      toast.error("Error al cargar ingresos");
    } finally {
      setLoading(false);
    }
  };

  const handleAddEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!kpi) return;

    try {
      const { data, error } = await supabase
        .from("kpi_empresa_entries")
        .insert({
          kpi_id: kpi.id,
          name: newEntry.name,
          description: newEntry.description || null,
          entry_date: newEntry.entry_date,
          created_by: user?.id,
        })
        .select()
        .single();

      if (error) throw error;
      
      setEntries((prev) => [data as KPIEmpresaEntry, ...prev]);
      setNewEntry({ name: "", description: "", entry_date: format(new Date(), "yyyy-MM-dd") });
      setShowAddForm(false);
      toast.success("Ingreso registrado");
    } catch (error) {
      console.error("Error adding entry:", error);
      toast.error("Error al registrar ingreso");
    }
  };

  const handleDeleteEntry = async (id: string) => {
    if (!confirm("¿Eliminar este ingreso?")) return;
    
    try {
      const { error } = await supabase
        .from("kpi_empresa_entries")
        .delete()
        .eq("id", id);

      if (error) throw error;
      
      setEntries((prev) => prev.filter((e) => e.id !== id));
      toast.success("Ingreso eliminado");
    } catch (error) {
      console.error("Error deleting entry:", error);
      toast.error("Error al eliminar ingreso");
    }
  };

  if (!kpi) return null;

  // Calculate progress
  const goal100 = kpi.goal_100 || 0;
  const goal80 = goal100 * 0.8;
  const goal120 = goal100 * 1.2;
  const currentValue = entries.length;
  const progressPercentage = goal100 > 0 ? Math.min((currentValue / goal100) * 100, 100) : 0;

  // Determine status
  let status: "red" | "yellow" | "green" = "red";
  let statusLabel = "Por debajo de la meta";
  if (currentValue >= goal100) {
    status = "green";
    statusLabel = currentValue >= goal120 ? "Excelente (≥120%)" : "Meta cumplida (100%)";
  } else if (currentValue >= goal80) {
    status = "yellow";
    statusLabel = "En progreso (≥80%)";
  }

  // Check if within validity period
  const now = new Date();
  const validityStart = kpi.validity_start ? new Date(kpi.validity_start) : null;
  const validityEnd = kpi.validity_end ? new Date(kpi.validity_end) : null;
  const isWithinValidity = (!validityStart || now >= validityStart) && (!validityEnd || now <= validityEnd);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5" />
            Ingresos: {kpi.name}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Progress Summary */}
          <Card>
            <CardContent className="pt-4">
              <div className="grid grid-cols-4 gap-4 mb-4">
                <div className="text-center">
                  <p className="text-sm text-muted-foreground">Meta 80%</p>
                  <p className="text-2xl font-bold text-yellow-600">{goal80.toFixed(0)}</p>
                </div>
                <div className="text-center">
                  <p className="text-sm text-muted-foreground">Meta 100%</p>
                  <p className="text-2xl font-bold text-green-600">{goal100.toFixed(0)}</p>
                </div>
                <div className="text-center">
                  <p className="text-sm text-muted-foreground">Meta 120%</p>
                  <p className="text-2xl font-bold text-blue-600">{goal120.toFixed(0)}</p>
                </div>
                <div className="text-center">
                  <p className="text-sm text-muted-foreground">Actual</p>
                  <p className="text-2xl font-bold">{currentValue}</p>
                </div>
              </div>
              
              <Progress value={progressPercentage} className="h-3 mb-2" />
              
              <div className="flex justify-between items-center">
                <Badge 
                  variant={status === "green" ? "default" : status === "yellow" ? "secondary" : "destructive"}
                  className={status === "green" ? "bg-green-600" : status === "yellow" ? "bg-yellow-500" : ""}
                >
                  {statusLabel}
                </Badge>
                <span className="text-sm text-muted-foreground">
                  {progressPercentage.toFixed(1)}% completado
                </span>
              </div>

              {kpi.validity_start && kpi.validity_end && (
                <div className="mt-3 pt-3 border-t text-sm text-muted-foreground">
                  Vigencia: {format(new Date(kpi.validity_start), "dd/MM/yyyy")} - {format(new Date(kpi.validity_end), "dd/MM/yyyy")}
                  {!isWithinValidity && (
                    <Badge variant="outline" className="ml-2">Fuera de vigencia</Badge>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Add Entry Form */}
          <div>
            {!showAddForm ? (
              <Button onClick={() => setShowAddForm(true)} disabled={!isWithinValidity}>
                <Plus className="h-4 w-4 mr-2" />
                Registrar Ingreso
              </Button>
            ) : (
              <Card>
                <CardContent className="pt-4">
                  <form onSubmit={handleAddEntry} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Nombre del Ingreso *</Label>
                        <Input
                          value={newEntry.name}
                          onChange={(e) => setNewEntry({ ...newEntry, name: e.target.value })}
                          placeholder="Ej: Contrato firmado, Local abierto..."
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Fecha</Label>
                        <Input
                          type="date"
                          value={newEntry.entry_date}
                          onChange={(e) => setNewEntry({ ...newEntry, entry_date: e.target.value })}
                          required
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Descripción (opcional)</Label>
                      <Textarea
                        value={newEntry.description}
                        onChange={(e) => setNewEntry({ ...newEntry, description: e.target.value })}
                        rows={2}
                        placeholder="Detalles adicionales..."
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button type="submit">Registrar</Button>
                      <Button type="button" variant="outline" onClick={() => setShowAddForm(false)}>
                        Cancelar
                      </Button>
                    </div>
                  </form>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Entries Table */}
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm">Historial de Ingresos ({entries.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">#</TableHead>
                    <TableHead>Nombre</TableHead>
                    <TableHead>Descripción</TableHead>
                    <TableHead>Fecha</TableHead>
                    <TableHead className="w-16">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entries.map((entry, index) => (
                    <TableRow key={entry.id}>
                      <TableCell className="font-medium text-muted-foreground">
                        {entries.length - index}
                      </TableCell>
                      <TableCell className="font-medium">{entry.name}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {entry.description || "-"}
                      </TableCell>
                      <TableCell className="text-sm">
                        {format(new Date(entry.entry_date), "dd/MM/yyyy", { locale: es })}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDeleteEntry(entry.id)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {entries.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                        No hay ingresos registrados para este KPI
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      </DialogContent>
    </Dialog>
  );
}