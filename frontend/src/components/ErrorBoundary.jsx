import { Component } from 'react'
import { AlertTriangle, RotateCcw } from 'lucide-react'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, info) {
    // In production this would report to a logging service (e.g. Sentry).
    console.error('ErrorBoundary caught:', error, info)
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null })
    window.location.href = '/'
  }

  render() {
    if (!this.state.hasError) return this.props.children

    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-white px-4 text-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-red-50 text-red-600">
          <AlertTriangle className="h-8 w-8" />
        </span>
        <h1 className="mt-5 text-2xl font-bold text-ink-900">Something went wrong</h1>
        <p className="mt-2 max-w-md text-sm text-ink-500">
          An unexpected error occurred. Try reloading — if it keeps happening, please contact support.
        </p>

        {/* What actually broke. Without this the page says only "something went
            wrong", which is useless to whoever has to fix it — the real error
            was reachable only by opening the browser console, and most people
            reporting a fault never do. Collapsed so it never dominates the
            page, and safe to ship: it is this app's own stack, not user data. */}
        {this.state.error && (
          <details className="mt-5 w-full max-w-2xl text-left">
            <summary className="cursor-pointer text-xs font-semibold text-ink-400 hover:text-ink-600">
              Show technical details
            </summary>
            <pre className="mt-2 max-h-64 overflow-auto rounded-lg bg-ink-900 p-3 text-[11px] leading-relaxed text-red-300">
              {String(this.state.error?.stack || this.state.error)}
            </pre>
          </details>
        )}
        <button
          onClick={this.handleReset}
          className="mt-6 inline-flex h-11 items-center gap-2 rounded-lg bg-brand-600 px-5 text-sm font-semibold text-white transition hover:bg-brand-700"
        >
          <RotateCcw className="h-4 w-4" /> Back to home
        </button>
      </div>
    )
  }
}
