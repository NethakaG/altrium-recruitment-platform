import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('public submission security', () => {
  it('does not grant public access to candidate submissions or CV files', () => {
    const migration = readFileSync(resolve('supabase/migrations/20260817071024_create_cv_submission_portal.sql'), 'utf8')
    expect(migration).toMatch(/enable row level security/i)
    expect(migration).toMatch(/revoke all on table public\.cv_submissions from anon, authenticated/i)
    expect(migration).toMatch(/values\s*\([\s\S]*'candidate-cvs'[\s\S]*false/i)
    expect(migration).not.toMatch(/candidate-cvs[\s\S]*for select[\s\S]*to anon/i)
  })
})
