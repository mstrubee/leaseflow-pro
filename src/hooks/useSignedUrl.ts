import { useEffect, useState } from "react";
import { resolveFileUrl } from "@/lib/storageUtils";

/**
 * Resolve a single stored file reference (path / legacy public URL) to a
 * short-lived signed URL for display or download. Returns null while loading
 * or if resolution fails.
 */
export function useSignedUrl(storedValue: string | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    if (!storedValue) {
      setUrl(null);
      return;
    }
    resolveFileUrl(storedValue).then((resolved) => {
      if (active) setUrl(resolved);
    });
    return () => {
      active = false;
    };
  }, [storedValue]);

  return url;
}

/**
 * Resolve an array of stored file references to signed URLs, preserving order.
 * Entries that fail to resolve are kept as their original value so links still
 * render (e.g. external URLs).
 */
export function useSignedUrls(storedValues: (string | null | undefined)[]): string[] {
  const [urls, setUrls] = useState<string[]>([]);
  const key = (storedValues || []).join("|");

  useEffect(() => {
    let active = true;
    const list = storedValues || [];
    Promise.all(list.map((v) => resolveFileUrl(v))).then((resolved) => {
      if (active) {
        setUrls(resolved.map((r, i) => r ?? (list[i] as string) ?? ""));
      }
    });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return urls;
}
