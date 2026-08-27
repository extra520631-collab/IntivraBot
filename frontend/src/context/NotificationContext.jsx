import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { api, tokenStore } from '../lib/api'
import { connectSocket, disconnectSocket } from '../lib/socket'
import { useAuth } from './AuthContext'

const NotificationContext = createContext(null)

export function NotificationProvider({ children }) {
  const { user } = useAuth()
  const [notifications, setNotifications] = useState([])
  const [unread, setUnread] = useState(0)

  const reload = useCallback(async () => {
    try {
      const d = await api.get('/notifications')
      setNotifications(d.notifications || [])
      setUnread(d.unread || 0)
    } catch { /* ignore */ }
  }, [])

  // Connect the socket + load history whenever a user signs in.
  useEffect(() => {
    if (!user) {
      setNotifications([])
      setUnread(0)
      disconnectSocket()
      return
    }
    reload()
    const socket = connectSocket(tokenStore.get())
    socket.on('notification:new', ({ notification, unread: u }) => {
      setNotifications((cur) => [notification, ...cur].slice(0, 50))
      setUnread((prev) => (typeof u === 'number' ? u : prev + 1))
    })
    return () => {
      socket.off('notification:new')
      disconnectSocket()
    }
  }, [user, reload])

  const markAllRead = async () => {
    setUnread(0)
    setNotifications((cur) => cur.map((n) => ({ ...n, read: true })))
    try { await api.patch('/notifications/read-all') } catch { /* ignore */ }
  }

  const markRead = async (id) => {
    setNotifications((cur) => cur.map((n) => (n._id === id ? { ...n, read: true } : n)))
    try {
      const d = await api.patch(`/notifications/${id}/read`)
      if (d?.unread != null) setUnread(d.unread)
    } catch { /* ignore */ }
  }

  return (
    <NotificationContext.Provider value={{ notifications, unread, markAllRead, markRead, reload }}>
      {children}
    </NotificationContext.Provider>
  )
}

export function useNotifications() {
  const ctx = useContext(NotificationContext)
  if (!ctx) throw new Error('useNotifications must be used within NotificationProvider')
  return ctx
}
