import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { DashboardSection } from "@/components/dashboard/DraggableDashboard";

const DEFAULT_SECTIONS: Omit<DashboardSection, "component">[] = [
  { key: "alerts", title: "Próximas Alertas", isVisible: true, order: 0 },
  { key: "indicators", title: "Indicadores Económicos", isVisible: true, order: 1 },
  { key: "summary", title: "Resumen de Contratos", isVisible: true, order: 2 },
  { key: "regional", title: "Contratos por Región", isVisible: true, order: 3 },
];

export function useDashboardSections() {
  const { user } = useAuth();
  const [sections, setSections] = useState<Omit<DashboardSection, "component">[]>(DEFAULT_SECTIONS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      loadSections();
    } else {
      setSections(DEFAULT_SECTIONS);
      setLoading(false);
    }
  }, [user?.id]);

  const loadSections = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from("dashboard_sections")
        .select("*")
        .eq("user_id", user.id);

      if (error) throw error;

      if (data && data.length > 0) {
        const mergedSections = DEFAULT_SECTIONS.map((defaultSection) => {
          const savedSection = data.find((s) => s.section_key === defaultSection.key);
          if (savedSection) {
            return {
              ...defaultSection,
              isVisible: savedSection.is_visible,
              order: savedSection.display_order,
            };
          }
          return defaultSection;
        });
        setSections(mergedSections.sort((a, b) => a.order - b.order));
      } else {
        setSections(DEFAULT_SECTIONS);
      }
    } catch (error) {
      console.error("Error loading dashboard sections:", error);
      setSections(DEFAULT_SECTIONS);
    } finally {
      setLoading(false);
    }
  };

  const updateSections = (newSections: Omit<DashboardSection, "component">[]) => {
    setSections(newSections);
  };

  return { sections, loading, updateSections };
}
