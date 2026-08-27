import { Link } from 'react-router-dom'
import { ShieldCheck, Bot, ScanFace, Lock, Star } from 'lucide-react'
import Logo from '../../components/ui/Logo'

// Two-column auth layout: white form left, orange brand panel right.
export default function AuthShell({ children }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* Form side (pure white) */}
      <div className="flex flex-col bg-white">
        <div className="flex items-center justify-between p-6">
          <Link to="/">
            <Logo />
          </Link>
          <Link to="/" className="text-sm font-medium text-ink-500 hover:text-ink-900">
            ← Back to home
          </Link>
        </div>
        <div className="flex flex-1 items-center justify-center px-6 pb-8">
          <div className="w-full max-w-md">
            {children}

            {/* Trust row — fills the blank space, adds credibility */}
            <div className="mt-8 border-t border-ink-100 pt-5">
              <div className="flex items-center justify-center gap-5 text-xs text-ink-400">
                <span className="flex items-center gap-1.5"><Lock className="h-3.5 w-3.5" /> Encrypted</span>
                <span className="flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5" /> Consent-based</span>
                <span className="flex items-center gap-1.5"><Star className="h-3.5 w-3.5" /> Free beta</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Brand side (orange, white text) */}
      <div className="relative hidden overflow-hidden bg-brand-600 lg:flex">
        <div className="flex flex-col justify-center px-12 text-white">
          <h2 className="text-3xl font-extrabold leading-tight">
            Recruitment, reimagined with AI.
          </h2>
          <p className="mt-4 max-w-md text-brand-100">
            Resume screening, intelligent interviews, and identity verification —
            all in one secure platform.
          </p>
          <div className="mt-10 space-y-4">
            {[
              [ShieldCheck, 'Bias-free, objective scoring'],
              [Bot, 'AI adaptive interviews'],
              [ScanFace, 'Face & voice verification'],
            ].map(([Icon, t]) => (
              <div key={t} className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/15">
                  <Icon className="h-5 w-5" />
                </span>
                <span className="text-sm font-medium text-brand-50">{t}</span>
              </div>
            ))}
          </div>

          {/* Quote card */}
          <div className="mt-10 max-w-md rounded-xl bg-white/10 p-5 backdrop-blur">
            <p className="text-sm leading-relaxed text-brand-50">
              “IntivraBot cut our first-round screening time by 80% — and removed bias
              completely.”
            </p>
            <div className="mt-3 flex items-center gap-2 text-sm">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20 text-xs font-bold">SN</span>
              <div>
                <div className="font-semibold text-white">Sara Naveed</div>
                <div className="text-xs text-brand-100">HR Lead, TechNova</div>
              </div>
            </div>
          </div>
        </div>
        <div className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-white/10" />
        <div className="pointer-events-none absolute -bottom-20 -left-10 h-56 w-56 rounded-full bg-white/10" />
      </div>
    </div>
  )
}
