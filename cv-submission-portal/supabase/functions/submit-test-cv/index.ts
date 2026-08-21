import { createClient } from 'npm:@supabase/supabase-js@2.112.3'
import { extractCvProfile } from '../_shared/extract-cv.ts'

const MAX_FILE_SIZE = 10 * 1024 * 1024
const BUCKET = 'candidate-cvs'
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function getAllowedOrigins(): string[] {
  return (Deno.env.get('ALLOWED_ORIGINS') ?? 'http://localhost:5173,http://127.0.0.1:5173')
    .split(',').map((origin) => origin.trim()).filter(Boolean)
}

function corsHeaders(origin: string | null): HeadersInit {
  const headers: Record<string, string> = {
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  }
  if (origin && getAllowedOrigins().includes(origin)) headers['Access-Control-Allow-Origin'] = origin
  return headers
}

function jsonResponse(origin: string | null, status: number, body: Record<string, unknown>) {
  return Response.json(body, { status, headers: { ...corsHeaders(origin), 'Cache-Control': 'no-store' } })
}

function fail(origin: string | null, status: number, code: string, error: string) {
  return jsonResponse(origin, status, { code, error })
}

Deno.serve(async (request) => {
  const origin = request.headers.get('Origin')
  if (origin && !getAllowedOrigins().includes(origin)) return fail(origin, 403, 'INVALID_REQUEST', 'Origin is not allowed.')
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(origin) })
  if (request.method !== 'POST') return fail(origin, 405, 'INVALID_REQUEST', 'Method not allowed.')

  try {
    const formData = await request.formData()
    const positionId = formData.get('positionId')
    const cv = formData.get('cv')
    if (typeof positionId !== 'string' || !UUID_PATTERN.test(positionId) || !(cv instanceof File)) {
      return fail(origin, 400, 'INVALID_REQUEST', 'A position and PDF CV are required.')
    }
    if (cv.size === 0) return fail(origin, 400, 'INVALID_FILE', 'The selected CV file is empty.')
    if (cv.size > MAX_FILE_SIZE) return fail(origin, 413, 'FILE_TOO_LARGE', 'CV files must be smaller than 10 MB.')
    if (!cv.name.toLowerCase().endsWith('.pdf') || (cv.type && !['application/pdf', 'application/octet-stream'].includes(cv.type))) {
      return fail(origin, 415, 'INVALID_FILE', 'Please upload CVs as PDF files.')
    }

    const bytes = new Uint8Array(await cv.arrayBuffer())
    if (bytes.length < 5 || new TextDecoder().decode(bytes.slice(0, 5)) !== '%PDF-') {
      return fail(origin, 415, 'INVALID_FILE', 'The CV file content is not a valid PDF.')
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!supabaseUrl || !serviceRoleKey) return fail(origin, 500, 'SUBMISSION_FAILED', 'The test submission service is unavailable.')
    const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })

    const { data: position, error: positionError } = await admin.from('positions').select('id')
      .eq('id', positionId).eq('status', 'Open').is('archived_at', null)
      .eq('workflow_configured', true).eq('rubric_configured', true).maybeSingle()
    if (positionError) return fail(origin, 500, 'SUBMISSION_FAILED', 'The position could not be validated.')
    if (!position) return fail(origin, 409, 'POSITION_CLOSED', 'This position is no longer accepting applications.')

    let extraction
    try {
      extraction = await extractCvProfile(bytes, 'application/pdf')
    } catch (error) {
      console.error('Test-mode extraction failed:', error instanceof Error ? error.message : 'Unknown error')
      return fail(origin, 422, 'EXTRACTION_FAILED', 'Candidate details could not be extracted from this CV. Retry the file.')
    }

    const name = extraction.profile.extracted_name.trim()
    const email = extraction.profile.extracted_email.trim().toLowerCase()
    const rawPhone = extraction.profile.extracted_phone.trim()
    const phone = rawPhone.length >= 7 && rawPhone.length <= 30 ? rawPhone : null
    if (name.length < 2 || name.length > 120 || !EMAIL_PATTERN.test(email) || email.length > 254) {
      return fail(origin, 422, 'CONTACT_NOT_FOUND', 'This CV must contain a readable candidate name and email address for normal duplicate checking.')
    }

    const { data: duplicate, error: duplicateError } = await admin.from('cv_submissions').select('id')
      .eq('position_id', positionId).eq('candidate_email', email).maybeSingle()
    if (duplicateError) return fail(origin, 500, 'SUBMISSION_FAILED', 'Duplicate checking failed.')
    if (duplicate) return fail(origin, 409, 'DUPLICATE_APPLICATION', 'This candidate has already applied for the selected position.')

    const { data: firstStage, error: stageError } = await admin.from('recruitment_stages').select('id')
      .eq('position_id', positionId).eq('stage_order', 1).maybeSingle()
    if (stageError || !firstStage) return fail(origin, 500, 'SUBMISSION_FAILED', 'The position workflow is unavailable.')

    const submissionId = crypto.randomUUID()
    const storagePath = `${positionId}/${submissionId}/original_cv.pdf`
    const { error: uploadError } = await admin.storage.from(BUCKET).upload(storagePath, bytes, {
      contentType: 'application/pdf', cacheControl: '0', upsert: false,
    })
    if (uploadError) return fail(origin, 500, 'SUBMISSION_FAILED', 'The CV could not be stored.')

    const { error: insertError } = await admin.from('cv_submissions').insert({
      id: submissionId,
      position_id: positionId,
      original_filename: cv.name,
      storage_path: storagePath,
      mime_type: 'application/pdf',
      file_size: cv.size,
      processing_status: 'Processed',
      processed_at: new Date().toISOString(),
      candidate_name: name,
      candidate_email: email,
      candidate_phone: phone,
      current_stage_id: firstStage.id,
      application_status: 'Active',
      extracted_profile: extraction.profile,
      extraction_model: extraction.model,
    })
    if (insertError) {
      await admin.storage.from(BUCKET).remove([storagePath])
      if (insertError.code === '23505') return fail(origin, 409, 'DUPLICATE_APPLICATION', 'This candidate has already applied for the selected position.')
      return fail(origin, 500, 'SUBMISSION_FAILED', 'The candidate record could not be created.')
    }

    return jsonResponse(origin, 201, { success: true, submissionId, candidateName: name })
  } catch (error) {
    console.error('submit-test-cv failed:', error instanceof Error ? error.message : 'Unknown error')
    return fail(origin, 500, 'SUBMISSION_FAILED', 'The CV could not be submitted.')
  }
})
