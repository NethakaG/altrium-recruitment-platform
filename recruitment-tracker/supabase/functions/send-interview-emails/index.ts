import { createClient } from 'npm:@supabase/supabase-js@2.112.3'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function allowedOrigins() {
  return [...new Set(['http://localhost:5173', 'http://127.0.0.1:5173', ...(Deno.env.get('ALLOWED_ORIGINS') ?? '').split(',').map((item) => item.trim()).filter(Boolean)])]
}
function reply(origin: string | null, status: number, body: Record<string, unknown>) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-cron-secret', 'Access-Control-Allow-Methods': 'POST, OPTIONS', Vary: 'Origin' }
  if (origin && allowedOrigins().includes(origin)) headers['Access-Control-Allow-Origin'] = origin
  return new Response(status === 204 ? null : JSON.stringify(body), { status, headers })
}
function encode(message: string) {
  const bytes = new TextEncoder().encode(message)
  let binary = ''; for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
}
function formatDate(value: string) { return new Intl.DateTimeFormat('en-LK', { dateStyle: 'full', timeStyle: 'short', timeZone: 'Asia/Colombo' }).format(new Date(value)) }

async function accessToken() {
  const clientId = Deno.env.get('GMAIL_CLIENT_ID'); const clientSecret = Deno.env.get('GMAIL_CLIENT_SECRET'); const refreshToken = Deno.env.get('GMAIL_REFRESH_TOKEN')
  if (!clientId || !clientSecret || !refreshToken) throw new Error('Gmail OAuth secrets are not configured.')
  const response = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: 'refresh_token' }) })
  const result = await response.json(); if (!response.ok || !result.access_token) throw new Error('Gmail authorization could not be refreshed.')
  return result.access_token as string
}

function content(row: any) {
  const event = String(row.notification_type).replaceAll('_', ' ')
  const candidate = row.interview.candidate.candidate_name || 'Candidate'
  const position = row.interview.candidate.position.title
  const when = formatDate(row.interview.scheduled_start)
  const venue = row.interview.format === 'online' ? `Meeting link: ${row.interview.meeting_url}` : `Location: ${row.interview.location}`
  const cancelled = row.notification_type === 'cancelled'
  const subject = cancelled ? `Cancelled: ${position} interview` : `${event[0].toUpperCase()}${event.slice(1)}: ${position} interview`
  const greeting = row.recipient_kind === 'candidate' ? candidate : row.interview.interviewer.display_name
  const body = cancelled
    ? `Hello ${greeting},\n\nThe ${position} interview planned for ${when} has been cancelled.\nReason: ${row.interview.cancellation_reason}\n\nAltrium Recruitment`
    : `Hello ${greeting},\n\nThis is your ${event} notification for the ${position} interview.\nCandidate: ${candidate}\nStage: ${row.interview.stage.name}\nTime: ${when} (Sri Lanka time)\n${venue}\n${row.interview.instructions ? `Instructions: ${row.interview.instructions}\n` : ''}\nAltrium Recruitment`
  return { subject, body }
}

Deno.serve(async (request) => {
  const origin = request.headers.get('Origin')
  if (origin && !allowedOrigins().includes(origin)) return reply(origin, 403, { error: 'Origin is not allowed.' })
  if (request.method === 'OPTIONS') return reply(origin, 204, {})
  if (request.method !== 'POST') return reply(origin, 405, { error: 'Method not allowed.' })
  const url = Deno.env.get('SUPABASE_URL'); const anon = Deno.env.get('SUPABASE_ANON_KEY'); const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !anon || !service) return reply(origin, 500, { error: 'Server configuration is incomplete.' })
  try {
    const authorization = request.headers.get('Authorization'); const cronSecret = request.headers.get('x-cron-secret'); const configuredCronSecret = Deno.env.get('INTERVIEW_CRON_SECRET')
    let authorized = Boolean(configuredCronSecret && cronSecret === configuredCronSecret)
    if (!authorized && authorization) {
      const authClient = createClient(url, anon, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } })
      const { data: user } = await authClient.auth.getUser()
      if (user.user) { const admin = createClient(url, service); const { data: profile } = await admin.from('staff_profiles').select('role,is_active').eq('id', user.user.id).maybeSingle(); authorized = Boolean(profile?.is_active && ['it_admin', 'hr_recruiter'].includes(profile.role)) }
    }
    if (!authorized) return reply(origin, 401, { error: 'Authentication required.' })
    const body = await request.json().catch(() => ({})); const interviewId = body?.interviewId
    if (interviewId && (typeof interviewId !== 'string' || !UUID.test(interviewId))) return reply(origin, 400, { error: 'Invalid interview.' })
    const admin = createClient(url, service, { auth: { persistSession: false } })
    const staleBefore = new Date(Date.now() - 10 * 60_000).toISOString()
    await admin.from('interview_email_notifications').update({ status: 'failed', last_error: 'A previous delivery attempt was interrupted.' }).eq('status', 'sending').lt('updated_at', staleBefore)
    let query = admin.from('interview_email_notifications').select(`id,recipient_email,recipient_kind,notification_type,status,scheduled_for,attempts,interview:interviews!interview_email_notifications_interview_id_fkey(scheduled_start,format,meeting_url,location,instructions,cancellation_reason,candidate:cv_submissions!interviews_submission_id_fkey(candidate_name,position:positions!cv_submissions_position_id_fkey(title)),stage:recruitment_stages!interviews_stage_id_fkey(name),interviewer:interviewer_profiles!interviews_interviewer_id_fkey(display_name))`).in('status', ['pending', 'failed']).lte('scheduled_for', new Date().toISOString()).lt('attempts', 10).order('scheduled_for').limit(20)
    if (interviewId) query = query.eq('interview_id', interviewId)
    const { data: notifications, error } = await query; if (error) throw error
    if (!notifications?.length) return reply(origin, 200, { sent: 0, failed: 0 })
    const token = await accessToken(); const sender = Deno.env.get('GMAIL_SENDER')
    if (!sender) throw new Error('The Gmail sender address is not configured.')
    let sent = 0; let failed = 0
    for (const row of notifications as any[]) {
      try {
        const { data: claimed } = await admin.from('interview_email_notifications').update({ status: 'sending', attempts: row.attempts + 1, last_error: null }).eq('id', row.id).in('status', ['pending', 'failed']).select('id').maybeSingle()
        if (!claimed) continue
        const mail = content(row); const raw = encode(`From: Altrium Recruitment <${sender}>\r\nTo: ${row.recipient_email}\r\nSubject: ${mail.subject}\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n${mail.body}`)
        const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ raw }) })
        const result = await response.json(); if (!response.ok) throw new Error(result?.error?.message || 'Gmail rejected the message.')
        await admin.from('interview_email_notifications').update({ status: 'sent', sent_at: new Date().toISOString(), provider_message_id: result.id }).eq('id', row.id); sent++
      } catch (sendError) { await admin.from('interview_email_notifications').update({ status: 'failed', last_error: sendError instanceof Error ? sendError.message : 'Email delivery failed.' }).eq('id', row.id); failed++ }
    }
    return reply(origin, 200, { sent, failed })
  } catch (error) { console.error('send-interview-emails:', error); return reply(origin, 500, { error: error instanceof Error ? error.message : 'Email delivery failed.' }) }
})
