import { createClient } from 'npm:@supabase/supabase-js@2.112.3'
import { extractAndStoreCvProfile } from '../_shared/extract-cv.ts'

declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void }

const MAX_FILE_SIZE = 10 * 1024 * 1024
const BUCKET = 'candidate-cvs'
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const fileTypes = {
  pdf: 'application/pdf',
} as const

type ErrorCode = 'INVALID_REQUEST' | 'INVALID_FILE' | 'FILE_TOO_LARGE' | 'POSITION_CLOSED' | 'DUPLICATE_APPLICATION' | 'SUBMISSION_FAILED'

function getAllowedOrigins(): string[] {
  return (Deno.env.get('ALLOWED_ORIGINS') ?? 'http://localhost:5173,http://127.0.0.1:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
}

function corsHeaders(origin: string | null): HeadersInit {
  const headers: Record<string, string> = {
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  }
  if (origin && getAllowedOrigins().includes(origin)) {
    headers['Access-Control-Allow-Origin'] = origin
  }
  return headers
}

function jsonResponse(
  origin: string | null,
  status: number,
  body: Record<string, unknown>,
): Response {
  return Response.json(body, {
    status,
    headers: { ...corsHeaders(origin), 'Cache-Control': 'no-store' },
  })
}

function extensionOf(filename: string): keyof typeof fileTypes | null {
  const extension = filename.split('.').pop()?.toLowerCase()
  return extension && extension in fileTypes ? extension as keyof typeof fileTypes : null
}

function hasValidSignature(bytes: Uint8Array, extension: keyof typeof fileTypes): boolean {
  return extension === 'pdf' && bytes.length >= 5 && new TextDecoder().decode(bytes.slice(0, 5)) === '%PDF-'
}

function safeError(origin: string | null, status: number, code: ErrorCode, error: string) {
  return jsonResponse(origin, status, { code, error })
}

Deno.serve(async (request) => {
  const origin = request.headers.get('Origin')

  if (origin && !getAllowedOrigins().includes(origin)) {
    return safeError(origin, 403, 'INVALID_REQUEST', 'Origin is not allowed.')
  }

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(origin) })
  }

  if (request.method !== 'POST') {
    return safeError(origin, 405, 'INVALID_REQUEST', 'Method not allowed.')
  }

  try {
    const formData = await request.formData()
    const positionId = formData.get('positionId')
    const fullName = formData.get('fullName')
    const email = formData.get('email')
    const phone = formData.get('phone')
    const cv = formData.get('cv')
    const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : ''

    if (
      typeof positionId !== 'string' || !UUID_PATTERN.test(positionId)
      || typeof fullName !== 'string' || fullName.trim().length < 2 || fullName.trim().length > 120
      || typeof email !== 'string' || email.length > 254 || !EMAIL_PATTERN.test(normalizedEmail)
      || typeof phone !== 'string' || (phone.trim() && (phone.trim().length < 7 || phone.trim().length > 30))
      || !(cv instanceof File)
    ) {
      return safeError(origin, 400, 'INVALID_REQUEST', 'Valid contact details, a position, and a CV are required.')
    }

    if (cv.size === 0) {
      return safeError(origin, 400, 'INVALID_FILE', 'The selected CV file is empty.')
    }

    if (cv.size > MAX_FILE_SIZE) {
      return safeError(origin, 413, 'FILE_TOO_LARGE', 'CV files must be smaller than 10 MB.')
    }

    const extension = extensionOf(cv.name)
    if (!extension || (cv.type && cv.type !== fileTypes[extension] && cv.type !== 'application/octet-stream')) {
      return safeError(origin, 415, 'INVALID_FILE', 'Please upload your CV as a PDF file.')
    }

    const bytes = new Uint8Array(await cv.arrayBuffer())
    if (!hasValidSignature(bytes, extension)) {
      return safeError(origin, 415, 'INVALID_FILE', 'The CV file content does not match its file type.')
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!supabaseUrl || !serviceRoleKey) {
      console.error('Required Supabase function secrets are unavailable.')
      return safeError(origin, 500, 'SUBMISSION_FAILED', "We couldn't submit your CV. Please try again.")
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const { data: position, error: positionError } = await supabase
      .from('positions')
      .select('id')
      .eq('id', positionId)
      .eq('status', 'Open')
      .is('archived_at', null)
      .eq('workflow_configured', true)
      .maybeSingle()

    if (positionError) {
      console.error('Position validation failed:', positionError.code)
      return safeError(origin, 500, 'SUBMISSION_FAILED', "We couldn't submit your CV. Please try again.")
    }

    if (!position) {
      return safeError(origin, 409, 'POSITION_CLOSED', 'This position is no longer accepting applications.')
    }

    const { data: existingApplication, error: duplicateCheckError } = await supabase
      .from('cv_submissions')
      .select('id')
      .eq('position_id', positionId)
      .eq('candidate_email', normalizedEmail)
      .maybeSingle()

    if (duplicateCheckError) {
      console.error('Duplicate application check failed:', duplicateCheckError.code)
      return safeError(origin, 500, 'SUBMISSION_FAILED', "We couldn't submit your CV. Please try again.")
    }
    if (existingApplication) {
      return safeError(origin, 409, 'DUPLICATE_APPLICATION', 'An application using this email address has already been submitted for this position.')
    }

    const { data: firstStage, error: stageError } = await supabase
      .from('recruitment_stages')
      .select('id')
      .eq('position_id', positionId)
      .eq('stage_order', 1)
      .maybeSingle()

    if (stageError || !firstStage) {
      console.error('Initial workflow stage lookup failed:', stageError?.code ?? 'missing_stage')
      return safeError(origin, 500, 'SUBMISSION_FAILED', "We couldn't submit your CV. Please try again.")
    }

    const submissionId = crypto.randomUUID()
    const storagePath = `${positionId}/${submissionId}/original_cv.${extension}`
    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, bytes, {
        contentType: fileTypes[extension],
        cacheControl: '0',
        upsert: false,
      })

    if (uploadError) {
      console.error('CV upload failed:', uploadError.message)
      return safeError(origin, 500, 'SUBMISSION_FAILED', "We couldn't submit your CV. Please try again.")
    }

    const { error: insertError } = await supabase.from('cv_submissions').insert({
      id: submissionId,
      position_id: positionId,
      original_filename: cv.name,
      storage_path: storagePath,
      mime_type: fileTypes[extension],
      file_size: cv.size,
      processing_status: 'Pending',
      candidate_name: fullName.trim(),
      candidate_email: normalizedEmail,
      candidate_phone: phone.trim() || null,
      current_stage_id: firstStage.id,
      application_status: 'Active',
    })

    if (insertError) {
      console.error('Submission record insert failed:', insertError.code)
      const { error: cleanupError } = await supabase.storage.from(BUCKET).remove([storagePath])
      if (cleanupError) console.error('Orphan upload cleanup failed:', cleanupError.message)
      if (insertError.code === '23505') {
        return safeError(origin, 409, 'DUPLICATE_APPLICATION', 'An application using this email address has already been submitted for this position.')
      }
      return safeError(origin, 500, 'SUBMISSION_FAILED', "We couldn't submit your CV. Please try again.")
    }

    EdgeRuntime.waitUntil(extractAndStoreCvProfile(supabase, submissionId, bytes, fileTypes[extension]))
    return jsonResponse(origin, 201, { success: true })
  } catch (error) {
    console.error('Unexpected submit-cv failure:', error instanceof Error ? error.message : 'Unknown error')
    return safeError(origin, 500, 'SUBMISSION_FAILED', "We couldn't submit your CV. Please try again.")
  }
})
