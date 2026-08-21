import { FunctionsHttpError } from '@supabase/supabase-js'
import { getSupabaseClient } from '../lib/supabase'
import type { CandidateContact, SubmissionErrorCode, SubmissionResult } from '../types/submission'

interface ErrorPayload {
  code?: SubmissionErrorCode
  error?: string
}

export class SubmissionError extends Error {
  code: SubmissionErrorCode

  constructor(message: string, code: SubmissionErrorCode = 'SUBMISSION_FAILED') {
    super(message)
    this.name = 'SubmissionError'
    this.code = code
  }
}

export async function submitCv(
  positionId: string,
  file: File,
  contact: CandidateContact,
): Promise<SubmissionResult> {
  const body = new FormData()
  body.append('positionId', positionId)
  body.append('fullName', contact.fullName.trim())
  body.append('email', contact.email.trim().toLowerCase())
  body.append('phone', contact.phone.trim())
  body.append('cv', file)

  let response
  try {
    response = await getSupabaseClient().functions.invoke<SubmissionResult>('submit-cv', {
      body,
    })
  } catch (error) {
    if (error instanceof Error && error.message.includes('environment variables')) {
      throw new SubmissionError(
        'The application is not configured to receive submissions yet.',
        'CONFIGURATION_ERROR',
      )
    }
    throw error
  }

  const { data, error } = response

  if (error) {
    let payload: ErrorPayload = {}
    if (error instanceof FunctionsHttpError) {
      try {
        payload = (await error.context.json()) as ErrorPayload
      } catch {
        // The fallback below is intentionally generic and candidate-safe.
      }
    }

    if (payload.code === 'POSITION_CLOSED') {
      throw new SubmissionError(
        'This position is no longer accepting applications.',
        'POSITION_CLOSED',
      )
    }

    if (payload.code === 'DUPLICATE_APPLICATION') {
      throw new SubmissionError(
        'An application using this email address has already been submitted for this position.',
        'DUPLICATE_APPLICATION',
      )
    }

    if (payload.code === 'INVALID_FILE' || payload.code === 'FILE_TOO_LARGE') {
      throw new SubmissionError(
        payload.error ?? 'The selected CV could not be accepted.',
        payload.code,
      )
    }

    throw new SubmissionError("We couldn't submit your CV. Please try again.")
  }

  if (!data?.success) {
    throw new SubmissionError("We couldn't submit your CV. Please try again.")
  }

  return data
}

export async function submitTestCv(positionId: string, file: File): Promise<SubmissionResult> {
  const body = new FormData()
  body.append('positionId', positionId)
  body.append('cv', file)

  const { data, error } = await getSupabaseClient().functions.invoke<SubmissionResult>('submit-test-cv', { body })
  if (error) {
    let payload: ErrorPayload = {}
    if (error instanceof FunctionsHttpError) {
      try { payload = (await error.context.json()) as ErrorPayload } catch { /* Candidate-safe fallback below. */ }
    }
    throw new SubmissionError(payload.error ?? "We couldn't submit this CV. Please retry it.", payload.code ?? 'SUBMISSION_FAILED')
  }
  if (!data?.success) throw new SubmissionError("We couldn't submit this CV. Please retry it.")
  return data
}
