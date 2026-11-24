/**
 * Bitácora de auditoría encadenada por hash (tamper-evident).
 * Cada evento guarda el hash del anterior; alterar cualquiera rompe la cadena.
 * La tabla pd.audit_log además es inmutable por trigger.
 */
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const encoder = new TextEncoder();

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(input));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export interface AuditEntry {
  actor: string | null;
  accion: string;
  entidad?: string;
  entidadId?: string;
  metadata?: Record<string, unknown>;
}

export async function audit(db: SupabaseClient, entry: AuditEntry): Promise<void> {
  const { data: last } = await db
    .from('audit_log')
    .select('hash')
    .order('id', { ascending: false })
    .limit(1)
    .maybeSingle();

  const prevHash = last?.hash ?? 'GENESIS';
  const creadoEn = new Date().toISOString();
  const metadata = entry.metadata ?? {};

  const hash = await sha256Hex(
    JSON.stringify({
      prevHash,
      actor: entry.actor,
      accion: entry.accion,
      entidad: entry.entidad ?? '',
      entidadId: entry.entidadId ?? '',
      metadata,
      creadoEn,
    }),
  );

  await db.from('audit_log').insert({
    actor: entry.actor,
    accion: entry.accion,
    entidad: entry.entidad ?? null,
    entidad_id: entry.entidadId ?? null,
    metadata,
    prev_hash: prevHash,
    hash,
    creado_en: creadoEn,
  });
}

/** Verifica la integridad de toda la cadena. */
export async function verifyChain(db: SupabaseClient): Promise<{ ok: boolean; roto_en?: number }> {
  const { data: rows } = await db.from('audit_log').select('*').order('id', { ascending: true });
  let prevHash = 'GENESIS';
  for (const r of rows ?? []) {
    if (r.prev_hash !== prevHash) return { ok: false, roto_en: r.id };
    const expected = await sha256Hex(
      JSON.stringify({
        prevHash,
        actor: r.actor,
        accion: r.accion,
        entidad: r.entidad ?? '',
        entidadId: r.entidad_id ?? '',
        metadata: r.metadata ?? {},
        creadoEn: new Date(r.creado_en).toISOString(),
      }),
    );
    if (expected !== r.hash) return { ok: false, roto_en: r.id };
    prevHash = r.hash;
  }
  return { ok: true };
}
