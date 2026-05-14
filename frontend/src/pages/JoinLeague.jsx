import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

export default function JoinLeague() {
  const { codigo } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()

  const [liga, setLiga] = useState(null)
  const [loading, setLoading] = useState(true)
  const [joining, setJoining] = useState(false)
  const [alreadyMember, setAlreadyMember] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('ligas')
        .select('*, profiles:admin_id(username)')
        .eq('codigo_invitacion', codigo.toUpperCase())
        .single()

      if (!data) { setError('Código inválido o liga no encontrada.'); setLoading(false); return }
      setLiga(data)

      if (user) {
        const { data: membership } = await supabase
          .from('liga_miembros')
          .select('id')
          .eq('liga_id', data.id)
          .eq('usuario_id', user.id)
          .single()
        setAlreadyMember(!!membership)
      }

      setLoading(false)
    }
    load()
  }, [codigo, user])

  async function handleJoin() {
    if (!user) { navigate(`/auth?returnTo=/unirse/${codigo}`); return }
    setJoining(true)
    const { error: err } = await supabase
      .from('liga_miembros')
      .insert({ liga_id: liga.id, usuario_id: user.id })
    if (err) setError(err.message)
    else navigate(`/liga/${liga.id}`)
    setJoining(false)
  }

  if (loading) return (
    <div className="flex items-center justify-center min-h-[calc(100vh-64px)]">
      <p className="text-gray-500">Buscando liga...</p>
    </div>
  )

  return (
    <div className="min-h-[calc(100vh-64px)] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm animate-slide-up">
        {error && !liga ? (
          <div className="card p-8 text-center">
            <div className="text-5xl mb-4">❌</div>
            <h2 className="text-white font-black text-xl mb-2">Liga no encontrada</h2>
            <p className="text-gray-500 mb-6">{error}</p>
            <Link to="/dashboard" className="btn-secondary">Volver</Link>
          </div>
        ) : (
          <div className="card overflow-hidden">
            {/* Top gradient strip */}
            <div className="h-2" style={{ background: 'linear-gradient(90deg, #1B4FD8, #6B2FA0, #E8122D)' }} />

            <div className="p-8 text-center">
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl mx-auto mb-6"
                   style={{ backgroundColor: '#0A1628' }}>
                🏆
              </div>

              <p className="font-display text-xs tracking-widest text-gray-500 uppercase mb-2">
                Invitación a liga
              </p>
              <h2 className="font-display text-3xl text-white tracking-wide mb-1">{liga.nombre}</h2>
              {liga.descripcion && (
                <p className="text-gray-500 text-sm mb-2">{liga.descripcion}</p>
              )}
              <p className="text-xs text-gray-500 mb-6">
                Admin: <span className="font-semibold text-gray-300">{liga.profiles?.username}</span>
              </p>

              {/* Scoring info */}
              <div className="bg-white/5 border border-white/10 rounded-2xl px-4 py-3 mb-6 text-sm text-left space-y-1.5">
                <div className="flex justify-between items-center">
                  <span className="text-gray-500">Marcador exacto</span>
                  <span className="font-display text-xl text-panini-gold">{liga.sistema_puntos?.exacto} pts</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-500">Resultado correcto</span>
                  <span className="font-display text-xl" style={{ color: '#1B4FD8' }}>{liga.sistema_puntos?.resultado} pt</span>
                </div>
              </div>

              {alreadyMember ? (
                <div>
                  <p className="text-green-400 text-sm font-semibold mb-4">Ya sos miembro de esta liga.</p>
                  <Link to={`/liga/${liga.id}`} className="btn-primary w-full">
                    Ir a la liga
                  </Link>
                </div>
              ) : (
                <button onClick={handleJoin} disabled={joining}
                  className="btn-gradient w-full text-base py-3 disabled:opacity-50">
                  {joining ? 'Uniéndose...' : user ? 'Unirse a la liga' : 'Ingresar para unirse'}
                </button>
              )}

              {error && liga && (
                <p className="text-red-400 text-sm mt-3">{error}</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
