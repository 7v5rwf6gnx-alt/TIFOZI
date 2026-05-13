import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { MatchPredictionCard, GROUP_COLORS, isLocked } from '../components/MatchPredictionCard'
import { Flag } from '../components/FlagPair'
import { AvatarDisplay } from '../components/AvatarDisplay'
import LeagueChat from '../components/LeagueChat'

const TABS = ['Ranking', 'Partidos', 'Chat', 'Miembros']

const WC_MATCH_SELECT = `
  id, match_number, stage, match_date, match_time, home_score, away_score, status, competition,
  home_team:home_team_id(id, name, code, flag_url),
  away_team:away_team_id(id, name, code, flag_url),
  group:group_id(name)
`
const PL_MATCH_SELECT = `
  id, match_date, match_time, home_score, away_score, status, competition,
  home_team_name, away_team_name,
  home_team:home_team_id(id, name, code, flag_url),
  away_team:away_team_id(id, name, code, flag_url)
`

// ── Animated number ───────────────────────────────────────────────────────────
function AnimatedNumber({ value, duration = 900 }) {
  const ref = useRef(null)
  useEffect(() => {
    if (!ref.current) return
    let start = 0
    const end = value
    if (end === 0) { ref.current.textContent = 0; return }
    const step = Math.max(1, Math.ceil(end / (duration / 16)))
    const timer = setInterval(() => {
      start = Math.min(start + step, end)
      if (ref.current) ref.current.textContent = start
      if (start >= end) clearInterval(timer)
    }, 16)
    return () => clearInterval(timer)
  }, [value, duration])
  return <span ref={ref}>0</span>
}

// ── Skeleton loader ───────────────────────────────────────────────────────────
function SkeletonRanking() {
  return (
    <div className="space-y-3">
      {[1, 2, 3, 4, 5].map(i => (
        <div key={i} className="flex items-center gap-3 px-4 py-3 rounded-2xl"
             style={{ background: '#1A1A1A', border: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="skeleton w-6 h-6 rounded-full" />
          <div className="skeleton w-8 h-8 rounded-full" />
          <div className="skeleton h-4 rounded flex-1" style={{ opacity: 1 - i * 0.12 }} />
          <div className="skeleton w-10 h-6 rounded" />
        </div>
      ))}
    </div>
  )
}

// ── Picks Grid ────────────────────────────────────────────────────────────────
function PicksGrid({ rankingRows, matches, predMap }) {

  function cellInfo(userId, match) {
    if (!isLocked(match)) {
      return { bg: 'transparent', border: '1px dashed rgba(255,255,255,0.07)', flagUrl: null, isDraw: false }
    }
    const pred = predMap[userId]?.[match.id]
    if (!pred || pred.home_score == null) {
      return { bg: 'rgba(255,255,255,0.04)', border: '1px dashed rgba(255,255,255,0.12)', flagUrl: null, isDraw: false }
    }
    const outcome = pred.home_score > pred.away_score ? 'home'
                  : pred.home_score < pred.away_score ? 'away' : 'draw'
    const flagUrl = outcome === 'home' ? match.home_team?.flag_url
                  : outcome === 'away' ? match.away_team?.flag_url : null
    const isDraw  = outcome === 'draw'
    const pts     = pred.points_earned
    let bg, border
    if (match.status !== 'finished' || pts == null) {
      bg = '#2a2a2a'; border = '1.5px solid rgba(255,255,255,0.14)'
    } else if (pts === 3) {
      bg = '#14532d'; border = '2px solid #4ade80'
    } else if (pts >= 1) {
      bg = '#78350f'; border = '2px solid #fbbf24'
    } else {
      bg = '#7f1d1d'; border = '2px solid #f87171'
    }
    return { bg, border, flagUrl, isDraw }
  }

  const hi = url => url?.replace(/\/w\d+\//, '/w80/') ?? ''

  if (rankingRows.length === 0) return null

  return (
    <div className="overflow-x-auto -mx-4">
      <div style={{ minWidth: 'max-content', paddingLeft: 16, paddingRight: 16 }}>
        <div className="flex items-end mb-2">
          <div style={{ minWidth: 172, flexShrink: 0 }} />
          {matches.map(m => {
            const isClubLogo = m.competition === 'premier_league'
            return (
              <div key={m.id} style={{ width: 50, flexShrink: 0 }}
                   className="flex flex-col items-center gap-0.5 px-1">
                <img src={isClubLogo ? m.home_team?.flag_url : hi(m.home_team?.flag_url)} alt=""
                     style={{ width: 20, height: 20, objectFit: isClubLogo ? 'contain' : 'cover', borderRadius: isClubLogo ? '50%' : 3, opacity: 0.7, backgroundColor: isClubLogo ? '#222' : 'transparent' }} />
                <img src={isClubLogo ? m.away_team?.flag_url : hi(m.away_team?.flag_url)} alt=""
                     style={{ width: 20, height: 20, objectFit: isClubLogo ? 'contain' : 'cover', borderRadius: isClubLogo ? '50%' : 3, opacity: 0.7, backgroundColor: isClubLogo ? '#222' : 'transparent' }} />
              </div>
            )
          })}
        </div>

        {rankingRows.map((row, idx) => (
          <motion.div
            key={row.user_id}
            initial={{ opacity: 0, x: -16 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: idx * 0.04, duration: 0.3 }}
            className="flex items-center mb-2.5"
          >
            <div style={{ minWidth: 172, flexShrink: 0 }} className="flex items-center gap-2 pr-3">
              <span className="font-display text-base text-gray-600 w-5 text-center shrink-0">{idx + 1}</span>
              <AvatarDisplay avatarUrl={row.avatar_url} username={row.username} size={28} rank={idx + 1 <= 3 ? idx + 1 : null} />
              <span className="text-white text-xs font-semibold truncate flex-1">{row.username}</span>
              <span className="font-display text-lg text-[#1B4FD8] shrink-0">{row.total_points}</span>
            </div>
            {matches.map(match => {
              const { bg, border, flagUrl, isDraw } = cellInfo(row.user_id, match)
              return (
                <div key={match.id} style={{ width: 50, flexShrink: 0 }} className="px-1">
                  <div style={{ width: 42, height: 42, borderRadius: 10, backgroundColor: bg, border, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {isDraw ? (
                      <span style={{ fontSize: 11, fontWeight: 900, color: 'rgba(255,255,255,0.5)' }}>=</span>
                    ) : flagUrl ? (
                      <img src={hi(flagUrl)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : null}
                  </div>
                </div>
              )
            })}
          </motion.div>
        ))}

        <div className="flex items-center gap-4 mt-4 pt-3 border-t border-white/5">
          {[
            { bg: '#14532d', border: '#4ade80', label: 'Marcador exacto' },
            { bg: '#78350f', border: '#fbbf24', label: 'Ganador correcto' },
            { bg: '#7f1d1d', border: '#f87171', label: 'Falló' },
            { bg: '#2a2a2a', border: 'rgba(255,255,255,0.14)', label: 'Sin resultado aún' },
          ].map(({ bg, border, label }) => (
            <div key={label} className="flex items-center gap-1.5">
              <div style={{ width: 14, height: 14, borderRadius: 3, backgroundColor: bg, border: `1px solid ${border}`, flexShrink: 0 }} />
              <span className="text-[10px] text-gray-600">{label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Ranking Tab ───────────────────────────────────────────────────────────────
function RankingTab({ ligaId, userId, torneo }) {
  const [rows, setRows]         = useState([])
  const [matches, setMatches]   = useState([])
  const [predMap, setPredMap]   = useState({})
  const [loading, setLoading]   = useState(true)
  const [view, setView]         = useState('tabla')
  const [expandedRow, setExpandedRow] = useState(null)
  const isPL = torneo === 'premier_league'

  useEffect(() => {
    async function load() {
      const { data: rankData } = await supabase
        .from('liga_leaderboard')
        .select('*')
        .eq('liga_id', ligaId)
        .order('rank')

      const rowsData = rankData || []
      setRows(rowsData)

      if (rowsData.length > 0) {
        const memberIds = rowsData.map(r => r.user_id)

        const matchQuery = isPL
          ? supabase.from('matches')
              .select('id, match_date, match_time, status, competition, home_team:home_team_id(flag_url, code, name), away_team:away_team_id(flag_url, code, name)')
              .eq('competition', 'premier_league').order('match_date')
          : supabase.from('matches')
              .select('id, match_number, match_date, match_time, status, competition, home_team:home_team_id(flag_url, code), away_team:away_team_id(flag_url, code)')
              .eq('stage', 'group').order('match_number')

        const [{ data: mData }, { data: pData }] = await Promise.all([
          matchQuery,
          supabase.from('predictions')
            .select('user_id, match_id, home_score, away_score, points_earned, bonus_goleador')
            .in('user_id', memberIds),
        ])
        setMatches(mData || [])
        const map = {}
        for (const p of pData || []) {
          if (!map[p.user_id]) map[p.user_id] = {}
          map[p.user_id][p.match_id] = p
        }
        setPredMap(map)
      }
      setLoading(false)
    }
    load()
  }, [ligaId, isPL])

  const weeks = useMemo(() => {
    if (matches.length === 0) return []
    const weekMap = {}
    for (const m of matches) {
      const d = new Date(m.match_date + 'T12:00:00')
      if (isNaN(d)) continue
      const day = new Date(d); day.setHours(0, 0, 0, 0)
      const mon = new Date(day); mon.setDate(day.getDate() - ((day.getDay() + 6) % 7))
      const key = mon.toISOString().slice(0, 10)
      if (!weekMap[key]) weekMap[key] = { key, matchIds: [], hasFinished: false }
      weekMap[key].matchIds.push(m.id)
      if (m.status === 'finished') weekMap[key].hasFinished = true
    }
    return Object.values(weekMap)
      .sort((a, b) => a.key.localeCompare(b.key))
      .map((w, i) => ({ ...w, label: `Sem ${i + 1}` }))
  }, [matches])

  function getWeeklyPts(uid, week) {
    if (!week.hasFinished) return null
    const up = predMap[uid] || {}
    let total = 0
    for (const mid of week.matchIds) {
      const p = up[mid]
      if (p) total += (p.points_earned || 0) + (p.bonus_goleador || 0)
    }
    return total
  }

  function getBreakdown(uid) {
    const preds = Object.values(predMap[uid] || {})
    return {
      exact:  preds.filter(p => p.points_earned === 3).length,
      result: preds.filter(p => p.points_earned === 1).length,
      scorer: preds.filter(p => (p.bonus_goleador || 0) > 0).length,
      miss:   preds.filter(p => p.home_score != null && !p.points_earned).length,
    }
  }

  if (loading) return <SkeletonRanking />
  if (rows.length === 0) return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
      className="text-center py-16 text-gray-500">
      Nadie ha hecho pronósticos todavía.
    </motion.div>
  )

  const leaderPts = rows[0]?.total_points || 1
  const podium    = rows.slice(0, 3)
  const rest      = rows.slice(3)
  const podiumCfg = [
    { medal: '🥇', bg: 'bg-yellow-900/20', border: 'border-yellow-500/40', pts: 'text-panini-gold',  name: 'text-yellow-200' },
    { medal: '🥈', bg: 'bg-white/5',       border: 'border-white/15',      pts: 'text-gray-300',    name: 'text-white'      },
    { medal: '🥉', bg: 'bg-orange-900/20', border: 'border-orange-600/40', pts: 'text-orange-400',  name: 'text-orange-200' },
  ]

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-5"
    >
      {/* View toggle */}
      <div className="flex bg-[#1A1A1A] rounded-2xl p-1 border border-white/10 w-fit">
        {[['tabla', 'Tabla'], ['picks', 'Picks']].map(([v, label]) => (
          <button key={v} onClick={() => setView(v)}
            className={`relative px-4 py-2 rounded-xl text-sm font-bold transition-colors z-10 ${
              view === v ? 'text-white' : 'text-gray-500 hover:text-gray-300'
            }`}>
            {view === v && (
              <motion.div layoutId="ranking-view-bg"
                className="absolute inset-0 rounded-xl"
                style={{ backgroundColor: '#1B4FD8' }}
                transition={{ type: 'spring', bounce: 0.2, duration: 0.35 }} />
            )}
            <span className="relative z-10">{label}</span>
          </button>
        ))}
      </div>

      {view === 'picks' ? (
        <PicksGrid rankingRows={rows} matches={matches} predMap={predMap} />
      ) : (
        <>
          {/* Podium top 3 */}
          <div className="space-y-2">
            {podium.map((row, i) => {
              const isMe  = row.user_id === userId
              const cfg   = podiumCfg[i]
              const pct   = Math.round((row.total_points / leaderPts) * 100)
              const bd    = getBreakdown(row.user_id)
              const isExp = expandedRow === row.user_id

              return (
                <motion.div
                  key={row.user_id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.07, duration: 0.35 }}
                  className="relative overflow-hidden rounded-2xl cursor-pointer"
                  onClick={() => setExpandedRow(isExp ? null : row.user_id)}
                >
                  {/* Progress fill */}
                  <motion.div
                    className="absolute inset-0"
                    initial={{ scaleX: 0 }}
                    animate={{ scaleX: pct / 100 }}
                    transition={{ delay: i * 0.07 + 0.3, duration: 0.8, ease: 'easeOut' }}
                    style={{ transformOrigin: 'left', backgroundColor: 'rgba(27,79,216,0.10)', borderRadius: 'inherit' }}
                  />
                  <div className={`relative flex items-center gap-4 px-5 py-4 border-2 transition-all ${
                    isMe ? 'bg-blue-900/25 border-[#1B4FD8]' : `${cfg.bg} ${cfg.border}`
                  }`}
                  style={{ borderRadius: 'inherit' }}>
                    <span className="text-2xl w-8 shrink-0 text-center">{cfg.medal}</span>
                    <AvatarDisplay avatarUrl={row.avatar_url} username={row.username} size={40} rank={i + 1} />
                    <div className="flex-1 min-w-0">
                      <p className={`font-bold text-sm leading-tight truncate ${isMe ? 'text-[#1B4FD8]' : cfg.name}`}>
                        {row.username}
                        {isMe && <span className="ml-1 text-xs opacity-60 font-normal">(vos)</span>}
                      </p>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        {weeks.map(w => {
                          const pts = getWeeklyPts(row.user_id, w)
                          return (
                            <span key={w.key} className="text-[10px] text-gray-600">
                              {w.label} <span className="font-bold text-gray-400">{pts === null ? '–' : pts}</span>
                            </span>
                          )
                        })}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className={`font-display text-3xl leading-none ${isMe ? 'text-[#1B4FD8]' : cfg.pts}`}>
                        <AnimatedNumber value={row.total_points} />
                      </p>
                      <p className="text-gray-500 text-xs mt-0.5">pts</p>
                    </div>
                  </div>

                  {/* Expand breakdown */}
                  <AnimatePresence>
                    {isExp && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                        style={{ background: 'rgba(0,0,0,0.25)', borderTop: '1px solid rgba(255,255,255,0.06)' }}
                      >
                        <div className="flex items-center justify-around px-5 py-3">
                          <div className="text-center">
                            <p className="text-green-400 font-display text-xl">{bd.exact}</p>
                            <p className="text-gray-600 text-[10px] mt-0.5">✅ Exactos</p>
                          </div>
                          <div className="text-center">
                            <p className="text-yellow-400 font-display text-xl">{bd.result}</p>
                            <p className="text-gray-600 text-[10px] mt-0.5">Resultados</p>
                          </div>
                          <div className="text-center">
                            <p className="text-[#1B4FD8] font-display text-xl">{bd.scorer}</p>
                            <p className="text-gray-600 text-[10px] mt-0.5">Goleadores</p>
                          </div>
                          <div className="text-center">
                            <p className="text-red-400 font-display text-xl">{bd.miss}</p>
                            <p className="text-gray-600 text-[10px] mt-0.5">❌ Fallados</p>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              )
            })}
          </div>

          {/* Tabla #4+ */}
          {rest.length > 0 && (
            <div className="rounded-2xl overflow-hidden border border-white/10"
                 style={{ background: 'linear-gradient(160deg, #1A1A1A 0%, #161616 100%)' }}>
              <div className="flex items-center gap-3 px-4 py-2.5 border-b border-white/10
                              text-[11px] font-bold text-gray-600 uppercase tracking-widest select-none">
                <span className="w-7 text-center shrink-0">#</span>
                <span className="flex-1">Jugador</span>
                {weeks.map(w => (
                  <span key={w.key} className="w-10 text-center shrink-0">{w.label}</span>
                ))}
                <span className="w-10 text-right shrink-0">Pts</span>
              </div>
              {rest.map((row, idx) => {
                const isMe  = row.user_id === userId
                const pos   = idx + 4
                const pct   = Math.round((row.total_points / leaderPts) * 100)
                const bd    = getBreakdown(row.user_id)
                const isExp = expandedRow === row.user_id

                return (
                  <motion.div
                    key={row.user_id}
                    initial={{ opacity: 0, x: -12 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: (idx + 3) * 0.04, duration: 0.3 }}
                  >
                    {/* Progress bg */}
                    <div className="relative overflow-hidden border-b border-white/5 last:border-0 cursor-pointer"
                         onClick={() => setExpandedRow(isExp ? null : row.user_id)}>
                      <motion.div
                        className="absolute inset-0"
                        initial={{ scaleX: 0 }}
                        animate={{ scaleX: pct / 100 }}
                        transition={{ delay: (idx + 3) * 0.04 + 0.3, duration: 0.8, ease: 'easeOut' }}
                        style={{ transformOrigin: 'left', backgroundColor: isMe ? 'rgba(27,79,216,0.12)' : 'rgba(255,255,255,0.03)' }}
                      />
                      <div className={`relative flex items-center gap-3 px-4 py-3 transition-colors ${
                        isMe ? 'bg-blue-900/5' : idx % 2 === 0 ? 'bg-white/[0.012]' : ''
                      }`}>
                        <span className="font-display text-base text-gray-500 w-7 text-center shrink-0">{pos}</span>
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <AvatarDisplay avatarUrl={row.avatar_url} username={row.username} size={32} />
                          <span className={`font-semibold text-sm truncate ${isMe ? 'text-[#1B4FD8]' : 'text-white'}`}>
                            {row.username}
                            {isMe && <span className="ml-1 text-xs text-[#1B4FD8]/60 font-normal">(vos)</span>}
                          </span>
                        </div>
                        {weeks.map(w => {
                          const pts = getWeeklyPts(row.user_id, w)
                          return (
                            <span key={w.key} className="w-10 text-center text-sm shrink-0 font-mono"
                                  style={{ color: pts === null ? '#374151' : pts > 0 ? '#d1d5db' : '#6b7280' }}>
                              {pts === null ? '–' : pts}
                            </span>
                          )
                        })}
                        <span className={`font-display text-2xl w-10 text-right shrink-0 ${isMe ? 'text-[#1B4FD8]' : 'text-white'}`}>
                          {row.total_points}
                        </span>
                      </div>

                      <AnimatePresence>
                        {isExp && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.18 }}
                            className="overflow-hidden"
                          >
                            <div className="flex items-center justify-around px-4 py-2.5 border-t border-white/5"
                                 style={{ background: 'rgba(0,0,0,0.2)' }}>
                              {[
                                { val: bd.exact,  label: '✅ Exactos',     color: '#4ade80' },
                                { val: bd.result, label: 'Resultados',   color: '#fbbf24' },
                                { val: bd.scorer, label: 'Goleadores',   color: '#1B4FD8' },
                                { val: bd.miss,   label: '❌ Fallados',    color: '#f87171' },
                              ].map(({ val, label, color }) => (
                                <div key={label} className="text-center">
                                  <p className="font-display text-base" style={{ color }}>{val}</p>
                                  <p className="text-gray-600 text-[9px] mt-0.5">{label}</p>
                                </div>
                              ))}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </motion.div>
                )
              })}
            </div>
          )}
        </>
      )}
    </motion.div>
  )
}

// ── Pick Distribution ─────────────────────────────────────────────────────────
function PickDistribution({ match, stats, members, viewMode, myUserId }) {
  const isPL       = match.competition === 'premier_league'
  const groupColor = isPL ? '#9B59D0' : (GROUP_COLORS[match.group?.name] ?? '#1B4FD8')
  const memberMap  = Object.fromEntries((members || []).map(m => [m.usuario_id, m.profiles?.username]))
  const total      = stats?.total ?? 0

  const outcomes = [
    { key: 'homeWin', label: match.home_team?.name ?? match.home_team_name, flagUrl: match.home_team?.flag_url, color: groupColor, isPL, ...(stats?.homeWin ?? { count: 0, pct: 0, userIds: [] }) },
    { key: 'draw',    label: 'Empate',                                       flagUrl: null,                       color: '#6B7280',   isPL, ...(stats?.draw    ?? { count: 0, pct: 0, userIds: [] }) },
    { key: 'awayWin', label: match.away_team?.name ?? match.away_team_name, flagUrl: match.away_team?.flag_url, color: '#E8122D',   isPL, ...(stats?.awayWin ?? { count: 0, pct: 0, userIds: [] }) },
  ]

  return (
    <>
      <div className="flex items-center justify-between mb-3">
        <span className="text-[10px] text-gray-600 uppercase tracking-widest font-bold">Liga picks</span>
        <span className="text-[10px] text-gray-600">
          {total === 0 ? 'Sin pronósticos' : `${total} pronóstico${total !== 1 ? 's' : ''}`}
        </span>
      </div>

      {total === 0 ? (
        <p className="text-center text-gray-700 text-xs py-1">Nadie ha pronosticado este partido aún.</p>
      ) : viewMode === 'summary' ? (
        <>
          <div className="flex justify-between text-xs text-gray-500 mb-1.5">
            <span className="flex items-center gap-1">
              {match.home_team?.flag_url && (isPL
                ? <img src={match.home_team.flag_url} style={{ width: 14, height: 14, objectFit: 'contain' }} alt="" />
                : <Flag src={match.home_team.flag_url} size={14} />)}
              <span className="truncate max-w-[90px]">{match.home_team?.name ?? match.home_team_name}</span>
            </span>
            <span>Empate</span>
            <span className="flex items-center gap-1">
              <span className="truncate max-w-[90px]">{match.away_team?.name ?? match.away_team_name}</span>
              {match.away_team?.flag_url && (isPL
                ? <img src={match.away_team.flag_url} style={{ width: 14, height: 14, objectFit: 'contain' }} alt="" />
                : <Flag src={match.away_team.flag_url} size={14} />)}
            </span>
          </div>
          <div className="flex rounded-full overflow-hidden h-6 gap-[2px] bg-white/5">
            {outcomes.map(o => o.count > 0 && (
              <div key={o.key} style={{ flex: o.count, backgroundColor: o.color, minWidth: 4 }}
                   className="flex items-center justify-center">
                {o.pct >= 14 && (
                  <span className="text-white text-[10px] font-black leading-none">{o.pct}%</span>
                )}
              </div>
            ))}
          </div>
          <div className="flex justify-between mt-1.5">
            {outcomes.map(o => (
              <span key={o.key} className="text-[11px] font-bold"
                    style={{ color: o.count > 0 ? o.color : '#333' }}>
                {o.pct}%
              </span>
            ))}
          </div>
        </>
      ) : (
        <div className="space-y-3">
          {outcomes.map(o => (
            <div key={o.key}>
              <div className="flex items-center gap-2 mb-1.5">
                {o.flagUrl
                  ? (o.isPL
                    ? <img src={o.flagUrl} style={{ width: 16, height: 16, objectFit: 'contain', flexShrink: 0 }} alt="" />
                    : <Flag src={o.flagUrl} size={16} />)
                  : <div className="w-4 h-4 rounded-full shrink-0" style={{ backgroundColor: o.color }} />}
                <span className="text-xs font-bold" style={{ color: o.color }}>{o.label}</span>
                <div className="flex-1 h-1 rounded-full bg-white/5 overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${o.pct}%`, backgroundColor: o.color }} />
                </div>
                <span className="text-xs font-black shrink-0" style={{ color: o.color }}>{o.pct}%</span>
              </div>
              <div className="flex flex-wrap gap-1.5 pl-5">
                {o.userIds.length === 0 ? (
                  <span className="text-gray-700 text-xs">–</span>
                ) : o.userIds.map(uid => (
                  <span key={uid}
                    className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                      uid === myUserId
                        ? 'bg-blue-900/30 text-[#1B4FD8] border border-[#1B4FD8]/30'
                        : 'bg-white/5 text-gray-400 border border-white/10'
                    }`}>
                    {uid === myUserId ? 'Vos' : (memberMap[uid] ?? '?')}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  )
}

// ── Matches Tab ───────────────────────────────────────────────────────────────
function MatchesTab({ ligaId, userId, torneo }) {
  const [matches, setMatches]               = useState([])
  const [myPredictions, setMyPredictions]   = useState({})
  const [allPredictions, setAllPredictions] = useState([])
  const [members, setMembers]               = useState([])
  const [loading, setLoading]               = useState(true)
  const [filter, setFilter]                 = useState('all')
  const [viewMode, setViewMode]             = useState('summary')
  const isPL = torneo === 'premier_league'

  useEffect(() => {
    if (!userId) return
    async function load() {
      const { data: memberData } = await supabase
        .from('liga_miembros')
        .select('usuario_id, profiles:usuario_id(username)')
        .eq('liga_id', ligaId)

      const memberIds = (memberData || []).map(m => m.usuario_id)
      setMembers(memberData || [])

      const predQuery = memberIds.length > 0
        ? supabase.from('predictions')
            .select('user_id, match_id, home_score, away_score, points_earned, bonus_goleador, primer_goleador_prediccion_id')
            .in('user_id', memberIds)
        : Promise.resolve({ data: [] })

      const matchQuery = isPL
        ? supabase.from('matches').select(PL_MATCH_SELECT).eq('competition', 'premier_league').order('match_date')
        : supabase.from('matches').select(WC_MATCH_SELECT).eq('stage', 'group').order('match_number')

      const [{ data: matchData }, { data: predData }] = await Promise.all([matchQuery, predQuery])

      setMatches(matchData || [])
      const all = predData || []
      setAllPredictions(all)
      const myMap = {}
      for (const p of all) if (p.user_id === userId) myMap[p.match_id] = p
      setMyPredictions(myMap)
      setLoading(false)
    }
    load()
  }, [ligaId, userId, isPL])

  const handleSave = useCallback(async (matchId, homeScore, awayScore) => {
    const existing = myPredictions[matchId]
    const { data } = await supabase.from('predictions')
      .upsert({
        user_id: userId, match_id: matchId,
        home_score: homeScore, away_score: awayScore,
        primer_goleador_prediccion_id: existing?.primer_goleador_prediccion_id ?? null,
      }, { onConflict: 'user_id,match_id' })
      .select('match_id, home_score, away_score, points_earned, bonus_goleador, primer_goleador_prediccion_id')
      .single()
    if (data) setMyPredictions(prev => ({ ...prev, [matchId]: data }))
  }, [userId, myPredictions])

  const handleSaveGoalscorer = useCallback(async (matchId, playerId) => {
    const existing = myPredictions[matchId]
    const { data } = await supabase.from('predictions')
      .upsert({
        user_id: userId, match_id: matchId,
        home_score: existing?.home_score ?? null,
        away_score: existing?.away_score ?? null,
        primer_goleador_prediccion_id: playerId,
      }, { onConflict: 'user_id,match_id' })
      .select('match_id, home_score, away_score, points_earned, bonus_goleador, primer_goleador_prediccion_id')
      .single()
    if (data) setMyPredictions(prev => ({ ...prev, [matchId]: data }))
  }, [userId, myPredictions])

  function getMatchStats(matchId) {
    const preds = allPredictions.filter(p => p.match_id === matchId && p.home_score != null)
    const total = preds.length
    if (total === 0) return null
    const homeWins = preds.filter(p => p.home_score > p.away_score)
    const draws    = preds.filter(p => p.home_score === p.away_score)
    const awayWins = preds.filter(p => p.home_score < p.away_score)
    const pct = n => Math.round(n / total * 100)
    return {
      homeWin: { count: homeWins.length, pct: pct(homeWins.length), userIds: homeWins.map(p => p.user_id) },
      draw:    { count: draws.length,    pct: pct(draws.length),    userIds: draws.map(p => p.user_id)    },
      awayWin: { count: awayWins.length, pct: pct(awayWins.length), userIds: awayWins.map(p => p.user_id) },
      total,
    }
  }

  const accentColor = isPL ? '#9B59D0' : '#1B4FD8'
  const groups   = isPL ? [] : [...new Set(matches.map(m => m.group?.name))].sort()
  const filtered = (!isPL && filter !== 'all') ? matches.filter(m => m.group?.name === filter) : matches
  const byDate   = filtered.reduce((acc, m) => {
    const d = (m.match_date ?? '').slice(0, 10)
    if (!acc[d]) acc[d] = []
    acc[d].push(m)
    return acc
  }, {})

  if (loading) return <SkeletonRanking />

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="animate-slide-up">
      <div className="flex items-start justify-between gap-2 mb-6">
        <div className="flex flex-wrap gap-2">
          {!isPL && ['all', ...groups].map(g => (
            <button key={g} onClick={() => setFilter(g)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                filter === g ? 'text-white' : 'bg-white/5 text-gray-400 border border-white/10 hover:border-white/25'
              }`}
              style={filter === g ? { backgroundColor: GROUP_COLORS[g] ?? '#1B4FD8' } : {}}>
              {g === 'all' ? 'Todos' : `Grupo ${g}`}
            </button>
          ))}
          {isPL && (
            <span className="text-xs font-bold px-3 py-1.5 rounded-xl text-white"
                  style={{ backgroundColor: '#3D0070' }}>PREMIER LEAGUE</span>
          )}
        </div>
        <div className="flex items-center gap-1 bg-white/5 border border-white/10 rounded-xl p-1 shrink-0">
          <button onClick={() => setViewMode('summary')} title="Resumen"
            className={`px-2.5 py-1 rounded-lg text-xs transition-all ${
              viewMode === 'summary' ? 'text-white' : 'text-gray-500 hover:text-gray-300'
            }`}
            style={viewMode === 'summary' ? { backgroundColor: accentColor } : {}}>📊</button>
          <button onClick={() => setViewMode('detail')} title="Detalle"
            className={`px-2.5 py-1 rounded-lg text-xs transition-all ${
              viewMode === 'detail' ? 'text-white' : 'text-gray-500 hover:text-gray-300'
            }`}
            style={viewMode === 'detail' ? { backgroundColor: accentColor } : {}}>👥</button>
        </div>
      </div>

      <div className="space-y-8">
        {Object.entries(byDate).map(([date, dayMatches]) => (
          <div key={date}>
            <p className="font-display text-sm tracking-widest uppercase mb-3" style={{ color: accentColor }}>
              {new Date(date + 'T12:00:00').toLocaleDateString('es-AR', {
                weekday: 'long', day: 'numeric', month: 'long',
              }).toUpperCase()}
            </p>
            <div className="space-y-4">
              {dayMatches.map(match => {
                const locked = isLocked(match)
                return (
                  <div key={match.id}>
                    <MatchPredictionCard
                      match={match}
                      prediction={myPredictions[match.id]}
                      onSave={handleSave}
                      onSaveGoalscorer={handleSaveGoalscorer}
                    />
                    {locked && (
                      <div className="mt-1 rounded-2xl px-5 py-4"
                           style={{ background: 'linear-gradient(160deg, #181818 0%, #141414 100%)', border: '1px solid rgba(255,255,255,0.06)' }}>
                        <PickDistribution
                          match={match} stats={getMatchStats(match.id)}
                          members={members} viewMode={viewMode} myUserId={userId}
                        />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </motion.div>
  )
}

// ── Members Tab ───────────────────────────────────────────────────────────────
function MembersTab({ ligaId, adminId }) {
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.from('liga_miembros')
      .select('joined_at, profiles:usuario_id(id, username, avatar_url)')
      .eq('liga_id', ligaId).order('joined_at')
      .then(({ data }) => { setMembers(data || []); setLoading(false) })
  }, [ligaId])

  if (loading) return <SkeletonRanking />

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-2">
      {members.map((m, i) => (
        <motion.div
          key={m.profiles?.id}
          initial={{ opacity: 0, x: -12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: i * 0.06, duration: 0.3 }}
          className="card flex items-center gap-3 px-5 py-3"
        >
          <AvatarDisplay avatarUrl={m.profiles?.avatar_url} username={m.profiles?.username} size={36} />
          <span className="text-white font-semibold flex-1">{m.profiles?.username}</span>
          {m.profiles?.id === adminId && <span className="badge">Admin</span>}
          <span className="text-gray-500 text-xs">
            {new Date(m.joined_at).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })}
          </span>
        </motion.div>
      ))}
    </motion.div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function LeaguePage() {
  const { id } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [liga, setLiga]             = useState(null)
  const [tab, setTab]               = useState('Ranking')
  const [loading, setLoading]       = useState(true)
  const [copied, setCopied]         = useState(false)
  const [memberCount, setMemberCount] = useState(0)
  const [matchCount, setMatchCount] = useState(0)
  const [showQR, setShowQR]         = useState(false)

  useEffect(() => {
    async function load() {
      const [{ data: ligaData }, { count: mCount }] = await Promise.all([
        supabase.from('ligas').select('*, profiles:admin_id(username)').eq('id', id).single(),
        supabase.from('liga_miembros').select('*', { count: 'exact', head: true }).eq('liga_id', id),
      ])
      if (!ligaData) { navigate('/dashboard'); return }
      setLiga(ligaData)
      setMemberCount(mCount || 0)

      // Match count for this torneo
      const { count: mc } = await (ligaData.torneo === 'premier_league'
        ? supabase.from('matches').select('*', { count: 'exact', head: true }).eq('competition', 'premier_league')
        : supabase.from('matches').select('*', { count: 'exact', head: true }).eq('stage', 'group'))
      setMatchCount(mc || 0)
      setLoading(false)
    }
    load()
  }, [id, navigate])

  function copyInviteLink() {
    const url = `${window.location.origin}/unirse/${liga.codigo_invitacion}`
    navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  function shareWhatsApp() {
    const url = `${window.location.origin}/unirse/${liga.codigo_invitacion}`
    window.open(`https://wa.me/?text=${encodeURIComponent(`¡Uníte a mi quiniela "${liga.nombre}"!\n${url}`)}`, '_blank')
  }

  if (loading) return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-4">
      <div className="skeleton h-48 w-full rounded-2xl" />
      <div className="skeleton h-12 w-full rounded-2xl" />
      <SkeletonRanking />
    </div>
  )

  const isPL        = liga.torneo === 'premier_league'
  const accentColor = isPL ? '#9B59D0' : '#1B4FD8'
  const inviteUrl   = `${window.location.origin}/unirse/${liga.codigo_invitacion}`
  const qrUrl       = `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(inviteUrl)}&size=180x180&bgcolor=1a1a1a&color=ffffff&qzone=1`

  const tabCounts = {
    'Partidos': matchCount > 0 ? matchCount : null,
    'Miembros': memberCount > 0 ? memberCount : null,
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">

      {/* ── Header card ── */}
      <motion.div
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: 'easeOut' }}
        className="card overflow-hidden mb-6"
      >
        {/* Aurora top strip */}
        <div className="aurora-bg h-2" />

        <div className="p-6">
          <div className="flex items-start gap-4">
            {/* League avatar with glow */}
            <div className="glow-pulse w-14 h-14 rounded-2xl flex items-center justify-center text-3xl shrink-0"
                 style={{
                   background: isPL
                     ? 'linear-gradient(135deg, #3D0070, #9B59D0)'
                     : 'linear-gradient(135deg, #1B4FD8, #E8122D)',
                 }}>
              <span className="font-display text-xl font-black text-white/80">{isPL ? 'PL' : 'WC'}</span>
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="font-display text-3xl text-white leading-tight tracking-wide">{liga.nombre}</h1>
                {/* Active badge */}
                <span className="flex items-center gap-1.5 text-[10px] font-bold px-2 py-0.5 rounded-full text-green-400"
                      style={{ background: 'rgba(74,222,128,0.12)', border: '1px solid rgba(74,222,128,0.3)' }}>
                  <span className="blink-dot w-1.5 h-1.5 rounded-full bg-green-400 shrink-0" />
                  ACTIVA
                </span>
              </div>
              {liga.descripcion && <p className="text-gray-500 text-sm mt-0.5">{liga.descripcion}</p>}

              {/* Quick stats pills */}
              <div className="flex flex-wrap gap-2 mt-3">
                {[
                  { val: memberCount, label: memberCount === 1 ? 'miembro' : 'miembros' },
                  { val: matchCount,  label: 'partidos' },
                  { val: liga.codigo_invitacion, label: null },
                ].map(({ val, label }) => (
                  <span key={String(val)}
                    className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full transition-all hover:bg-white/10"
                    style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}>
                    <span className="text-white">{label ? `${val} ${label}` : val}</span>
                  </span>
                ))}
                <span className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full"
                      style={{ background: `${accentColor}18`, border: `1px solid ${accentColor}40`, color: accentColor }}>
                  {isPL ? 'Premier League' : 'Mundial 2026'}
                </span>
              </div>
            </div>
          </div>

          {/* Invite section */}
          <div className="mt-4 rounded-xl overflow-hidden"
               style={{ border: '1px solid rgba(255,255,255,0.1)' }}>
            <div className="flex items-center gap-3 bg-white/5 px-4 py-2.5">
              <div className="flex-1 min-w-0">
                <p className="text-xs text-gray-500 mb-0.5 font-semibold">Link de invitación</p>
                <p className="text-gray-400 text-xs font-mono truncate">{inviteUrl}</p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <motion.button
                  onClick={copyInviteLink}
                  whileTap={{ scale: 0.92 }}
                  className={`text-xs font-bold px-3 py-1.5 rounded-lg transition-all ${
                    copied
                      ? 'bg-green-900/30 text-green-400 border border-green-500/30'
                      : 'bg-white/10 text-gray-400 hover:text-white border border-white/10'
                  }`}>
                  {copied ? '✓ ¡Copiado!' : 'Copiar'}
                </motion.button>
                {/* WhatsApp */}
                <motion.button
                  onClick={shareWhatsApp}
                  whileTap={{ scale: 0.92 }}
                  title="Compartir por WhatsApp"
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-white transition-all hover:opacity-90"
                  style={{ backgroundColor: '#25D366' }}>
                  <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                  </svg>
                </motion.button>
                {/* QR toggle */}
                <motion.button
                  onClick={() => setShowQR(v => !v)}
                  whileTap={{ scale: 0.92 }}
                  title="Ver código QR"
                  className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs transition-all border ${
                    showQR ? 'bg-[#1B4FD8]/20 text-[#1B4FD8] border-[#1B4FD8]/40' : 'bg-white/5 text-gray-500 border-white/10 hover:text-white'
                  }`}>
                  ▦
                </motion.button>
              </div>
            </div>

            {/* QR code panel */}
            <AnimatePresence>
              {showQR && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.22 }}
                  className="overflow-hidden"
                >
                  <div className="flex flex-col items-center py-4 gap-3"
                       style={{ background: 'rgba(0,0,0,0.3)', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                    <img src={qrUrl} alt="QR" className="rounded-xl"
                         style={{ width: 140, height: 140, imageRendering: 'pixelated' }} />
                    <a href={qrUrl} download={`qr-${liga.codigo_invitacion}.png`}
                       className="text-xs text-gray-500 hover:text-white transition-colors">
                      ↓ Descargar QR
                    </a>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <p className="text-gray-600 text-xs mt-2">Admin: {liga.profiles?.username}</p>
        </div>
      </motion.div>

      {/* ── Tabs ── */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.15 }}
        className="relative flex bg-[#1A1A1A] rounded-2xl p-1 mb-6 border border-white/10"
      >
        {TABS.map((t, i) => (
          <motion.button
            key={t}
            onClick={() => setTab(t)}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 + i * 0.05 }}
            className="relative flex-1 py-2.5 rounded-xl text-sm font-bold transition-colors z-10 flex items-center justify-center gap-1.5"
            style={{ color: tab === t ? 'white' : 'rgba(255,255,255,0.4)' }}
          >
            {tab === t && (
              <motion.div
                layoutId="tab-indicator"
                className="absolute inset-0 rounded-xl"
                style={{ backgroundColor: accentColor }}
                transition={{ type: 'spring', bounce: 0.18, duration: 0.4 }}
              />
            )}
            <span className="relative z-10">{t}</span>
            {tabCounts[t] && (
              <span className="relative z-10 text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none"
                    style={{
                      backgroundColor: tab === t ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.08)',
                      color: tab === t ? 'white' : 'rgba(255,255,255,0.4)',
                    }}>
                {tabCounts[t]}
              </span>
            )}
          </motion.button>
        ))}
      </motion.div>

      {/* ── Tab content with fade transition ── */}
      <AnimatePresence mode="wait">
        <motion.div
          key={tab}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.18 }}
        >
          {tab === 'Ranking'  && <RankingTab  ligaId={id} userId={user?.id} torneo={liga.torneo} />}
          {tab === 'Partidos' && <MatchesTab  ligaId={id} userId={user?.id} torneo={liga.torneo} />}
          {tab === 'Chat'     && <LeagueChat  ligaId={id} />}
          {tab === 'Miembros' && <MembersTab  ligaId={id} adminId={liga.admin_id} />}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}
