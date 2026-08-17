import type { PositionStatus } from '../types/positions'

export function PositionStatusBadge({ status }: { status: PositionStatus }) {
  return <span className={`position-status position-status-${status.toLowerCase()}`}><span />{status}</span>
}
