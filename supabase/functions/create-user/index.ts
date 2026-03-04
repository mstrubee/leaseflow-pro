import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

import { getCorsHeaders, handleCorsPreflightRequest } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    // Create admin client
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })

    // Create regular client to verify requesting user is admin
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

    // Get requesting user
    const { data: { user: requestingUser }, error: userError } = await supabaseClient.auth.getUser()
    if (userError || !requestingUser) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Check if requesting user is admin
    const { data: roleData } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', requestingUser.id)
      .single()

    if (roleData?.role !== 'admin') {
      return new Response(JSON.stringify({ error: 'Only admins can create users' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Get request body
    const { email, password, fullName, cargo, role, permissions } = await req.json()

    if (!email || !password) {
      return new Response(JSON.stringify({ error: 'Email and password are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    let newUserId: string;

    // Try to create user first
    const { data: authData, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName }
    })

    if (createError) {
      // If user already exists, find and reactivate them
      if (createError.message.includes('already been registered') || createError.message.includes('already exists')) {
        // List users to find the existing one by email
        const { data: listData, error: listError } = await supabaseAdmin.auth.admin.listUsers()
        
        if (listError) {
          return new Response(JSON.stringify({ error: listError.message }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          })
        }

        const existingUser = listData.users.find(u => u.email === email)
        if (!existingUser) {
          return new Response(JSON.stringify({ error: 'User exists but could not be found' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          })
        }

        newUserId = existingUser.id

        // Update the existing auth user with new password and metadata
        await supabaseAdmin.auth.admin.updateUserById(newUserId, {
          password,
          email_confirm: true,
          user_metadata: { full_name: fullName }
        })
      } else {
        return new Response(JSON.stringify({ error: createError.message }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
    } else {
      newUserId = authData.user.id
    }

    // Upsert profile (handles both new and re-created users)
    await supabaseAdmin
      .from('profiles')
      .upsert({ id: newUserId, email, full_name: fullName, cargo: cargo || null }, { onConflict: 'id' })

    // Delete old role and assign new one
    await supabaseAdmin
      .from('user_roles')
      .delete()
      .eq('user_id', newUserId)

    await supabaseAdmin
      .from('user_roles')
      .insert({ user_id: newUserId, role: role || 'user' })

    // Delete old permissions and assign new ones
    await supabaseAdmin
      .from('user_permissions')
      .delete()
      .eq('user_id', newUserId)

    if (permissions && Object.keys(permissions).length > 0) {
      const permissionsToInsert = Object.entries(permissions)
        .filter(([_, perm]) => perm !== 'none')
        .map(([resource, permission]) => ({
          user_id: newUserId,
          resource,
          permission
        }))

      if (permissionsToInsert.length > 0) {
        await supabaseAdmin
          .from('user_permissions')
          .insert(permissionsToInsert)
      }
    }

    return new Response(JSON.stringify({ 
      success: true, 
      user: { id: newUserId, email } 
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' }
    })
  }
})
