import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Secure CORS configuration - only allow trusted origins
const ALLOWED_ORIGINS = [
  'https://tgxiqvfpirwvhktgqqfa.lovable.app',
  'http://localhost:5173',
  'http://localhost:8080',
];

function isAllowedOrigin(origin: string): boolean {
  if (!origin) return false;
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  if (origin.endsWith('.lovable.app')) return true;
  if (origin.endsWith('.lovableproject.com')) return true;
  return false;
}

function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('origin') || '';
  
  return {
    'Access-Control-Allow-Origin': isAllowedOrigin(origin) ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Credentials': 'true',
  };
}

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
      return new Response(JSON.stringify({ error: 'Only admins can update users' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Get request body
    const { userId, email, fullName, password, role, permissions } = await req.json()

    if (!userId) {
      return new Response(JSON.stringify({ error: 'User ID is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    console.log(`Updating user ${userId} with email: ${email}, fullName: ${fullName}, role: ${role}, password: ${password ? 'provided' : 'not provided'}, permissions: ${permissions ? 'provided' : 'not provided'}`)

    // Update auth user
    const updateData: { email?: string; password?: string; user_metadata?: { full_name: string } } = {}
    if (email) updateData.email = email
    if (password) updateData.password = password
    if (fullName !== undefined) updateData.user_metadata = { full_name: fullName }

    if (Object.keys(updateData).length > 0) {
      const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(userId, updateData)
      if (updateError) {
        console.error('Error updating auth user:', updateError)
        return new Response(JSON.stringify({ error: updateError.message }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
    }

    // Update profile
    const profileUpdate: { email?: string; full_name?: string } = {}
    if (email) profileUpdate.email = email
    if (fullName !== undefined) profileUpdate.full_name = fullName

    if (Object.keys(profileUpdate).length > 0) {
      const { error: profileError } = await supabaseAdmin
        .from('profiles')
        .update(profileUpdate)
        .eq('id', userId)
      
      if (profileError) {
        console.error('Error updating profile:', profileError)
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
        console.error('Error updating role:', roleError)
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
          console.error('Error updating permissions:', permError)
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
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('Error in update-user function:', message)
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' }
    })
  }
})
