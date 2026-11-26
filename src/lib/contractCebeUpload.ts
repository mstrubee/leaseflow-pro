import { supabase } from "@/integrations/supabase/client";
import { loadContractCebeEntriesFor } from "@/lib/contractCebe";

/**
 * Escritura del CEBE desde las cargas masivas (Excel). Escribe SIEMPRE en "CEBE por empresa"
 * (contract_cebes); el campo personalizado antiguo ya no se usa.
 */

/** "A, B" / "A;B" / "A / B" -> ["A", "B"] (sin repetidos, sin vacíos). */
export const parseCebeCodes = (raw: string | null | undefined): string[] => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of String(raw ?? "").split(/[,;/\n]+/)) {
    const code = part.trim();
    if (!code || seen.has(code.toLowerCase())) continue;
    seen.add(code.toLowerCase());
    out.push(code);
  }
  return out;
};

export interface ApplyCebeResult {
  /** Códigos agregados a "CEBE por empresa". */
  added: string[];
  /** true si se corrigió el único CEBE que ya tenía el local. */
  replaced: boolean;
  /** Cosas que no se pudieron hacer solas y requieren Editar contrato. */
  warnings: string[];
}

/**
 * Aplica los CEBE de una fila de Excel a un contrato:
 *  - Un solo código y el local tiene un único CEBE: lo corrige (equivale al comportamiento de siempre).
 *  - Varios códigos: agrega los que falten (nunca borra, para no romper distribuciones de OC).
 *  - Un código nuevo se asigna a la empresa del contrato SOLO si el contrato tiene una sola empresa;
 *    con varias empresas (o ninguna) no se puede saber a cuál va: queda como advertencia.
 */
export async function applyCebeCodesToContract(contractId: string, codes: string[]): Promise<ApplyCebeResult> {
  const result: ApplyCebeResult = { added: [], replaced: false, warnings: [] };
  if (codes.length === 0) return result;

  const existing = await loadContractCebeEntriesFor(contractId);
  const has = (code: string) => existing.some((e) => e.cebe.toLowerCase() === code.toLowerCase());

  if (codes.length === 1 && existing.length === 1) {
    if (!has(codes[0])) {
      const { error } = await supabase.from("contract_cebes").update({ cebe: codes[0] }).eq("id", existing[0].id);
      if (error) throw error;
      result.replaced = true;
    }
    return result;
  }

  const toAdd = codes.filter((c) => !has(c));
  if (toAdd.length === 0) return result;

  const { data: companies, error: companiesError } = await supabase
    .from("contract_companies")
    .select("company_id")
    .eq("contract_id", contractId);
  if (companiesError) throw companiesError;

  if ((companies || []).length !== 1) {
    result.warnings.push(
      `CEBE ${toAdd.join(", ")}: el contrato tiene ${(companies || []).length === 0 ? "ninguna empresa" : "varias empresas"}; asígnalos en Editar contrato > CEBE por empresa.`,
    );
    return result;
  }

  const { error } = await supabase.from("contract_cebes").insert(
    toAdd.map((cebe, i) => ({
      contract_id: contractId,
      company_id: companies![0].company_id,
      cebe,
      sort_order: existing.length + i,
    })),
  );
  if (error) throw error;
  result.added = toAdd;
  return result;
}
