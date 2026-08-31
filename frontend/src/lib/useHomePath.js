import { useAuth } from '../context/AuthContext'

/**
 * Where "home" should take the current visitor.
 *
 * Signed out, that is the public landing page. Signed in, it is that user's own
 * portal — a logo click inside the app should never drop someone back onto the
 * marketing site they have already signed up for.
 */
export function useHomePath() {
  const { user } = useAuth()
  if (!user) return '/'
  return user.role === 'hr' ? '/hr' : '/candidate'
}
