import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { AvatarDisplay } from '../components/AvatarDisplay'

const TORNEO_META = {
  mundial_2026:   { icon: '🌍', label: 'Mundial 2026',    color: '#1B4FD8' },
  premier_league: { icon: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', label: 'Premier League', color: '#9B59D0' },
}

function rankColor(rank) {
  if (rank <= 3) return '#22C55E'   // verde
  if (rank <= 6) return '#EAB308'   // amarillo
  return '#9CA3AF'                  // gris
}

function RankBadge({ rank }) {
  const color = rankColor(rank)
  return (
    <div
      className="flex flex-col items-center justify-center rounded-2xl shrink-0"
      style={{ width: 64, height: 64, background: `${color}18`, border: `2px solid ${color}40` }}
    >
      <span className="font-display text-2xl font-black leading-none" style={{ color }}>
        #{rank}
      </span>
      <span className="text-[9px] font-bold tracking-widest uppercase mt-0.5" style={{ color: color + '99' }}>
        {rank <= 3 ? 'podio' : 'pos'}
      </span>
    </div>
  )
}

function LeaguePositionCard({ data, index }) {
  const { liga, myRank, myPoints, leader, memberCount } = data
  const torneo = TORNEO_META[liga.torneo] ?? { icon: '🏆', label: liga.torneo, color: '#1B4FD8' }
  const isLeader = myRank === 1

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.08, duration: 0.4 }}
    >
      <Link to={`/liga/${liga.id}`} className="block group">
        <div
          className="rounded-2xl p-5 transition-all duration-200 group-hover:-translate-y-0.5"
          style={{
            background: '#1A1A1A',
            border: '1px solid rgba(255,255,255,0.08)',
            boxShadow: '0 2px 12px rgba(0,0,0,0.4)',
          }}
        >
          {/* Header row */}
          <div className="flex items-start gap-3 mb-4">
            <div
              className="w-11 h-11 rounded-xl flex items-center justify-center text-xl shrink-0"
              style={{ background: `${torneo.color}20`, border: `1px solid ${torneo.color}30` }}
            >
              {torneo.icon}
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-white font-black text-base leading-tight truncate group-hover:text-white/80 transition-colors">
                {liga.nombre}
              </h3>
              <p className="text-gray-500 text-xs mt-0.5">
                {torneo.label} · {memberCount} {memberCount === 1 ? 'miembro' : 'miembros'}
              </p>
            </div>
          </div>

          {/* Position block */}
          <div
            className="rounded-xl px-4 py-3 mb-3 flex items-center justify-between"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}
          >
            <div>
              <p className="text-gray-500 text-[10px] font-bold uppercase tracking-widest mb-1">
                Tu posición
              </p>
              <div className="flex items-baseline gap-3">
                <RankBadge rank={myRank} />
                <div>
                  <span className="font-display text-3xl text-white leading-none">{myPoints}</span>
                  <span className="text-gray-600 text-xs ml-1">pts</span>
                </div>
              </div>
            </div>

            {isLeader && (
              <div className="text-right">
                <span className="text-[10px] font-black tracking-widest uppercase px-2 py-0.5 rounded-full"
                      style={{ background: '#FFD70020', color: '#FFD700', border: '1px solid #FFD70040' }}>
                  Líder 👑
                </span>
              </div>
            )}
          </div>

          {/* Leader row (only if user isn't the leader) */}
          {!isLeader && leader && (
            <div className="flex items-center gap-2 mb-3">
              <AvatarDisplay avatarUrl={leader.avatar_url} username={leader.username} size={22} />
              <p className="text-gray-500 text-xs">
                Líder: <span className="text-gray-300 font-semibold">@{leader.username}</span>
                <span className="text-gray-600 ml-1">· {leader.total_points} pts</span>
              </p>
            </div>
          )}

          {/* CTA */}
          <div className="flex items-center justify-end">
            <span className="text-xs font-semibold transition-colors text-gray-600 group-hover:text-white">
              Ver ranking completo →
            </span>
          </div>
        </div>
      </Link>
    </motion.div>
  )
}

function EmptyState() {
  const navigate = useNavigate()
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="card p-12 text-center"
    >
      <p className="text-5xl mb-4">🏆</p>
      <p className="text-white font-black text-xl mb-2">No estás en ninguna liga todavía</p>
      <p className="text-gray-500 text-sm mb-8">
        Creá tu propia liga o unite a una con un código de invitación.
      </p>
      <div className="flex gap-3 justify-center flex-wrap">
        <button onClick={() => navigate('/crear-liga')} className="btn-primary">
          + Crear liga
        </button>
        <button onClick={() => navigate('/dashboard')} className="btn-secondary">
          Unirse con código
        </button>
      </div>
    </motion.div>
  )
}

export default function Leaderboard() {
  const { user, loading: authLoading } = useAuth()
  const navigate = useNavigate()
  const [leagues, setLeagues]   = useState([])
  const [loading, setLoading]   = useState(true)

  useEffect(() => {
    if (authLoading) return
    if (!user) { setLoading(false); return }

    async function load() {
      const { data: memberships } = await supabase
        .from('liga_miembros')
        .select('liga_id, ligas(id, nombre, torneo)')
        .eq('usuario_id', user.id)

      if (!memberships?.length) { setLoading(false); return }

      const results = await Promise.all(
        memberships.map(async m => {
          const ligaId = m.liga_id
          const liga   = m.ligas

          const [{ count }, { data: board }] = await Promise.all([
            supabase.from('liga_miembros')
              .select('*', { count: 'exact', head: true })
              .eq('liga_id', ligaId),
            supabase.from('liga_leaderboard')
              .select('user_id, rank, total_points, username, avatar_url')
              .eq('liga_id', ligaId)
              .order('rank', { ascending: true })
              .limit(10),
          ])

          const me     = board?.find(r => r.user_id === user.id)
          const leader = board?.[0] ?? null

          return {
            liga,
            myRank:      me?.rank        ?? null,
            myPoints:    me?.total_points ?? 0,
            leader:      leader?.user_id !== user.id ? leader : null,
            memberCount: count ?? 0,
          }
        })
      )

      // Sort: best rank first (null rank goes last)
      results.sort((a, b) => {
        if (a.myRank === null) return 1
        if (b.myRank === null) return -1
        return a.myRank - b.myRank
      })

      setLeagues(results)
      setLoading(false)
    }
    load()
  }, [user, authLoading])

  // Not logged in
  if (!authLoading && !user) {
    return (
      <div className="max-w-lg mx-auto px-4 py-10">
        <div className="mb-8">
          <p className="font-display text-sm tracking-widest text-gray-500 uppercase mb-1">Ligas</p>
          <h1 className="font-display text-5xl text-white tracking-wide">MIS POSICIONES</h1>
        </div>
        <div className="card p-12 text-center">
          <p className="text-gray-400 font-semibold text-lg mb-2">Iniciá sesión para ver tus posiciones</p>
          <button onClick={() => navigate('/auth')} className="btn-primary mt-4">
            Ingresar
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-10">
      {/* Header */}
      <motion.div className="mb-8"
        initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}>
        <p className="font-display text-sm tracking-widest text-gray-500 uppercase mb-1">Ligas</p>
        <h1 className="font-display text-5xl text-white tracking-wide">MIS POSICIONES</h1>
        {!loading && leagues.length > 0 && (
          <p className="text-gray-500 text-sm mt-1">
            {leagues.length} {leagues.length === 1 ? 'liga' : 'ligas'}
          </p>
        )}
      </motion.div>

      {loading ? (
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <motion.div key={i}
              initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              transition={{ delay: i * 0.07 }}
              className="skeleton rounded-2xl h-44" />
          ))}
        </div>
      ) : leagues.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="space-y-4">
          {leagues.map((data, i) => (
            <LeaguePositionCard key={data.liga.id} data={data} index={i} />
          ))}
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            transition={{ delay: leagues.length * 0.08 + 0.1 }}
            className="flex gap-3 pt-2"
          >
            <Link to="/crear-liga" className="btn-primary flex-1 justify-center">
              + Crear liga
            </Link>
            <Link to="/dashboard" className="btn-secondary flex-1 justify-center">
              Unirse con código
            </Link>
          </motion.div>
        </div>
      )}
    </div>
  )
}
