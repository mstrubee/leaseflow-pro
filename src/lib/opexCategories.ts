import { supabase } from "@/integrations/supabase/client";

// Categorías OPEX con vigencia por año (renombrar, fusionar y retirar desde 2027; ver docs/opex-categorias-2027.md).
// `valid_from_year` / `valid_to_year` en NULL = sin límite, así que mientras no haya cambios todo se comporta como antes.

export interface OpexCategoryRecord {
  id: string;
  name: string;
  is_active: boolean | null;
  display_order: number | null;
  supplier_category_id: string | null;
  valid_from_year: number | null;
  valid_to_year: number | null;
}

type CategoryValidity = Pick<OpexCategoryRecord, "is_active" | "valid_from_year" | "valid_to_year">;

// Columnas para consultar categorías con su vigencia.
export const OPEX_CATEGORY_COLUMNS =
  "id, name, is_active, display_order, supplier_category_id, valid_from_year, valid_to_year";

export const isCategoryValidForYear = (category: CategoryValidity, year: number): boolean =>
  category.is_active !== false &&
  (category.valid_from_year === null || category.valid_from_year <= year) &&
  (category.valid_to_year === null || category.valid_to_year >= year);

// Año de una fecha "YYYY-MM-DD" (la fecha de la OC define qué categorías puede usar); sin fecha, el año indicado.
export const yearFromDate = (date: string | null | undefined, fallbackYear: number = new Date().getFullYear()): number =>
  date && /^\d{4}/.test(date) ? parseInt(date.slice(0, 4), 10) : fallbackYear;

// Categorías vigentes en `year`. `keepIds` conserva las que ya usa el registro que se edita
// (por ejemplo una OC anterior a una fusión), para que su categoría actual siga visible.
export const categoriesForYear = <T extends { id: string } & CategoryValidity>(
  categories: T[],
  year: number,
  keepIds: Array<string | null | undefined> = [],
): T[] => categories.filter((c) => isCategoryValidForYear(c, year) || keepIds.includes(c.id));

export interface CategoryMapping {
  id: string;
  batch_id: string;
  year: number;
  from_category_id: string;
  to_category_id: string | null;
  target_created: boolean;
  applied_at: string | null;
}

// categoría antigua -> nueva (null = retirada sin destino). Solo los cambios del año indicado.
export const buildMappingIndex = (mappings: CategoryMapping[]): Map<string, string | null> =>
  new Map(mappings.map((m) => [m.from_category_id, m.to_category_id]));

// Categoría final de `id` según el mapa: se mantiene si no cambió, null si fue retirada sin destino.
export const resolveCategoryId = (id: string, index: Map<string, string | null>): string | null =>
  index.has(id) ? index.get(id) ?? null : id;

// El trigger de purchase_orders rechaza una categoría que no está vigente en el año de la fecha de OC
// con un mensaje ya en español; este texto permite reconocerlo.
const NOT_VALID_FOR_YEAR_TEXT = "no está vigente para una OC";

// Mensaje en español para mostrar al usuario si el error es del trigger de vigencia, o null si es otro error.
export const opexCategoryErrorMessage = (error: unknown): string | null => {
  const message = (error as { message?: string } | null)?.message;
  return typeof message === "string" && message.includes(NOT_VALID_FOR_YEAR_TEXT) ? message : null;
};

export type CategoryNameResolution =
  | { kind: "found"; id: string; viaChange: boolean } // viaChange: el nombre era de una categoría fusionada o renombrada
  | { kind: "retired" } // existe, pero no está vigente en ese año y no tiene categoría nueva
  | { kind: "unknown" };

// Resuelve nombres de categorías (por ejemplo de un Excel) contra las vigentes en `year`.
// Un nombre antiguo se resuelve a su categoría nueva según los cambios de ese año; si fue retirada sin destino, "retired".
export const loadCategoryNameResolver = async (year: number) => {
  const [categoriesRes, mappingsRes] = await Promise.all([
    supabase.from("opex_categories").select(OPEX_CATEGORY_COLUMNS).eq("is_active", true),
    supabase.from("opex_category_mappings").select("from_category_id, to_category_id").eq("year", year),
  ]);
  if (categoriesRes.error) throw categoriesRes.error;
  if (mappingsRes.error) throw mappingsRes.error;
  const key = (name: string) => name.trim().toLowerCase();
  const all = categoriesRes.data || [];
  const valid = new Map(all.filter((c) => isCategoryValidForYear(c, year)).map((c) => [key(c.name), c.id]));
  const byName = new Map(all.map((c) => [key(c.name), c.id]));
  const changes = new Map((mappingsRes.data || []).map((m) => [m.from_category_id, m.to_category_id]));

  return {
    resolve(name: string): CategoryNameResolution {
      const validId = valid.get(key(name));
      if (validId) return { kind: "found", id: validId, viaChange: false };
      const existingId = byName.get(key(name));
      if (!existingId) return { kind: "unknown" };
      const target = changes.get(existingId);
      return target ? { kind: "found", id: target, viaChange: true } : { kind: "retired" };
    },
    // Para que una categoría recién creada también se reconozca en las filas siguientes.
    remember(name: string, id: string) {
      valid.set(key(name), id);
      byName.set(key(name), id);
    },
  };
};
