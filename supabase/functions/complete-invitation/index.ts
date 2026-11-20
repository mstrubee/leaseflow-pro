import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

import { getCorsHeaders, handleCorsPreflightRequest } from "../_shared/cors.ts";

// Llamada por el propio usuario invitado/reseteado, justo después de fijar
// su nueva contraseña con supabase.auth.updateUser({ password }) en el
// frontend. Cierra el ciclo del token de un solo uso: sin una invitación en
// estado pending/reset para este usuario, no hay nada que marcar como usada.
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

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'No authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const supabaseClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } }
    })

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser()
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const { data: invitation } = await supabaseAdmin
      .from('invitations')
      .select('id, status')
      .eq('user_id', user.id)
      .in('status', ['pending', 'reset'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!invitation) {
      return new Response(JSON.stringify({ error: 'No hay una invitación pendiente para este usuario' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const { error: invitationUpdateError } = await supabaseAdmin
      .from('invitations')
      .update({ status: 'used', used_at: new Date().toISOString() })
      .eq('id', invitation.id)

    if (invitationUpdateError) {
      console.error('complete-invitation: invitation update failed', invitationUpdateError.message)
      return new Response(JSON.stringify({ error: 'No se pudo completar la activación. Intenta nuevamente.' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const { error: profileUpdateError } = await supabaseAdmin
      .from('profiles')
      .update({ invitation_status: 'active' })
      .eq('id', user.id)

    if (profileUpdateError) {
      console.error('complete-invitation: profile update failed', profileUpdateError.message)
      return new Response(JSON.stringify({ error: 'No se pudo completar la activación. Intenta nuevamente.' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // El gate de "invitación pending/reset" arriba es solo cosmético si la
    // sesión de recovery sigue viva después de este punto -- cualquiera con
    // ese mismo enlace/token todavía podría volver a llamar updateUser().
    // Cerramos globalmente la sesión para que, una vez activada la cuenta,
    // el único camino de entrada válido sea un login normal con la
    // contraseña recién fijada (mismo mecanismo que el reset por gerente/admin).
    const { error: signOutError } = await supabaseAdmin.auth.admin.signOut(user.id, 'global')
    if (signOutError) {
      // Este signOut es el control de seguridad real que cierra el enlace de
      // recovery ya usado -- si falla, tratarlo como fallo duro en vez de
      // reportar éxito con la sesión original todavía viva.
      console.error('complete-invitation: signOut failed', signOutError.message)
      return new Response(JSON.stringify({ error: 'No se pudo finalizar la sesión de activación. Intenta nuevamente.' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error: unknown) {
    console.error('complete-invitation: unhandled error', error instanceof Error ? error.message : error)
    return new Response(JSON.stringify({ error: 'Error inesperado. Intenta nuevamente.' }), {
      status: 500,
      headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' }
    })
  }
})
