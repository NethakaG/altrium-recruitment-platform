import type { InterviewFormat } from '../types/interviews'

export interface InterviewDraft {
  start: string
  end: string
  format: InterviewFormat
  meetingUrl?: string
  location?: string
}

export function validateInterviewDraft(draft: InterviewDraft, now = new Date()): string[] {
  const errors: string[] = []
  const start = new Date(draft.start)
  const end = new Date(draft.end)
  if (!draft.start || Number.isNaN(start.getTime())) errors.push('Choose a valid start time.')
  if (!draft.end || Number.isNaN(end.getTime())) errors.push('Choose a valid end time.')
  if (!errors.length && start <= now) errors.push('The interview must start in the future.')
  if (!errors.length && end <= start) errors.push('The end time must be after the start time.')
  if (!errors.length && (start.getMinutes() % 30 !== 0 || end.getMinutes() % 30 !== 0)) errors.push('Use 30-minute time increments.')
  if (draft.format === 'online' && !draft.meetingUrl?.trim()) errors.push('Add the online meeting link.')
  if (draft.format === 'physical' && !draft.location?.trim()) errors.push('Add the physical interview location.')
  return errors
}
