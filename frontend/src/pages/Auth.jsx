import { useState } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

function GoogleButton({ onClick, loading }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className="w-full flex items-center justify-center gap-3 py-2.5 px-4 rounded-xl font-bold text-sm
                 text-white border border-white/15 transition-all hover:bg-white/10 active:scale-95 disabled:opacity-50"
      style={{ backgroundColor: 'rgba(255,255,255,0.06)' }}
    >
      <svg viewBox="0 0 24 24" className="w-5 h-5 shrink-0">
        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
      </svg>
      Continuar con Google
    </button>
  )
}

export default function Auth() {
  const { user, signIn, signUp, signInWithGoogle } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const returnTo = searchParams.get('returnTo') || '/dashboard'

  const [tab, setTab]           = useState('login')
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [username, setUsername] = useState('')
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)
  const [success, setSuccess]   = useState('')

  if (user) return <Navigate to={returnTo} replace />

  function handleUsernameChange(val) {
    setUsername(val.replace(/\s/g, '').toLowerCase())
  }

  async function handleGoogle() {
    setError('')
    setLoading(true)
    const { error: err } = await signInWithGoogle()
    if (err) { setError(err.message); setLoading(false) }
    // On success, Supabase redirects to /dashboard
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setSuccess('')

    if (tab === 'register') {
      if (!fullName.trim()) { setError('El nombre completo es requerido'); return }
      if (username.length < 3) { setError('El apodo debe tener al menos 3 caracteres'); return }
      if (/\s/.test(username)) { setError('El apodo no puede tener espacios'); return }
    }

    setLoading(true)

    if (tab === 'login') {
      const { error: err } = await signIn(email, password)
      if (err) setError(err.message)
      else navigate(returnTo)
    } else {
      const { error: err } = await signUp(email, password, username.trim(), fullName.trim())
      if (err) setError(err.message)
      else setSuccess('¡Listo! Revisá tu email para confirmar el registro.')
    }
    setLoading(false)
  }

  return (
    <div className="min-h-[calc(100vh-64px)] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm animate-slide-up">

        <div className="text-center mb-8">
          <div
            className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4 shadow-lg border border-white/20"
            style={{ backgroundColor: '#0A1628' }}
          >
            <span className="font-display text-white font-black text-2xl tracking-widest leading-none">TZ</span>
          </div>
          <h1 className="font-display text-5xl text-white tracking-widest">TIFOZI</h1>
          <p className="text-gray-500 text-sm mt-1">Mundial 2026 · USA · Canada · Mexico</p>
        </div>

        <div className="card p-6">
          <div className="flex bg-[#2A2A2A] rounded-xl p-1 mb-5">
            {[
              { key: 'login',    label: 'Ingresar' },
              { key: 'register', label: 'Registrarse' },
            ].map(t => (
              <button
                key={t.key}
                onClick={() => { setTab(t.key); setError(''); setSuccess('') }}
                className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all duration-200 ${
                  tab === t.key
                    ? 'bg-[#383838] text-white shadow-sm'
                    : 'text-gray-500 hover:text-gray-300'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Google button */}
          <GoogleButton onClick={handleGoogle} loading={loading} />

          <div className="flex items-center gap-3 my-4">
            <div className="flex-1 h-px bg-white/10" />
            <span className="text-gray-600 text-xs font-semibold">o</span>
            <div className="flex-1 h-px bg-white/10" />
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">

            {tab === 'register' && (
              <>
                <div>
                  <label className="text-xs text-gray-500 font-bold block mb-1.5 uppercase tracking-wide">
                    Nombre completo *
                  </label>
                  <input
                    type="text" required
                    value={fullName} onChange={e => setFullName(e.target.value)}
                    className="input-dark"
                    placeholder="Juan García"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 font-bold block mb-1.5 uppercase tracking-wide">
                    Apodo / usuario *
                  </label>
                  <input
                    type="text" required minLength={3} maxLength={30}
                    value={username} onChange={e => handleUsernameChange(e.target.value)}
                    className="input-dark"
                    placeholder="juancho10"
                    autoComplete="username"
                  />
                  <p className="text-gray-600 text-[11px] mt-1">Sin espacios · mínimo 3 caracteres</p>
                </div>
              </>
            )}

            <div>
              <label className="text-xs text-gray-500 font-bold block mb-1.5 uppercase tracking-wide">Email</label>
              <input
                type="email" required
                value={email} onChange={e => setEmail(e.target.value)}
                className="input-dark"
                placeholder="tu@email.com"
              />
            </div>

            <div>
              <label className="text-xs text-gray-500 font-bold block mb-1.5 uppercase tracking-wide">Contraseña</label>
              <input
                type="password" required minLength={6}
                value={password} onChange={e => setPassword(e.target.value)}
                className="input-dark"
                placeholder="Mínimo 6 caracteres"
              />
            </div>

            {error && (
              <div className="bg-red-950/40 border border-red-800/40 rounded-xl px-4 py-3">
                <p className="text-red-400 text-sm">{error}</p>
              </div>
            )}
            {success && (
              <div className="bg-green-950/40 border border-green-800/40 rounded-xl px-4 py-3">
                <p className="text-green-400 text-sm">{success}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full text-base py-3 mt-2 disabled:opacity-50"
            >
              {loading ? 'Cargando...' : tab === 'login' ? 'Ingresar' : 'Crear cuenta'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
