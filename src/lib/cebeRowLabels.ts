import { supabase } from "@/integrations/supabase/client";

/**
 * Número de una Orden CO tal como se muestra en los documentos: sin el prefijo "CO" (se agrega aparte)
 * y sin la nota entre paréntesis que a veces se escribe al cargarla (ej. "170901 (AG Sta Cruz)" → "170901").
 */
export function coShortNumber(raw: string): string {
  const trimmed = raw.trim();
  const noNote = trimmed.replace(/\s*\([^)]*\)\s*$/, "").trim();
  const noPrefix = noNote.replace(/^CO[\s#:\-.]*/i, "").trim();
  return noPrefix || noNote || trimmed;
}

/**
 * Texto de una fila de la distribución por CEBE, en UNA sola línea:
 *   "Empresa / CEBE H04ADP1390 / CO 170901"
 * Sin Orden CO asignada a ese CEBE, queda "Empresa / CEBE H04ADP1390".
 */
export function formatCebeRowLabel(company: string | null | undefined, cebe: string, coNumbers: string[]): string {
  const parts = [company?.trim() || null, `CEBE ${cebe}`];
  const cos = coNumbers.map(coShortNumber).filter(Boolean);
  if (cos.length > 0) parts.push(`CO ${cos.join(", ")}`);
  return parts.filter(Boolean).join(" / ");
}

/**
 * Rótulo "Empresa / CEBE X / CO N" de cada CEBE (por id de contract_cebes), con las Órdenes CO que tiene
 * asignadas ese CEBE (contract_co_orders.cebe_id). Si algo no se puede leer devuelve lo que alcanzó a
 * armar (o nada): el PDF siempre se genera.
 */
export async function loadCebeRowLabels(cebeIds: string[]): Promise<Map<string, string>> {
  const ids = [...new Set(cebeIds.filter(Boolean))];
  const out = new Map<string, string>();
  if (ids.length === 0) return out;
  try {
    const [cebesRes, coRes] = await Promise.all([
      supabase.from("contract_cebes").select("id, company_id, cebe").in("id", ids),
      supabase.from("contract_co_orders").select("cebe_id, co_number, sort_order").in("cebe_id", ids).order("sort_order", { ascending: true }),
    ]);
    if (cebesRes.error) throw cebesRes.error;
    const entries = cebesRes.data || [];
    const companyIds = [...new Set(entries.map((e) => e.company_id))];
    const companiesRes = companyIds.length > 0 ? await supabase.from("companies").select("id, name").in("id", companyIds) : { data: [], error: null };
    const companyName = new Map((companiesRes.data || []).map((c) => [c.id, c.name as string]));
    // Las CO son opcionales: si falla su lectura (p. ej. sin permiso), igual se muestra Empresa / CEBE.
    const cosByCebe = new Map<string, string[]>();
    (coRes.data || []).forEach((o) => {
      if (!o.cebe_id) return;
      cosByCebe.set(o.cebe_id, [...(cosByCebe.get(o.cebe_id) ?? []), o.co_number]);
    });
    entries.forEach((e) => out.set(e.id, formatCebeRowLabel(companyName.get(e.company_id), e.cebe, cosByCebe.get(e.id) ?? [])));
  } catch (error) {
    console.error("No se pudo armar el detalle Contrato / CEBE / CO para el PDF:", error);
  }
  return out;
}
