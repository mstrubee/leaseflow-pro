import { useState, useEffect, useCallback } from "react";

/**
 * Hook to manage collapsible state with localStorage persistence.
 * Sections load collapsed by default unless the user has previously expanded them.
 * 
 * @param storageKey - Unique key to store the state in localStorage
 * @param defaultExpanded - Optional array of IDs that should be expanded by default (first time only)
 */
export const useCollapsibleState = (
  storageKey: string,
  defaultExpanded: string[] = []
) => {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        return new Set(JSON.parse(stored));
      }
    } catch (e) {
      console.error("Error reading collapsible state from localStorage:", e);
    }
    return new Set(defaultExpanded);
  });

  // Persist to localStorage whenever expandedIds changes
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(Array.from(expandedIds)));
    } catch (e) {
      console.error("Error saving collapsible state to localStorage:", e);
    }
  }, [expandedIds, storageKey]);

  const toggle = useCallback((id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const expandAll = useCallback((ids: string[]) => {
    setExpandedIds(new Set(ids));
  }, []);

  const collapseAll = useCallback(() => {
    setExpandedIds(new Set());
  }, []);

  const isExpanded = useCallback((id: string) => {
    return expandedIds.has(id);
  }, [expandedIds]);

  const expand = useCallback((id: string) => {
    setExpandedIds(prev => new Set([...prev, id]));
  }, []);

  return {
    expandedIds,
    setExpandedIds,
    toggle,
    expandAll,
    collapseAll,
    isExpanded,
    expand,
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
  const [isOpen, setIsOpen] = useState(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored !== null) {
        return stored === "true";
      }
    } catch (e) {
      console.error("Error reading collapsible state from localStorage:", e);
    }
    return defaultOpen;
  });

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, String(isOpen));
    } catch (e) {
      console.error("Error saving collapsible state to localStorage:", e);
    }
  }, [isOpen, storageKey]);

  const toggle = useCallback(() => {
    setIsOpen(prev => !prev);
  }, []);

  return { isOpen, setIsOpen, toggle };
};
