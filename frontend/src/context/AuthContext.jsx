import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { api, tokenStore } from '../lib/api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true) // initial session check

  // On boot, if a token exists, restore the session via /auth/me.
  useEffect(() => {
    const token = tokenStore.get()
    if (!token) {
      setLoading(false)
      return
    }
    api
      .get('/auth/me')
      .then((d) => setUser(d.user))
      .catch(() => tokenStore.clear())
      .finally(() => setLoading(false))
  }, [])

  const register = async (payload) => {
    const d = await api.post('/auth/register', payload, { auth: false })
    tokenStore.set(d.token)
    setUser(d.user)
    return d.user
  }

  const login = async (payload) => {
    const d = await api.post('/auth/login', payload, { auth: false })
    tokenStore.set(d.token)
    setUser(d.user)
    return d.user
  }

  const logout = () => {
    tokenStore.clear()
    setUser(null)
  }

  const value = useMemo(
    () => ({ user, loading, register, login, logout, setUser }),
    [user, loading]
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
