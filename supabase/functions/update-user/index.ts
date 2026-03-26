import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req) => {
  
  
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

    // Check if requesting user is admin (robust against multiple-role rows)
    const { data: roleData, error: roleError } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', requestingUser.id)
      .eq('role', 'admin')
      .maybeSingle()

    if (roleError) {
      console.error('Admin role lookup failed:', roleError.message)
      return new Response(JSON.stringify({ error: 'Failed to validate admin permissions' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    if (!roleData) {
      return new Response(JSON.stringify({ error: 'Only admins can update users' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Get request body
    const { userId, email, fullName, cargo, password, role, permissions } = await req.json()

    if (!userId) {
      return new Response(JSON.stringify({ error: 'User ID is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Generate error tracking ID for this operation
    const operationId = crypto.randomUUID().slice(0, 8);

    // Update auth user
    const updateData: { email?: string; password?: string; user_metadata?: { full_name: string } } = {}
    if (email) updateData.email = email
    if (password && password.length >= 6) updateData.password = password
    else if (password && password.length > 0 && password.length < 6) {
      return new Response(JSON.stringify({ error: 'Password should be at least 6 characters.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }
    if (fullName !== undefined) updateData.user_metadata = { full_name: fullName }

    if (Object.keys(updateData).length > 0) {
      const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(userId, updateData)
      if (updateError) {
        console.error(`[${operationId}] Auth user update failed:`, updateError.message);
        return new Response(JSON.stringify({ error: updateError.message }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
    }

    // Update profile
    const profileUpdate: { email?: string; full_name?: string; cargo?: string | null } = {}
    if (email) profileUpdate.email = email
    if (fullName !== undefined) profileUpdate.full_name = fullName
    if (cargo !== undefined) profileUpdate.cargo = cargo

    if (Object.keys(profileUpdate).length > 0) {
      const { error: profileError } = await supabaseAdmin
        .from('profiles')
        .update(profileUpdate)
        .eq('id', userId)
      
      if (profileError) {
        console.error(`[${operationId}] Profile update failed:`, profileError.message);
      }
    }

    // Update role if provided
    if (role) {
      // First delete existing role
      await supabaseAdmin
        .from('user_roles')
        .delete()
        .eq('user_id', userId)
      
      // Insert new role
      const { error: roleError } = await supabaseAdmin
        .from('user_roles')
        .insert({ user_id: userId, role })
      
      if (roleError) {
        console.error(`[${operationId}] Role update failed:`, roleError.message);
      }
    }

    // Update permissions if provided
    if (permissions && typeof permissions === 'object') {
      // Delete existing permissions
      await supabaseAdmin
        .from('user_permissions')
        .delete()
        .eq('user_id', userId)

      // Insert new permissions
      const permissionsToInsert = Object.entries(permissions)
        .filter(([_, perm]) => perm !== 'none')
        .map(([resource, permission]) => ({
          user_id: userId,
          resource,
          permission
        }))

      if (permissionsToInsert.length > 0) {
        const { error: permError } = await supabaseAdmin
          .from('user_permissions')
          .insert(permissionsToInsert)

        if (permError) {
          console.error(`[${operationId}] Permissions update failed:`, permError.message);
        }
      }
    }

    return new Response(JSON.stringify({ 
      success: true, 
      message: 'User updated successfully'
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error: unknown) {
    const errorId = crypto.randomUUID().slice(0, 8);
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[${errorId}] Update-user function error:`, message);
    return new Response(JSON.stringify({ error: 'Operation failed', errorId }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
