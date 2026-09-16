import { createClient } from 'npm:@supabase/supabase-js@2.112.3'

const STAFF_ROLES = new Set([
  'it_admin',
  'hr_recruiter',
  'interviewer',
  'hiring_manager',
  'management_user',
])

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function allowedOrigins() {
  return [...new Set([
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost:5174',
    'http://127.0.0.1:5174',
    ...(Deno.env.get('ALLOWED_ORIGINS') ?? '').split(',').map((item) => item.trim()).filter(Boolean),
  ])]
}

function reply(origin: string | null, status: number, body: Record<string, unknown>) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  }
  if (origin && allowedOrigins().includes(origin)) headers['Access-Control-Allow-Origin'] = origin
  return new Response(status === 204 ? null : JSON.stringify(body), { status, headers })
}

Deno.serve(async (request) => {
  const origin = request.headers.get('Origin')
  if (origin && !allowedOrigins().includes(origin)) return reply(origin, 403, { error: 'Origin is not allowed.' })
  if (request.method === 'OPTIONS') return reply(origin, 204, {})
  if (request.method !== 'POST') return reply(origin, 405, { error: 'Method not allowed.' })

  const url = Deno.env.get('SUPABASE_URL')
  const anon = Deno.env.get('SUPABASE_ANON_KEY')
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const authorization = request.headers.get('Authorization')
  if (!url || !anon || !service) return reply(origin, 500, { error: 'Server configuration is incomplete.' })
  if (!authorization) return reply(origin, 401, { error: 'Authentication required.' })

  try {
    const authClient = createClient(url, anon, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false },
    })
    const { data: userData, error: userError } = await authClient.auth.getUser()
    if (userError || !userData.user) return reply(origin, 401, { error: 'Authentication required.' })

    const admin = createClient(url, service, { auth: { persistSession: false } })
    const { data: requester, error: requesterError } = await admin
      .from('staff_profiles')
      .select('role,is_active')
      .eq('id', userData.user.id)
      .maybeSingle()
    if (requesterError) throw requesterError
    if (!requester?.is_active || requester.role !== 'it_admin') {
      return reply(origin, 403, { error: 'Only an active IT Admin can invite staff.' })
    }

    const body = await request.json().catch(() => ({}))
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
    const fullName = typeof body.fullName === 'string' ? body.fullName.trim() : ''
    const role = typeof body.role === 'string' ? body.role : ''

    if (!EMAIL.test(email)) return reply(origin, 400, { error: 'Enter a valid staff email address.' })
    if (fullName.length < 2 || fullName.length > 120) return reply(origin, 400, { error: 'Full name must contain between 2 and 120 characters.' })
    if (!STAFF_ROLES.has(role)) return reply(origin, 400, { error: 'Select a valid staff role.' })

    const configuredTrackerUrl = (Deno.env.get('TRACKER_URL') ?? '').trim().replace(/\/$/, '')
    const trackerUrl = origin && allowedOrigins().includes(origin) ? origin : configuredTrackerUrl
    if (!trackerUrl) return reply(origin, 500, { error: 'The tracker invitation URL is not configured.' })

    const { data: invitation, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
      data: { full_name: fullName },
      redirectTo: `${trackerUrl}/set-password`,
    })
    if (inviteError || !invitation.user) {
      const message = inviteError?.message?.toLowerCase().includes('already')
        ? 'A staff account already exists for this email address.'
        : inviteError?.message || 'The invitation could not be sent.'
      return reply(origin, 400, { error: message })
    }

    const { error: accessError } = await authClient.rpc('update_staff_access', {
      p_staff_id: invitation.user.id,
      p_full_name: fullName,
      p_role: role,
      p_is_active: true,
    })
    if (accessError) {
      console.error('invite-staff-user access assignment:', accessError)
      return reply(origin, 500, {
        error: 'The invitation was sent, but access could not be activated. Review the new account in Staff Access.',
      })
    }

    return reply(origin, 200, {
      success: true,
      userId: invitation.user.id,
      message: `Invitation sent to ${email}.`,
    })
  } catch (error) {
    console.error('invite-staff-user:', error)
    return reply(origin, 500, { error: error instanceof Error ? error.message : 'The invitation could not be sent.' })
  }
})
