import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

import { getCorsHeaders, handleCorsPreflightRequest } from "../_shared/cors.ts";

const SITE_URL = Deno.env.get('SITE_URL') ?? 'https://gplanet.vercel.app';

// Función PÚBLICA (sin Authorization) -- el destinatario de una invitación o
// reset todavía no tiene sesión. La credencial es el propio token corto
// (`invitations.token`) que viene en el enlace `/activar?t=...` compartido a
// mano. Genera el enlace real de Supabase recién en este momento (en vez de
// pre-generarlo y exponerlo desde el inicio) para que el enlace compartido
// sea corto y no exponga la URL técnica de Supabase.
Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  const preflight = handleCorsPreflightRequest(req);
  if (preflight) return preflight;

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    })

    const { token } = await req.json()
    if (!token || typeof token !== 'string') {
      return new Response(JSON.stringify({ error: 'Falta token' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const { data: invitation } = await supabaseAdmin
      .from('invitations')
      .select('id, user_id, status, created_at')
      .eq('token', token)
      .maybeSingle()

    if (!invitation) {
      return new Response(JSON.stringify({ error: 'Este enlace no es válido.' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    if (invitation.status === 'used') {
      return new Response(JSON.stringify({ error: 'Este enlace ya fue utilizado. Pide a tu gerente o administrador que reenvíe el acceso.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Mientras el status siga pending/reset, este endpoint puede generar un
    // link de recovery fresco cada vez que se llama -- sin esto, un token
    // corto filtrado (screenshot, backup de chat) seguiría siendo una llave
    // válida indefinidamente. Se limita la vigencia del enlace corto en sí
    // (no la del link de Supabase, que ya es de un solo uso y expira solo).
    const MAX_AGE_DAYS = 30
    const ageMs = Date.now() - new Date(invitation.created_at).getTime()
    if (ageMs > MAX_AGE_DAYS * 24 * 60 * 60 * 1000) {
      return new Response(JSON.stringify({ error: 'Este enlace venció. Pide a tu gerente o administrador que reenvíe el acceso.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('email')
      .eq('id', invitation.user_id)
      .maybeSingle()

    if (!profile?.email) {
      console.error('resolve-activation-link: no profile/email found for invitation', invitation.id)
      return new Response(JSON.stringify({ error: 'No se pudo resolver este enlace. Intenta nuevamente.' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'recovery',
      email: profile.email,
      options: { redirectTo: `${SITE_URL}/auth` },
    })

    if (linkError || !linkData?.properties?.action_link) {
      console.error('resolve-activation-link: generateLink failed', linkError?.message)
      return new Response(JSON.stringify({ error: 'No se pudo generar el enlace. Intenta nuevamente.' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    return new Response(JSON.stringify({ success: true, action_link: linkData.properties.action_link }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error: unknown) {
    console.error('resolve-activation-link: unhandled error', error instanceof Error ? error.message : error)
    return new Response(JSON.stringify({ error: 'Error inesperado. Intenta nuevamente.' }), {
      status: 500,
      headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' }
    })
  }
})
