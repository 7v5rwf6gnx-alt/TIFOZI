import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { supabase } from '../lib/supabase'
import { Flag } from '../components/FlagPair'

const GROUP_COLORS = {
  A: '#1B4FD8', B: '#E8122D', C: '#00A550', D: '#1B4FD8',
  E: '#F97316', F: '#EC4899', G: '#0891B2', H: '#D97706',
  I: '#2563EB', J: '#059669', K: '#DC2626', L: '#0369A1',
}

function buildStandings(teams, matches) {
  const stats = {}
  for (const t of teams) {
    stats[t.id] = { team: t, pj: 0, pg: 0, pe: 0, pp: 0, gf: 0, gc: 0 }
  }

  for (const m of matches) {
    if (m.status !== 'finished' || m.home_score == null) continue
    const h = stats[m.home_team_id]
    const a = stats[m.away_team_id]
    if (!h || !a) continue

    h.pj++; a.pj++
    h.gf += m.home_score; h.gc += m.away_score
    a.gf += m.away_score; a.gc += m.home_score

    if (m.home_score > m.away_score)      { h.pg++; a.pp++ }
    else if (m.home_score < m.away_score) { a.pg++; h.pp++ }
    else                                  { h.pe++; a.pe++ }
  }

  return Object.values(stats)
    .map(s => ({ ...s, pts: s.pg * 3 + s.pe, dg: s.gf - s.gc }))
    .sort((a, b) => b.pts - a.pts || b.dg - a.dg || b.gf - a.gf)
}

function GroupCard({ group, matches }) {
  const navigate = useNavigate()
  const color     = GROUP_COLORS[group.name] ?? '#1B4FD8'
  const standings = buildStandings(group.teams || [], matches)
  return (
    <div className="card overflow-hidden">
      {/* Header */}
      <div className="px-5 py-3 flex items-center justify-between"
           style={{ backgroundColor: color }}>
        <span className="font-display text-2xl text-white tracking-wide">GRUPO {group.name}</span>
        <span className="text-white/70 text-xs font-semibold">{group.teams?.length} equipos</span>
      </div>

      {/* Column headers */}
      <div className="grid px-4 py-1.5 border-b border-white/5"
           style={{ gridTemplateColumns: '18px 1fr 26px 26px 26px 26px 32px' }}>
        <span />
        <span />
        {['PJ','PG','PE','PP','Pts'].map(h => (
          <span key={h} className="text-[10px] font-bold text-gray-600 uppercase tracking-wider text-center">
            {h}
          </span>
        ))}
      </div>

      {/* Team rows */}
      <div className="divide-y divide-white/5">
        {standings.map((s, i) => (
          <motion.div
            key={s.team.id}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.05, duration: 0.3 }}
            onClick={() => navigate(`/equipos/${s.team.code}`)}
            className="grid items-center px-4 py-2.5 hover:bg-white/5 transition-colors cursor-pointer group"
            style={{ gridTemplateColumns: '18px 1fr 26px 26px 26px 26px 32px' }}
          >
            <span className="text-gray-600 text-xs font-bold">{i + 1}</span>

            <div className="flex items-center gap-2 min-w-0 pr-1">
              <Flag src={s.team.flag_url} alt={s.team.name} size={20} />
              <span className="text-white text-xs font-semibold truncate group-hover:text-white/80">
                {s.team.name}
              </span>
            </div>

            <span className={`text-xs text-center font-mono ${s.pj > 0 ? 'text-gray-400' : 'text-gray-700'}`}>{s.pj}</span>
            <span className={`text-xs text-center font-mono ${s.pg > 0 ? 'text-green-400' : 'text-gray-700'}`}>{s.pg}</span>
            <span className={`text-xs text-center font-mono ${s.pe > 0 ? 'text-gray-400' : 'text-gray-700'}`}>{s.pe}</span>
            <span className={`text-xs text-center font-mono ${s.pp > 0 ? 'text-red-400' : 'text-gray-700'}`}>{s.pp}</span>
            <span className="font-display text-base text-center transition-colors"
                  style={{ color: s.pts > 0 ? color : '#374151' }}>
              {s.pts}
            </span>
          </motion.div>
        ))}
      </div>
    </div>
  )
}

export default function Groups() {
  const [groups, setGroups]   = useState([])
  const [matches, setMatches] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const [{ data: groupData }, { data: matchData }] = await Promise.all([
        supabase
          .from('groups')
          .select('id, name, teams(id, name, code, flag_url)')
          .order('name'),
        supabase
          .from('matches')
          .select('id, home_team_id, away_team_id, home_score, away_score, status, group:group_id(name)')
          .eq('stage', 'group'),
      ])
      setGroups(groupData || [])
      setMatches(matchData || [])
      setLoading(false)
    }
    load()
  }, [])

  // Build a map: group_name → matches[]
  const matchesByGroup = matches.reduce((acc, m) => {
    const name = m.group?.name
    if (!name) return acc
    if (!acc[name]) acc[name] = []
    acc[name].push(m)
    return acc
  }, {})

  const playedCount = matches.filter(m => m.status === 'finished').length

  return (
    <div className="max-w-6xl mx-auto px-4 py-10">
      <motion.div
        className="mb-8"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <p className="font-display text-sm tracking-widest text-gray-500 uppercase mb-1">
          Mundial 2026
        </p>
        <h1 className="font-display text-5xl text-white tracking-wide">GRUPOS</h1>
        <p className="text-gray-500 text-sm mt-1">
          12 grupos · 48 selecciones
          {playedCount > 0 && ` · ${playedCount} partidos jugados`}
        </p>
      </motion.div>

      {/* Stats legend */}
      {playedCount > 0 && (
        <div className="flex flex-wrap gap-4 mb-6 text-xs text-gray-600">
          {['PJ Jugados','PG Ganados','PE Empates','PP Perdidos','Pts Puntos'].map(l => (
            <span key={l}><span className="font-bold text-gray-500">{l.split(' ')[0]}</span> {l.split(' ')[1]}</span>
          ))}
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {[...Array(12)].map((_, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
              className="rounded-2xl overflow-hidden"
              style={{ background: '#1A1A1A', border: '1px solid rgba(255,255,255,0.06)' }}
            >
              <div className="skeleton h-10 w-full" />
              <div className="p-3 space-y-2.5">
                {[...Array(4)].map((_, j) => (
                  <div key={j} className="flex items-center gap-2">
                    <div className="skeleton w-4 h-4 rounded" />
                    <div className="skeleton w-5 h-5 rounded-full" />
                    <div className="skeleton h-3 flex-1 rounded" />
                    <div className="skeleton w-6 h-3 rounded" />
                  </div>
                ))}
              </div>
            </motion.div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {groups.map((group, i) => (
            <motion.div
              key={group.id}
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06, duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
            >
              <GroupCard group={group} matches={matchesByGroup[group.name] || []} />
            </motion.div>
          ))}
        </div>
      )}
    </div>
  )
}
