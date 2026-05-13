import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { TeamBlock } from '../components/FlagPair'

const GROUP_COLORS = {
  A: '#1B4FD8', B: '#E8122D', C: '#00A550', D: '#6B2FA0',
  E: '#F97316', F: '#EC4899', G: '#0891B2', H: '#D97706',
  I: '#7C3AED', J: '#059669', K: '#DC2626', L: '#0369A1',
}

function fmtTime(t) {
  if (!t) return null
  const [h, m] = t.split(':').map(Number)
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`
}

function MatchCard({ match }) {
  const finished = match.status === 'finished'
  const live     = match.status === 'live'
  const color    = GROUP_COLORS[match.group?.name] ?? '#1B4FD8'

  return (
    <div className="overflow-hidden rounded-2xl hover:shadow-[0_8px_40px_rgba(0,0,0,0.7)] hover:-translate-y-0.5 transition-all duration-200 cursor-default"
         style={{
           background: 'linear-gradient(160deg, #1E1E1E 0%, #181818 100%)',
           border: '1px solid rgba(255,255,255,0.08)',
           borderLeft: `4px solid ${color}`,
           boxShadow: `0 2px 12px rgba(0,0,0,0.5), inset 3px 0 20px ${color}18`,
         }}>
      <div className="px-5 py-4">

        {/* Meta row */}
        <div className="flex items-center justify-between mb-4">
          <span className="font-display text-sm tracking-wider" style={{ color }}>
            GRUPO {match.group?.name}
          </span>
          <div className="flex items-center gap-2">
            {live && (
              <span className="flex items-center gap-1 text-xs font-bold text-green-400 bg-green-900/30 px-2 py-0.5 rounded-full border border-green-500/30">
                <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                EN VIVO
              </span>
            )}
            {finished && (
              <span className="text-xs font-bold text-gray-500 bg-white/10 px-2 py-0.5 rounded-full">
                FINALIZADO
              </span>
            )}
            <span className="text-gray-500 text-xs">
              {new Date(match.match_date?.slice(0, 10) + 'T12:00:00').toLocaleDateString('es-AR', {
                day: 'numeric', month: 'short',
              })}
              {fmtTime(match.match_time) && ` · ${fmtTime(match.match_time)}`}
            </span>
          </div>
        </div>

        {/* Teams + score */}
        <div className="flex items-center gap-3 sm:gap-5">

          <TeamBlock flagUrl={match.home_team?.flag_url} name={match.home_team?.name} />

          {/* Score / vs */}
          <div className="shrink-0 text-center">
            {finished || live ? (
              <span className="font-display text-3xl sm:text-4xl text-white leading-none">
                {match.home_score}–{match.away_score}
              </span>
            ) : (
              <span className="font-display text-lg text-gray-600">vs</span>
            )}
          </div>

          <TeamBlock flagUrl={match.away_team?.flag_url} name={match.away_team?.name} />

        </div>
      </div>
    </div>
  )
}

export default function Matches() {
  const [matches, setMatches] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')

  useEffect(() => {
    supabase
      .from('matches')
      .select(`
        id, match_number, stage, match_date, match_time, home_score, away_score, status,
        home_team:home_team_id(name, code, flag_url),
        away_team:away_team_id(name, code, flag_url),
        group:group_id(name)
      `)
      .eq('stage', 'group')
      .order('match_number')
      .then(({ data }) => { setMatches(data || []); setLoading(false) })
  }, [])

  const groups = [...new Set(matches.map(m => m.group?.name))].sort()
  const filtered = filter === 'all' ? matches : matches.filter(m => m.group?.name === filter)
  const byDate = filtered.reduce((acc, m) => {
    const d = m.match_date?.slice(0, 10)
    if (!acc[d]) acc[d] = []
    acc[d].push(m)
    return acc
  }, {})

  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <div className="mb-8">
        <p className="font-display text-sm tracking-widest text-gray-500 uppercase mb-1">Calendario</p>
        <h1 className="font-display text-5xl text-white tracking-wide">FASE DE GRUPOS</h1>
        <p className="text-gray-500 text-sm mt-1">72 partidos · 11 jun – 27 jun 2026</p>
      </div>

      <div className="flex flex-wrap gap-2 mb-8">
        {['all', ...groups].map(g => (
          <button key={g} onClick={() => setFilter(g)}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              filter === g
                ? 'text-white shadow-sm'
                : 'bg-white/5 text-gray-400 hover:text-white border border-white/10 hover:border-white/25'
            }`}
            style={filter === g ? { backgroundColor: GROUP_COLORS[g] ?? '#1B4FD8' } : {}}>
            {g === 'all' ? 'Todos' : `Grupo ${g}`}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-20 text-gray-500">Cargando partidos...</div>
      ) : (
        <div className="space-y-8">
          {Object.entries(byDate).map(([date, dayMatches]) => (
            <div key={date}>
              <p className="font-display text-sm tracking-widest uppercase mb-3" style={{ color: '#1B4FD8' }}>
                {new Date(date + 'T12:00:00').toLocaleDateString('es-AR', {
                  weekday: 'long', day: 'numeric', month: 'long',
                }).toUpperCase()}
              </p>
              <div className="space-y-2">
                {dayMatches.map(m => <MatchCard key={m.id} match={m} />)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
