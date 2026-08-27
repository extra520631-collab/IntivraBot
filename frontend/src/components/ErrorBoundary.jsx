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
