export interface Position {
  id: string
  title: string
  department: string | null
}

export interface PositionRow extends Position {
  status: string
  archived_at: string | null
  workflow_configured: boolean
  rubric_configured: boolean
}
