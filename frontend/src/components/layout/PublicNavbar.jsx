import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Menu, X, Sparkles, Mail } from 'lucide-react'
import Logo from '../ui/Logo'
import Button from '../ui/Button'
import { cn } from '../../lib/cn'
import { useAuth } from '../../context/AuthContext'
import { useHomePath } from '../../lib/useHomePath'

const links = [
  { id: 'features', label: 'Features' },
  { id: 'how', label: 'How it works' },
  { id: 'roles', label: 'For teams' },
  { to: '/blog', label: 'Blog' },
  { id: 'faq', label: 'FAQ' },
]

export default function PublicNavbar() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)

  // A signed-in visitor on a public page belongs in their own portal: the logo
  // and the primary button both point there instead of offering sign-in again.
  const home = useHomePath()

  // Smooth-scroll to an on-page anchor if it exists; otherwise route home to it.
  const goToHash = (id) => (e) => {
    setOpen(false)
    const el = document.getElementById(id)
    if (el) {
      e.preventDefault()
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
      history.replaceState(null, '', `#${id}`)
    } else {
      e.preventDefault()
      navigate(`/#${id}`)
    }
  }

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <div className="sticky top-0 z-40">
      {/* Slim announcement strip (orange, white text) */}
      <div className="bg-brand-600 text-white">
        <div className="mx-auto flex max-w-6xl items-center justify-center gap-2 px-4 py-1.5 text-xs font-medium">
          <Sparkles className="h-3.5 w-3.5" />
          Beta is live - free for candidates &amp; recruiters during launch.
        </div>
      </div>

      {/* Main nav */}
      <header
        className={cn(
          'border-b bg-white/80 backdrop-blur transition-shadow supports-[backdrop-filter]:bg-white/65',
          scrolled ? 'border-ink-100 shadow-soft' : 'border-transparent'
        )}
      >
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link to={home} className="shrink-0">
            <Logo />
          </Link>

          {/* Center pill nav */}
          <nav className="hidden items-center gap-1 rounded-full border border-ink-100 bg-ink-50/70 p-1 md:flex">
            {links.map((l) =>
              l.to ? (
                <Link
                  key={l.label}
                  to={l.to}
                  className="rounded-full px-3.5 py-1.5 text-sm font-medium text-ink-600 transition hover:bg-white hover:text-ink-900 hover:shadow-sm"
                >
                  {l.label}
                </Link>
              ) : (
                <button
                  key={l.label}
                  type="button"
                  onClick={goToHash(l.id)}
                  className="rounded-full px-3.5 py-1.5 text-sm font-medium text-ink-600 transition hover:bg-white hover:text-ink-900 hover:shadow-sm"
                >
                  {l.label}
                </button>
              )
            )}
          </nav>

          <div className="hidden items-center gap-2 md:flex">
            <button
              type="button"
              onClick={goToHash('contact')}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-ink-200 px-3.5 text-sm font-semibold text-ink-700 transition hover:bg-ink-50"
            >
              <Mail className="h-4 w-4" /> Contact
            </button>
            {user ? (
              <Button size="sm" onClick={() => navigate(home)}>
                Go to dashboard
              </Button>
            ) : (
              <>
                <Button variant="ghost" size="sm" onClick={() => navigate('/login')}>
                  Sign in
                </Button>
                <Button size="sm" onClick={() => navigate('/register')}>
                  Get started
                </Button>
              </>
            )}
          </div>

          {/* Mobile toggle */}
          <button className="rounded-lg p-2 hover:bg-ink-50 md:hidden" onClick={() => setOpen(!open)}>
            {open ? <X className="h-5 w-5 text-ink-700" /> : <Menu className="h-5 w-5 text-ink-700" />}
          </button>
        </div>

        {/* Mobile menu */}
        {open && (
          <div className="border-t border-ink-100 bg-white md:hidden">
            <div className="space-y-1 px-4 py-3">
              {links.map((l) =>
                l.to ? (
                  <Link
                    key={l.label}
                    to={l.to}
                    onClick={() => setOpen(false)}
                    className="block rounded-lg px-3 py-2 text-sm font-medium text-ink-600 hover:bg-ink-50"
                  >
                    {l.label}
                  </Link>
                ) : (
                  <button
                    key={l.label}
                    type="button"
                    onClick={goToHash(l.id)}
                    className="block w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-ink-600 hover:bg-ink-50"
                  >
                    {l.label}
                  </button>
                )
              )}
              <button
                type="button"
                onClick={goToHash('contact')}
                className="flex w-full items-center gap-1.5 rounded-lg px-3 py-2 text-left text-sm font-medium text-ink-600 hover:bg-ink-50"
              >
                <Mail className="h-4 w-4" /> Contact
              </button>
              <div className="flex gap-2 pt-2">
                {user ? (
                  <Button size="sm" className="flex-1" onClick={() => { setOpen(false); navigate(home) }}>
                    Go to dashboard
                  </Button>
                ) : (
                  <>
                    <Button variant="secondary" size="sm" className="flex-1" onClick={() => navigate('/login')}>Sign in</Button>
                    <Button size="sm" className="flex-1" onClick={() => navigate('/register')}>Get started</Button>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </header>
    </div>
  )
}
