/**
 * CEBE por empresa para contratos con más de una empresa.
 *
 * El CEBE "de siempre" (campo personalizado único del contrato) NO cambia; esto
 * solo agrega la posibilidad de varios CEBE, cada uno asignado a UNA empresa del
 * contrato, y de asignar cada Orden CO a uno de ellos.
 */

export interface ContractCebe {
  id: string;
  company_id: string;
  cebe: string;
}

/** Fila editable. `key` es el id para filas existentes y una clave temporal para nuevas. */
export interface CebeDraft {
  key: string;
  id?: string;
  company_id: string;
  cebe: string;
}

export const cebeToDrafts = (rows: ContractCebe[]): CebeDraft[] =>
  rows.map((r) => ({ key: r.id, id: r.id, company_id: r.company_id, cebe: r.cebe }));

export const newCebeDraft = (companyId = ""): CebeDraft => ({
  key: `new-cebe-${Math.random().toString(36).slice(2)}`,
  company_id: companyId,
  cebe: "",
});

const norm = (s: string) => s.trim().toLowerCase();

/** Mensaje de error o null si los borradores se pueden guardar. Filas totalmente vacías se ignoran. */
export const validateCebeDrafts = (drafts: CebeDraft[], companyIds: string[]): string | null => {
  const seen = new Set<string>();
  for (const d of drafts) {
    const hasCebe = d.cebe.trim().length > 0;
    if (!hasCebe && !d.company_id) continue;
    if (!hasCebe) return "Cada CEBE adicional debe tener un código.";
    if (!d.company_id) return `El CEBE "${d.cebe.trim()}" debe asignarse a una empresa.`;
    if (!companyIds.includes(d.company_id)) {
      return `El CEBE "${d.cebe.trim()}" está asignado a una empresa que ya no pertenece al contrato.`;
    }
    const k = norm(d.cebe);
    if (seen.has(k)) return `El CEBE "${d.cebe.trim()}" está repetido.`;
    seen.add(k);
  }
  return null;
};

/** Etiqueta para selectores: "H04C8P1290 · Empresa X". */
export const cebeLabel = (cebe: string, companyName?: string | null) =>
  companyName ? `${cebe} · ${companyName}` : cebe;
