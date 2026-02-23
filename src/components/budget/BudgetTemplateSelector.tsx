import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { QUANTITY_SOURCE_OPTIONS } from "./BudgetTemplateLineTree";

interface BudgetTemplate {
  id: string;
  name: string;
  description: string | null;
  budget_type: string;
}

interface BudgetTemplateSelectorProps {
  budgetType: "capex" | "opex";
  value: string;
  onChange: (templateId: string) => void;
  label?: string;
}

export const BudgetTemplateSelector = ({
  budgetType,
  value,
  onChange,
  label,
}: BudgetTemplateSelectorProps) => {
  const [templates, setTemplates] = useState<BudgetTemplate[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadTemplates();
  }, [budgetType]);

  const loadTemplates = async () => {
    try {
      const { data, error } = await supabase
        .from("budget_templates")
        .select("id, name, description, budget_type")
        .eq("budget_type", budgetType)
        .eq("is_active", true)
        .order("name");

      if (error) throw error;
      setTemplates(data || []);
    } catch (error) {
      console.error("Error loading templates:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-sm text-muted-foreground">Cargando plantillas...</span>
      </div>
    );
  }

  const hasTemplates = templates.length > 0;
  const isValid = value && value !== "none";

  return (
    <div className="space-y-2">
      {label && <Label>{label}</Label>}
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className={!isValid && hasTemplates ? "border-destructive" : ""}>
          <SelectValue placeholder="Seleccionar plantilla *" />
        </SelectTrigger>
        <SelectContent>
          {templates.map((template) => (
            <SelectItem key={template.id} value={template.id}>
              {template.name}
              {template.description && (
                <span className="text-xs text-muted-foreground ml-2">
                  - {template.description}
                </span>
              )}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {!hasTemplates && (
        <p className="text-xs text-destructive">
          No hay plantillas de {budgetType === "capex" ? "CAPEX" : "OPEX"} disponibles. 
          Solicite al administrador crear una plantilla.
        </p>
      )}
      {hasTemplates && !isValid && (
        <p className="text-xs text-destructive">
          Debe seleccionar una plantilla para crear el presupuesto
        </p>
      )}
    </div>
  );
};

// Helper to resolve quantity from contract surfaces
const resolveQuantityFromContract = (
  quantitySource: string | null | undefined,
  contractData: Record<string, any>,
  fallbackQuantity: number
): number => {
  if (!quantitySource || quantitySource === "manual") return fallbackQuantity;
  const validSources = QUANTITY_SOURCE_OPTIONS.map(o => o.value);
  if (validSources.includes(quantitySource)) {
    return contractData[quantitySource] ?? 0;
  }
  return fallbackQuantity;
};

// Helper to fetch contract surface data
const fetchContractSurfaces = async (contractId: string): Promise<Record<string, any>> => {
  const { data, error } = await supabase
    .from("contracts")
    .select("superficie_terreno, superficie_showroom, superficie_bodega_backoffice, superficie_edificada_local, superficie_exterior_cubierto, superficie_exterior_descubierto, num_estacionamientos, metros_lineales_frente")
    .eq("id", contractId)
    .single();
  if (error || !data) return {};
  return data;
};

// Helper function to apply a template to a budget
// Copies template structure including quantity, unit_type, currency fields
// Uses default_amount_uf from template as starting values
// When contractId is provided, resolves quantity_source references from contract surfaces
export const applyBudgetTemplate = async (
  templateId: string,
  budgetId: string,
  contractId?: string
): Promise<boolean> => {
  try {
    // Fetch contract surfaces if needed
    const contractData = contractId ? await fetchContractSurfaces(contractId) : {};

    // 1. Get template lines
    const { data: templateLines, error: linesError } = await supabase
      .from("budget_template_lines")
      .select("*")
      .eq("template_id", templateId)
      .order("display_order");

    if (linesError) throw linesError;

    if (!templateLines || templateLines.length === 0) {
      return true; // No lines to copy
    }

    // 2. Map old IDs to new IDs for parent references
    const idMap = new Map<string, string>();

    // Separate normal lines and percentage-calculated lines
    const normalLines = templateLines.filter((l: any) => l.calc_type !== "percentage");
    const calcLines = templateLines.filter((l: any) => l.calc_type === "percentage");

    // First pass: create all normal lines without parent_id
    for (const line of normalLines) {
      // Resolve quantity from contract if indexed
      const quantity = resolveQuantityFromContract(
        (line as any).quantity_source,
        contractData,
        line.quantity || 0
      );
      const defaultAmount = line.default_amount_uf || 0;
      const unitPrice = defaultAmount; // unit_price = template price per unit
      const totalAmount = quantity > 0 ? quantity * unitPrice : 0; // amount_uf = total
      
      const { data: newLine, error } = await supabase
        .from("budget_lines")
        .insert({
          budget_id: budgetId,
          name: line.name,
          description: line.description,
          amount_uf: totalAmount,
          display_order: line.display_order,
          status: "no_autorizado",
          parent_id: null,
          quantity: quantity,
          unit_type: line.unit_type || "m2",
          currency: line.currency || "UF",
          unit_price: unitPrice,
          template_line_id: line.id,
          supplier_name: line.supplier_name || null,
          category_id: line.category_id || null,
        })
        .select()
        .single();

      if (error) throw error;
      idMap.set(line.id, newLine.id);
    }

    // Second pass: update parent_id references for normal lines
    for (const line of normalLines) {
      if (line.parent_id && idMap.has(line.parent_id)) {
        const newId = idMap.get(line.id);
        const newParentId = idMap.get(line.parent_id);
        if (newId && newParentId) {
          await supabase
            .from("budget_lines")
            .update({ parent_id: newParentId })
            .eq("id", newId);
        }
      }
    }

    // Third pass: create percentage-calculated lines
    for (const line of calcLines) {
      const sourceLineId = (line as any).calc_source_line_id;
      const mappedSourceId = sourceLineId ? idMap.get(sourceLineId) || null : null;
      const percentage = (line as any).calc_percentage || 0;
      
      // Calculate amount based on source line subtotal
      let calcAmount = 0;
      if (mappedSourceId) {
        // Get the subtotal of the source line's children in the budget
        const { data: sourceChildren } = await supabase
          .from("budget_lines")
          .select("amount_uf")
          .eq("budget_id", budgetId)
          .eq("parent_id", mappedSourceId)
          .is("deleted_at", null);
        
        const sourceSubtotal = (sourceChildren || []).reduce((sum: number, c: any) => sum + (c.amount_uf || 0), 0);
        calcAmount = sourceSubtotal * percentage / 100;
      }
      
      const { data: newLine, error } = await supabase
        .from("budget_lines")
        .insert({
          budget_id: budgetId,
          name: line.name,
          description: line.description,
          amount_uf: calcAmount,
          display_order: line.display_order,
          status: "no_autorizado",
          parent_id: null,
          quantity: 1,
          unit_type: "gl",
          currency: "UF",
          unit_price: calcAmount,
          template_line_id: line.id,
          supplier_name: line.supplier_name || null,
          category_id: line.category_id || null,
          calc_type: "percentage",
          calc_source_line_id: mappedSourceId,
          calc_percentage: percentage,
        })
        .select()
        .single();

      if (error) throw error;
      idMap.set(line.id, newLine.id);
    }

    return true;
  } catch (error) {
    console.error("Error applying template:", error);
    return false;
  }
};

// Helper function to get the current template ID from budget lines
export const getCurrentTemplateId = async (budgetId: string): Promise<string | null> => {
  try {
    const { data, error } = await supabase
      .from("budget_lines")
      .select("template_line_id")
      .eq("budget_id", budgetId)
      .not("template_line_id", "is", null)
      .limit(1);

    if (error || !data || data.length === 0) return null;

    // Get the template_id from the template_line
    const { data: templateLine, error: tlError } = await supabase
      .from("budget_template_lines")
      .select("template_id")
      .eq("id", data[0].template_line_id)
      .single();

    if (tlError || !templateLine) return null;
    return templateLine.template_id;
  } catch {
    return null;
  }
};

// Helper function to update template preserving user values
export const updateBudgetTemplatePreservingValues = async (
  templateId: string,
  budgetId: string,
  contractId?: string
): Promise<boolean> => {
  try {
    // Fetch contract surfaces if needed
    const contractData = contractId ? await fetchContractSurfaces(contractId) : {};

    // 1. Get existing budget lines with their values
    const { data: existingLines, error: existingError } = await supabase
      .from("budget_lines")
      .select("*")
      .eq("budget_id", budgetId);

    if (existingError) throw existingError;

    // Create a map of template_line_id -> existing values
    const existingValuesMap = new Map<string, {
      quantity: number;
      unit_price: number;
      amount_uf: number;
      status: string;
      hasUserValues: boolean;
    }>();

    (existingLines || []).forEach((line: any) => {
      if (line.template_line_id) {
        const hasUserValues = (line.quantity > 0 || line.unit_price > 0 || line.amount_uf > 0);
        existingValuesMap.set(line.template_line_id, {
          quantity: line.quantity || 0,
          unit_price: line.unit_price || 0,
          amount_uf: line.amount_uf || 0,
          status: line.status || "no_autorizado",
          hasUserValues,
        });
      }
    });

    // 2. Delete existing lines
    const { error: deleteError } = await supabase
      .from("budget_lines")
      .delete()
      .eq("budget_id", budgetId);

    if (deleteError) throw deleteError;

    // 3. Get new template lines
    const { data: templateLines, error: linesError } = await supabase
      .from("budget_template_lines")
      .select("*")
      .eq("template_id", templateId)
      .order("display_order");

    if (linesError) throw linesError;

    if (!templateLines || templateLines.length === 0) {
      return true;
    }

    // Separate normal and calc lines
    const normalLines = templateLines.filter((l: any) => (l as any).calc_type !== "percentage");
    const calcLines = templateLines.filter((l: any) => (l as any).calc_type === "percentage");

    // 4. Create normal lines, preserving existing user values where they exist
    const idMap = new Map<string, string>();

    for (const line of normalLines) {
      const existingValues = existingValuesMap.get(line.id);
      const hasUserValues = existingValues?.hasUserValues || false;
      
      // Resolve quantity from contract if indexed
      const templateQuantity = resolveQuantityFromContract(
        (line as any).quantity_source,
        contractData,
        line.quantity || 0
      );
      const templateAmount = line.default_amount_uf || 0;
      const templateUnitPrice = templateQuantity > 0 ? templateAmount / templateQuantity : templateAmount;
      
      const { data: newLine, error } = await supabase
        .from("budget_lines")
        .insert({
          budget_id: budgetId,
          name: line.name,
          description: line.description,
          quantity: hasUserValues ? existingValues!.quantity : templateQuantity,
          unit_price: hasUserValues ? existingValues!.unit_price : templateUnitPrice,
          amount_uf: hasUserValues ? existingValues!.amount_uf : templateAmount,
          status: existingValues?.status ?? "no_autorizado",
          display_order: line.display_order,
          unit_type: line.unit_type || "m2",
          currency: line.currency || "UF",
          template_line_id: line.id,
          parent_id: null,
          supplier_name: line.supplier_name || null,
          category_id: line.category_id || null,
        })
        .select()
        .single();

      if (error) throw error;
      idMap.set(line.id, newLine.id);
    }

    // 5. Update parent_id references for normal lines
    for (const line of normalLines) {
      if (line.parent_id && idMap.has(line.parent_id)) {
        const newId = idMap.get(line.id);
        const newParentId = idMap.get(line.parent_id);
        if (newId && newParentId) {
          await supabase
            .from("budget_lines")
            .update({ parent_id: newParentId })
            .eq("id", newId);
        }
      }
    }

    // 6. Create percentage-calculated lines (always recalculated, never preserve user values)
    for (const line of calcLines) {
      const sourceLineId = (line as any).calc_source_line_id;
      const mappedSourceId = sourceLineId ? idMap.get(sourceLineId) || null : null;
      const percentage = (line as any).calc_percentage || 0;
      
      let calcAmount = 0;
      if (mappedSourceId) {
        const { data: sourceChildren } = await supabase
          .from("budget_lines")
          .select("amount_uf")
          .eq("budget_id", budgetId)
          .eq("parent_id", mappedSourceId)
          .is("deleted_at", null);
        
        const sourceSubtotal = (sourceChildren || []).reduce((sum: number, c: any) => sum + (c.amount_uf || 0), 0);
        calcAmount = sourceSubtotal * percentage / 100;
      }
      
      const { data: newLine, error } = await supabase
        .from("budget_lines")
        .insert({
          budget_id: budgetId,
          name: line.name,
          description: line.description,
          amount_uf: calcAmount,
          display_order: line.display_order,
          status: existingValuesMap.get(line.id)?.status ?? "no_autorizado",
          unit_type: "gl",
          currency: "UF",
          template_line_id: line.id,
          parent_id: null,
          quantity: 1,
          unit_price: calcAmount,
          supplier_name: line.supplier_name || null,
          category_id: line.category_id || null,
          calc_type: "percentage",
          calc_source_line_id: mappedSourceId,
          calc_percentage: percentage,
        })
        .select()
        .single();

      if (error) throw error;
      idMap.set(line.id, newLine.id);
    }

    return true;
  } catch (error) {
    console.error("Error updating template:", error);
    return false;
  }
};
