/**
 * Clientes de Supabase para las Edge Functions.
 *  - adminClient(): usa la service_role key → omite RLS. Para escribir/leer pd.*
 *  - userClient(req): usa el JWT del llamador → sirve para identificar al usuario.
 */
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!;

/** Cliente con service_role, apuntando al esquema pd. Omite RLS. */
export function adminClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false },
    db: { schema: 'pd' },
  });
}

/** Devuelve el usuario autenticado a partir del header Authorization del request. */
export async function getUser(req: Request) {
  const authHeader = req.headers.get('Authorization') ?? '';
  const client = createClient(SUPABASE_URL, ANON, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) return null;
  return data.user;
}

/** ¿El usuario es admin/DPO de cumplimiento? (tabla pd.compliance_admins) */
export async function isComplianceAdmin(userId: string): Promise<boolean> {
  const db = adminClient();
  const { data } = await db.from('compliance_admins').select('user_id').eq('user_id', userId).maybeSingle();
  return !!data;
}
