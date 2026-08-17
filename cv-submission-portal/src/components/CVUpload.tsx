import { useRef, useState, type DragEvent } from 'react'
import { formatFileSize, validateCvFile } from '../lib/file-validation'
import { CheckIcon, FileIcon, UploadIcon, XIcon } from './icons'

interface CVUploadProps {
  file: File | null
  onChange: (file: File | null) => void
  disabled?: boolean
  error?: string
  onValidationError: (message: string | null) => void
}

export function CVUpload({
  file,
  onChange,
  disabled,
  error,
  onValidationError,
}: CVUploadProps) {
  const [dragActive, setDragActive] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  function chooseFile(candidate?: File) {
    if (!candidate) return
    const validationError = validateCvFile(candidate)
    onValidationError(validationError)
    if (validationError) {
      onChange(null)
      if (inputRef.current) inputRef.current.value = ''
      return
    }
    onChange(candidate)
  }

  function handleDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault()
    setDragActive(false)
    if (!disabled) chooseFile(event.dataTransfer.files[0])
  }

  function removeFile() {
    onChange(null)
    onValidationError(null)
    if (inputRef.current) inputRef.current.value = ''
  }

  return (
    <fieldset className="field-group" disabled={disabled}>
      <legend>Upload your CV</legend>
      {file ? (
        <div className="selected-file" data-testid="selected-file">
          <div className="file-status-icon">
            <FileIcon />
            <span><CheckIcon /></span>
          </div>
          <div className="file-copy">
            <strong>{file.name}</strong>
            <span>{formatFileSize(file.size)} · Ready to submit</span>
          </div>
          <button type="button" onClick={removeFile} aria-label={`Remove ${file.name}`}>
            <XIcon />
          </button>
        </div>
      ) : (
        <label
          className={`drop-zone ${dragActive ? 'drop-zone-active' : ''} ${error ? 'field-invalid' : ''}`}
          onDragEnter={(event) => {
            event.preventDefault()
            if (!disabled) setDragActive(true)
          }}
          onDragOver={(event) => event.preventDefault()}
          onDragLeave={() => setDragActive(false)}
          onDrop={handleDrop}
        >
          <input
            ref={inputRef}
            type="file"
            aria-label="Upload your CV"
            accept=".pdf,application/pdf"
            onChange={(event) => chooseFile(event.target.files?.[0])}
            aria-invalid={Boolean(error)}
            aria-describedby="cv-help cv-error"
          />
          <span className="upload-icon"><UploadIcon /></span>
          <span className="drop-title">Drop your CV here</span>
          <span className="drop-or">or</span>
          <span className="choose-file">Choose file</span>
          <span id="cv-help" className="drop-help">PDF only · Maximum 10 MB</span>
        </label>
      )}
      {error ? <p id="cv-error" className="field-error">{error}</p> : null}
    </fieldset>
  )
}
