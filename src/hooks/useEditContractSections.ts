import { useCallback, useMemo } from "react";
import { useAuth } from "./useAuth";
import { useUserPreferences } from "./useUserPreferences";

export type EditSectionKey =
  | "dates"
  | "currency"
  | "escalation"
  | "variableRent"
  | "guarantee"
  | "entryExpenses"
  | "gastosComunes"
  | "fondoPromocion"
  | "otrosArrendamientos"
  | "periodicAdjustments"
  | "duration"
  | "noticeType";

interface SectionConfig {
  key: EditSectionKey;
  order: number;
  collapsed: boolean;
}

const DEFAULT_ORDER: EditSectionKey[] = [
  "dates",
  "currency",
  "escalation",
  "variableRent",
  "guarantee",
  "entryExpenses",
  "gastosComunes",
  "fondoPromocion",
  "otrosArrendamientos",
  "periodicAdjustments",
  "duration",
  "noticeType",
];

const STORAGE_KEY = "edit_contract_commercial_sections";

const getDefaultSections = (): SectionConfig[] =>
  DEFAULT_ORDER.map((key, index) => ({
    key,
    order: index,
    collapsed: false,
  }));

export function useEditContractSections() {
  const { isAdmin } = useAuth();

  const { value: sections, setValue: setSections, loading } = useUserPreferences<SectionConfig[]>({
    preferenceKey: STORAGE_KEY,
    defaultValue: getDefaultSections(),
    localStorageKey: STORAGE_KEY,
  });

  // Ensure all expected keys exist (handle new keys added after preferences were saved)
  const normalizedSections = useMemo(() => {
    const storedKeys = new Set(sections.map(s => s.key));
    const missingKeys = DEFAULT_ORDER.filter(k => !storedKeys.has(k));
    
    if (missingKeys.length > 0) {
      const maxOrder = Math.max(...sections.map(s => s.order), -1);
      const newSections = missingKeys.map((key, idx) => ({
        key,
        order: maxOrder + 1 + idx,
        collapsed: false,
      }));
      return [...sections, ...newSections];
    }
    return sections;
  }, [sections]);

  const getSortedSections = useCallback(() => {
    return [...normalizedSections].sort((a, b) => a.order - b.order);
  }, [normalizedSections]);

  const reorderSections = useCallback((activeId: string, overId: string) => {
    setSections((prev) => {
      const oldIndex = prev.findIndex((s) => s.key === activeId);
      const newIndex = prev.findIndex((s) => s.key === overId);

      if (oldIndex === -1 || newIndex === -1) return prev;

      const newSections = [...prev];
      const [removed] = newSections.splice(oldIndex, 1);
      newSections.splice(newIndex, 0, removed);

      return newSections.map((section, index) => ({
        ...section,
        order: index,
      }));
    });
  }, [setSections]);

  const toggleCollapsed = useCallback((key: EditSectionKey) => {
    setSections((prev) =>
      prev.map((section) =>
        section.key === key
          ? { ...section, collapsed: !section.collapsed }
          : section
      )
    );
  }, [setSections]);

  const isCollapsed = useCallback(
    (key: EditSectionKey) => {
      return normalizedSections.find((s) => s.key === key)?.collapsed ?? false;
    },
    [normalizedSections]
  );

  const collapseAll = useCallback(() => {
    setSections((prev) =>
      prev.map((section) => ({ ...section, collapsed: true }))
    );
  }, [setSections]);

  const expandAll = useCallback(() => {
    setSections((prev) =>
      prev.map((section) => ({ ...section, collapsed: false }))
    );
  }, [setSections]);

  const resetToDefault = useCallback(() => {
    setSections(getDefaultSections());
  }, [setSections]);

  return {
    sections: getSortedSections(),
    reorderSections,
    toggleCollapsed,
    isCollapsed,
    collapseAll,
    expandAll,
    resetToDefault,
    canReorder: isAdmin,
    loading,
  };
}
