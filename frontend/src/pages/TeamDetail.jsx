import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { supabase } from '../lib/supabase'

const POSITION_ORDER = ['portero', 'defensa', 'mediocampista', 'delantero']
const POSITION_META = {
  portero:       { label: 'Porteros',        color: '#FFD700', bg: 'rgba(255,215,0,0.12)',   abbr: 'PO', gradient: 'linear-gradient(135deg, #78350f, #451a03)' },
  defensa:       { label: 'Defensas',         color: '#60A5FA', bg: 'rgba(96,165,250,0.12)',  abbr: 'DF', gradient: 'linear-gradient(135deg, #1e3a8a, #0f1e4a)' },
  mediocampista: { label: 'Mediocampistas',   color: '#34D399', bg: 'rgba(52,211,153,0.12)',  abbr: 'MC', gradient: 'linear-gradient(135deg, #14532d, #052e16)' },
  delantero:     { label: 'Delanteros',       color: '#F87171', bg: 'rgba(248,113,113,0.12)', abbr: 'DL', gradient: 'linear-gradient(135deg, #7f1d1d, #3b0000)' },
}

// ── Initials circle fallback ──────────────────────────────────────────────────
function Initials({ name, meta }) {
  const parts = name.trim().split(/\s+/)
  const initials = parts.length >= 2
    ? parts[0][0] + parts[parts.length - 1][0]
    : parts[0].slice(0, 2)
  return (
    <div className="w-full h-full flex items-center justify-center"
         style={{ background: meta.gradient }}>
      <span className="font-black text-2xl select-none uppercase" style={{ color: meta.color }}>
        {initials.toUpperCase()}
      </span>
    </div>
  )
}

// ── Player card ───────────────────────────────────────────────────────────────
function PlayerCard({ player, meta, index }) {
  const [imgErr, setImgErr] = useState(false)

  const photoUrl = !imgErr
    ? (player.api_football_id
        ? `https://media.api-sports.io/football/players/${player.api_football_id}.png`
        : player.foto_url || null)
    : null

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04, duration: 0.3 }}
      className="rounded-2xl p-4 text-center flex flex-col items-center gap-1.5"
      style={{
        background: '#1A1A1A',
        border: `1.5px solid ${meta.color}22`,
        boxShadow: `0 2px 12px rgba(0,0,0,0.4)`,
      }}
    >
      {/* Photo circle */}
      <div
        className="relative overflow-hidden rounded-full shrink-0 mb-0.5"
        style={{
          width: 80, height: 80,
          border: `2px solid ${meta.color}40`,
          background: meta.bg,
        }}
      >
        {photoUrl ? (
          <motion.img
            src={photoUrl}
            alt={player.nombre}
            onError={() => setImgErr(true)}
            className="w-full h-full object-cover object-top"
            whileHover={{ scale: 1.12 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            draggable={false}
          />
        ) : (
          <Initials name={player.nombre} meta={meta} />
        )}
      </div>

      {/* Name */}
      <p className="text-white font-black text-[11px] uppercase tracking-wide leading-tight line-clamp-2 w-full">
        {player.nombre}
      </p>

      {/* Number | Position */}
      <div className="flex items-center gap-1.5">
        <span className="font-display text-sm font-black" style={{ color: meta.color }}>
          #{player.numero_camiseta}
        </span>
        <span className="text-white/20 text-xs">|</span>
        <span className="text-[11px] font-black tracking-widest" style={{ color: meta.color + 'bb' }}>
          {meta.abbr}
        </span>
      </div>

      {/* Club */}
      {player.club_actual && (
        <p className="text-[10px] text-gray-500 truncate w-full leading-none">
          {player.club_actual}
        </p>
      )}
    </motion.div>
  )
}

// ── Position section ──────────────────────────────────────────────────────────
function PositionSection({ pos, list, meta, sectionIndex }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: sectionIndex * 0.1, duration: 0.4 }}
    >
      <div className="flex items-center gap-3 mb-3 px-1">
        <div className="w-1 h-6 rounded-full" style={{ backgroundColor: meta.color }} />
        <span className="font-display text-lg tracking-wider uppercase" style={{ color: meta.color }}>
          {meta.label}
        </span>
        <span className="text-xs font-semibold" style={{ color: meta.color + '60' }}>{list.length}</span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {list.map((p, i) => (
          <PlayerCard key={p.id} player={p} meta={meta} index={i} />
        ))}
      </div>
    </motion.div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function TeamDetail() {
  const { codigo } = useParams()
  const navigate   = useNavigate()
  const [team, setTeam]       = useState(null)
  const [players, setPlayers] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const { data: teamData } = await supabase
        .from('teams')
        .select('id, name, code, flag_url, confederacion, group:group_id(name)')
        .eq('code', codigo.toUpperCase())
        .single()

      if (!teamData) { navigate('/equipos'); return }
      setTeam(teamData)

      const { data: filtered } = await supabase
        .from('jugadores')
        .select('id, nombre, numero_camiseta, posicion, club_actual, foto_url, api_football_id')
        .eq('equipo_id', teamData.id)
        .order('numero_camiseta')

      setPlayers(filtered || [])
      setLoading(false)
    }
    load()
  }, [codigo, navigate])

  const byPosition = POSITION_ORDER.reduce((acc, pos) => {
    const list = players.filter(p => p.posicion?.toLowerCase() === pos)
    if (list.length) acc[pos] = list
    return acc
  }, {})

  if (loading) return (
    <div className="max-w-2xl mx-auto px-4 py-10">
      <div className="skeleton h-4 w-32 rounded mb-6" />
      <div className="skeleton h-28 rounded-2xl mb-6" />
      <div className="space-y-6">
        {[3, 4, 5, 3].map((n, i) => (
          <div key={i}>
            <div className="skeleton h-4 w-28 rounded mb-3" />
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {[...Array(n)].map((_, j) => (
                <motion.div key={j}
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                  transition={{ delay: (i * n + j) * 0.04 }}
                  className="skeleton rounded-2xl" style={{ height: 160 }} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )

  return (
    <div className="max-w-2xl mx-auto px-4 py-10">
      <motion.button
        initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
        onClick={() => navigate('/equipos')}
        className="text-gray-500 text-sm hover:text-gray-300 transition-colors mb-6 flex items-center gap-1 font-medium"
      >
        ← Todos los equipos
      </motion.button>

      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45 }}
        className="rounded-2xl overflow-hidden mb-8"
        style={{ background: 'linear-gradient(160deg, #1E1E1E, #161616)', border: '1px solid rgba(255,255,255,0.08)' }}
      >
        <div className="h-1.5" style={{ background: 'linear-gradient(90deg, #1B4FD8, #E8122D)' }} />
        <div className="p-6 flex items-center gap-5">
          <div className="w-20 h-14 rounded-xl overflow-hidden shrink-0 shadow-xl">
            {team.flag_url
              ? <img src={team.flag_url} alt={team.name} className="w-full h-full object-cover" />
              : <div className="w-full h-full bg-white/10 flex items-center justify-center font-black text-white text-lg">{team.code}</div>
            }
          </div>
          <div>
            <h1 className="font-display text-4xl sm:text-5xl text-white leading-tight tracking-wide">
              {team.name}
            </h1>
            <p className="text-gray-500 text-sm mt-1">
              Grupo {team.group?.name} · {team.confederacion}
            </p>
            {players.length > 0 && (
              <p className="text-gray-600 text-xs mt-1">{players.length} jugadores</p>
            )}
          </div>
        </div>
      </motion.div>

      {/* Roster */}
      {players.length === 0 ? (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          className="card p-12 text-center">
          <p className="text-gray-400 font-semibold text-lg mb-2">Plantel no disponible aún</p>
          <p className="text-gray-600 text-sm">
            Las convocatorias oficiales se anuncian entre el 12 y 29 de mayo.
          </p>
        </motion.div>
      ) : (
        <div className="space-y-8">
          {Object.entries(byPosition).map(([pos, list], si) => {
            const meta = POSITION_META[pos] ?? {
              label: pos, color: '#60A5FA', bg: 'rgba(96,165,250,0.12)',
              abbr: '?', gradient: 'linear-gradient(135deg,#1e3a8a,#0f1e4a)',
            }
            return (
              <PositionSection key={pos} pos={pos} list={list} meta={meta} sectionIndex={si} />
            )
          })}
        </div>
      )}
    </div>
  )
}
