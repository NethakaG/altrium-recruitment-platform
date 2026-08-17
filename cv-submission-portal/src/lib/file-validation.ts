export const MAX_CV_SIZE_BYTES = 10 * 1024 * 1024
export const ACCEPTED_CV_EXTENSIONS = ['pdf'] as const

const acceptedMimeTypes = new Set([
  'application/pdf',
  'application/octet-stream',
  '',
])

export function getFileExtension(filename: string): string {
  return filename.split('.').pop()?.toLowerCase() ?? ''
}

export function validateCvFile(file: File): string | null {
  if (file.size === 0) {
    return 'The selected CV file is empty.'
  }

  if (file.size > MAX_CV_SIZE_BYTES) {
    return 'CV files must be smaller than 10 MB.'
  }

  const extension = getFileExtension(file.name)
  if (
    !ACCEPTED_CV_EXTENSIONS.includes(
      extension as (typeof ACCEPTED_CV_EXTENSIONS)[number],
    ) ||
    !acceptedMimeTypes.has(file.type)
  ) {
    return 'Please upload your CV as a PDF file.'
  }

  return null
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
