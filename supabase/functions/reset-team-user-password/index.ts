import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

import { getCorsHeaders, handleCorsPreflightRequest } from "../_shared/cors.ts";

const SITE_URL = Deno.env.get('SITE_URL') ?? 'https://gplanet.vercel.app';

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

    const { data: { user: requestingUser }, error: userError } = await supabaseClient.auth.getUser()
    if (userError || !requestingUser) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const { data: roleRow } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', requestingUser.id)
      .maybeSingle()

    const requesterRole = roleRow?.role
    if (requesterRole !== 'admin' && requesterRole !== 'gerente') {
      return new Response(JSON.stringify({ error: 'Solo admin o gerente pueden resetear contraseñas' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const { user_id } = await req.json()
    if (!user_id || typeof user_id !== 'string') {
      return new Response(JSON.stringify({ error: 'Falta user_id' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const { data: target } = await supabaseAdmin
      .from('profiles')
      .select('id, email, created_by')
      .eq('id', user_id)
      .maybeSingle()

    if (!target) {
      return new Response(JSON.stringify({ error: 'Usuario no encontrado' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    if (requesterRole === 'gerente' && target.created_by !== requestingUser.id) {
      return new Response(JSON.stringify({ error: 'Solo puedes resetear usuarios de tu propio equipo' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const { data: targetRoleRow } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', user_id)
      .maybeSingle()

    if (targetRoleRow?.role !== 'equipo_gerencia') {
      return new Response(JSON.stringify({ error: 'Esta función solo aplica a usuarios de Equipo Gerencia' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Invalida cualquier sesión activa del usuario reseteado.
    const { error: signOutError } = await supabaseAdmin.auth.admin.signOut(user_id, 'global')
    if (signOutError) {
      console.error('reset-team-user-password: signOut failed', signOutError.message)
    }

    // invitations.token ahora SÍ es el control de acceso real: es la única
    // credencial que exige resolve-activation-link para generar un enlace de
    // recovery fresco (ver ese archivo) -- por eso se regenera acá en cada
    // reset, invalidando cualquier enlace corto compartido antes.
    const newToken = crypto.randomUUID()
    const { data: existingInvitation } = await supabaseAdmin
      .from('invitations')
      .select('id')
      .eq('user_id', user_id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    const invitationWrite = existingInvitation
      ? await supabaseAdmin
          .from('invitations')
          .update({ status: 'reset', token: newToken, used_at: null })
          .eq('id', existingInvitation.id)
      : await supabaseAdmin
          .from('invitations')
          .insert({ user_id, invited_by: requestingUser.id, status: 'reset', token: newToken })

    if (invitationWrite.error) {
      console.error('reset-team-user-password: invitation write failed', invitationWrite.error.message)
      return new Response(JSON.stringify({ error: 'No se pudo actualizar la invitación. Intenta nuevamente.' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const { error: profileUpdateError } = await supabaseAdmin
      .from('profiles')
      .update({ invitation_status: 'reset' })
      .eq('id', user_id)

    if (profileUpdateError) {
      console.error('reset-team-user-password: profile update failed', profileUpdateError.message)
      return new Response(JSON.stringify({ error: 'No se pudo actualizar el perfil. Intenta nuevamente.' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // La plataforma todavía no tiene capacidad de envío de email -- el enlace
    // se comparte a mano (WhatsApp/Email). En vez de exponer la URL técnica
    // cruda de Supabase (.../auth/v1/verify?token=...&type=recovery&...,
    // que a un destinatario le parece sospechosa/rota), se devuelve un
    // enlace corto y propio (`/activar?t=<token>`); resolve-activation-link
    // genera el enlace real de Supabase recién cuando lo clickean.
    return new Response(JSON.stringify({
      success: true,
      reset_link: `${SITE_URL}/activar?t=${newToken}`,
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error: unknown) {
    console.error('reset-team-user-password: unhandled error', error instanceof Error ? error.message : error)
    return new Response(JSON.stringify({ error: 'Error inesperado. Intenta nuevamente.' }), {
      status: 500,
      headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' }
    })
  }
})
