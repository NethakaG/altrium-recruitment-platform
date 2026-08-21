import { useRef, useState } from 'react'
import { formatFileSize, validateCvFile } from '../lib/file-validation'
import { submitTestCv } from '../services/submissions'
import type { Position } from '../types/position'
import { ArrowUpRightIcon, UploadIcon, XIcon } from './icons'
import { PositionSelect } from './PositionSelect'

type UploadStatus = 'Queued' | 'Uploading' | 'Submitted' | 'Failed'

interface UploadItem {
  id: string
  file: File
  status: UploadStatus
  message: string
  candidateName?: string
}

function fileId(file: File) {
  return `${file.name}-${file.size}-${file.lastModified}`
}

export function TestModeBulkUpload({ positions }: { positions: Position[] }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [positionId, setPositionId] = useState('')
  const [items, setItems] = useState<UploadItem[]>([])
  const [error, setError] = useState('')
  const [running, setRunning] = useState(false)

  function chooseFiles(files: FileList | null) {
    if (!files) return
    const selected = Array.from(files)
    const existingIds = new Set(items.map((item) => item.id))
    const valid: UploadItem[] = []
    const errors: string[] = []
    selected.forEach((file) => {
      const validationError = validateCvFile(file)
      if (validationError) errors.push(`${file.name}: ${validationError}`)
      else if (!existingIds.has(fileId(file))) valid.push({ id: fileId(file), file, status: 'Queued', message: '' })
    })
    const available = Math.max(0, 15 - items.length)
    if (valid.length > available) errors.push('Test Mode accepts a maximum of 15 CVs in one batch.')
    setItems((current) => [...current, ...valid.slice(0, available)])
    setError(errors.join(' '))
    if (inputRef.current) inputRef.current.value = ''
  }

  function updateItem(id: string, patch: Partial<UploadItem>) {
    setItems((current) => current.map((item) => item.id === id ? { ...item, ...patch } : item))
  }

  async function runBatch(batch: UploadItem[]) {
    if (!positionId) { setError('Select the position for this batch.'); return }
    if (!batch.length) { setError('Choose at least one PDF CV.'); return }
    setRunning(true)
    setError('')
    let nextIndex = 0
    const worker = async () => {
      while (nextIndex < batch.length) {
        const item = batch[nextIndex]
        nextIndex += 1
        updateItem(item.id, { status: 'Uploading', message: 'Extracting and submitting…' })
        try {
          const result = await submitTestCv(positionId, item.file)
          updateItem(item.id, { status: 'Submitted', message: 'Processed normally', candidateName: result.candidateName })
        } catch (uploadError) {
          updateItem(item.id, { status: 'Failed', message: uploadError instanceof Error ? uploadError.message : 'Submission failed.' })
        }
      }
    }
    await Promise.all([worker(), worker()])
    setRunning(false)
  }

  const submittedCount = items.filter((item) => item.status === 'Submitted').length
  const failedItems = items.filter((item) => item.status === 'Failed')

  return <div className="submission-form test-mode-form">
    <div className="form-heading"><span>Temporary Test Mode</span><h2>Bulk CV processing</h2><p>Select one open position and add up to 15 PDF CVs. Every file follows the real extraction, duplicate-checking and application process.</p></div>
    <div className="test-mode-warning"><strong>Normal data rules apply</strong><span>Each CV must contain a readable candidate name and unique email address. Successful submissions are real candidate records.</span></div>
    <PositionSelect positions={positions} value={positionId} onChange={(value) => { setPositionId(value); setError('') }} disabled={running || submittedCount > 0} error={!positionId && error.startsWith('Select') ? error : ''} />

    <fieldset className="field-group" disabled={running || items.length >= 15}>
      <legend>Upload CV batch</legend>
      <label className="bulk-drop-zone">
        <input ref={inputRef} type="file" multiple accept=".pdf,application/pdf" onChange={(event) => chooseFiles(event.target.files)} />
        <span className="upload-icon"><UploadIcon /></span><strong>Choose multiple PDF CVs</strong><span>{items.length}/15 selected · Maximum 10 MB each</span>
      </label>
    </fieldset>

    {items.length ? <div className="bulk-file-list">{items.map((item) => <article key={item.id} className={`bulk-file bulk-file-${item.status.toLowerCase()}`}>
      <div><strong>{item.candidateName || item.file.name}</strong><span>{formatFileSize(item.file.size)} · {item.status}</span>{item.message ? <small>{item.message}</small> : null}</div>
      {['Queued', 'Failed'].includes(item.status) && !running ? <button type="button" aria-label={`Remove ${item.file.name}`} onClick={() => setItems((current) => current.filter((currentItem) => currentItem.id !== item.id))}><XIcon /></button> : null}
    </article>)}</div> : null}

    {error && !error.startsWith('Select') ? <div className="error-message" role="alert"><span>!</span><p>{error}</p></div> : null}
    {submittedCount ? <div className="bulk-progress"><strong>{submittedCount} of {items.length} submitted successfully</strong><span>{failedItems.length ? `${failedItems.length} file(s) need retry.` : 'The successful candidates are now visible in the private tracker.'}</span></div> : null}
    {failedItems.length && !running ? <button className="secondary-button bulk-retry-button" type="button" onClick={() => void runBatch(failedItems)}>Retry failed files</button> : null}
    <button className="submit-button" type="button" disabled={running || !items.some((item) => item.status === 'Queued') || !positionId} onClick={() => void runBatch(items.filter((item) => item.status === 'Queued'))}>
      {running ? <><span className="spinner" />Processing batch…</> : <>Submit all queued CVs <ArrowUpRightIcon /></>}
    </button>
  </div>
}
