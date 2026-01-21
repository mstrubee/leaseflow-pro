import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

export interface KPICategory {
  id: string;
  name: string;
  description: string | null;
  display_order: number;
  is_active: boolean;
  created_at: string;
}

export interface KPIGoalType {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
}

export interface KPIFrequency {
  id: string;
  name: string;
  months_interval: number;
  is_active: boolean;
}

export interface KPI {
  id: string;
  name: string;
  category_id: string;
  description: string | null;
  formula: string | null;
  formula_variables: any;
  unit: string | null;
  goal_value: number | null;
  goal_type_id: string | null;
  threshold_green: number | null;
  threshold_yellow: number | null;
  threshold_red: number | null;
  frequency_id: string | null;
  responsible_user_id: string | null;
  data_source: string | null;
  is_active: boolean;
  display_order: number;
  created_at: string;
  updated_at: string;
  // Sub-KPI support
  parent_kpi_id: string | null;
  assigned_user_id: string | null;
  // Classification
  kpi_classification: string;
  // KPI Empresa simplified fields
  validity_start: string | null;
  validity_end: string | null;
  goal_100: number | null;
  // Joined fields
  category?: KPICategory;
  goal_type?: KPIGoalType;
  frequency?: KPIFrequency;
  responsible_user?: { id: string; email: string; full_name: string | null };
}

export interface KPIEmpresaEntry {
  id: string;
  kpi_id: string;
  name: string;
  description: string | null;
  entry_date: string;
  created_at: string;
  created_by: string | null;
}

export interface KPIMeasurement {
  id: string;
  kpi_id: string;
  period_start: string;
  period_end: string;
  value: number;
  notes: string | null;
  created_at: string;
}

export interface KPIAuditLog {
  id: string;
  entity_type: string;
  entity_id: string;
  action: string;
  old_values: any;
  new_values: any;
  changed_at: string;
  changed_by: string | null;
}

export function useKPI() {
  const { user } = useAuth();
  const [categories, setCategories] = useState<KPICategory[]>([]);
  const [goalTypes, setGoalTypes] = useState<KPIGoalType[]>([]);
  const [frequencies, setFrequencies] = useState<KPIFrequency[]>([]);
  const [kpis, setKpis] = useState<KPI[]>([]);
  const [measurements, setMeasurements] = useState<KPIMeasurement[]>([]);
  const [auditLogs, setAuditLogs] = useState<KPIAuditLog[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      
      const [categoriesRes, goalTypesRes, frequenciesRes, kpisRes] = await Promise.all([
        supabase.from("kpi_categories").select("*").order("display_order"),
        supabase.from("kpi_goal_types").select("*").eq("is_active", true),
        supabase.from("kpi_frequencies").select("*").eq("is_active", true),
        supabase.from("kpis").select(`
          *,
          category:kpi_categories(*),
          goal_type:kpi_goal_types(*),
          frequency:kpi_frequencies(*)
        `).order("display_order"),
      ]);

      if (categoriesRes.error) throw categoriesRes.error;
      if (goalTypesRes.error) throw goalTypesRes.error;
      if (frequenciesRes.error) throw frequenciesRes.error;
      if (kpisRes.error) throw kpisRes.error;

      setCategories(categoriesRes.data || []);
      setGoalTypes(goalTypesRes.data || []);
      setFrequencies(frequenciesRes.data || []);
      setKpis(kpisRes.data || []);
    } catch (error) {
      console.error("Error loading KPI data:", error);
      toast.error("Error al cargar datos de KPI");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user) {
      loadData();
    }
  }, [user, loadData]);

  // Category CRUD
  const createCategory = async (data: Partial<KPICategory>) => {
    try {
      const { data: newCategory, error } = await supabase
        .from("kpi_categories")
        .insert({ name: data.name || "", description: data.description, is_active: data.is_active, display_order: data.display_order, created_by: user?.id })
        .select()
        .single();

      if (error) throw error;
      
      await logAudit("kpi_category", newCategory.id, "create", null, newCategory);
      setCategories((prev) => [...prev, newCategory]);
      toast.success("Categoría creada exitosamente");
      return newCategory;
    } catch (error) {
      console.error("Error creating category:", error);
      toast.error("Error al crear categoría");
      throw error;
    }
  };

  const updateCategory = async (id: string, data: Partial<KPICategory>) => {
    try {
      const oldCategory = categories.find((c) => c.id === id);
      const { data: updated, error } = await supabase
        .from("kpi_categories")
        .update(data)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      
      await logAudit("kpi_category", id, "update", oldCategory, updated);
      setCategories((prev) => prev.map((c) => (c.id === id ? updated : c)));
      toast.success("Categoría actualizada");
      return updated;
    } catch (error) {
      console.error("Error updating category:", error);
      toast.error("Error al actualizar categoría");
      throw error;
    }
  };

  const deleteCategory = async (id: string) => {
    try {
      const oldCategory = categories.find((c) => c.id === id);
      const { error } = await supabase.from("kpi_categories").delete().eq("id", id);
      if (error) throw error;
      
      await logAudit("kpi_category", id, "delete", oldCategory, null);
      setCategories((prev) => prev.filter((c) => c.id !== id));
      toast.success("Categoría eliminada");
    } catch (error) {
      console.error("Error deleting category:", error);
      toast.error("Error al eliminar categoría");
      throw error;
    }
  };

  // KPI CRUD
  const createKPI = async (data: Partial<KPI>) => {
    try {
      const insertData = {
        name: data.name || "",
        category_id: data.category_id || "",
        description: data.description,
        formula: data.formula,
        formula_variables: data.formula_variables,
        unit: data.unit,
        goal_value: data.goal_value,
        goal_type_id: data.goal_type_id,
        threshold_green: data.threshold_green,
        threshold_yellow: data.threshold_yellow,
        threshold_red: data.threshold_red,
        frequency_id: data.frequency_id,
        responsible_user_id: data.responsible_user_id,
        data_source: data.data_source,
        is_active: data.is_active,
        display_order: data.display_order,
        created_by: user?.id,
        parent_kpi_id: data.parent_kpi_id || null,
        assigned_user_id: data.assigned_user_id || null,
      };
      const { data: newKPI, error } = await supabase
        .from("kpis")
        .insert(insertData)
        .select(`
          *,
          category:kpi_categories(*),
          goal_type:kpi_goal_types(*),
          frequency:kpi_frequencies(*)
        `)
        .single();

      if (error) throw error;
      
      // Save formula version
      if (data.formula) {
        await supabase.from("kpi_formula_versions").insert({
          kpi_id: newKPI.id,
          formula: data.formula,
          formula_variables: data.formula_variables || [],
          version_number: 1,
          created_by: user?.id,
        });
      }
      
      await logAudit("kpi", newKPI.id, "create", null, newKPI);
      setKpis((prev) => [...prev, newKPI]);
      toast.success("KPI creado exitosamente");
      return newKPI;
    } catch (error) {
      console.error("Error creating KPI:", error);
      toast.error("Error al crear KPI");
      throw error;
    }
  };

  const updateKPI = async (id: string, data: Partial<KPI>) => {
    try {
      const oldKPI = kpis.find((k) => k.id === id);
      const { data: updated, error } = await supabase
        .from("kpis")
        .update(data)
        .eq("id", id)
        .select(`
          *,
          category:kpi_categories(*),
          goal_type:kpi_goal_types(*),
          frequency:kpi_frequencies(*)
        `)
        .single();

      if (error) throw error;
      
      // Save new formula version if formula changed
      if (data.formula && data.formula !== oldKPI?.formula) {
        const { data: versions } = await supabase
          .from("kpi_formula_versions")
          .select("version_number")
          .eq("kpi_id", id)
          .order("version_number", { ascending: false })
          .limit(1);
        
        const nextVersion = (versions?.[0]?.version_number || 0) + 1;
        
        await supabase.from("kpi_formula_versions").insert({
          kpi_id: id,
          formula: data.formula,
          formula_variables: data.formula_variables || [],
          version_number: nextVersion,
          created_by: user?.id,
        });
      }
      
      await logAudit("kpi", id, "update", oldKPI, updated);
      setKpis((prev) => prev.map((k) => (k.id === id ? updated : k)));
      toast.success("KPI actualizado");
      return updated;
    } catch (error) {
      console.error("Error updating KPI:", error);
      toast.error("Error al actualizar KPI");
      throw error;
    }
  };

  const deleteKPI = async (id: string) => {
    try {
      const oldKPI = kpis.find((k) => k.id === id);
      const { error } = await supabase.from("kpis").delete().eq("id", id);
      if (error) throw error;
      
      await logAudit("kpi", id, "delete", oldKPI, null);
      setKpis((prev) => prev.filter((k) => k.id !== id));
      toast.success("KPI eliminado");
    } catch (error) {
      console.error("Error deleting KPI:", error);
      toast.error("Error al eliminar KPI");
      throw error;
    }
  };

  // Goal Type CRUD
  const createGoalType = async (data: Partial<KPIGoalType>) => {
    try {
      const { data: newType, error } = await supabase
        .from("kpi_goal_types")
        .insert({ name: data.name || "", description: data.description, is_active: data.is_active })
        .select()
        .single();

      if (error) throw error;
      setGoalTypes((prev) => [...prev, newType]);
      toast.success("Tipo de meta creado");
      return newType;
    } catch (error) {
      console.error("Error creating goal type:", error);
      toast.error("Error al crear tipo de meta");
      throw error;
    }
  };

  const updateGoalType = async (id: string, data: Partial<KPIGoalType>) => {
    try {
      const { data: updated, error } = await supabase
        .from("kpi_goal_types")
        .update(data)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      setGoalTypes((prev) => prev.map((t) => (t.id === id ? updated : t)));
      toast.success("Tipo de meta actualizado");
      return updated;
    } catch (error) {
      console.error("Error updating goal type:", error);
      toast.error("Error al actualizar tipo de meta");
      throw error;
    }
  };

  const deleteGoalType = async (id: string) => {
    try {
      const { error } = await supabase.from("kpi_goal_types").delete().eq("id", id);
      if (error) throw error;
      setGoalTypes((prev) => prev.filter((t) => t.id !== id));
      toast.success("Tipo de meta eliminado");
    } catch (error) {
      console.error("Error deleting goal type:", error);
      toast.error("Error al eliminar tipo de meta");
      throw error;
    }
  };

  // Measurements
  const createMeasurement = async (data: Partial<KPIMeasurement>) => {
    try {
      const { data: newMeasurement, error } = await supabase
        .from("kpi_measurements")
        .insert({ kpi_id: data.kpi_id || "", period_start: data.period_start || "", period_end: data.period_end || "", value: data.value || 0, notes: data.notes, created_by: user?.id })
        .select()
        .single();

      if (error) throw error;
      setMeasurements((prev) => [...prev, newMeasurement]);
      toast.success("Medición registrada");
      return newMeasurement;
    } catch (error) {
      console.error("Error creating measurement:", error);
      toast.error("Error al registrar medición");
      throw error;
    }
  };

  const loadMeasurements = async (kpiId?: string) => {
    try {
      let query = supabase.from("kpi_measurements").select("*").order("period_start", { ascending: false });
      if (kpiId) query = query.eq("kpi_id", kpiId);
      
      const { data, error } = await query;
      if (error) throw error;
      setMeasurements(data || []);
      return data;
    } catch (error) {
      console.error("Error loading measurements:", error);
      throw error;
    }
  };

  const loadAuditLogs = async (entityType?: string, entityId?: string) => {
    try {
      let query = supabase.from("kpi_audit_log").select("*").order("changed_at", { ascending: false }).limit(100);
      if (entityType) query = query.eq("entity_type", entityType);
      if (entityId) query = query.eq("entity_id", entityId);
      
      const { data, error } = await query;
      if (error) throw error;
      setAuditLogs(data || []);
      return data;
    } catch (error) {
      console.error("Error loading audit logs:", error);
      throw error;
    }
  };

  const logAudit = async (entityType: string, entityId: string, action: string, oldValues: any, newValues: any) => {
    try {
      await supabase.from("kpi_audit_log").insert({
        entity_type: entityType,
        entity_id: entityId,
        action,
        old_values: oldValues,
        new_values: newValues,
        changed_by: user?.id,
      });
    } catch (error) {
      console.error("Error logging audit:", error);
    }
  };

  // Calculate KPI status based on thresholds
  const getKPIStatus = (kpi: KPI, value: number): "green" | "yellow" | "red" | "unknown" => {
    if (kpi.threshold_green == null || kpi.threshold_yellow == null || kpi.threshold_red == null) {
      return "unknown";
    }

    const goalType = kpi.goal_type?.name || "Mayor es Mejor";

    if (goalType === "Mayor es Mejor") {
      if (value >= kpi.threshold_green) return "green";
      if (value >= kpi.threshold_yellow) return "yellow";
      return "red";
    } else if (goalType === "Menor es Mejor") {
      if (value <= kpi.threshold_green) return "green";
      if (value <= kpi.threshold_yellow) return "yellow";
      return "red";
    } else if (goalType === "Rango") {
      if (value >= kpi.threshold_green && value <= kpi.threshold_yellow) return "green";
      return "red";
    } else if (goalType === "Exacto") {
      if (value === kpi.goal_value) return "green";
      if (Math.abs(value - (kpi.goal_value || 0)) <= (kpi.threshold_yellow || 0)) return "yellow";
      return "red";
    }

    return "unknown";
  };

  return {
    categories,
    goalTypes,
    frequencies,
    kpis,
    measurements,
    auditLogs,
    loading,
    loadData,
    createCategory,
    updateCategory,
    deleteCategory,
    createKPI,
    updateKPI,
    deleteKPI,
    createGoalType,
    updateGoalType,
    deleteGoalType,
    createMeasurement,
    loadMeasurements,
    loadAuditLogs,
    getKPIStatus,
  };
}
