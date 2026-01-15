import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

interface UseUserPreferencesOptions<T> {
  preferenceKey: string;
  defaultValue: T;
  localStorageKey?: string; // For migration from localStorage
}

/**
 * Hook to manage user preferences stored in Supabase.
 * Falls back to localStorage if user is not authenticated.
 * Automatically migrates localStorage data to Supabase on first load.
 */
export function useUserPreferences<T>({
  preferenceKey,
  defaultValue,
  localStorageKey,
}: UseUserPreferencesOptions<T>) {
  const { user, loading: authLoading } = useAuth();
  const [value, setValue] = useState<T>(defaultValue);
  const [loading, setLoading] = useState(true);
  const [initialized, setInitialized] = useState(false);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastSavedRef = useRef<string>("");

  // Load preferences from Supabase or localStorage
  const loadPreferences = useCallback(async () => {
    if (authLoading) return;

    setLoading(true);
    try {
      if (user) {
        // Try to load from Supabase
        const { data, error } = await supabase
          .from("user_preferences")
          .select("preference_value")
          .eq("user_id", user.id)
          .eq("preference_key", preferenceKey)
          .maybeSingle();

        if (error) {
          console.error("Error loading preferences:", error);
          // Fall back to localStorage
          loadFromLocalStorage();
          return;
        }

        if (data?.preference_value) {
          setValue(data.preference_value as T);
          lastSavedRef.current = JSON.stringify(data.preference_value);
        } else {
          // No data in Supabase, try to migrate from localStorage
          const localStorageKeyToUse = localStorageKey || preferenceKey;
          const localData = localStorage.getItem(localStorageKeyToUse);
          
          if (localData) {
            try {
              const parsed = JSON.parse(localData) as T;
              setValue(parsed);
              // Migrate to Supabase
              await saveToSupabase(parsed);
              // Clear localStorage after successful migration
              localStorage.removeItem(localStorageKeyToUse);
            } catch (e) {
              console.error("Error migrating from localStorage:", e);
              setValue(defaultValue);
            }
          } else {
            setValue(defaultValue);
          }
        }
      } else {
        // Not authenticated, use localStorage
        loadFromLocalStorage();
      }
    } catch (e) {
      console.error("Error in loadPreferences:", e);
      loadFromLocalStorage();
    } finally {
      setLoading(false);
      setInitialized(true);
    }
  }, [user, authLoading, preferenceKey, localStorageKey, defaultValue]);

  const loadFromLocalStorage = () => {
    const localStorageKeyToUse = localStorageKey || preferenceKey;
    try {
      const stored = localStorage.getItem(localStorageKeyToUse);
      if (stored) {
        const parsed = JSON.parse(stored) as T;
        setValue(parsed);
        lastSavedRef.current = stored;
      } else {
        setValue(defaultValue);
      }
    } catch (e) {
      console.error("Error reading from localStorage:", e);
      setValue(defaultValue);
    }
  };

  const saveToSupabase = async (data: T) => {
    if (!user) return;

    // Check if record exists
    const { data: existing } = await supabase
      .from("user_preferences")
      .select("id")
      .eq("user_id", user.id)
      .eq("preference_key", preferenceKey)
      .maybeSingle();

    let error;
    const jsonValue = JSON.parse(JSON.stringify(data));
    
    if (existing) {
      // Update existing record
      const result = await supabase
        .from("user_preferences")
        .update({
          preference_value: jsonValue,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", user.id)
        .eq("preference_key", preferenceKey);
      error = result.error;
    } else {
      // Insert new record
      const result = await supabase
        .from("user_preferences")
        .insert([{
          user_id: user.id,
          preference_key: preferenceKey,
          preference_value: jsonValue,
        }]);
      error = result.error;
    }

    if (error) {
      console.error("Error saving preferences to Supabase:", error);
    } else {
      lastSavedRef.current = JSON.stringify(data);
    }
  };

  const saveToLocalStorage = (data: T) => {
    const localStorageKeyToUse = localStorageKey || preferenceKey;
    try {
      const stringified = JSON.stringify(data);
      localStorage.setItem(localStorageKeyToUse, stringified);
      lastSavedRef.current = stringified;
    } catch (e) {
      console.error("Error saving to localStorage:", e);
    }
  };

  // Debounced save function
  const save = useCallback(
    (data: T) => {
      const stringified = JSON.stringify(data);
      
      // Skip if no change
      if (stringified === lastSavedRef.current) return;

      // Clear existing timeout
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }

      // Debounce save by 500ms
      saveTimeoutRef.current = setTimeout(() => {
        if (user) {
          saveToSupabase(data);
        } else {
          saveToLocalStorage(data);
        }
      }, 500);
    },
    [user, preferenceKey]
  );

  // Update value and trigger save
  const updateValue = useCallback(
    (newValue: T | ((prev: T) => T)) => {
      setValue((prev) => {
        const next = typeof newValue === "function" 
          ? (newValue as (prev: T) => T)(prev) 
          : newValue;
        save(next);
        return next;
      });
    },
    [save]
  );

  // Initial load
  useEffect(() => {
    loadPreferences();
  }, [loadPreferences]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  return {
    value,
    setValue: updateValue,
    loading,
    initialized,
    refresh: loadPreferences,
  };
}
