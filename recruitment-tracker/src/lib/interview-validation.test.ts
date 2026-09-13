import { describe, expect, it } from 'vitest'
import { validateInterviewDraft } from './interview-validation'

const now = new Date('2026-09-12T04:00:00Z')

describe('validateInterviewDraft', () => {
  it('accepts a future online interview on half-hour boundaries', () => {
    expect(validateInterviewDraft({ start: '2026-09-14T04:30:00Z', end: '2026-09-14T05:30:00Z', format: 'online', meetingUrl: 'https://meet.google.com/example' }, now)).toEqual([])
  })

  it('requires the correct destination and valid times', () => {
    expect(validateInterviewDraft({ start: '2026-09-12T03:30:00Z', end: '2026-09-12T03:00:00Z', format: 'physical' }, now)).toEqual([
      'The interview must start in the future.',
      'Add the physical interview location.',
    ])
  })
})
