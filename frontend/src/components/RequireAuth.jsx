import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import Spinner from './ui/Spinner'

// Guards a route: waits for the session check, redirects to /login when signed
// out, and bounces to the correct dashboard on a role mismatch.
export default function RequireAuth({ role, children }) {
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

  return children
}
