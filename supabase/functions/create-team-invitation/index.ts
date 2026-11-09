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
      return new Response(JSON.stringify({ error: 'Solo admin o gerente pueden invitar usuarios' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const { email: rawEmail, full_name, on_behalf_of_gerente_id } = await req.json()

    if (!rawEmail || typeof rawEmail !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail)) {
      return new Response(JSON.stringify({ error: 'Email inválido' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }
    const email = rawEmail.toLowerCase()

    // Determinar de qué gerente será el equipo. Un gerente solo puede crear
    // usuarios para sí mismo; un admin debe indicar explícitamente para qué
    // gerente (nunca se infiere ni se permite que el cliente lo falsifique).
    let createdBy: string
    if (requesterRole === 'gerente') {
      createdBy = requestingUser.id
    } else {
      if (!on_behalf_of_gerente_id || typeof on_behalf_of_gerente_id !== 'string') {
        return new Response(JSON.stringify({ error: 'Falta on_behalf_of_gerente_id' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
      const { data: targetGerenteRole } = await supabaseAdmin
        .from('user_roles')
        .select('role')
        .eq('user_id', on_behalf_of_gerente_id)
        .eq('role', 'gerente')
        .maybeSingle()
      if (!targetGerenteRole) {
        return new Response(JSON.stringify({ error: 'on_behalf_of_gerente_id debe ser un gerente válido' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
      createdBy = on_behalf_of_gerente_id
    }

    // Chequeo de duplicados: exact-match (nunca ilike/wildcards). Un gerente
    // solo puede ver si el correo ya existe DENTRO de su propio equipo -- no
    // debe poder sondear cuentas de otros gerentes ni del admin. El chequeo
    // global real de unicidad de email lo hace auth.admin.createUser más
    // abajo, con un mensaje igual de genérico.
    let dupQuery = supabaseAdmin.from('profiles').select('id').eq('email', email)
    if (requesterRole === 'gerente') {
      dupQuery = dupQuery.eq('created_by', requestingUser.id)
    }
    const { data: existingProfile } = await dupQuery.maybeSingle()

    if (existingProfile) {
      return new Response(JSON.stringify({
        error: 'Ya existe una cuenta con este correo. Si necesitas reenviar el acceso, usa "Reset Password".'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const { data: authData, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: { full_name: full_name || null }
    })

    if (createError || !authData.user) {
      const alreadyRegistered = createError?.message?.includes('already been registered')
      if (!alreadyRegistered) {
        console.error('create-team-invitation: createUser failed', createError?.message)
      }
      return new Response(JSON.stringify({
        error: alreadyRegistered
          ? 'Ya existe una cuenta con este correo. Si necesitas reenviar el acceso, usa "Reset Password".'
          : 'No se pudo crear el usuario. Intenta nuevamente.'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const newUserId = authData.user.id
    const invitationToken = crypto.randomUUID()

    try {
      const { error: profileError } = await supabaseAdmin
        .from('profiles')
        .update({ created_by: createdBy, invitation_status: 'pending', full_name: full_name || null })
        .eq('id', newUserId)
      if (profileError) throw profileError

      const { error: roleError } = await supabaseAdmin
        .from('user_roles')
        .insert({ user_id: newUserId, role: 'equipo_gerencia' })
      if (roleError) throw roleError

      // Permisos fijos del rol equipo_gerencia (no configurables por diseño):
      // contracts:view para poder listar/abrir un proyecto, contract_gantt:view
      // para ver la sección Cronograma (solo lectura -- forzado por isEquipoGerencia
      // en GanttModule, no por el nivel de este permiso), gantt_reports:view para
      // la subsección "Cartas Gantt" de Informes (recurso propio, no reutiliza
      // "capex" para no filtrar esa card en el Home).
      const { error: permError } = await supabaseAdmin
        .from('user_permissions')
        .insert([
          { user_id: newUserId, resource: 'contracts', permission: 'view' },
          { user_id: newUserId, resource: 'contract_gantt', permission: 'view' },
          { user_id: newUserId, resource: 'gantt_reports', permission: 'view' },
        ])
      if (permError) throw permError

      const { error: invitationError } = await supabaseAdmin
        .from('invitations')
        .insert({ user_id: newUserId, invited_by: requestingUser.id, status: 'pending', token: invitationToken })
      if (invitationError) throw invitationError
    } catch (setupError) {
      // Evita usuarios auth "fantasma" sin perfil/rol/invitación consistentes.
      console.error('create-team-invitation: setup failed', (setupError as Error).message)
      await supabaseAdmin.auth.admin.deleteUser(newUserId)
      return new Response(JSON.stringify({ error: 'No se pudo completar la invitación. Intenta nuevamente.' }), {
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
      user: { id: newUserId, email, full_name: full_name || null },
      activation_link: `${SITE_URL}/activar?t=${invitationToken}`,
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error: unknown) {
    console.error('create-team-invitation: unhandled error', error instanceof Error ? error.message : error)
    return new Response(JSON.stringify({ error: 'Error inesperado. Intenta nuevamente.' }), {
      status: 500,
      headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' }
    })
  }
})
