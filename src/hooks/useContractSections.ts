import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export type SectionKey =
  | "address"
  | "contact"
  | "commercial"
  | "surfaces"
  | "documentVersions"
  | "terminationNotices"
  | "repository"
  | "budget"
  | "gantt"
  | "alerts";

interface SectionConfig {
  key: SectionKey;
  order: number;
  collapsed: boolean;
}

const DEFAULT_ORDER: SectionKey[] = [
  "address",
  "contact",
  "commercial",
  "surfaces",
  "documentVersions",
  "terminationNotices",
  "repository",
  "budget",
  "gantt",
  "alerts",
];

const STORAGE_KEY = "contract_detail_sections";

export function useContractSections() {
  const { user, isAdmin } = useAuth();
  const [sections, setSections] = useState<SectionConfig[]>(() => {
    // Initialize from localStorage
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        return JSON.parse(stored);
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

  // Persist to localStorage when sections change
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

      // Update order values
      return newSections.map((section, index) => ({
        ...section,
        order: index,
      }));
    });
  }, []);

  const toggleCollapsed = useCallback((key: SectionKey) => {
    setSections((prev) =>
      prev.map((section) =>
        section.key === key
          ? { ...section, collapsed: !section.collapsed }
          : section
      )
    );
  }, []);

  const setCollapsed = useCallback((key: SectionKey, collapsed: boolean) => {
    setSections((prev) =>
      prev.map((section) =>
        section.key === key ? { ...section, collapsed } : section
      )
    );
  }, []);

  const isCollapsed = useCallback(
    (key: SectionKey) => {
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
    setCollapsed,
    isCollapsed,
    collapseAll,
    expandAll,
    resetToDefault,
    canReorder: isAdmin,
  };
}
