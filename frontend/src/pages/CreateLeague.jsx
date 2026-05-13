import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

const TORNEOS = [
  {
    id: 'mundial_2026',
    icon: 'WC',
    title: 'MUNDIAL',
    subtitle: '2026',
    desc: 'USA · CAN · MEX',
    color: '#1B4FD8',
    bg: 'rgba(27,79,216,0.12)',
    border: 'rgba(27,79,216,0.4)',
  },
  {
    id: 'premier_league',
    icon: 'PL',
    title: 'PREMIER',
    subtitle: 'LEAGUE',
    desc: '2024/25',
    color: '#9B59D0',
    bg: 'rgba(61,0,112,0.18)',
    border: 'rgba(155,89,208,0.4)',
  },
]

export default function CreateLeague() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [torneo, setTorneo]         = useState(null)
  const [nombre, setNombre]         = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [ptsExacto, setPtsExacto]   = useState(3)
  const [ptsResultado, setPtsResultado] = useState(1)
  const [loading, setLoading]       = useState(false)
  const [error, setError]           = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    if (!torneo) { setError('Elegí el torneo primero'); return }
    setError('')
    setLoading(true)

    const { data, error: err } = await supabase
      .from('ligas')
      .insert({
        nombre: nombre.trim(),
        descripcion: descripcion.trim() || null,
        admin_id: user.id,
        torneo,
        sistema_puntos: { exacto: Number(ptsExacto), resultado: Number(ptsResultado) },
      })
      .select().single()

    if (err) { setError(err.message); setLoading(false) }
    else navigate(`/liga/${data.id}`)
  }

  const selected = TORNEOS.find(t => t.id === torneo)

  return (
    <div className="max-w-lg mx-auto px-4 py-10">
      <div className="mb-8">
        <p className="font-display text-sm tracking-widest text-gray-500 uppercase mb-1">Nueva liga</p>
        <h1 className="font-display text-5xl text-white tracking-wide">CREAR LIGA</h1>
        <p className="text-gray-500 text-sm mt-1">Se genera un código de invitación automáticamente.</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">

        {/* Tournament selector */}
        <div className="card p-6">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-1 h-5 rounded-full" style={{ backgroundColor: selected?.color ?? '#555' }} />
            <h3 className="text-white font-bold">Torneo</h3>
            {!torneo && <span className="text-red-400 text-xs ml-1">*</span>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            {TORNEOS.map(t => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTorneo(t.id)}
                className="relative rounded-2xl p-5 text-center transition-all hover:-translate-y-0.5"
                style={{
                  background: torneo === t.id ? t.bg : 'rgba(255,255,255,0.03)',
                  border: `2px solid ${torneo === t.id ? t.border : 'rgba(255,255,255,0.08)'}`,
                  boxShadow: torneo === t.id ? `0 4px 20px ${t.color}20` : 'none',
                }}
              >
                {torneo === t.id && (
                  <div className="absolute top-2 right-2 w-5 h-5 rounded-full flex items-center justify-center"
                       style={{ backgroundColor: t.color }}>
                    <span className="text-white text-[9px] font-black">✓</span>
                  </div>
                )}
                <div className="font-display text-xl font-black mb-2" style={{ color: t.color }}>{t.icon}</div>
                <div className="font-display text-white text-lg tracking-wide leading-tight">{t.title}</div>
                <div className="font-display text-lg tracking-wide leading-tight mb-1"
                     style={{ color: torneo === t.id ? t.color : '#555' }}>{t.subtitle}</div>
                <div className="text-xs text-gray-600">{t.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Main info */}
        <div className="card p-6 space-y-5">
          <div>
            <label className="text-xs text-gray-500 font-bold block mb-1.5 uppercase tracking-wide">
              Nombre de la liga *
            </label>
            <input
              required value={nombre}
              onChange={e => setNombre(e.target.value)}
              placeholder="Los campeones del mundo"
              className="input-dark"
            />
          </div>

          <div>
            <label className="text-xs text-gray-500 font-bold block mb-1.5 uppercase tracking-wide">
              Descripción (opcional)
            </label>
            <textarea
              value={descripcion}
              onChange={e => setDescripcion(e.target.value)}
              placeholder="La quiniela de la oficina..."
              rows={3}
              className="input-dark resize-none"
            />
          </div>
        </div>

        {/* Scoring system */}
        <div className="card p-6">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-1 h-5 rounded-full" style={{ backgroundColor: selected?.color ?? '#1B4FD8' }} />
            <h3 className="text-white font-bold">Sistema de puntos</h3>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-gray-500 font-bold block mb-1.5 uppercase tracking-wide">
                Marcador exacto
              </label>
              <input
                type="number" min={1} max={10}
                value={ptsExacto}
                onChange={e => setPtsExacto(e.target.value)}
                className="input-dark no-spinners"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 font-bold block mb-1.5 uppercase tracking-wide">
                Resultado correcto
              </label>
              <input
                type="number" min={0} max={5}
                value={ptsResultado}
                onChange={e => setPtsResultado(e.target.value)}
                className="input-dark no-spinners"
              />
            </div>
          </div>
          <p className="text-gray-500 text-xs mt-3">
            Ejemplo: predecir 2–1 con resultado 2–1 = {ptsExacto} pts.
            Predecir 3–1 con resultado 2–1 = {ptsResultado} pt.
          </p>
        </div>

        {error && (
          <div className="bg-red-950/40 border border-red-800/40 rounded-xl px-4 py-3">
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        )}

        <div className="flex gap-3">
          <button type="button" onClick={() => navigate('/dashboard')} className="btn-secondary flex-1">
            Cancelar
          </button>
          <button
            type="submit"
            disabled={loading || !torneo}
            className="btn-primary flex-1 disabled:opacity-50"
            style={torneo ? { backgroundColor: selected?.color } : {}}
          >
            {loading ? 'Creando...' : 'Crear liga'}
          </button>
        </div>
      </form>
    </div>
  )
}
