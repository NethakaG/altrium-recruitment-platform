import { createClient } from 'npm:@supabase/supabase-js@2.112.3'
import { extractAndStoreCvProfile } from '../_shared/extract-cv.ts'

declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void }

const BUCKET = 'candidate-cvs'
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function getAllowedOrigins() {
  const localOrigins = [
    'http://localhost:5173', 'http://127.0.0.1:5173',
    'http://localhost:5181', 'http://127.0.0.1:5181',
  ]
  const configuredOrigins = (Deno.env.get('ALLOWED_ORIGINS') ?? '')
    .split(',').map((value) => value.trim()).filter(Boolean)
  return [...new Set([...localOrigins, ...configuredOrigins])]
}

function response(origin: string | null, status: number, body: Record<string, unknown>) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json', 'Cache-Control': 'no-store',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Vary': 'Origin',
  }
  if (origin && getAllowedOrigins().includes(origin)) headers['Access-Control-Allow-Origin'] = origin
  return new Response(status === 204 ? null : JSON.stringify(body), { status, headers })
}

Deno.serve(async (request) => {
  const origin = request.headers.get('Origin')
  if (origin && !getAllowedOrigins().includes(origin)) return response(origin, 403, { error: 'Origin is not allowed.' })
  if (request.method === 'OPTIONS') return response(origin, 204, {})
  if (request.method !== 'POST') return response(origin, 405, { error: 'Method not allowed.' })

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const authorization = request.headers.get('Authorization')
  if (!supabaseUrl || !anonKey || !serviceRoleKey || !authorization) return response(origin, 401, { error: 'Authentication required.' })

  try {
    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { data: userData, error: userError } = await authClient.auth.getUser()
    if (userError || !userData.user) return response(origin, 401, { error: 'Authentication required.' })

    const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
    const { data: profile } = await admin.from('staff_profiles').select('role,is_active').eq('id', userData.user.id).maybeSingle()
    if (!profile?.is_active || !['it_admin', 'hr_recruiter'].includes(profile.role)) return response(origin, 403, { error: 'You do not have permission to process CVs.' })

    const body = await request.json()
    const submissionId = body?.submissionId
    if (typeof submissionId !== 'string' || !UUID_PATTERN.test(submissionId)) return response(origin, 400, { error: 'A valid candidate is required.' })

    const { data: submission, error: submissionError } = await admin
      .from('cv_submissions').select('id,storage_path,mime_type').eq('id', submissionId).maybeSingle()
    if (submissionError || !submission) return response(origin, 404, { error: 'Candidate not found.' })

    const { data: cv, error: downloadError } = await admin.storage.from(BUCKET).download(submission.storage_path, {}, { cache: 'no-store' })
    if (downloadError || !cv) return response(origin, 500, { error: 'The CV could not be loaded.' })

    const bytes = new Uint8Array(await cv.arrayBuffer())
    EdgeRuntime.waitUntil(extractAndStoreCvProfile(admin, submission.id, bytes, submission.mime_type))
    return response(origin, 202, { success: true })
  } catch (error) {
    console.error('process-cv failed:', error instanceof Error ? error.message : 'Unknown error')
    return response(origin, 500, { error: 'The CV could not be processed.' })
  }
})
