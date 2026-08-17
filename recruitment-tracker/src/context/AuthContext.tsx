import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { getSupabaseClient } from '../lib/supabase'
import { getCurrentSession, getStaffProfile, signInWithPassword, signOut as requestSignOut } from '../services/auth'
import type { StaffProfile } from '../types/auth'

type AuthStatus = 'loading' | 'signed_out' | 'active' | 'pending' | 'error'

interface AuthContextValue {
  session: Session | null
  profile: StaffProfile | null
  status: AuthStatus
  error: string | null
  login: (email: string, password: string) => Promise<AuthStatus>
  logout: () => Promise<void>
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

function accessStatus(profile: StaffProfile | null): AuthStatus {
  return profile?.is_active && profile.role ? 'active' : 'pending'
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<StaffProfile | null>(null)
  const [status, setStatus] = useState<AuthStatus>('loading')
  const [error, setError] = useState<string | null>(null)

  const hydrate = useCallback(async (nextSession: Session | null) => {
    setSession(nextSession)
    setError(null)
    if (!nextSession) {
      setProfile(null)
      setStatus('signed_out')
      return 'signed_out' as const
    }

    try {
      const nextProfile = await getStaffProfile(nextSession.user.id)
      setProfile(nextProfile)
      const nextStatus = accessStatus(nextProfile)
      setStatus(nextStatus)
      return nextStatus
    } catch {
      setProfile(null)
      setStatus('error')
      setError('We could not verify your staff access. Please try again.')
      return 'error' as const
    }
  }, [])

  useEffect(() => {
    let mounted = true
    void getCurrentSession()
      .then((initialSession) => {
        if (mounted) void hydrate(initialSession)
      })
      .catch(() => {
        if (!mounted) return
        setStatus('error')
        setError('We could not restore your session.')
      })

    const { data } = getSupabaseClient().auth.onAuthStateChange((_event, nextSession) => {
      window.setTimeout(() => {
        if (mounted) void hydrate(nextSession)
      }, 0)
    })

    return () => {
      mounted = false
      data.subscription.unsubscribe()
    }
  }, [hydrate])

  const login = useCallback(async (email: string, password: string) => {
    setStatus('loading')
    setError(null)
    try {
      const nextSession = await signInWithPassword(email, password)
      return await hydrate(nextSession)
    } catch {
      setStatus('signed_out')
      setError('The email or password is incorrect.')
      return 'signed_out'
    }
  }, [hydrate])

  const logout = useCallback(async () => {
    await requestSignOut()
    await hydrate(null)
  }, [hydrate])

  const refreshProfile = useCallback(async () => {
    if (session) await hydrate(session)
  }, [hydrate, session])

  const value = useMemo(() => ({ session, profile, status, error, login, logout, refreshProfile }), [session, profile, status, error, login, logout, refreshProfile])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside AuthProvider.')
  return context
}
