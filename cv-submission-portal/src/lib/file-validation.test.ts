import { describe, expect, it } from 'vitest'
import { MAX_CV_SIZE_BYTES, validateCvFile } from './file-validation'

describe('validateCvFile', () => {
  it('rejects unsupported file types', () => {
    const file = new File(['hello'], 'cv.txt', { type: 'text/plain' })
    expect(validateCvFile(file)).toBe('Please upload your CV as a PDF file.')
  })

  it('rejects Word documents', () => {
    const file = new File(['word'], 'cv.docx', { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' })
    expect(validateCvFile(file)).toBe('Please upload your CV as a PDF file.')
  })

  it('rejects files larger than 10 MB', () => {
    const file = new File([new Uint8Array(MAX_CV_SIZE_BYTES + 1)], 'cv.pdf', { type: 'application/pdf' })
    expect(validateCvFile(file)).toBe('CV files must be smaller than 10 MB.')
  })

  it('accepts a valid CV', () => {
    const file = new File(['%PDF-1.7'], 'cv.pdf', { type: 'application/pdf' })
    expect(validateCvFile(file)).toBeNull()
  })
})
