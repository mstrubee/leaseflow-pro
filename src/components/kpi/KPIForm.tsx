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
    kpi_classification: "objetivos_gerencia",
    validity_start: null,
    validity_end: null,
    goal_100: null,
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
        parent_kpi_id: kpi.parent_kpi_id,
        assigned_user_id: kpi.assigned_user_id,
        kpi_classification: kpi.kpi_classification || "objetivos_gerencia",
        validity_start: kpi.validity_start,
        validity_end: kpi.validity_end,
        goal_100: kpi.goal_100,
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
        parent_kpi_id: null,
        assigned_user_id: null,
        kpi_classification: "objetivos_gerencia",
        validity_start: null,
        validity_end: null,
        goal_100: null,
      });
    }
  }, [kpi, categories, goalTypes, frequencies]);

  const isKPIEmpresa = formData.kpi_classification === "kpi_empresa";
  const isSubKPI = !!formData.parent_kpi_id;

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

  // Calculate auto-goals for KPI Empresa
  const goal80 = formData.goal_100 ? (formData.goal_100 * 0.8).toFixed(0) : "-";
  const goal120 = formData.goal_100 ? (formData.goal_100 * 1.2).toFixed(0) : "-";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {kpi?.id ? "Editar KPI" : isSubKPI ? "Nuevo Sub-KPI" : "Nuevo KPI"}
          </DialogTitle>
          {isSubKPI && (
            <p className="text-sm text-muted-foreground">
              Este Sub-KPI estará vinculado al KPI principal y puede asignarse a un usuario específico.
            </p>
          )}
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          {/* Classification Selection */}
          <div className="mb-4 p-3 bg-muted/50 rounded-lg">
            <Label className="mb-2 block">Clasificación del KPI *</Label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="kpi_classification"
                  value="objetivos_gerencia"
                  checked={formData.kpi_classification === "objetivos_gerencia"}
                  onChange={(e) => updateField("kpi_classification" as keyof typeof formData, e.target.value as any)}
                  className="w-4 h-4"
                />
                <span className="text-sm font-medium">Objetivos Gerencia</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="kpi_classification"
                  value="kpi_empresa"
                  checked={formData.kpi_classification === "kpi_empresa"}
                  onChange={(e) => updateField("kpi_classification" as keyof typeof formData, e.target.value as any)}
                  className="w-4 h-4"
                />
                <span className="text-sm font-medium">KPI Empresa</span>
              </label>
            </div>
          </div>

          <Tabs defaultValue="general" className="w-full">
            <TabsList className={`grid w-full ${isKPIEmpresa ? 'grid-cols-2' : 'grid-cols-3'}`}>
              <TabsTrigger value="general">General</TabsTrigger>
              {!isKPIEmpresa && <TabsTrigger value="formula">Fórmula</TabsTrigger>}
              <TabsTrigger value="thresholds">{isKPIEmpresa ? "Metas" : "Semáforo"}</TabsTrigger>
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

              {/* KPI Empresa: Validity Period */}
              {isKPIEmpresa && (
                <div className="grid grid-cols-2 gap-4 p-3 bg-blue-50 dark:bg-blue-950/30 rounded-lg border border-blue-200 dark:border-blue-800">
                  <div className="space-y-2">
                    <Label htmlFor="validity_start">Fecha Inicio Vigencia *</Label>
                    <Input
                      id="validity_start"
                      type="date"
                      value={formData.validity_start || ""}
                      onChange={(e) => updateField("validity_start" as any, e.target.value || null)}
                      required={isKPIEmpresa}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="validity_end">Fecha Término Vigencia *</Label>
                    <Input
                      id="validity_end"
                      type="date"
                      value={formData.validity_end || ""}
                      onChange={(e) => updateField("validity_end" as any, e.target.value || null)}
                      required={isKPIEmpresa}
                    />
                  </div>
                </div>
              )}

              {/* Objetivos Gerencia fields */}
              {!isKPIEmpresa && (
                <>
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
                </>
              )}

              {isSubKPI && (
                <div className="grid grid-cols-2 gap-4 p-3 bg-blue-50 dark:bg-blue-950/30 rounded-lg border border-blue-200 dark:border-blue-800">
                  <div className="space-y-2">
                    <Label htmlFor="assigned_user">Usuario Asignado (Sub-KPI)</Label>
                    <Select
                      value={formData.assigned_user_id || ""}
                      onValueChange={(value) => updateField("assigned_user_id" as any, value || null)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Asignar a usuario" />
                      </SelectTrigger>
                      <SelectContent>
                        {users.map((user) => (
                          <SelectItem key={user.id} value={user.id}>
                            {user.full_name || user.email}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      Este usuario será responsable de alcanzar la meta de este Sub-KPI
                    </p>
                  </div>
                </div>
              )}

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

                {!isKPIEmpresa && (
                  <div className="space-y-2">
                    <Label htmlFor="data_source">Fuente de Datos</Label>
                    <Input
                      id="data_source"
                      value={formData.data_source || ""}
                      onChange={(e) => updateField("data_source", e.target.value)}
                      placeholder="Ej: Sistema de contratos"
                    />
                  </div>
                )}
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

            {!isKPIEmpresa && (
              <TabsContent value="formula" className="mt-4">
                <KPIFormulaEditor
                  formula={formData.formula || ""}
                  variables={formData.formula_variables || []}
                  onFormulaChange={(formula) => updateField("formula", formula)}
                  onVariablesChange={(variables) => updateField("formula_variables", variables)}
                />
              </TabsContent>
            )}

            <TabsContent value="thresholds" className="space-y-4 mt-4">
              {isKPIEmpresa ? (
                <>
                  <p className="text-sm text-muted-foreground mb-4">
                    Configure la meta 100% y el sistema calculará automáticamente las metas 80% y 120%. Cada ingreso registrado suma 1 unidad.
                  </p>

                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-2 p-3 bg-yellow-50 dark:bg-yellow-950/30 rounded-lg border border-yellow-200 dark:border-yellow-800">
                      <Label className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full bg-yellow-500" />
                        Meta 80% (Auto)
                      </Label>
                      <div className="text-2xl font-bold text-yellow-600">{goal80}</div>
                      <p className="text-xs text-muted-foreground">Nivel mínimo aceptable</p>
                    </div>

                    <div className="space-y-2 p-3 bg-green-50 dark:bg-green-950/30 rounded-lg border border-green-200 dark:border-green-800">
                      <Label htmlFor="goal_100" className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full bg-green-500" />
                        Meta 100% *
                      </Label>
                      <Input
                        id="goal_100"
                        type="number"
                        step="1"
                        value={formData.goal_100 ?? ""}
                        onChange={(e) => updateField("goal_100" as any, e.target.value ? parseFloat(e.target.value) : null)}
                        required={isKPIEmpresa}
                        className="text-lg font-bold"
                      />
                      <p className="text-xs text-muted-foreground">Objetivo esperado</p>
                    </div>

                    <div className="space-y-2 p-3 bg-blue-50 dark:bg-blue-950/30 rounded-lg border border-blue-200 dark:border-blue-800">
                      <Label className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full bg-blue-500" />
                        Meta 120% (Auto)
                      </Label>
                      <div className="text-2xl font-bold text-blue-600">{goal120}</div>
                      <p className="text-xs text-muted-foreground">Objetivo excelencia</p>
                    </div>
                  </div>

                  <div className="p-4 bg-muted rounded-lg text-sm">
                    <p className="font-medium mb-2">Medición simplificada:</p>
                    <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                      <li>Cada ingreso registrado suma <strong>1 unidad</strong> al progreso</li>
                      <li>El sistema calcula automáticamente el porcentaje de avance</li>
                      <li>Los ingresos solo pueden registrarse dentro del período de vigencia</li>
                    </ul>
                  </div>
                </>
              ) : (
                <>
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
                </>
              )}
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