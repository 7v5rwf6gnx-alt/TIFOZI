import { useEffect, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { MatchPredictionCard, GROUP_COLORS } from '../components/MatchPredictionCard'
import { AvatarDisplay } from '../components/AvatarDisplay'
import PLStandings from '../components/PLStandings'

const PL_MATCH_SELECT = `
  id, match_date, match_time, home_score, away_score, status, competition, sofascore_id,
  match_minute, goals, lineup_home, lineup_away, h2h,
  home_team_name, away_team_name,
  home_team:home_team_id(id, name, code, flag_url),
  away_team:away_team_id(id, name, code, flag_url)
`

// ── Mini ranking widget ───────────────────────────────────────────────────────
function MiniRanking({ userId }) {
  const [leagues, setLeagues] = useState([])
  const [open, setOpen]       = useState(false)

  useEffect(() => {
    async function load() {
      const { data: memberships } = await supabase
        .from('liga_miembros')
        .select('liga_id, ligas(id, nombre, torneo)')
        .eq('usuario_id', userId)

      if (!memberships?.length) return

      const results = await Promise.all(
        memberships.map(async m => {
          const { data: rows } = await supabase
            .from('liga_leaderboard')
            .select('rank, user_id, username, avatar_url, total_points')
            .eq('liga_id', m.liga_id)
            .order('rank')
            .limit(5)
          const myRow = (rows || []).find(r => r.user_id === userId)
          return {
            liga:  m.ligas,
            rows:  (rows || []).slice(0, 3),
            myRow,
          }
        })
      )
      setLeagues(results.filter(l => l.rows.length > 0))
    }
    load()
  }, [userId])

  if (leagues.length === 0) return null

  const MEDALS = ['🥇', '🥈', '🥉']
  const RANK_COLORS = ['#FFD700', '#9CA3AF', '#CD7F32']

  return (
    <div className="mb-8">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3 rounded-2xl transition-all"
        style={{
          background: 'rgba(27,79,216,0.08)',
          border: '1px solid rgba(27,79,216,0.2)',
        }}
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-[#1B4FD8]">Mi ranking en ligas</span>
        </div>
        <span className="text-gray-500 text-xs">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="mt-2 space-y-3">
          {leagues.map(({ liga, rows, myRow }) => (
            <div key={liga.id} className="card p-4">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">
                {liga.nombre}
              </p>

              {/* Top 3 */}
              <div className="space-y-2 mb-2">
                {rows.map((r, i) => {
                  const isMe = r.user_id === userId
                  return (
                    <div key={r.user_id}
                      className={`flex items-center gap-2.5 px-3 py-2 rounded-xl ${
                        isMe ? 'bg-blue-900/20 border border-[#1B4FD8]/30' : 'bg-white/[0.03]'
                      }`}>
                      <span className="text-lg w-6 text-center shrink-0">{MEDALS[i]}</span>
                      <AvatarDisplay avatarUrl={r.avatar_url} username={r.username} size={26} rank={i + 1} />
                      <span className={`text-sm font-semibold flex-1 truncate ${isMe ? 'text-[#1B4FD8]' : 'text-white'}`}>
                        @{r.username}
                        {isMe && <span className="ml-1 text-xs opacity-50">(vos)</span>}
                      </span>
                      <span className="font-display text-xl shrink-0"
                            style={{ color: RANK_COLORS[i] }}>
                        {r.total_points}
                      </span>
                    </div>
                  )
                })}
              </div>

              {/* My position if not in top 3 */}
              {myRow && myRow.rank > 3 && (
                <div className="flex items-center gap-2.5 px-3 py-2 rounded-xl bg-blue-900/15 border border-[#1B4FD8]/20 mt-1">
                  <span className="text-xs text-gray-500 font-bold w-6 text-center">#{myRow.rank}</span>
                  <AvatarDisplay avatarUrl={myRow.avatar_url} username={myRow.username} size={26} />
                  <span className="text-sm font-semibold flex-1 text-[#1B4FD8] truncate">
                    @{myRow.username} <span className="text-xs opacity-50">(vos)</span>
                  </span>
                  <span className="font-display text-xl text-[#1B4FD8] shrink-0">{myRow.total_points}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function Predictions() {
  const { user } = useAuth()

  const [tab, setTab] = useState('mundial')

  const [matches, setMatches]             = useState([])
  const [predictions, setPredictions]     = useState({})
  const [loadingWC, setLoadingWC]         = useState(true)
  const [selectedGroup, setSelectedGroup] = useState('all')

  const [plMatches, setPlMatches]         = useState([])
  const [plPredictions, setPlPredictions] = useState({})
  const [loadingPL, setLoadingPL]         = useState(true)


  useEffect(() => {
    async function load() {
      const [{ data: matchData }, { data: predData }] = await Promise.all([
        supabase
          .from('matches')
          .select(`
            id, match_number, stage, match_date, match_time, home_score, away_score, status, competition,
            sofascore_id, match_minute, goals, lineup_home, lineup_away, h2h,
            home_team:home_team_id(id, name, code, flag_url),
            away_team:away_team_id(id, name, code, flag_url),
            group:group_id(name)
          `)
          .eq('stage', 'group')
          .order('match_number'),
        supabase
          .from('predictions')
          .select('match_id, home_score, away_score, points_earned, bonus_goleador, primer_goleador_prediccion_id')
          .eq('user_id', user.id),
      ])
      setMatches(matchData || [])
      const predMap = {}
      for (const p of predData || []) predMap[p.match_id] = p
      setPredictions(predMap)

      setLoadingWC(false)
    }
    load()
  }, [user.id])

  useEffect(() => {
    async function load() {
      const [{ data: matchData }, { data: predData }] = await Promise.all([
        supabase
          .from('matches')
          .select(PL_MATCH_SELECT)
          .eq('competition', 'premier_league')
          .order('match_date'),
        supabase
          .from('predictions')
          .select('match_id, home_score, away_score, points_earned, bonus_goleador, primer_goleador_prediccion_id')
          .eq('user_id', user.id),
      ])
      setPlMatches(matchData || [])
      const predMap = {}
      for (const p of predData || []) predMap[p.match_id] = p
      setPlPredictions(predMap)

      setLoadingPL(false)
    }
    load()
  }, [user.id])

  const handleSave = useCallback(async (matchId, homeScore, awayScore, goalscorerId) => {
    const { data } = await supabase
      .from('predictions')
      .upsert({
        user_id: user.id, match_id: matchId,
        home_score: homeScore, away_score: awayScore,
        primer_goleador_prediccion_id: goalscorerId ?? null,
      }, { onConflict: 'user_id,match_id' })
      .select('match_id, home_score, away_score, points_earned, bonus_goleador, primer_goleador_prediccion_id')
      .single()
    if (data) setPredictions(prev => ({ ...prev, [matchId]: data }))
  }, [user.id])

  const handleSavePL = useCallback(async (matchId, homeScore, awayScore, goalscorerId) => {
    const { data } = await supabase
      .from('predictions')
      .upsert({
        user_id: user.id, match_id: matchId,
        home_score: homeScore, away_score: awayScore,
        primer_goleador_prediccion_id: goalscorerId ?? null,
      }, { onConflict: 'user_id,match_id' })
      .select('match_id, home_score, away_score, points_earned, bonus_goleador, primer_goleador_prediccion_id')
      .single()
    if (data) setPlPredictions(prev => ({ ...prev, [matchId]: data }))
  }, [user.id])

  const groupNames  = [...new Set(matches.map(m => m.group?.name))].sort()
  const filtered    = selectedGroup === 'all' ? matches : matches.filter(m => m.group?.name === selectedGroup)
  const byDate      = filtered.reduce((acc, m) => {
    const d = m.match_date?.slice(0, 10)
    if (!acc[d]) acc[d] = []
    acc[d].push(m)
    return acc
  }, {})

  const plByDate = plMatches.reduce((acc, m) => {
    const d = m.match_date?.slice(0, 10)
    if (!acc[d]) acc[d] = []
    acc[d].push(m)
    return acc
  }, {})
  const plPredCount = Object.keys(plPredictions).filter(id => plMatches.some(m => m.id === id)).length

  return (
    <div className="max-w-xl mx-auto px-4 py-10">

      {/* Mini ranking */}
      <MiniRanking userId={user.id} />

      {/* Tab switcher */}
      <div className="flex gap-1.5 mb-8 p-1 rounded-2xl" style={{ backgroundColor: 'rgba(255,255,255,0.05)' }}>
        <button onClick={() => setTab('mundial')}
          className={`flex-1 py-2.5 rounded-xl font-display text-xs tracking-wider transition-all ${
            tab === 'mundial' ? 'text-white shadow-sm' : 'text-gray-500 hover:text-gray-300'
          }`}
          style={tab === 'mundial' ? { backgroundColor: '#0A1628', color: '#FFD700' } : {}}>
          MUNDIAL 2026
        </button>
        <button onClick={() => setTab('premier')}
          className={`flex-1 py-2.5 rounded-xl font-display text-xs tracking-wider transition-all ${
            tab === 'premier' ? 'text-white shadow-sm' : 'text-gray-500 hover:text-gray-300'
          }`}
          style={tab === 'premier' ? { backgroundColor: '#3D0070' } : {}}>
          PRONÓSTICOS PL
        </button>
        <button onClick={() => setTab('tabla')}
          className={`flex-1 py-2.5 rounded-xl font-display text-xs tracking-wider transition-all ${
            tab === 'tabla' ? 'text-white shadow-sm' : 'text-gray-500 hover:text-gray-300'
          }`}
          style={tab === 'tabla' ? { backgroundColor: '#3D0070' } : {}}>
          TABLA PL
        </button>
      </div>

      {/* MUNDIAL */}
      {tab === 'mundial' && (
        <>
          <div className="flex items-center justify-between mb-2">
            <div>
              <p className="font-display text-sm tracking-widest text-gray-500 uppercase mb-1">Mundial 2026</p>
              <h1 className="font-display text-5xl text-white tracking-wide">MIS PRONÓSTICOS</h1>
            </div>
            <div className="text-right">
              <p className="font-display text-4xl" style={{ color: '#1B4FD8' }}>
                {Object.keys(predictions).length}
              </p>
              <p className="text-gray-500 text-xs">de 72</p>
            </div>
          </div>
          <p className="text-gray-500 mb-6 text-sm">3 pts exacto · 1 pt resultado · +2 pts goleador</p>

          <div className="flex flex-wrap gap-2 mb-8">
            {['all', ...groupNames].map(g => (
              <button key={g} onClick={() => setSelectedGroup(g)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                  selectedGroup === g
                    ? 'text-white shadow-sm'
                    : 'bg-white/5 text-gray-400 border border-white/10 hover:border-white/25'
                }`}
                style={selectedGroup === g ? { backgroundColor: GROUP_COLORS[g] ?? '#1B4FD8' } : {}}>
                {g === 'all' ? 'Todos' : `Grupo ${g}`}
              </button>
            ))}
          </div>

          {loadingWC ? (
            <div className="space-y-4">
              {[...Array(5)].map((_, i) => (
                <motion.div key={i} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                  transition={{ delay: i * 0.08 }}
                  className="rounded-2xl overflow-hidden"
                  style={{ background: '#1A1A1A', border: '1px solid rgba(255,255,255,0.06)', borderLeft: '4px solid rgba(255,255,255,0.08)' }}>
                  <div className="px-5 py-4 space-y-4">
                    <div className="flex justify-between">
                      <div className="skeleton h-3 w-24 rounded" />
                      <div className="skeleton h-3 w-16 rounded" />
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex flex-col items-center gap-2 flex-1">
                        <div className="skeleton w-10 h-7 rounded" />
                        <div className="skeleton h-3 w-20 rounded" />
                      </div>
                      <div className="flex gap-2">
                        <div className="skeleton w-14 h-14 rounded-xl" />
                        <div className="skeleton w-5 h-14 rounded" />
                        <div className="skeleton w-14 h-14 rounded-xl" />
                      </div>
                      <div className="flex flex-col items-center gap-2 flex-1">
                        <div className="skeleton w-10 h-7 rounded" />
                        <div className="skeleton h-3 w-20 rounded" />
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          ) : (
            <div className="space-y-8">
              {Object.entries(byDate).map(([date, dayMatches], dateIdx) => (
                <motion.div key={date}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: dateIdx * 0.08, duration: 0.4 }}>
                  <p className="font-display text-sm tracking-widest uppercase mb-3" style={{ color: '#1B4FD8' }}>
                    {new Date(date + 'T12:00:00').toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' }).toUpperCase()}
                  </p>
                  <div className="space-y-3">
                    {dayMatches.map((match, matchIdx) => (
                      <motion.div key={match.id}
                        initial={{ opacity: 0, x: -12 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: dateIdx * 0.06 + matchIdx * 0.05, duration: 0.35 }}>
                        <MatchPredictionCard
                          match={match}
                          prediction={predictions[match.id]}
                          onSave={handleSave}
                        />
                      </motion.div>
                    ))}
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </>
      )}

      {/* PREMIER */}
      {tab === 'premier' && (
        <>
          <div className="flex items-center justify-between mb-2">
            <div>
              <p className="font-display text-sm tracking-widest text-gray-500 uppercase mb-1">🏴󠁧󠁢󠁥󠁮󠁧󠁿 Premier League</p>
              <h1 className="font-display text-5xl text-white tracking-wide">MIS PRONÓSTICOS</h1>
            </div>
            <div className="text-right">
              <p className="font-display text-4xl" style={{ color: '#9B59D0' }}>{plPredCount}</p>
              <p className="text-gray-500 text-xs">de {plMatches.length}</p>
            </div>
          </div>
          <p className="text-gray-500 mb-8 text-sm">3 pts exacto · 1 pt resultado · +2 pts goleador</p>

          {loadingPL ? (
            <div className="space-y-4">
              {[...Array(5)].map((_, i) => (
                <motion.div key={i} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                  transition={{ delay: i * 0.08 }}
                  className="rounded-2xl overflow-hidden"
                  style={{ background: '#1A1A1A', border: '1px solid rgba(255,255,255,0.06)', borderLeft: '4px solid rgba(255,255,255,0.08)' }}>
                  <div className="px-5 py-4 space-y-4">
                    <div className="flex justify-between">
                      <div className="skeleton h-3 w-24 rounded" />
                      <div className="skeleton h-3 w-16 rounded" />
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex flex-col items-center gap-2 flex-1">
                        <div className="skeleton w-10 h-7 rounded" />
                        <div className="skeleton h-3 w-20 rounded" />
                      </div>
                      <div className="flex gap-2">
                        <div className="skeleton w-14 h-14 rounded-xl" />
                        <div className="skeleton w-5 h-14 rounded" />
                        <div className="skeleton w-14 h-14 rounded-xl" />
                      </div>
                      <div className="flex flex-col items-center gap-2 flex-1">
                        <div className="skeleton w-10 h-7 rounded" />
                        <div className="skeleton h-3 w-20 rounded" />
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          ) : plMatches.length === 0 ? (
            <div className="text-center py-20 text-gray-500">Sin partidos disponibles</div>
          ) : (
            <div className="space-y-8">
              {Object.entries(plByDate).map(([date, dayMatches], dateIdx) => (
                <motion.div key={date}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: dateIdx * 0.08, duration: 0.4 }}>
                  <p className="font-display text-sm tracking-widest uppercase mb-3" style={{ color: '#9B59D0' }}>
                    {new Date(date + 'T12:00:00').toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' }).toUpperCase()}
                  </p>
                  <div className="space-y-3">
                    {dayMatches.map((match, matchIdx) => (
                      <motion.div key={match.id}
                        initial={{ opacity: 0, x: -12 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: dateIdx * 0.06 + matchIdx * 0.05, duration: 0.35 }}>
                        <MatchPredictionCard
                          match={match}
                          prediction={plPredictions[match.id]}
                          onSave={handleSavePL}
                        />
                      </motion.div>
                    ))}
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </>
      )}

      {tab === 'tabla' && <PLStandings />}
    </div>
  )
}
