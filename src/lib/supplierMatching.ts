// Fuzzy supplier-name matching used by the bulk OC import.
//
// Decision: the deterministic matcher below resolves the common cases
// ("QCLASS" vs "Q Class", "Desarrollo + Innovación" vs "DESARROLLO INNOVACION")
// with no network call. Whatever it can't resolve is sent to the
// `match-suppliers` edge function (AI) — see `matchSuppliersWithAI`.

import { supabase } from "@/integrations/supabase/client";

export interface MatchableSupplier {
  id: string;
  name: string;
}

export type SupplierMatchSource = "exact" | "fuzzy" | "ai" | "manual";

export interface SupplierMatch<T extends MatchableSupplier = MatchableSupplier> {
  supplier: T;
  score: number;
  source: "exact" | "fuzzy";
}

/** Minimum similarity (0-1) to auto-assign a supplier without asking the user. */
export const AUTO_MATCH_THRESHOLD = 0.9;

/** Names shorter than this (compact form) are never fuzzy-matched: too ambiguous. */
const MIN_FUZZY_LENGTH = 5;

// Legal-form suffixes that don't identify a company ("Foo SpA" == "Foo").
const LEGAL_SUFFIXES = new Set(["spa", "sa", "ltda", "limitada", "eirl", "cia", "sociedad", "anonima"]);

/**
 * Lowercase, strip accents/punctuation/symbols ("+", "&", "."), collapse spaces
 * and drop trailing legal-form tokens.
 * "Desarrollo + Innovación S.p.A." → "desarrollo innovacion"
 */
export function normalizeSupplierName(name: string | null | undefined): string {
  const base = (name ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\.(?=[a-z0-9])/g, "")   // "s.p.a." → "spa."; "a.b" → "ab"
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

  const tokens = base.split(" ").filter(Boolean);
  while (tokens.length > 1 && LEGAL_SUFFIXES.has(tokens[tokens.length - 1])) tokens.pop();
  return tokens.join(" ");
}

/** Normalized name without spaces — "q class" and "qclass" share this key. */
export function compactSupplierName(name: string | null | undefined): string {
  return normalizeSupplierName(name).replace(/ /g, "");
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const curr = [i];
    for (let j = 1; j <= b.length; j++) {
      curr[j] = Math.min(
        prev[j] + 1,
        curr[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    prev = curr;
  }
  return prev[b.length];
}

/** Similarity 0-1 between two supplier names (1 = same company name). */
export function supplierSimilarity(a: string, b: string): number {
  const na = normalizeSupplierName(a);
  const nb = normalizeSupplierName(b);
  if (!na || !nb) return 0;

  const ca = na.replace(/ /g, "");
  const cb = nb.replace(/ /g, "");
  if (ca === cb) return 1;

  // Same words, different order ("Innovacion Desarrollo" vs "Desarrollo Innovacion")
  const sortedA = na.split(" ").sort().join(" ");
  const sortedB = nb.split(" ").sort().join(" ");
  if (sortedA === sortedB) return 0.99;

  if (Math.min(ca.length, cb.length) < MIN_FUZZY_LENGTH) return 0;

  // One name contained in the other ("Sodimac" ⊂ "Sodimac Homecenter") —
  // kept for parity with the previous substring matcher.
  if (ca.includes(cb) || cb.includes(ca)) return AUTO_MATCH_THRESHOLD;

  // Typos / small variations
  const maxLen = Math.max(ca.length, cb.length);
  return 1 - levenshtein(ca, cb) / maxLen;
}

/** Best supplier for a raw name, or null if nothing reaches the auto threshold. */
export function findSupplierMatch<T extends MatchableSupplier>(
  rawName: string,
  suppliers: T[],
): SupplierMatch<T> | null {
  let best: SupplierMatch<T> | null = null;
  for (const supplier of suppliers) {
    const score = supplierSimilarity(rawName, supplier.name);
    if (score < AUTO_MATCH_THRESHOLD) continue;
    if (!best || score > best.score) {
      best = { supplier, score, source: score === 1 ? "exact" : "fuzzy" };
      if (score === 1) break;
    }
  }
  return best;
}

// ── AI matching ───────────────────────────────────────────────────────────────

const AI_CHUNK_SIZE = 100;

/**
 * Asks the `match-suppliers` edge function which of `names` correspond to an
 * existing supplier. Returns a map: raw name → supplier (high confidence only).
 * Never throws: on any failure it returns what it has so far (empty map), so
 * the import keeps working with the deterministic matches only.
 */
export async function matchSuppliersWithAI<T extends MatchableSupplier>(
  names: string[],
  suppliers: T[],
): Promise<Map<string, T>> {
  const result = new Map<string, T>();
  if (names.length === 0 || suppliers.length === 0) return result;

  const supplierNames = suppliers.map(s => s.name);

  for (let i = 0; i < names.length; i += AI_CHUNK_SIZE) {
    const chunk = names.slice(i, i + AI_CHUNK_SIZE);
    try {
      const { data, error } = await supabase.functions.invoke("match-suppliers", {
        body: { names: chunk, suppliers: supplierNames },
      });
      if (error) throw error;

      for (const m of (data?.matches ?? []) as Array<{
        nameIndex: number; supplierIndex: number; confidence: string;
      }>) {
        const name = chunk[m.nameIndex];
        const supplier = suppliers[m.supplierIndex];
        if (name && supplier && m.confidence === "high") result.set(name, supplier);
      }
    } catch (err) {
      console.error("match-suppliers (AI) failed:", err);
      break;
    }
  }
  return result;
}
