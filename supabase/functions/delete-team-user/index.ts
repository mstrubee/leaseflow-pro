import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

import { getCorsHeaders, handleCorsPreflightRequest } from "../_shared/cors.ts";

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
      return new Response(JSON.stringify({ error: 'Solo admin o gerente pueden eliminar usuarios' }), {
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
      .select('id, created_by')
      .eq('id', user_id)
      .maybeSingle()

    if (!target) {
      return new Response(JSON.stringify({ error: 'Usuario no encontrado' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    if (requesterRole === 'gerente' && target.created_by !== requestingUser.id) {
      return new Response(JSON.stringify({ error: 'Solo puedes eliminar usuarios de tu propio equipo' }), {
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

    // Limpieza explícita de tablas de aplicación (mismo patrón que delete-user)
    // antes de borrar el usuario de Auth.
    await supabaseAdmin.from('login_events').delete().eq('user_id', user_id)
    await supabaseAdmin.from('invitations').delete().eq('user_id', user_id)
    await supabaseAdmin.from('user_permissions').delete().eq('user_id', user_id)
    await supabaseAdmin.from('user_roles').delete().eq('user_id', user_id)
    await supabaseAdmin.from('profiles').delete().eq('id', user_id)

    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(user_id)
    if (deleteError) {
      console.error('delete-team-user: deleteUser failed', deleteError.message)
      return new Response(JSON.stringify({ error: 'No se pudo eliminar el usuario. Intenta nuevamente.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error: unknown) {
    console.error('delete-team-user: unhandled error', error instanceof Error ? error.message : error)
    return new Response(JSON.stringify({ error: 'Error inesperado. Intenta nuevamente.' }), {
      status: 500,
      headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' }
    })
  }
})
