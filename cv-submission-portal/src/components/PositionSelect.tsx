import { BriefcaseIcon, ChevronDownIcon } from './icons'
import type { Position } from '../types/position'

interface PositionSelectProps {
  positions: Position[]
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  error?: string
}

export function PositionSelect({
  positions,
  value,
  onChange,
  disabled,
  error,
}: PositionSelectProps) {
  return (
    <div className="field-group">
      <label htmlFor="position">Position Applying For</label>
      <div className={`select-shell ${error ? 'field-invalid' : ''}`}>
        <BriefcaseIcon className="field-icon" />
        <select
          id="position"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          disabled={disabled}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? 'position-error' : undefined}
        >
          <option value="">Select a position</option>
          {positions.map((position) => (
            <option key={position.id} value={position.id}>
              {position.title}
              {position.department ? ` — ${position.department}` : ''}
            </option>
          ))}
        </select>
        <ChevronDownIcon className="select-chevron" />
      </div>
      {error ? <p id="position-error" className="field-error">{error}</p> : null}
    </div>
  )
}
