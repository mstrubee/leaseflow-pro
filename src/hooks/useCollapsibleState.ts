import { useState, useEffect, useCallback, useMemo } from "react";
import { useUserPreferences } from "./useUserPreferences";

/**
 * Hook to manage collapsible state with Supabase persistence (falls back to localStorage).
 * Sections load collapsed by default unless the user has previously expanded them.
 * 
 * @param storageKey - Unique key to store the state
 * @param defaultExpanded - Optional array of IDs that should be expanded by default (first time only)
 */
export const useCollapsibleState = (
  storageKey: string,
  defaultExpanded: string[] = []
) => {
  const { value: expandedArray, setValue: setExpandedArray, loading } = useUserPreferences<string[]>({
    preferenceKey: `collapsible_${storageKey}`,
    defaultValue: defaultExpanded,
    localStorageKey: storageKey,
  });

  const expandedIds = useMemo(() => new Set(expandedArray), [expandedArray]);

  const setExpandedIds = useCallback((newSet: Set<string>) => {
    setExpandedArray(Array.from(newSet));
  }, [setExpandedArray]);

  const toggle = useCallback((id: string) => {
    setExpandedArray((prev) => {
      const set = new Set(prev);
      if (set.has(id)) {
        set.delete(id);
      } else {
        set.add(id);
      }
      return Array.from(set);
    });
  }, [setExpandedArray]);

  const expandAll = useCallback((ids: string[]) => {
    setExpandedArray(ids);
  }, [setExpandedArray]);

  const collapseAll = useCallback(() => {
    setExpandedArray([]);
  }, [setExpandedArray]);

  const isExpanded = useCallback((id: string) => {
    return expandedIds.has(id);
  }, [expandedIds]);

  const expand = useCallback((id: string) => {
    setExpandedArray((prev) => {
      const set = new Set(prev);
      set.add(id);
      return Array.from(set);
    });
  }, [setExpandedArray]);

  return {
    expandedIds,
    setExpandedIds,
    toggle,
    expandAll,
    collapseAll,
    isExpanded,
    expand,
    loading,
  };
};

/**
 * Simpler hook for single collapsible sections (like cards/panels)
 * Loads collapsed by default unless previously expanded by user.
 */
export const useSingleCollapsible = (
  storageKey: string,
  defaultOpen: boolean = false
) => {
  const { value: isOpen, setValue: setIsOpen, loading } = useUserPreferences<boolean>({
    preferenceKey: `single_collapsible_${storageKey}`,
    defaultValue: defaultOpen,
    localStorageKey: storageKey,
  });

  const toggle = useCallback(() => {
    setIsOpen((prev) => !prev);
  }, [setIsOpen]);

  return { isOpen, setIsOpen, toggle, loading };
};
