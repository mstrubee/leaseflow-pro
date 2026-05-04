import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

interface UseUserPreferencesOptions<T> {
  preferenceKey: string;
  defaultValue: T;
  localStorageKey?: string; // For migration from localStorage
}

// Helper to check if error is a transient network error
const isNetworkError = (error: unknown): boolean => {
  if (!error) return false;
  const message = (error as { message?: string })?.message || String(error);
  return message.includes('Failed to fetch') || 
         message.includes('NetworkError') ||
         message.includes('network') ||
         message.includes('ECONNREFUSED');
};

// Helper to delay execution
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// ============================================================
// Global shared cache for user_preferences
// All useUserPreferences hooks share a single batched fetch per user
// to avoid N+1 requests on pages that mount many preference-backed components.
// ============================================================
type PrefRecord = { preference_key: string; preference_value: unknown };
const prefsCache = new Map<string, Map<string, unknown>>();
const prefsLoadPromise = new Map<string, Promise<Map<string, unknown>>>();
const prefsSubscribers = new Map<string, Set<() => void>>();

function notifyPrefsSubscribers(userId: string) {
  prefsSubscribers.get(userId)?.forEach((fn) => { try { fn(); } catch {} });
}

function subscribePrefs(userId: string, cb: () => void): () => void {
  let set = prefsSubscribers.get(userId);
  if (!set) { set = new Set(); prefsSubscribers.set(userId, set); }
  set.add(cb);
  return () => { set!.delete(cb); };
}

async function loadAllUserPrefs(userId: string): Promise<Map<string, unknown>> {
  const cached = prefsCache.get(userId);
  if (cached) return cached;
  const inflight = prefsLoadPromise.get(userId);
  if (inflight) return inflight;
  const p = (async () => {
    try {
      const { data, error } = await supabase
        .from("user_preferences")
        .select("preference_key, preference_value")
        .eq("user_id", userId);
      const map = new Map<string, unknown>();
      if (!error && Array.isArray(data)) {
        (data as PrefRecord[]).forEach((row) => map.set(row.preference_key, row.preference_value));
      }
      prefsCache.set(userId, map);
      notifyPrefsSubscribers(userId);
      return map;
    } finally {
      prefsLoadPromise.delete(userId);
    }
  })();
  prefsLoadPromise.set(userId, p);
  return p;
}

function updatePrefsCache(userId: string, key: string, value: unknown) {
  let map = prefsCache.get(userId);
  if (!map) { map = new Map(); prefsCache.set(userId, map); }
  map.set(key, value);
  notifyPrefsSubscribers(userId);
}

/**
 * Hook to manage user preferences stored in Supabase.
 * Falls back to localStorage if user is not authenticated.
 * Automatically migrates localStorage data to Supabase on first load.
 * Includes retry logic and silent fallback for network errors.
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
  const loadingPromiseRef = useRef<Promise<void> | null>(null);
  // Track if user has interacted - prevents async load from overwriting user changes
  const userHasInteractedRef = useRef(false);

  // Fetch from Supabase with retry logic
  const fetchFromSupabaseWithRetry = useCallback(async (
    userId: string,
    maxRetries = 2
  ): Promise<{ data: T | null; success: boolean }> => {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const { data, error } = await supabase
          .from("user_preferences")
          .select("preference_value")
          .eq("user_id", userId)
          .eq("preference_key", preferenceKey)
          .maybeSingle();

        if (error) {
          if (isNetworkError(error)) {
            // Retry for network errors
            if (attempt < maxRetries) {
              await delay(300 * (attempt + 1)); // 300ms, 600ms
              continue;
            }
            // Silent fallback after all retries
            return { data: null, success: false };
          }
          // Log non-network errors
          console.error("Error loading preferences:", error);
          return { data: null, success: false };
        }

        return { 
          data: data?.preference_value as T | null, 
          success: true 
        };
      } catch (e) {
        if (isNetworkError(e)) {
          if (attempt < maxRetries) {
            await delay(300 * (attempt + 1));
            continue;
          }
          // Silent fallback
          return { data: null, success: false };
        }
        console.error("Error fetching preferences:", e);
        return { data: null, success: false };
      }
    }
    return { data: null, success: false };
  }, [preferenceKey]);

  // Load preferences from Supabase or localStorage
  const loadPreferences = useCallback(async () => {
    if (authLoading) return;

    // Avoid duplicate simultaneous calls
    if (loadingPromiseRef.current) {
      return loadingPromiseRef.current;
    }

    const loadPromise = (async () => {
      setLoading(true);
      try {
        // If user has already interacted, don't overwrite their changes
        if (userHasInteractedRef.current) {
          setLoading(false);
          return;
        }

        if (user) {
          // Use shared global cache (one fetch per user, not per hook instance)
          const map = await loadAllUserPrefs(user.id);

          if (userHasInteractedRef.current) {
            setLoading(false);
            return;
          }

          const cachedValue = map.has(preferenceKey) ? (map.get(preferenceKey) as T) : null;

          if (cachedValue !== null && cachedValue !== undefined) {
            setValue(cachedValue);
            lastSavedRef.current = JSON.stringify(cachedValue);
          } else {
            // No data in Supabase, try to migrate from localStorage
            const localStorageKeyToUse = localStorageKey || preferenceKey;
            const localData = localStorage.getItem(localStorageKeyToUse);

            if (localData) {
              try {
                const parsed = JSON.parse(localData) as T;
                setValue(parsed);
                saveToSupabase(parsed).then(() => {
                  localStorage.removeItem(localStorageKeyToUse);
                }).catch(() => {});
              } catch (e) {
                console.error("Error parsing localStorage data:", e);
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
        if (!isNetworkError(e)) {
          console.error("Error in loadPreferences:", e);
        }
        loadFromLocalStorage();
      } finally {
        setLoading(false);
        setInitialized(true);
      }
    })();

    loadingPromiseRef.current = loadPromise;
    await loadPromise;
    loadingPromiseRef.current = null;
  }, [user, authLoading, preferenceKey, localStorageKey, defaultValue, fetchFromSupabaseWithRetry]);

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

  const saveToSupabase = async (data: T): Promise<boolean> => {
    if (!user) return false;

    try {
      // Check if record exists
      const { data: existing, error: fetchError } = await supabase
        .from("user_preferences")
        .select("id")
        .eq("user_id", user.id)
        .eq("preference_key", preferenceKey)
        .maybeSingle();

      if (fetchError && !isNetworkError(fetchError)) {
        console.error("Error checking existing preference:", fetchError);
        return false;
      }

      if (fetchError && isNetworkError(fetchError)) {
        // Silent failure for network errors, save to localStorage as backup
        saveToLocalStorage(data);
        return false;
      }

      const jsonValue = JSON.parse(JSON.stringify(data));
      let error;

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
        if (!isNetworkError(error)) {
          console.error("Error saving preferences to Supabase:", error);
        }
        // Fallback to localStorage
        saveToLocalStorage(data);
        return false;
      }

      lastSavedRef.current = JSON.stringify(data);
      return true;
    } catch (e) {
      if (!isNetworkError(e)) {
        console.error("Error in saveToSupabase:", e);
      }
      // Fallback to localStorage
      saveToLocalStorage(data);
      return false;
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
    [user, preferenceKey, localStorageKey]
  );

  // Update value and trigger save
  const updateValue = useCallback(
    (newValue: T | ((prev: T) => T)) => {
      // Mark that user has interacted - prevents async load from overwriting
      userHasInteractedRef.current = true;
      
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
