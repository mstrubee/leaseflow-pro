/**
 * Gestión de titulares: alta/actualización con PII cifrada e índices ciegos.
 */
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { encrypt, decrypt, blindIndex, type Envelope } from './crypto.ts';

export interface SubjectInput {
  externalRef?: string | null;
  email?: string | null;
  rut?: string | null;
  nombre?: string | null;
  telefono?: string | null;
}

/** Crea o actualiza un titular. Busca por external_ref o índice ciego de email/RUT. */
export async function upsertSubject(db: SupabaseClient, input: SubjectInput): Promise<string> {
  const emailBidx = input.email ? await blindIndex(input.email) : null;
  const rutBidx = input.rut ? await blindIndex(input.rut) : null;

  let existingId: string | null = null;
  if (input.externalRef) {
    const { data } = await db.from('data_subjects').select('id').eq('external_ref', input.externalRef).maybeSingle();
    existingId = data?.id ?? null;
  }
  if (!existingId && emailBidx) {
    const { data } = await db.from('data_subjects').select('id').eq('email_bidx', emailBidx).maybeSingle();
    existingId = data?.id ?? null;
  }
  if (!existingId && rutBidx) {
    const { data } = await db.from('data_subjects').select('id').eq('rut_bidx', rutBidx).maybeSingle();
    existingId = data?.id ?? null;
  }

  const patch: Record<string, unknown> = { actualizado_en: new Date().toISOString() };
  if (input.externalRef) patch.external_ref = input.externalRef;
  if (input.email) { patch.email_cifrado = await encrypt(input.email); patch.email_bidx = emailBidx; }
  if (input.rut) { patch.rut_cifrado = await encrypt(input.rut); patch.rut_bidx = rutBidx; }
  if (input.nombre) patch.nombre_cifrado = await encrypt(input.nombre);
  if (input.telefono) patch.telefono_cifrado = await encrypt(input.telefono);

  if (existingId) {
    await db.from('data_subjects').update(patch).eq('id', existingId);
    return existingId;
  }
  const { data, error } = await db.from('data_subjects').insert(patch).select('id').single();
  if (error) throw new Error(`No se pudo crear el titular: ${error.message}`);
  return data.id;
}

/** Devuelve la PII descifrada de un titular (derecho de acceso / portabilidad). */
export async function getSubjectDecrypted(db: SupabaseClient, subjectId: string) {
  const { data: row } = await db.from('data_subjects').select('*').eq('id', subjectId).maybeSingle();
  if (!row) return null;
  return {
    id: row.id,
    externalRef: row.external_ref,
    email: await decrypt(row.email_cifrado as Envelope | null),
    rut: await decrypt(row.rut_cifrado as Envelope | null),
    nombre: await decrypt(row.nombre_cifrado as Envelope | null),
    telefono: await decrypt(row.telefono_cifrado as Envelope | null),
  };
}
