import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { useAuth } from '../context/AuthContext'
import { validateStaffAccess, validateStaffInvite, type StaffAccessErrors } from '../lib/staff-access-validation'
import { inviteStaffUser, listStaffAccessAudit, listStaffProfiles, updateStaffAccess } from '../services/staff-access'
import { roleDefinitions, staffRoles, type StaffProfile, type StaffRole } from '../types/auth'
import type { StaffAccessAudit } from '../types/staff-access'

type StatusFilter = 'all' | 'active' | 'inactive' | 'pending'

const initialInvite = { email: '', fullName: '', role: 'hr_recruiter' as StaffRole }

function messageFrom(error: unknown) {
  return error instanceof Error ? error.message : 'The action could not be completed.'
}

function auditDescription(entry: StaffAccessAudit) {
  if (entry.action === 'activated') return 'activated staff access'
  if (entry.action === 'deactivated') return 'deactivated staff access'
  if (entry.action === 'role_changed') return `changed the role to ${entry.new_role ? roleDefinitions[entry.new_role].shortLabel : 'unassigned'}`
  if (entry.action === 'profile_updated') return 'updated the staff profile'
  return 'confirmed staff access'
}

export function StaffAccessPage() {
  const { profile } = useAuth()
  const [staff, setStaff] = useState<StaffProfile[]>([])
  const [audit, setAudit] = useState<StaffAccessAudit[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState<'all' | StaffRole>('all')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [showInvite, setShowInvite] = useState(false)
  const [invite, setInvite] = useState(initialInvite)
  const [inviteErrors, setInviteErrors] = useState<StaffAccessErrors>({})
  const [inviting, setInviting] = useState(false)
  const [editing, setEditing] = useState<StaffProfile | null>(null)
  const [editName, setEditName] = useState('')
  const [editRole, setEditRole] = useState<StaffRole>('hr_recruiter')
  const [editActive, setEditActive] = useState(false)
  const [editErrors, setEditErrors] = useState<StaffAccessErrors>({})
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [profiles, history] = await Promise.all([listStaffProfiles(), listStaffAccessAudit()])
      setStaff(profiles)
      setAudit(history)
    } catch (requestError) {
      setError(messageFrom(requestError))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const filteredStaff = useMemo(() => {
    const query = search.trim().toLowerCase()
    return staff.filter((member) => {
      if (query && !`${member.full_name ?? ''} ${member.email}`.toLowerCase().includes(query)) return false
      if (roleFilter !== 'all' && member.role !== roleFilter) return false
      if (statusFilter === 'active' && !member.is_active) return false
      if (statusFilter === 'inactive' && member.is_active) return false
      if (statusFilter === 'pending' && (member.is_active || member.role)) return false
      return true
    })
  }, [roleFilter, search, staff, statusFilter])

  const counts = useMemo(() => ({
    total: staff.length,
    active: staff.filter((member) => member.is_active).length,
    inactive: staff.filter((member) => !member.is_active).length,
    admins: staff.filter((member) => member.is_active && member.role === 'it_admin').length,
  }), [staff])

  async function submitInvite(event: FormEvent) {
    event.preventDefault()
    const errors = validateStaffInvite(invite.email, invite.fullName, invite.role)
    setInviteErrors(errors)
    if (Object.keys(errors).length) return
    setInviting(true)
    setError(null)
    try {
      const message = await inviteStaffUser(invite)
      setNotice(message)
      setInvite(initialInvite)
      setShowInvite(false)
      await load()
    } catch (requestError) {
      setError(messageFrom(requestError))
    } finally {
      setInviting(false)
    }
  }

  function openEditor(member: StaffProfile) {
    setEditing(member)
    setEditName(member.full_name ?? '')
    setEditRole(member.role ?? 'hr_recruiter')
    setEditActive(member.is_active)
    setEditErrors({})
    setError(null)
  }

  async function saveEdit(event: FormEvent) {
    event.preventDefault()
    if (!editing) return
    const errors = validateStaffAccess(editName, editRole)
    setEditErrors(errors)
    if (Object.keys(errors).length) return
    setSaving(true)
    setError(null)
    try {
      await updateStaffAccess({ staffId: editing.id, fullName: editName, role: editRole, isActive: editActive })
      setNotice(`${editName.trim()}'s staff access was updated.`)
      setEditing(null)
      await load()
    } catch (requestError) {
      setError(messageFrom(requestError))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="page-shell staff-access-page">
      <header className="page-header staff-access-header">
        <div><span className="eyebrow dark">IT administration</span><h1>Staff access</h1><p>Invite staff, control assigned roles and review every access change.</p></div>
        <button type="button" className="primary-button" onClick={() => setShowInvite((value) => !value)}>{showInvite ? 'Close invitation' : 'Invite staff member'}</button>
      </header>

      <section className="dashboard-metrics" aria-label="Staff access summary">
        <article><span>Total accounts</span><strong>{counts.total}</strong></article>
        <article><span>Active staff</span><strong>{counts.active}</strong></article>
        <article><span>Inactive / pending</span><strong>{counts.inactive}</strong></article>
        <article><span>Active IT Admins</span><strong>{counts.admins}</strong></article>
      </section>

      {showInvite && <form className="staff-invite-panel" onSubmit={submitInvite} noValidate>
        <div className="section-heading"><div><span>Secure invitation</span><h2>Add a staff account</h2></div><p>The invitee receives a one-time Supabase email and creates their own password.</p></div>
        <div className="staff-form-grid">
          <label><span>Full name</span><input value={invite.fullName} onChange={(event) => setInvite({ ...invite, fullName: event.target.value })} />{inviteErrors.fullName && <small>{inviteErrors.fullName}</small>}</label>
          <label><span>Email address</span><input type="email" value={invite.email} onChange={(event) => setInvite({ ...invite, email: event.target.value })} />{inviteErrors.email && <small>{inviteErrors.email}</small>}</label>
          <label><span>Role</span><select value={invite.role} onChange={(event) => setInvite({ ...invite, role: event.target.value as StaffRole })}>{staffRoles.map((role) => <option key={role} value={role}>{roleDefinitions[role].label}</option>)}</select>{inviteErrors.role && <small>{inviteErrors.role}</small>}</label>
        </div>
        <button type="submit" className="primary-button" disabled={inviting}>{inviting ? 'Sending invitation…' : 'Send staff invitation'}</button>
      </form>}

      {notice && <div className="success-banner" role="status">{notice}</div>}
      {error && <div className="auth-error" role="alert">{error}</div>}

      <section className="staff-directory-panel">
        <div className="section-heading"><div><span>Account directory</span><h2>Staff members</h2></div><strong>{filteredStaff.length} shown</strong></div>
        <div className="staff-filters">
          <label className="search-field"><span>Search</span><input type="search" placeholder="Name or email" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
          <label className="filter-field"><span>Role</span><select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value as 'all' | StaffRole)}><option value="all">All roles</option>{staffRoles.map((role) => <option key={role} value={role}>{roleDefinitions[role].shortLabel}</option>)}</select></label>
          <label className="filter-field"><span>Status</span><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}><option value="all">All statuses</option><option value="active">Active</option><option value="inactive">Inactive</option><option value="pending">Pending setup</option></select></label>
        </div>

        {loading ? <div className="module-loading">Loading staff accounts…</div> : filteredStaff.length === 0 ? <div className="module-empty">No staff accounts match these filters.</div> : <div className="staff-table-wrap"><table className="staff-table"><thead><tr><th>Staff member</th><th>Role</th><th>Status</th><th>Last updated</th><th></th></tr></thead><tbody>{filteredStaff.map((member) => <tr key={member.id}>
          <td><strong>{member.full_name || 'Name not supplied'}</strong><span>{member.email}</span>{member.id === profile?.id && <small className="self-label">Your account</small>}</td>
          <td>{member.role ? roleDefinitions[member.role].label : 'Role not assigned'}</td>
          <td><span className={`staff-status ${member.is_active ? 'active' : 'inactive'}`}>{member.is_active ? 'Active' : 'Inactive'}</span></td>
          <td>{new Intl.DateTimeFormat('en-LK', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Colombo' }).format(new Date(member.updated_at))}</td>
          <td><button type="button" className="secondary-button compact-button" onClick={() => openEditor(member)}>Manage</button></td>
        </tr>)}</tbody></table></div>}
      </section>

      <section className="staff-audit-panel">
        <div className="section-heading"><div><span>Audit history</span><h2>Recent access changes</h2></div><strong>Latest 100</strong></div>
        {audit.length === 0 ? <div className="module-empty">No staff access changes have been recorded yet.</div> : <div className="audit-list">{audit.map((entry) => <article key={entry.id}>
          <span className="audit-mark" aria-hidden="true">A</span>
          <div><strong>{entry.actor?.full_name || entry.actor?.email || 'IT Admin'} {auditDescription(entry)}</strong><p>{entry.staff?.full_name || entry.staff?.email || 'Staff account'}</p></div>
          <time dateTime={entry.changed_at}>{new Intl.DateTimeFormat('en-LK', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Colombo' }).format(new Date(entry.changed_at))}</time>
        </article>)}</div>}
      </section>

      {editing && <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setEditing(null) }}>
        <form className="confirm-dialog staff-edit-dialog" role="dialog" aria-modal="true" aria-labelledby="staff-edit-title" onSubmit={saveEdit}>
          <span className="dialog-kicker">Staff account</span><h2 id="staff-edit-title">Manage access</h2><p>{editing.email}</p>
          <label><span>Full name</span><input value={editName} onChange={(event) => setEditName(event.target.value)} />{editErrors.fullName && <small>{editErrors.fullName}</small>}</label>
          <label><span>Role</span><select value={editRole} disabled={editing.id === profile?.id} onChange={(event) => setEditRole(event.target.value as StaffRole)}>{staffRoles.map((role) => <option key={role} value={role}>{roleDefinitions[role].label}</option>)}</select>{editErrors.role && <small>{editErrors.role}</small>}</label>
          <label className="staff-active-toggle"><input type="checkbox" checked={editActive} disabled={editing.id === profile?.id} onChange={(event) => setEditActive(event.target.checked)} /><span>Account is active</span></label>
          {editing.id === profile?.id && <p className="staff-safety-note">You can update your name, but you cannot remove or deactivate your own IT Admin access.</p>}
          <div className="dialog-actions"><button type="button" className="secondary-button" disabled={saving} onClick={() => setEditing(null)}>Cancel</button><button type="submit" className="primary-button" disabled={saving}>{saving ? 'Saving…' : 'Save access'}</button></div>
        </form>
      </div>}
    </div>
  )
}
