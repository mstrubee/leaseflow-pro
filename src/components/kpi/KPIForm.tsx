import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { KPI, KPICategory, KPIGoalType, KPIFrequency } from "@/hooks/useKPI";
import { KPIFormulaEditor } from "./KPIFormulaEditor";

interface Profile {
  id: string;
  email: string;
  full_name: string | null;
}

interface KPIFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kpi: KPI | null;
  categories: KPICategory[];
  goalTypes: KPIGoalType[];
  frequencies: KPIFrequency[];
  users: Profile[];
  onSave: (data: Partial<KPI>) => Promise<void>;
}

export function KPIForm({
  open,
  onOpenChange,
  kpi,
  categories,
  goalTypes,
  frequencies,
  users,
  onSave,
}: KPIFormProps) {
  const [formData, setFormData] = useState<Partial<KPI>>({
    name: "",
    category_id: "",
    description: "",
    formula: "",
    formula_variables: [],
    unit: "",
    goal_value: null,
    goal_type_id: null,
    threshold_green: null,
    threshold_yellow: null,
    threshold_red: null,
    frequency_id: null,
    responsible_user_id: null,
    data_source: "",
    is_active: true,
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (kpi) {
      setFormData({
        name: kpi.name,
        category_id: kpi.category_id,
        description: kpi.description || "",
        formula: kpi.formula || "",
        formula_variables: kpi.formula_variables || [],
        unit: kpi.unit || "",
        goal_value: kpi.goal_value,
        goal_type_id: kpi.goal_type_id,
        threshold_green: kpi.threshold_green,
        threshold_yellow: kpi.threshold_yellow,
        threshold_red: kpi.threshold_red,
        frequency_id: kpi.frequency_id,
        responsible_user_id: kpi.responsible_user_id,
        data_source: kpi.data_source || "",
        is_active: kpi.is_active,
      });
    } else {
      setFormData({
        name: "",
        category_id: categories[0]?.id || "",
        description: "",
        formula: "",
        formula_variables: [],
        unit: "",
        goal_value: null,
        goal_type_id: goalTypes[0]?.id || null,
        threshold_green: null,
        threshold_yellow: null,
        threshold_red: null,
        frequency_id: frequencies[0]?.id || null,
        responsible_user_id: null,
        data_source: "",
        is_active: true,
      });
    }
  }, [kpi, categories, goalTypes, frequencies]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave(formData);
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  const updateField = <K extends keyof typeof formData>(key: K, value: (typeof formData)[K]) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{kpi ? "Editar KPI" : "Nuevo KPI"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <Tabs defaultValue="general" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="general">General</TabsTrigger>
              <TabsTrigger value="formula">Fórmula</TabsTrigger>
              <TabsTrigger value="thresholds">Semáforo</TabsTrigger>
            </TabsList>

            <TabsContent value="general" className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Nombre del KPI *</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => updateField("name", e.target.value)}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="category">Categoría *</Label>
                  <Select
                    value={formData.category_id}
                    onValueChange={(value) => updateField("category_id", value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar categoría" />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.filter((c) => c.is_active).map((cat) => (
                        <SelectItem key={cat.id} value={cat.id}>
                          {cat.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Descripción</Label>
                <Textarea
                  id="description"
                  value={formData.description || ""}
                  onChange={(e) => updateField("description", e.target.value)}
                  rows={3}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="unit">Unidad de Medida</Label>
                  <Input
                    id="unit"
                    value={formData.unit || ""}
                    onChange={(e) => updateField("unit", e.target.value)}
                    placeholder="%, UF, m², etc."
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="goal_value">Meta</Label>
                  <Input
                    id="goal_value"
                    type="number"
                    step="any"
                    value={formData.goal_value ?? ""}
                    onChange={(e) => updateField("goal_value", e.target.value ? parseFloat(e.target.value) : null)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="goal_type">Tipo de Meta</Label>
                  <Select
                    value={formData.goal_type_id || ""}
                    onValueChange={(value) => updateField("goal_type_id", value || null)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar tipo" />
                    </SelectTrigger>
                    <SelectContent>
                      {goalTypes.map((type) => (
                        <SelectItem key={type.id} value={type.id}>
                          {type.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="frequency">Frecuencia de Medición</Label>
                  <Select
                    value={formData.frequency_id || ""}
                    onValueChange={(value) => updateField("frequency_id", value || null)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar frecuencia" />
                    </SelectTrigger>
                    <SelectContent>
                      {frequencies.map((freq) => (
                        <SelectItem key={freq.id} value={freq.id}>
                          {freq.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="responsible">Responsable</Label>
                  <Select
                    value={formData.responsible_user_id || ""}
                    onValueChange={(value) => updateField("responsible_user_id", value || null)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar responsable" />
                    </SelectTrigger>
                    <SelectContent>
                      {users.map((user) => (
                        <SelectItem key={user.id} value={user.id}>
                          {user.full_name || user.email}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="data_source">Fuente de Datos</Label>
                  <Input
                    id="data_source"
                    value={formData.data_source || ""}
                    onChange={(e) => updateField("data_source", e.target.value)}
                    placeholder="Ej: Sistema de contratos"
                  />
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <Switch
                  id="is_active"
                  checked={formData.is_active}
                  onCheckedChange={(checked) => updateField("is_active", checked)}
                />
                <Label htmlFor="is_active">KPI Activo</Label>
              </div>
            </TabsContent>

            <TabsContent value="formula" className="mt-4">
              <KPIFormulaEditor
                formula={formData.formula || ""}
                variables={formData.formula_variables || []}
                onFormulaChange={(formula) => updateField("formula", formula)}
                onVariablesChange={(variables) => updateField("formula_variables", variables)}
              />
            </TabsContent>

            <TabsContent value="thresholds" className="space-y-4 mt-4">
              <p className="text-sm text-muted-foreground mb-4">
                Configure los umbrales para el semáforo de estado del KPI. Los valores dependen del tipo de meta seleccionado.
              </p>

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="threshold_green" className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-green-500" />
                    Umbral Verde
                  </Label>
                  <Input
                    id="threshold_green"
                    type="number"
                    step="any"
                    value={formData.threshold_green ?? ""}
                    onChange={(e) => updateField("threshold_green", e.target.value ? parseFloat(e.target.value) : null)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="threshold_yellow" className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-yellow-500" />
                    Umbral Amarillo
                  </Label>
                  <Input
                    id="threshold_yellow"
                    type="number"
                    step="any"
                    value={formData.threshold_yellow ?? ""}
                    onChange={(e) => updateField("threshold_yellow", e.target.value ? parseFloat(e.target.value) : null)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="threshold_red" className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-red-500" />
                    Umbral Rojo
                  </Label>
                  <Input
                    id="threshold_red"
                    type="number"
                    step="any"
                    value={formData.threshold_red ?? ""}
                    onChange={(e) => updateField("threshold_red", e.target.value ? parseFloat(e.target.value) : null)}
                  />
                </div>
              </div>

              <div className="p-4 bg-muted rounded-lg text-sm space-y-2">
                <p><strong>Mayor es Mejor:</strong> Verde ≥ {formData.threshold_green || "?"}, Amarillo ≥ {formData.threshold_yellow || "?"}, Rojo {"<"} {formData.threshold_yellow || "?"}</p>
                <p><strong>Menor es Mejor:</strong> Verde ≤ {formData.threshold_green || "?"}, Amarillo ≤ {formData.threshold_yellow || "?"}, Rojo {">"} {formData.threshold_yellow || "?"}</p>
                <p><strong>Rango:</strong> Verde entre {formData.threshold_green || "?"} y {formData.threshold_yellow || "?"}</p>
                <p><strong>Exacto:</strong> Verde = Meta, Amarillo dentro de ± {formData.threshold_yellow || "?"}</p>
              </div>
            </TabsContent>
          </Tabs>

          <div className="flex justify-end gap-2 mt-6 pt-4 border-t">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Guardando..." : kpi ? "Guardar Cambios" : "Crear KPI"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
