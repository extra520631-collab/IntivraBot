import { useState } from 'react'
import { Link, NavLink, useNavigate, useLocation } from 'react-router-dom'
import { Bell, LogOut, Menu, Search, X } from 'lucide-react'
import Logo from '../ui/Logo'
import { useAuth } from '../../context/AuthContext'
import { useNotifications } from '../../context/NotificationContext'
import { cn } from '../../lib/cn'

export default function DashboardLayout({ nav = [], title, children }) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [photoBroken, setPhotoBroken] = useState(false)
  const { user, logout } = useAuth()
  const { unread } = useNotifications()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const base = pathname.startsWith('/hr') ? '/hr' : '/candidate'

  const handleLogout = () => {
    logout()
    navigate('/')
  }

  const initials = (user?.name || 'U')
    .split(' ')
    .map((s) => s[0])
    .slice(0, 2)
    .join('')

  return (
    <div className="flex min-h-screen bg-white">
      {/* Sidebar */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-64 transform flex-col border-r border-ink-100 bg-white transition-transform lg:static lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="flex h-16 shrink-0 items-center justify-between px-5">
          {/* Inside a portal the logo goes to that portal's dashboard, not to
              the public landing page — signed-in users expect "home" to mean
              their own home. */}
          <Link to={base}>
            <Logo />
          </Link>
          <button className="lg:hidden" onClick={() => setOpen(false)}>
            <X className="h-5 w-5 text-ink-500" />
          </button>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-2">
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition',
                  isActive
                    ? 'bg-brand-50 text-brand-700'
                    : 'text-ink-600 hover:bg-ink-50 hover:text-ink-900'
                )
              }
            >
              <item.icon className="h-[18px] w-[18px]" />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="shrink-0 border-t border-ink-100 p-3">
          <button
            onClick={handleLogout}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-ink-600 hover:bg-ink-50"
          >
            <LogOut className="h-[18px] w-[18px]" />
            Log out
          </button>
        </div>
      </aside>

      {open && (
        <div className="fixed inset-0 z-40 bg-ink-900/20 lg:hidden" onClick={() => setOpen(false)} />
      )}

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-ink-100 bg-white px-4 sm:px-6">
          <button className="lg:hidden" onClick={() => setOpen(true)}>
            <Menu className="h-5 w-5 text-ink-600" />
          </button>
          <h1 className="text-lg font-semibold text-ink-900">{title}</h1>
          <div className="ml-auto flex items-center gap-3">
            {/* Jumps to the searchable list for whichever side you're on —
                candidates search jobs, HR searches their applicants. */}
            <form
              onSubmit={(e) => {
                e.preventDefault()
                const q = search.trim()
                if (!q) return
                navigate(
                  user?.role === 'hr'
                    ? `/hr/applications?q=${encodeURIComponent(q)}`
                    : `/candidate/jobs?q=${encodeURIComponent(q)}`
                )
                setSearch('')
              }}
              className="hidden items-center gap-2 rounded-lg border border-ink-200 px-3 py-2 focus-within:border-brand-500 sm:flex"
            >
              <Search className="h-4 w-4 text-ink-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={user?.role === 'hr' ? 'Search applicants…' : 'Search jobs…'}
                className="w-40 bg-transparent text-sm outline-none placeholder:text-ink-400"
              />
            </form>
            <Link to={`${base}/notifications`} className="relative rounded-lg p-2 hover:bg-ink-50" aria-label={`Notifications${unread ? ` (${unread} unread)` : ''}`}>
              <Bell className="h-5 w-5 text-ink-600" />
              {unread > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-600 px-1 text-[10px] font-bold text-white">
                  {unread > 9 ? '9+' : unread}
                </span>
              )}
            </Link>
            <div className="flex items-center gap-2">
              {/* photoUrl can 404 (an image deleted from storage), so fall back
                  to initials rather than showing a broken-image icon. */}
              {user?.photoUrl && !photoBroken ? (
                <img
                  src={user.photoUrl}
                  alt={user.name || 'Your profile'}
                  onError={() => setPhotoBroken(true)}
                  className="h-9 w-9 rounded-full object-cover"
                />
              ) : (
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-600 text-sm font-semibold text-white">
                  {initials}
                </div>
              )}
              <div className="hidden text-sm leading-tight sm:block">
                <div className="font-semibold text-ink-900">{user?.name}</div>
                <div className="text-xs capitalize text-ink-400">{user?.role}</div>
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1 bg-ink-50/40 p-4 sm:p-6">{children}</main>
      </div>
    </div>
  )
}
