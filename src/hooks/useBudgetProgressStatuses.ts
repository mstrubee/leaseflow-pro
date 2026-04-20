import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface BudgetProgressStatus {
  id: string;
  name: string;
  color: string;
  is_selectable: boolean;
  is_active: boolean;
  display_order: number;
}

export const PROGRESS_COLOR_OPTIONS = [
  { value: "red", label: "Rojo", className: "bg-red-500 hover:bg-red-600 text-white" },
  { value: "yellow", label: "Amarillo", className: "bg-yellow-500 hover:bg-yellow-600 text-white" },
  { value: "blue", label: "Azul", className: "bg-blue-500 hover:bg-blue-600 text-white" },
  { value: "green", label: "Verde", className: "bg-green-500 hover:bg-green-600 text-white" },
  { value: "purple", label: "Morado", className: "bg-purple-500 hover:bg-purple-600 text-white" },
  { value: "orange", label: "Naranja", className: "bg-orange-500 hover:bg-orange-600 text-white" },
  { value: "gray", label: "Gris", className: "bg-gray-500 hover:bg-gray-600 text-white" },
];

export const getProgressColorClass = (color?: string | null) => {
  return PROGRESS_COLOR_OPTIONS.find(o => o.value === color)?.className || "bg-gray-400 hover:bg-gray-500 text-white";
};

export function useBudgetProgressStatuses() {
  const [statuses, setStatuses] = useState<BudgetProgressStatus[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await (supabase as any)
      .from("budget_line_progress_statuses")
      .select("*")
      .eq("is_active", true)
      .order("display_order");
    setStatuses((data as BudgetProgressStatus[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  return { statuses, loading, reload: load };
}
