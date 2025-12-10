import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";

interface BudgetTemplate {
  id: string;
  name: string;
  description: string | null;
  budget_type: string;
}

interface BudgetTemplateSelectorProps {
  budgetType: "inversion_inicial" | "capex";
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
          No hay plantillas de {budgetType === "inversion_inicial" ? "Inversión Inicial" : "CAPEX"} disponibles. 
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

// Helper function to apply a template to a budget
// IMPORTANT: Always creates lines with amount_uf = 0, ignoring any template default values
export const applyBudgetTemplate = async (
  templateId: string,
  budgetId: string
): Promise<boolean> => {
  try {
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

    // First pass: create all lines without parent_id
    // ALWAYS set amount_uf = 0 regardless of template default values
    for (const line of templateLines) {
      const { data: newLine, error } = await supabase
        .from("budget_lines")
        .insert({
          budget_id: budgetId,
          name: line.name,
          description: line.description,
          amount_uf: 0, // Always start at 0, template defaults are ignored
          display_order: line.display_order,
          status: "no_autorizado",
          parent_id: null,
        })
        .select()
        .single();

      if (error) throw error;
      idMap.set(line.id, newLine.id);
    }

    // Second pass: update parent_id references
    for (const line of templateLines) {
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

    return true;
  } catch (error) {
    console.error("Error applying template:", error);
    return false;
  }
};
