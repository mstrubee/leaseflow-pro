import { supabase } from "@/integrations/supabase/client";

/**
 * Lectura del CEBE de los contratos.
 *
 * ÚNICA FUENTE: "CEBE por empresa" (tabla contract_cebes). El campo personalizado "CEBE"
 * (contract_custom_fields) ya NO se lee en ninguna parte del sistema: todo módulo, listado,
 * buscador, documento o exportable debe usar estas funciones.
 *
 * Un contrato puede tener varios CEBE (locales mixtos); donde hace falta un solo texto se
 * muestran todos separados por coma ("A, B"), de modo que el buscador encuentra cualquiera.
 */

export interface ContractCebeEntry {
  id: string;
  contractId: string;
  companyId: string;
  cebe: string;
}

const CHUNK = 100; // contratos por consulta (evita URLs enormes)
const PAGE = 1000; // tope de filas por respuesta de PostgREST

const toEntry = (r: { id: string; contract_id: string; company_id: string; cebe: string }): ContractCebeEntry => ({
  id: r.id,
  contractId: r.contract_id,
  companyId: r.company_id,
  cebe: r.cebe,
});

/** Texto "A, B" a partir de los CEBE (en orden). */
export const joinCebes = (entries: Pick<ContractCebeEntry, "cebe">[]): string =>
  entries.map((e) => e.cebe).join(", ");

/** CEBE de varios contratos, en orden (sort_order, luego antigüedad). */
export async function loadContractCebeEntries(contractIds: string[]): Promise<Map<string, ContractCebeEntry[]>> {
  const out = new Map<string, ContractCebeEntry[]>();
  const ids = [...new Set(contractIds.filter(Boolean))];
  if (ids.length === 0) return out;

  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += CHUNK) chunks.push(ids.slice(i, i + CHUNK));

  const results = await Promise.all(
    chunks.map((chunk) =>
      supabase
        .from("contract_cebes")
        .select("id, contract_id, company_id, cebe, sort_order, created_at")
        .in("contract_id", chunk)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true }),
    ),
  );
  for (const res of results) {
    if (res.error) throw res.error;
    (res.data || []).forEach((r) => {
      const list = out.get(r.contract_id) ?? [];
      list.push(toEntry(r));
      out.set(r.contract_id, list);
    });
  }
  return out;
}

/** Todos los CEBE de todos los contratos (para pantallas que cruzan por código, no por contrato). */
export async function loadAllContractCebeEntries(): Promise<ContractCebeEntry[]> {
  const all: ContractCebeEntry[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("contract_cebes")
      .select("id, contract_id, company_id, cebe, sort_order, created_at")
      .order("contract_id", { ascending: true })
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    all.push(...(data || []).map(toEntry));
    if (!data || data.length < PAGE) break;
  }
  return all;
}

/** contrato -> "A, B" para varios contratos. Solo trae los que tienen CEBE. */
export async function loadContractCebes(contractIds: string[]): Promise<Map<string, string>> {
  const entries = await loadContractCebeEntries(contractIds);
  return new Map([...entries].map(([contractId, list]) => [contractId, joinCebes(list)]));
}

/** contrato -> "A, B" para TODOS los contratos. */
export async function loadAllContractCebes(): Promise<Map<string, string>> {
  const byContract = new Map<string, ContractCebeEntry[]>();
  (await loadAllContractCebeEntries()).forEach((e) => {
    const list = byContract.get(e.contractId) ?? [];
    list.push(e);
    byContract.set(e.contractId, list);
  });
  return new Map([...byContract].map(([contractId, list]) => [contractId, joinCebes(list)]));
}

/** CEBE de un contrato como texto ("A, B"), o null si no tiene. */
export async function loadContractCebeText(contractId: string): Promise<string | null> {
  if (!contractId) return null;
  const map = await loadContractCebes([contractId]);
  return map.get(contractId) ?? null;
}

/**
 * CEBE (cada uno con su empresa) de un contrato; lo usa el PDF de la Solicitud de OC para
 * mostrar la distribución. Vacío si no tiene.
 */
export async function loadContractCebeEntriesFor(contractId: string): Promise<ContractCebeEntry[]> {
  if (!contractId) return [];
  return (await loadContractCebeEntries([contractId])).get(contractId) ?? [];
}

export interface CebeByCompany {
  company: string;
  /** Códigos de esa empresa, separados por coma. */
  cebes: string;
}

/**
 * CEBE de un contrato agrupados por empresa, para identificar en documentos (PDF de la Solicitud de
 * OC) cuál es el CEBE de cada empresa. Devuelve null cuando no hace falta distinguir: el contrato
 * tiene una sola empresa y sus CEBE son de esa empresa (ahí basta "CEBE: X").
 */
export async function loadContractCebesByCompany(contractId: string): Promise<CebeByCompany[] | null> {
  const entries = await loadContractCebeEntriesFor(contractId);
  if (entries.length === 0) return null;

  const { data: contractCompanies, error: ccError } = await supabase
    .from("contract_companies")
    .select("company_id")
    .eq("contract_id", contractId);
  if (ccError) throw ccError;

  const companyIds = [...new Set(entries.map((e) => e.companyId))];
  if ((contractCompanies || []).length < 2 && companyIds.length < 2) return null;

  const { data: companies, error } = await supabase.from("companies").select("id, name").in("id", companyIds);
  if (error) throw error;
  const nameById = new Map((companies || []).map((c) => [c.id, c.name]));

  return companyIds.map((companyId) => ({
    company: nameById.get(companyId) ?? "Empresa",
    cebes: entries.filter((e) => e.companyId === companyId).map((e) => e.cebe).join(", "),
  }));
}
