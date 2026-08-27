import { Link } from 'react-router-dom'
import { Home, Search, ArrowLeft } from 'lucide-react'
import Button from '../components/ui/Button'
import Logo from '../components/ui/Logo'

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col bg-white">
      <header className="mx-auto flex w-full max-w-6xl items-center px-4 py-5 sm:px-6">
        <Link to="/"><Logo /></Link>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center px-4 pb-20 text-center">
        <div className="animate-fade-up select-none text-[110px] font-extrabold leading-none tracking-tight text-brand-600 sm:text-[150px]">
          404
        </div>
        <div className="animate-float pointer-events-none absolute -z-10 h-56 w-56 rounded-full bg-brand-100/50 blur-3xl" />
        <h1 className="mt-2 text-2xl font-bold text-ink-900 sm:text-3xl">Page not found</h1>
        <p className="mt-2 max-w-md text-ink-500">
          The page you're looking for doesn't exist or has been moved. Let's get you back on track.
        </p>
        <div className="mt-7 flex flex-col gap-3 sm:flex-row">
          <Button as={Link} to="/" size="lg">
            <Home className="h-4 w-4" /> Go home
          </Button>
          <Button as={Link} to="/candidate/jobs" size="lg" variant="secondary">
            <Search className="h-4 w-4" /> Browse jobs
          </Button>
        </div>
        <button
          onClick={() => window.history.back()}
          className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-ink-500 transition hover:text-brand-600"
        >
          <ArrowLeft className="h-4 w-4" /> Go back
        </button>
      </main>
    </div>
  )
}
