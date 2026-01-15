import { useState, useEffect, useCallback } from "react";
import { useAuth } from "./useAuth";

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

export function useEditContractSections() {
  const { isAdmin } = useAuth();
  const [sections, setSections] = useState<SectionConfig[]>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as SectionConfig[];
        // Ensure all expected keys exist (handle new keys added after localStorage was saved)
        const storedKeys = new Set(parsed.map(s => s.key));
        const missingKeys = DEFAULT_ORDER.filter(k => !storedKeys.has(k));
        if (missingKeys.length > 0) {
          // Add missing sections to the end
          const maxOrder = Math.max(...parsed.map(s => s.order), -1);
          const newSections = missingKeys.map((key, idx) => ({
            key,
            order: maxOrder + 1 + idx,
            collapsed: false,
          }));
          return [...parsed, ...newSections];
        }
        return parsed;
      } catch {
        return DEFAULT_ORDER.map((key, index) => ({
          key,
          order: index,
          collapsed: false,
        }));
      }
    }
    return DEFAULT_ORDER.map((key, index) => ({
      key,
      order: index,
      collapsed: false,
    }));
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sections));
  }, [sections]);

  const getSortedSections = useCallback(() => {
    return [...sections].sort((a, b) => a.order - b.order);
  }, [sections]);

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
  }, []);

  const toggleCollapsed = useCallback((key: EditSectionKey) => {
    setSections((prev) =>
      prev.map((section) =>
        section.key === key
          ? { ...section, collapsed: !section.collapsed }
          : section
      )
    );
  }, []);

  const isCollapsed = useCallback(
    (key: EditSectionKey) => {
      return sections.find((s) => s.key === key)?.collapsed ?? false;
    },
    [sections]
  );

  const collapseAll = useCallback(() => {
    setSections((prev) =>
      prev.map((section) => ({ ...section, collapsed: true }))
    );
  }, []);

  const expandAll = useCallback(() => {
    setSections((prev) =>
      prev.map((section) => ({ ...section, collapsed: false }))
    );
  }, []);

  const resetToDefault = useCallback(() => {
    setSections(
      DEFAULT_ORDER.map((key, index) => ({
        key,
        order: index,
        collapsed: false,
      }))
    );
  }, []);

  return {
    sections: getSortedSections(),
    reorderSections,
    toggleCollapsed,
    isCollapsed,
    collapseAll,
    expandAll,
    resetToDefault,
    canReorder: isAdmin,
  };
}
