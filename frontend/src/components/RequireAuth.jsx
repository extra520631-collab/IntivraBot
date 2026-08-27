import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import Spinner from './ui/Spinner'

// Guards a route: waits for the session check, redirects to /login when signed
// out, bounces to the correct dashboard on a role mismatch, and holds everyone
// in the signup wizard until they have finished it once.
//
// `onboarding` marks the wizard's own routes, which must stay reachable while
// it is still unfinished — without that exemption the redirect below would
// point at itself.
export default function RequireAuth({ role, onboarding = false, children }) {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white text-brand-600">
        <Spinner size={28} />
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />
  }

  if (role && user.role !== role) {
    return <Navigate to={user.role === 'hr' ? '/hr' : '/candidate'} replace />
  }

  // Onboarding is mandatory and one-time. It used to be reachable only via the
  // redirect straight after registering, so abandoning it and signing in again
  // landed on the dashboard with an empty profile — and there was no second
  // prompt to fill it in. The completion stamp lives on the account, so this
  // survives a refresh, a new device and a fresh sign-in.
  if (!onboarding && !user.onboardingCompletedAt) {
    return <Navigate to={user.role === 'hr' ? '/hr/onboarding' : '/candidate/onboarding'} replace />
  }

  return children
}
