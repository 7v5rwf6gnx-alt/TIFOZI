import { Component } from 'react'
import { Link } from 'react-router-dom'

export default class ErrorBoundary extends Component {
  state = { hasError: false }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error, info) {
    console.error('ErrorBoundary capturó:', error, info.componentStack)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center px-4 text-center"
             style={{ backgroundColor: '#0A0A0A' }}>
          <div>
            <p className="text-5xl mb-4">⚠️</p>
            <h1 className="font-display text-4xl text-white tracking-wide mb-2">
              ALGO SALIÓ MAL
            </h1>
            <p className="text-gray-500 mb-8 max-w-sm mx-auto">
              Ocurrió un error inesperado. Recargá la página o volvé al inicio.
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              <button
                onClick={() => window.location.reload()}
                className="font-bold text-base px-8 py-3 rounded-2xl bg-white/10
                           border border-white/20 text-white hover:bg-white/15 transition-all"
              >
                Recargar
              </button>
              <Link
                to="/"
                onClick={() => this.setState({ hasError: false })}
                className="font-display font-black text-base px-8 py-3 rounded-2xl
                           text-[#111] transition-all"
                style={{ backgroundColor: '#FFD700' }}
              >
                INICIO
              </Link>
            </div>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
