import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

const RANK_COLORS = ['#FFD700', '#9CA3AF', '#D97706']

function LeagueCard({ liga, myRank, memberCount }) {
  return (
    <Link to={`/liga/${liga.id}`}
      className="card card-hover p-5 block group animate-slide-up">
      <div className="flex items-start justify-between mb-4">
        <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl shrink-0"
             style={{ backgroundColor: '#0A1628' }}>
          🏆
        </div>
        <span className="text-xs text-gray-500 font-mono bg-white/10 px-2 py-1 rounded-lg">
          #{liga.codigo_invitacion}
        </span>
      </div>

      <h3 className="text-white font-black text-lg leading-tight mb-1 group-hover:text-[#1B4FD8] transition-colors">
        {liga.nombre}
      </h3>
      {liga.descripcion && (
        <p className="text-gray-500 text-sm mb-3 line-clamp-1">{liga.descripcion}</p>
      )}

      <div className="flex items-center justify-between mt-4 pt-4 border-t border-white/5">
        <div className="flex items-center gap-1.5">
          <div className="flex -space-x-1">
            {[...Array(Math.min(memberCount, 4))].map((_, i) => (
              <div key={i}
                className="w-6 h-6 rounded-full border-2 border-[#1A1A1A]"
                style={{ background: `hsl(${i * 60 + 200}, 70%, 60%)` }} />
            ))}
          </div>
          <span className="text-gray-500 text-xs ml-1">
            {memberCount} {memberCount === 1 ? 'miembro' : 'miembros'}
          </span>
        </div>
        {myRank && (
          <div className="flex items-center gap-1.5 bg-white/5 px-3 py-1 rounded-full border border-white/10">
            <span className="text-gray-500 text-xs">Posición</span>
            <span className="font-black text-sm"
                  style={{ color: RANK_COLORS[myRank - 1] ?? '#9CA3AF' }}>
              #{myRank}
            </span>
          </div>
        )}
      </div>
    </Link>
  )
}

export default function Dashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [ligas, setLigas] = useState([])
  const [loading, setLoading] = useState(true)
  const [code, setCode] = useState('')

  useEffect(() => {
    async function load() {
      const { data: memberships } = await supabase
        .from('liga_miembros')
        .select('liga_id, ligas(*)')
        .eq('usuario_id', user.id)

      if (!memberships) { setLoading(false); return }

      const ligasData = await Promise.all(
        memberships.map(async m => {
          const [{ count }, { data: rankData }] = await Promise.all([
            supabase.from('liga_miembros')
              .select('*', { count: 'exact', head: true })
              .eq('liga_id', m.liga_id),
            supabase.from('liga_leaderboard')
              .select('rank')
              .eq('liga_id', m.liga_id)
              .eq('user_id', user.id)
              .single(),
          ])
          return { ...m.ligas, memberCount: count || 0, myRank: rankData?.rank || null }
        })
      )

      setLigas(ligasData)
      setLoading(false)
    }
    load()
  }, [user.id])

  function handleJoin(e) {
    e.preventDefault()
    if (!code.trim()) return
    navigate(`/unirse/${code.trim().toUpperCase()}`)
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-10">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <p className="font-display text-sm tracking-widest text-gray-500 uppercase mb-1">
            Mis Ligas
          </p>
          <h1 className="font-display text-5xl text-white tracking-wide">
            {ligas.length} {ligas.length === 1 ? 'LIGA' : 'LIGAS'}
          </h1>
        </div>
        <Link to="/crear-liga" className="btn-gradient">
          + Crear liga
        </Link>
      </div>

      {/* Join by code */}
      <form onSubmit={handleJoin} className="card p-4 flex gap-3 items-center mb-8">
        <input
          value={code}
          onChange={e => setCode(e.target.value)}
          placeholder="Código de invitación (ej: A3F7B2)"
          className="input-dark flex-1"
        />
        <button type="submit" className="btn-secondary shrink-0">
          Unirse
        </button>
      </form>

      {/* Leagues grid */}
      {loading ? (
        <div className="text-center py-20 text-gray-500">Cargando ligas...</div>
      ) : ligas.length === 0 ? (
        <div className="card p-16 text-center">
          <div className="text-6xl mb-4">🏆</div>
          <h3 className="text-white font-black text-xl mb-2">Todavía no estás en ninguna liga</h3>
          <p className="text-gray-500 mb-6">Creá una o uníte con un código de invitación.</p>
          <Link to="/crear-liga" className="btn-primary">
            Crear mi primera liga
          </Link>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {ligas.map(liga => (
            <LeagueCard key={liga.id} liga={liga} myRank={liga.myRank} memberCount={liga.memberCount} />
          ))}
        </div>
      )}
    </div>
  )
}
