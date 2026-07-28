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
      return new Response(JSON.stringify({ error: 'Solo admin o gerente pueden editar usuarios' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const { user_id, email: rawEmail } = await req.json()
    if (!user_id || typeof user_id !== 'string') {
      return new Response(JSON.stringify({ error: 'Falta user_id' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }
    if (!rawEmail || typeof rawEmail !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail)) {
      return new Response(JSON.stringify({ error: 'Email inválido' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }
    const email = rawEmail.toLowerCase()

    const { data: target } = await supabaseAdmin
      .from('profiles')
      .select('id, created_by, invitation_status')
      .eq('id', user_id)
      .maybeSingle()

    if (!target) {
      return new Response(JSON.stringify({ error: 'Usuario no encontrado' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    if (requesterRole === 'gerente' && target.created_by !== requestingUser.id) {
      return new Response(JSON.stringify({ error: 'Solo puedes editar usuarios de tu propio equipo' }), {
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

    // Duplicado: exact-match, acotado al propio equipo si el caller es gerente
    // (mismo criterio que create-team-invitation -- evita enumeración global).
    let dupQuery = supabaseAdmin.from('profiles').select('id').eq('email', email).neq('id', user_id)
    if (requesterRole === 'gerente') {
      dupQuery = dupQuery.eq('created_by', requestingUser.id)
    }
    const { data: existingProfile } = await dupQuery.maybeSingle()
    if (existingProfile) {
      return new Response(JSON.stringify({ error: 'Ya existe una cuenta con este correo' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const { error: authUpdateError } = await supabaseAdmin.auth.admin.updateUserById(user_id, {
      email,
      email_confirm: true,
    })
    if (authUpdateError) {
      const alreadyRegistered = authUpdateError.message?.includes('already been registered')
      if (!alreadyRegistered) {
        console.error('update-team-user-email: auth update failed', authUpdateError.message)
      }
      return new Response(JSON.stringify({
        error: alreadyRegistered ? 'Ya existe una cuenta con este correo' : 'No se pudo actualizar el correo. Intenta nuevamente.'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const { error: profileUpdateError } = await supabaseAdmin
      .from('profiles')
      .update({ email })
      .eq('id', user_id)

    if (profileUpdateError) {
      console.error('update-team-user-email: profile update failed', profileUpdateError.message)
      return new Response(JSON.stringify({ error: 'No se pudo actualizar el perfil. Intenta nuevamente.' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Si la cuenta todavía no fue activada, la corrección de email invalida
    // cualquier enlace generado para la dirección anterior -- se genera uno
    // nuevo para la dirección corregida, a compartir manualmente (la
    // plataforma no envía email todavía). Si ya estaba activa, no forzamos
    // reactivación.
    let activationLink: string | null = null
    if (target.invitation_status !== 'active') {
      const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
        type: 'recovery',
        email,
        options: { redirectTo: `${SITE_URL}/auth` },
      })
      if (linkError || !linkData?.properties?.action_link) {
        console.error('update-team-user-email: generateLink failed', linkError?.message)
        return new Response(JSON.stringify({ error: 'El correo se actualizó, pero no se pudo generar el enlace de activación. Usa "Reset Password" para reintentar.' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
      activationLink = linkData.properties.action_link
    }

    return new Response(JSON.stringify({ success: true, activation_link: activationLink }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error: unknown) {
    console.error('update-team-user-email: unhandled error', error instanceof Error ? error.message : error)
    return new Response(JSON.stringify({ error: 'Error inesperado. Intenta nuevamente.' }), {
      status: 500,
      headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' }
    })
  }
})
