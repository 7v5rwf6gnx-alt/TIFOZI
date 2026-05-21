import { useState } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function Auth() {
  const { user, signIn, signUp } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const returnTo = searchParams.get('returnTo') || '/'

  const [tab, setTab]           = useState('login')
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [username, setUsername] = useState('')
  const [phone, setPhone]       = useState('')
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)
  const [success, setSuccess]   = useState('')

  if (user) return <Navigate to={returnTo} replace />

  function handleUsernameChange(val) {
    setUsername(val.replace(/\s/g, '').toLowerCase())
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
      const { error: err } = await signUp(email, password, username.trim(), fullName.trim(), phone.trim() || null)
      if (err) setError(err.message)
      else setSuccess('¡Cuenta creada! Ya podés ingresar.')
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
            <span className="font-display text-white font-black text-2xl tracking-widest leading-none">26</span>
          </div>
          <h1 className="font-display text-5xl text-white tracking-widest">POLLAWC26</h1>
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
                <div>
                  <label className="text-xs text-gray-500 font-bold block mb-1.5 uppercase tracking-wide">
                    Teléfono (opcional)
                  </label>
                  <input
                    type="tel"
                    value={phone} onChange={e => setPhone(e.target.value)}
                    className="input-dark"
                    placeholder="+54 9 11 1234-5678"
                    autoComplete="tel"
                  />
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
