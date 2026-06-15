import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '../lib/supabase'
import { Flag, TeamBlock } from './FlagPair'

export const GROUP_COLORS = {
  A: '#1B4FD8', B: '#E8122D', C: '#00A550', D: '#1B4FD8',
  E: '#F97316', F: '#EC4899', G: '#0891B2', H: '#D97706',
  I: '#2563EB', J: '#059669', K: '#DC2626', L: '#0369A1',
}

// ── Live score polling (TheSportsDB V1) ───────────────────────────────────────
const LIVE_STATUS_LABEL = { '1H': '1er T', 'HT': 'Descanso', '2H': '2do T', 'ET': 'Prórroga', 'PEN': 'Penales' }
const LIVE_STATUSES = new Set(['1H', 'HT', '2H', 'ET', 'PEN'])

function useLiveScore(match) {
  const [liveData, setLiveData] = useState(null)
  const [dbMinute, setDbMinute] = useState(match.match_minute ?? null)

  useEffect(() => {
    if (!match.sofascore_id) return
    const kickoff = kickoffUtc(match).getTime()
    const now = Date.now()
    if (now < kickoff - 5 * 60 * 1000 || now > kickoff + 150 * 60 * 1000) return
    async function fetchLive() {
      try {
        const [apiRes, dbRes] = await Promise.all([
          fetch(`https://www.thesportsdb.com/api/v1/json/3/lookupevent.php?id=${match.sofascore_id}`),
          supabase.from('matches').select('match_minute').eq('id', match.id).single(),
        ])
        if (dbRes.data?.match_minute != null) setDbMinute(dbRes.data.match_minute)
        const json = await apiRes.json()
        const evt  = json?.events?.[0]
        if (evt) setLiveData({
          homeScore: evt.intHomeScore,
          awayScore: evt.intAwayScore,
          status:    evt.strStatus,
          minute:    evt.intProgress != null ? parseInt(evt.intProgress) : null,
        })
      } catch {}
    }
    fetchLive()
    const id = setInterval(fetchLive, 60_000)
    return () => clearInterval(id)
  }, [match.sofascore_id, match.match_date, match.match_time])

  return { liveData, dbMinute }
}

// ── Locking helpers ───────────────────────────────────────────────────────────
function kickoffUtc(match) {
  const dateStr = match.match_date?.slice(0, 10)
  if (!dateStr) return new Date(0)
  if (match.match_time) {
    const [h, m] = match.match_time.split(':').map(Number)
    return new Date(`${dateStr}T${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:00-05:00`)
  }
  return new Date(`${dateStr}T00:00:00Z`)
}

export function isLocked(match) {
  return Date.now() >= kickoffUtc(match).getTime() - 10 * 60 * 1000
}

function minsToLock(match) {
  return (kickoffUtc(match).getTime() - Date.now()) / 60000
}

// ── Score Input ───────────────────────────────────────────────────────────────
function ScoreInput({ value, onChange }) {
  return (
    <input
      type="number" inputMode="numeric" min="0" max="20" value={value}
      onChange={e => { const v = e.target.value; if (v === '' || (Number(v) >= 0 && Number(v) <= 20)) onChange(v) }}
      className="w-12 h-12 text-center font-display text-2xl sm:text-3xl text-white bg-[#242424] border-2 rounded-xl focus:outline-none focus:border-[#1B4FD8] focus:bg-[#2A2A2A] active:scale-95 transition-all no-spinners"
      style={{ borderColor: '#444' }}
    />
  )
}

// ── Score Display ─────────────────────────────────────────────────────────────
function ScoreDisplay({ value }) {
  const hasValue = value !== '' && value != null
  return (
    <div className="w-12 h-12 flex items-center justify-center rounded-xl"
         style={{ backgroundColor: '#1C1C1C', border: '2px solid rgba(255,255,255,0.07)' }}>
      <span className="font-display text-2xl sm:text-3xl" style={{ color: hasValue ? 'white' : '#374151' }}>
        {hasValue ? value : '–'}
      </span>
    </div>
  )
}

// ── Goal Timeline ─────────────────────────────────────────────────────────────
function GoalTimeline({ goals, match }) {
  if (!goals?.length) return null

  const normStr = s => (s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z]/g, '')
  const homeLabel = match.home_team?.name
  const awayLabel = match.away_team?.name

  const isHomeGoal = g => {
    if (!g.team || !homeLabel) return true
    const nt = normStr(g.team), nh = normStr(homeLabel)
    return nt.includes(nh.slice(0, 5)) || nh.includes(nt.slice(0, 5))
  }

  const groupByPlayer = list => {
    const map = new Map()
    for (const g of list) {
      const key = g.player ?? '?'
      if (!map.has(key)) map.set(key, [])
      if (g.minute > 0) map.get(key).push(g.minute)
    }
    return [...map.entries()].map(([player, minutes]) => ({ player, minutes: minutes.sort((a, b) => a - b) }))
  }

  const homeGoals = groupByPlayer(goals.filter(g => isHomeGoal(g)))
  const awayGoals = groupByPlayer(goals.filter(g => !isHomeGoal(g)))

  return (
    <div className="px-5 pb-3 pt-2 border-t border-white/5">
      <div className="grid grid-cols-[1fr_14px_1fr] items-start gap-x-2">
        <div className="space-y-1.5">
          {homeGoals.map((g, i) => (
            <div key={i} className="flex items-baseline justify-end gap-1 text-right">
              {g.minutes.length > 0 && (
                <span className="text-[10px] text-gray-600 shrink-0">{g.minutes.map(m => `${m}'`).join(', ')}</span>
              )}
              <span className="text-[11px] font-semibold text-gray-300">{g.player}</span>
            </div>
          ))}
        </div>
        <div className="text-center pt-0.5 text-xs leading-none">⚽</div>
        <div className="space-y-1.5">
          {awayGoals.map((g, i) => (
            <div key={i} className="flex items-baseline gap-1">
              <span className="text-[11px] font-semibold text-gray-300">{g.player}</span>
              {g.minutes.length > 0 && (
                <span className="text-[10px] text-gray-600 shrink-0">{g.minutes.map(m => `${m}'`).join(', ')}</span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Lineup Section ────────────────────────────────────────────────────────────
function LineupSection({ match }) {
  const [open, setOpen] = useState(false)
  const home = match.lineup_home
  const away = match.lineup_away
  const isPreMatch = match.status !== 'finished' && match.status !== 'live'
  const hasData = home?.length || away?.length
  const confirmed = home?.[0]?.confirmed ?? false

  const homeTeam = match.home_team
  const awayTeam = match.away_team

  const starters = list => (list ?? []).filter(p => !p.sub)
  const byPos    = (list, pos) => starters(list).filter(p => (p.position ?? '').toLowerCase().includes(pos))

  // Home: GK | DEF | MID | FWD  (left → center)
  const homeColumns = [
    byPos(home, 'portero'),
    byPos(home, 'defensa'),
    byPos(home, 'medioc'),
    byPos(home, 'delant'),
  ]
  // Away: FWD | MID | DEF | GK  (center → right, mirrored)
  const awayColumns = [
    byPos(away, 'delant'),
    byPos(away, 'medioc'),
    byPos(away, 'defensa'),
    byPos(away, 'portero'),
  ]

  const PlayerDot = ({ player }) => (
    <div className="flex flex-col items-center gap-0.5" style={{ width: 34 }}>
      <PlayerFace player={{ sofascore_id: player.sofascore_id, nombre: player.name, numero_camiseta: player.number }} size={28} />
      <span className="text-center text-white/70 leading-tight"
            style={{ fontSize: 7, width: 34, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {(player.name ?? '').split(' ').pop()}
      </span>
    </div>
  )

  const PosColumn = ({ players }) => (
    <div className="flex flex-col items-center justify-center gap-2 flex-1 py-2">
      {players.map((p, i) => <PlayerDot key={i} player={p} />)}
    </div>
  )

  const TeamBadge = ({ team, align }) => (
    <div className={`flex items-center gap-1.5 ${align === 'right' ? 'flex-row-reverse' : ''}`}>
      {team?.flag_url && (
        <img src={team.flag_url} alt="" style={{ width: 18, height: 12, objectFit: 'cover', borderRadius: 2 }} />
      )}
      <span className="text-[10px] text-white font-bold truncate">{team?.code ?? team?.name}</span>
    </div>
  )

  return (
    <div className="mt-3 pt-3 border-t border-white/10">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between py-1 text-xs text-gray-400 hover:text-gray-200 transition-colors">
        <span className="font-bold uppercase tracking-wide">
          {isPreMatch ? (confirmed ? 'Alineación confirmada' : 'Posibles alineaciones') : 'Alineaciones'}
        </span>
        <span className="text-[10px] text-gray-600">{open ? '▲ Ocultar' : '▼ Ver'}</span>
      </button>

      {open && (
        hasData ? (
          <div className="mt-2 rounded-xl overflow-hidden" style={{ background: 'linear-gradient(160deg, #1a5c3a, #1e6e45)' }}>
            {/* Team headers */}
            <div className="flex items-center justify-between px-3 py-2 border-b border-white/10">
              <TeamBadge team={homeTeam} align="left" />
              <span className="text-[9px] text-white/25 italic">titulares</span>
              <TeamBadge team={awayTeam} align="right" />
            </div>

            {/* Pitch */}
            <div className="flex items-stretch px-1 relative" style={{ minHeight: 110 }}>
              <div className="absolute inset-y-2 left-1/2 w-px bg-white/15 -translate-x-px" />
              {homeColumns.map((col, i) => <PosColumn key={`h${i}`} players={col} />)}
              {awayColumns.map((col, i) => <PosColumn key={`a${i}`} players={col} />)}
            </div>

            <p className="text-center pb-1.5 text-white/25" style={{ fontSize: 8 }}>GK — DEF — MED — DEL · DEL — MED — DEF — GK</p>
          </div>
        ) : (
          <p className="mt-2 text-[11px] text-gray-600 text-center py-3">
            {match.status === 'finished' || match.status === 'live'
              ? 'Alineaciones no disponibles para este partido'
              : 'Alineaciones disponibles ~1h antes del partido'}
          </p>
        )
      )}
    </div>
  )
}

// ── H2H Section ───────────────────────────────────────────────────────────────
function H2HSection({ match }) {
  const [open, setOpen] = useState(false)
  const h2h = match.h2h
  if (!h2h?.length) return null

  return (
    <div className="mt-3 pt-3 border-t border-white/10">
      <button onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between text-xs text-gray-500 hover:text-gray-300 transition-colors">
        <span className="font-bold uppercase tracking-wide">Historial H2H</span>
        <span className="text-[10px]">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="mt-3 space-y-2">
          {h2h.slice(0, 5).map((m, i) => {
            const hScore = m.homeScore ?? '?'
            const aScore = m.awayScore ?? '?'
            return (
              <div key={i} className="flex items-center gap-2 text-[11px]">
                <span className="text-gray-700 w-14 shrink-0 text-right font-mono">
                  {m.date ? new Date(m.date + 'T12:00:00').toLocaleDateString('es', { day: 'numeric', month: 'short' }) : ''}
                </span>
                <span className="flex-1 text-right text-gray-400 truncate min-w-0">{m.homeTeam}</span>
                <span className="font-display text-sm text-white shrink-0 px-1.5 py-0.5 rounded min-w-[42px] text-center"
                      style={{ backgroundColor: 'rgba(255,255,255,0.07)' }}>
                  {hScore}–{aScore}
                </span>
                <span className="flex-1 text-left text-gray-400 truncate min-w-0">{m.awayTeam}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Player face photo ─────────────────────────────────────────────────────────
const POS_COLORS = {
  portero:       { bg: '#92400E', text: '#FCD34D' },
  defensa:       { bg: '#1E3A8A', text: '#93C5FD' },
  mediocampista: { bg: '#064E3B', text: '#6EE7B7' },
  delantero:     { bg: '#7F1D1D', text: '#FCA5A5' },
}

function PlayerFace({ player, size = 32 }) {
  const [err, setErr] = useState(false)
  const src = player?.foto_url || null

  if (!src || err) {
    const pos   = player?.posicion?.toLowerCase()
    const color = POS_COLORS[pos] ?? { bg: '#1e3a5f', text: '#93C5FD' }
    const num   = player?.numero_camiseta
    const initials = player?.nombre
      ? player.nombre.trim().split(/\s+/).slice(-2).map(w => w[0]).join('').toUpperCase()
      : '?'
    return (
      <div className="rounded-full flex flex-col items-center justify-center shrink-0 select-none"
           style={{ width: size, height: size, backgroundColor: color.bg, border: `1.5px solid ${color.text}22` }}>
        {num != null ? (
          <span style={{ color: color.text, fontSize: size * 0.36, fontWeight: 900, lineHeight: 1 }}>{num}</span>
        ) : (
          <span style={{ color: color.text, fontSize: size * 0.32, fontWeight: 900, lineHeight: 1 }}>{initials}</span>
        )}
      </div>
    )
  }
  return (
    <img src={src} alt={player?.nombre} onError={() => setErr(true)}
      referrerPolicy="no-referrer"
      style={{ width: size, height: size, borderRadius: size / 2, objectFit: 'cover', objectPosition: 'top', flexShrink: 0 }}
    />
  )
}

// ── Goalscorer Selector ───────────────────────────────────────────────────────
function GoalscorerSelector({ match, selectedId, onSelect, disabled }) {
  const [open, setOpen]         = useState(false)
  const [players, setPlayers]   = useState({ home: [], away: [] })
  const [loading, setLoading]   = useState(false)
  const [fetchError, setFetchError] = useState(false)
  const [selectedPlayer, setSelectedPlayer] = useState(null)

  useEffect(() => {
    if (!selectedId || selectedId === 'NONE') { setSelectedPlayer(null); return }
    const all = [...players.home, ...players.away]
    const found = all.find(p => p.id === selectedId)
    if (found) { setSelectedPlayer(found); return }
    supabase.from('jugadores').select('id, nombre, numero_camiseta, posicion, equipo_id, sofascore_id, foto_url')
      .eq('id', selectedId).single()
      .then(({ data }) => { if (data) setSelectedPlayer(data) })
  }, [selectedId, players])

  useEffect(() => {
    if (!open) return
    const homeId = match.home_team?.id
    const awayId = match.away_team?.id
    if (!homeId || !awayId) return
    setLoading(true); setFetchError(false)
    supabase.from('jugadores').select('id, nombre, numero_camiseta, posicion, equipo_id, sofascore_id, foto_url')
      .in('equipo_id', [homeId, awayId])
      .then(({ data, error }) => {
        if (error) { setFetchError(true); setLoading(false); return }
        const POS_ORDER = { portero: 0, defensa: 1, mediocampista: 2, delantero: 3 }
        const sort = list => list.slice().sort((a, b) => {
          const pa = POS_ORDER[a.posicion?.toLowerCase()] ?? 4
          const pb = POS_ORDER[b.posicion?.toLowerCase()] ?? 4
          return pa !== pb ? pa - pb : (a.numero_camiseta ?? 99) - (b.numero_camiseta ?? 99)
        })
        const all = data || []
        setPlayers({ home: sort(all.filter(p => p.equipo_id === homeId)), away: sort(all.filter(p => p.equipo_id === awayId)) })
        setLoading(false)
      })
  }, [open, match.home_team?.id, match.away_team?.id])

  const hasPlayers  = players.home.length > 0 || players.away.length > 0
  const teamsConfig = [{ team: match.home_team, list: players.home }, { team: match.away_team, list: players.away }]

  return (
    <div className="mt-3 pt-3 border-t border-white/10">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-gray-500 font-bold uppercase tracking-wide">
          ⚡ Primer goleador <span className="text-gray-600 font-normal">(+1 pt)</span>
        </span>
        {(selectedPlayer || selectedId === 'NONE') && !disabled && (
          <button onClick={e => { e.stopPropagation(); onSelect(null) }} className="text-xs text-gray-500 hover:text-red-400 transition-colors">
            Quitar
          </button>
        )}
      </div>

      {disabled ? (
        selectedPlayer ? (
          <div className="flex items-center gap-2.5 bg-yellow-900/20 border border-yellow-500/30 rounded-xl px-3 py-2">
            <PlayerFace player={selectedPlayer} size={32} />
            <span className="text-yellow-400 text-xs font-bold truncate">{selectedPlayer.nombre}</span>
          </div>
        ) : (
          <p className="text-gray-600 text-xs">Sin predicción de goleador</p>
        )
      ) : (
        <>
          <button
            onClick={() => setOpen(v => !v)}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-xl border-2 text-xs transition-all font-semibold ${
              selectedPlayer ? 'bg-yellow-900/20 border-yellow-500/40'
              : selectedId === 'NONE' ? 'bg-white/5 border-white/20 text-gray-400'
              : 'bg-[#242424] border-[#444] text-gray-500 hover:border-[#1B4FD8] hover:text-[#1B4FD8]'
            }`}>
            {selectedPlayer ? (
              <span className="flex items-center gap-2 min-w-0">
                <PlayerFace player={selectedPlayer} size={28} />
                <span className="text-yellow-400 font-bold truncate">{selectedPlayer.nombre}</span>
              </span>
            ) : selectedId === 'NONE' ? (
              <span className="flex items-center gap-2 min-w-0">
                <span style={{ fontSize: 16 }}>⛔</span>
                <span className="text-gray-300 font-bold">Sin goleador</span>
              </span>
            ) : (
              <span className="truncate">Seleccionar goleador...</span>
            )}
            <span className="ml-2 shrink-0 text-[10px]">{open ? '▲' : '▼'}</span>
          </button>

          {open && (
            <div className="mt-2 bg-[#1A1A1A] border-2 border-white/10 rounded-2xl overflow-hidden shadow-card-lg">
              {loading ? (
                <p className="text-center py-5 text-gray-500 text-xs">Cargando jugadores...</p>
              ) : fetchError ? (
                <p className="text-center py-5 text-red-400 text-xs">Error al cargar</p>
              ) : !hasPlayers ? (
                <p className="text-center py-5 text-gray-500 text-xs">Plantel no disponible</p>
              ) : (
                <>
                <button
                onClick={() => { onSelect('NONE'); setOpen(false) }}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 border-b border-white/5 text-left transition-all hover:bg-white/5 ${selectedId === 'NONE' ? 'bg-white/8' : ''}`}>
                <span style={{ fontSize: 18 }}>⛔</span>
                <span className={`text-sm font-semibold ${selectedId === 'NONE' ? 'text-gray-200' : 'text-gray-500'}`}>Sin goleador</span>
              </button>
              <div className="grid grid-cols-2 divide-x divide-white/5 max-h-72 overflow-y-auto">
                  {teamsConfig.map(({ team, list }) => (
                    <div key={team.id}>
                      <div className="sticky top-0 bg-[#242424] px-3 py-2 border-b border-white/5 flex items-center gap-1.5">
                        <Flag src={team.flag_url} size={18} />
                        <span className="text-xs text-gray-300 font-bold truncate">{team.name}</span>
                      </div>
                      {list.length === 0 ? (
                        <p className="text-center py-4 text-gray-600 text-xs px-2">Sin jugadores</p>
                      ) : (
                        list.map(p => (
                          <button key={p.id} onClick={() => { onSelect(p.id); setOpen(false) }}
                            className={`w-full flex items-center gap-2 px-2.5 py-2 text-left transition-all hover:bg-[#1B4FD8]/10 ${selectedId === p.id ? 'bg-yellow-900/20' : ''}`}>
                            <PlayerFace player={p} size={34} />
                            <div className="min-w-0">
                              <p className={`text-xs font-semibold leading-tight truncate ${selectedId === p.id ? 'text-yellow-400' : 'text-gray-200'}`}>{p.nombre}</p>
                              <p className="text-gray-600 text-[10px] capitalize">{p.posicion}</p>
                            </div>
                          </button>
                        ))
                      )}
                    </div>
                  ))}
                </div>
                </>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ── Live countdown hook ───────────────────────────────────────────────────────
function useLiveCountdown(match) {
  const [label, setLabel] = useState('')
  useEffect(() => {
    function tick() {
      const msLeft = kickoffUtc(match).getTime() - Date.now() - 10 * 60 * 1000
      if (msLeft <= 0) { setLabel(''); return }
      const s = Math.floor(msLeft / 1000)
      const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60
      if (h > 0)       setLabel(`${h}h ${String(m).padStart(2,'0')}m`)
      else if (m > 0)  setLabel(`${m}m ${String(sec).padStart(2,'0')}s`)
      else             setLabel(`${sec}s`)
    }
    tick(); const id = setInterval(tick, 1000); return () => clearInterval(id)
  }, [match])
  return label
}

// ── Kickoff countdown hook ────────────────────────────────────────────────────
function useKickoffCd(match) {
  const [label, setLabel]   = useState('')
  const [cdColor, setCdColor] = useState('#9CA3AF')
  const [cdBg, setCdBg]     = useState('rgba(255,255,255,0.06)')
  const [cdBorder, setCdBorder] = useState('rgba(255,255,255,0.12)')

  useEffect(() => {
    function tick() {
      const ms = kickoffUtc(match).getTime() - Date.now()
      if (ms <= 0) { setLabel(''); return }
      const totalMins = Math.floor(ms / 60000)
      const s = Math.floor(ms / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60
      if (h > 48) setLabel(`${Math.floor(h / 24)}d`)
      else if (h > 0) setLabel(`${h}h ${String(m).padStart(2, '0')}m`)
      else if (m > 0) setLabel(`${m}m ${String(sec).padStart(2, '0')}s`)
      else setLabel(`${sec}s`)
      if (totalMins > 60) { setCdColor('#00A550'); setCdBg('rgba(0,165,80,0.1)'); setCdBorder('rgba(0,165,80,0.25)') }
      else if (totalMins > 10) { setCdColor('#F97316'); setCdBg('rgba(249,115,22,0.1)'); setCdBorder('rgba(249,115,22,0.25)') }
      else { setCdColor('#E8122D'); setCdBg('rgba(232,18,45,0.12)'); setCdBorder('rgba(232,18,45,0.4)') }
    }
    tick(); const id = setInterval(tick, 1000); return () => clearInterval(id)
  }, [match])

  return { label, cdColor, cdBg, cdBorder }
}

// ── Main Card ─────────────────────────────────────────────────────────────────
export function MatchPredictionCard({ match, prediction, onSave, onDelete, onViewPicks, onDismiss }) {
  const locked      = isLocked(match)
  const closingSoon = !locked && minsToLock(match) <= 30
  const finished    = match.status === 'finished'
  const [homeScore, setHomeScore]       = useState(prediction?.home_score ?? '')
  const [awayScore, setAwayScore]       = useState(prediction?.away_score ?? '')
  const [goalscorerId, setGoalscorerId] = useState(() => {
    const dbId = prediction?.primer_goleador_prediccion_id
    if (dbId) return dbId
    if (localStorage.getItem(`nogol_${match.id}`)) return 'NONE'
    return null
  })
  const hasSavedPrediction = prediction?.home_score != null
  const [isDirty, setIsDirty]           = useState(false)
  const [saving, setSaving]             = useState(false)
  const [saved, setSaved]               = useState(false)
  const [shake, setShake]               = useState(false)
  const [showToast, setShowToast]       = useState(false)
  const [saveError, setSaveError]       = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting]           = useState(false)
  const countdown = useLiveCountdown(match)
  const { label: cdLabel, cdColor, cdBg, cdBorder } = useKickoffCd(match)
  const { liveData, dbMinute } = useLiveScore(match)
  const isLive    = liveData && LIVE_STATUSES.has(liveData.status)
  const liveMinute = liveData?.minute ?? dbMinute ?? null

  useEffect(() => {
    const dbId = prediction?.primer_goleador_prediccion_id
    if (dbId) {
      localStorage.removeItem(`nogol_${match.id}`)
      setGoalscorerId(dbId)
    } else if (localStorage.getItem(`nogol_${match.id}`)) {
      setGoalscorerId('NONE')
    } else {
      setGoalscorerId(null)
    }
    setIsDirty(false)
  }, [prediction?.home_score, prediction?.away_score, prediction?.primer_goleador_prediccion_id, match.id])

  function triggerShake() { setShake(true); setTimeout(() => setShake(false), 420) }

  async function handleGoalscorerSelect(id) {
    setGoalscorerId(id)
    if (id === 'NONE') localStorage.setItem(`nogol_${match.id}`, '1')
    else localStorage.removeItem(`nogol_${match.id}`)
    setSaveError(null)
    const hs = homeScore !== '' ? parseInt(homeScore) : prediction?.home_score
    const as = awayScore !== '' ? parseInt(awayScore) : prediction?.away_score
    if (hs != null && as != null) {
      setSaving(true)
      const err = await onSave(match.id, hs, as, id === 'NONE' ? null : id)
      setSaving(false)
      if (err) { setSaveError(err); return }
      setIsDirty(false)
      setSaved(true); setShowToast(true)
      setTimeout(() => setSaved(false), 2000)
      setTimeout(() => setShowToast(false), 2500)
    }
  }

  const pts        = prediction?.points_earned
  const bonus      = prediction?.bonus_goleador
  const groupColor = GROUP_COLORS[match.group?.name] ?? '#1B4FD8'

  async function handleSave() {
    if (homeScore === '' || awayScore === '') return
    setSaving(true); setSaveError(null)
    const err = await onSave(match.id, parseInt(homeScore), parseInt(awayScore), goalscorerId === 'NONE' ? null : goalscorerId)
    setSaving(false)
    if (err) { setSaveError(err); return }
    setIsDirty(false)
    setSaved(true); setShowToast(true)
    setTimeout(() => setSaved(false), 2000)
    setTimeout(() => setShowToast(false), 2500)
  }

  async function handleDelete() {
    if (!confirmDelete) { setConfirmDelete(true); setTimeout(() => setConfirmDelete(false), 3000); return }
    setDeleting(true)
    await onDelete(match.id)
    localStorage.removeItem(`nogol_${match.id}`)
    setHomeScore(''); setAwayScore(''); setGoalscorerId(null)
    setConfirmDelete(false); setDeleting(false)
  }

  const pointsLabel = finished && pts != null
    ? pts === 3 ? '3 pts' : pts === 1 ? '1 pt' : '0 pts' : null

  const ptColor = pts === 3 ? 'text-panini-gold bg-yellow-900/20 border-yellow-500/30'
               : pts === 1 ? 'text-green-400 bg-green-900/20 border-green-500/30'
               :             'text-gray-500 bg-white/5 border-white/10'

  const fmtTime = t => {
    if (!t) return null
    const [h, m] = t.split(':').map(Number)
    return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`
  }
  const dateStr = [
    new Date(match.match_date?.slice(0, 10) + 'T12:00:00').toLocaleDateString('es-AR', { day: 'numeric', month: 'short' }),
    fmtTime(match.match_time),
  ].filter(Boolean).join(' · ')

  // Live badge label
  const liveBadgeLabel = isLive
    ? `${LIVE_STATUS_LABEL[liveData.status] || 'EN VIVO'}${liveMinute ? ` ${liveMinute}'` : ''}`
    : 'EN VIVO'

  return (
    <div
      onClick={locked && !finished ? triggerShake : undefined}
      className={`overflow-hidden rounded-2xl transition-all duration-200 ${
        !locked ? 'hover:shadow-[0_8px_40px_rgba(0,0,0,0.7)] hover:-translate-y-0.5' : ''
      } ${locked && !finished ? 'cursor-not-allowed opacity-80' : ''} ${shake ? 'animate-shake' : ''}`}
      style={{
        background:   'linear-gradient(160deg, #1E1E1E 0%, #181818 100%)',
        border:       '1px solid rgba(255,255,255,0.08)',
        borderLeft:   `4px solid ${finished ? '#00A550' : groupColor}`,
        boxShadow:    `0 2px 12px rgba(0,0,0,0.5), inset 3px 0 20px ${groupColor}18`,
      }}
    >
      {/* Closing-soon warning */}
      {closingSoon && countdown && (
        <div className="px-5 py-2 flex items-center justify-center gap-2"
             style={{ backgroundColor: 'rgba(217,119,6,0.12)', borderBottom: '1px solid rgba(217,119,6,0.25)' }}>
          <span className="blink-dot w-1.5 h-1.5 rounded-full bg-amber-400 inline-block" />
          <span className="text-amber-400 text-xs font-bold">Cierra en {countdown}</span>
        </div>
      )}

      {/* Meta row */}
      <div className="px-5 pt-3.5 pb-0 flex items-center justify-between">
        <div className="flex items-center gap-2 flex-wrap">
          <>
            <span className="text-gray-600 text-xs font-mono">#{match.match_number}</span>
            <span className="text-gray-700">·</span>
            <span className="font-display text-sm tracking-wider" style={{ color: groupColor }}>
              GRUPO {match.group?.name}
            </span>
          </>
          <span className="text-gray-700">·</span>
          <span className="text-gray-500 text-xs">{dateStr}</span>
          {locked && <span className="text-gray-600 text-xs">· 🔒</span>}
        </div>
        <div className="flex items-center gap-2 shrink-0 ml-2">
          {bonus > 0 && (
            <span className="text-xs font-bold text-yellow-400 bg-yellow-900/20 border border-yellow-500/30 px-2 py-0.5 rounded-full">
              ⚡ +{bonus}
            </span>
          )}
          {pointsLabel && (
            <span className={`text-xs font-bold border px-2 py-0.5 rounded-full ${ptColor}`}>
              {pointsLabel}
            </span>
          )}
          {!finished && (match.status === 'live' || isLive) && (
            <span className="flex items-center gap-1 text-xs font-bold text-green-400 bg-green-900/30 px-2 py-0.5 rounded-full border border-green-500/30">
              <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse inline-block" />
              {liveBadgeLabel}
            </span>
          )}
          {!locked && !finished && cdLabel && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border"
                  style={{ color: cdColor, backgroundColor: cdBg, borderColor: cdBorder }}>
              {cdLabel}
            </span>
          )}
          {onDismiss && locked && (
            <button
              onClick={e => { e.stopPropagation(); onDismiss(match.id) }}
              className="text-gray-600 hover:text-gray-400 active:scale-90 transition-all text-base leading-none ml-1"
              title="Ocultar partido">
              ×
            </button>
          )}
        </div>
      </div>

      {/* Teams + scores */}
      {finished ? (
        /* ── Google-style result card ── */
        <div className="px-5 pt-3 pb-3">
          <div className="flex items-center justify-between gap-2">
            {/* Home team */}
            <div className="flex flex-col items-center gap-2" style={{ flex: 1 }}>
              <img src={match.home_team?.flag_url} alt={match.home_team?.name}
                style={{ width: 56, height: 56, borderRadius: 10, objectFit: 'cover', border: '1px solid rgba(255,255,255,0.1)' }} />
              <span className="text-white text-[11px] font-bold text-center leading-tight">{match.home_team?.name}</span>
            </div>

            {/* Center: FT + score + prediction */}
            <div className="flex flex-col items-center gap-1 px-1">
              <span className="text-[9px] font-bold tracking-wider px-2 py-0.5 rounded-full border"
                style={{ color: '#00A550', backgroundColor: 'rgba(0,165,80,0.1)', borderColor: 'rgba(0,165,80,0.3)' }}>
                FULL-TIME
              </span>
              <div className="flex items-center gap-2 mt-1">
                <span className="font-display leading-none" style={{ fontSize: 48, color: 'white' }}>{match.home_score}</span>
                <span className="font-display leading-none" style={{ fontSize: 28, color: '#4B5563' }}>-</span>
                <span className="font-display leading-none" style={{ fontSize: 48, color: 'white' }}>{match.away_score}</span>
              </div>
              {(homeScore !== '' && homeScore != null) && (
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="text-gray-600 text-[10px]">Tu pick: {homeScore}–{awayScore}</span>
                  {bonus > 0 && <span className="text-[10px] font-bold text-yellow-400">⚡+{bonus}</span>}
                </div>
              )}
            </div>

            {/* Away team */}
            <div className="flex flex-col items-center gap-2" style={{ flex: 1 }}>
              <img src={match.away_team?.flag_url} alt={match.away_team?.name}
                style={{ width: 56, height: 56, borderRadius: 10, objectFit: 'cover', border: '1px solid rgba(255,255,255,0.1)' }} />
              <span className="text-white text-[11px] font-bold text-center leading-tight">{match.away_team?.name}</span>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-3 sm:gap-5 px-5 py-3">
          <TeamBlock flagUrl={match.home_team?.flag_url} name={match.home_team?.name} code={match.home_team?.code} />
          <div className="shrink-0 flex items-center gap-1 sm:gap-2">
            {locked ? (
              <>
                <ScoreDisplay value={homeScore} />
                <span className="font-display text-2xl sm:text-3xl text-gray-600">—</span>
                <ScoreDisplay value={awayScore} />
              </>
            ) : (
              <>
                <ScoreInput value={homeScore} onChange={v => { setHomeScore(v); setIsDirty(true) }} />
                <span className="font-display text-2xl sm:text-3xl text-gray-600">—</span>
                <ScoreInput value={awayScore} onChange={v => { setAwayScore(v); setIsDirty(true) }} />
              </>
            )}
          </div>
          <TeamBlock flagUrl={match.away_team?.flag_url} name={match.away_team?.name} code={match.away_team?.code} />
        </div>
      )}

      {/* Live score */}
      {isLive && !finished && liveData.homeScore != null && (
        <div className="px-5 pb-2 text-center text-xs text-gray-500">
          En vivo:{' '}
          <span className="font-display text-lg text-green-400">
            {liveData.homeScore}–{liveData.awayScore}
          </span>
          {liveMinute && <span className="ml-1.5 text-green-600 text-xs">{liveMinute}'</span>}
        </div>
      )}

      {/* Goal timeline */}
      {finished && <GoalTimeline goals={match.goals} match={match} />}

      {/* Save button */}
      {!locked && (
        <div className="px-5 pb-4 flex flex-col items-center gap-2 relative">
          {saveError && (
            <p className="text-red-400 text-xs font-semibold text-center">{saveError}</p>
          )}
          <div className="flex items-center justify-center gap-3 w-full relative">
          <AnimatePresence>
            {showToast && (
              <motion.div
                key="toast"
                initial={{ y: 8, opacity: 0, scale: 0.95 }}
                animate={{ y: 0, opacity: 1, scale: 1 }}
                exit={{ y: -6, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="absolute -top-8 left-0 right-0 flex justify-center pointer-events-none z-10"
              >
                <span className="inline-flex items-center gap-1.5 bg-green-900/50 border border-green-500/40 text-green-400 text-xs font-bold px-4 py-1.5 rounded-full">
                  ✓ Predicción guardada
                </span>
              </motion.div>
            )}
          </AnimatePresence>
          <button
            onClick={handleSave}
            disabled={saving || homeScore === '' || awayScore === ''}
            className={`font-bold text-sm px-8 py-2.5 rounded-xl transition-all disabled:opacity-40 active:scale-95 ${
              !isDirty && hasSavedPrediction ? 'bg-green-900/30 text-green-400 border border-green-500/30' : 'text-white'
            }`}
            style={isDirty || !hasSavedPrediction ? { backgroundColor: '#0A1628', color: '#FFD700', border: '1px solid rgba(255,215,0,0.3)', boxShadow: '0 4px 15px rgba(10,22,40,0.6)' } : {}}>
            {saving ? 'Guardando...' : (!isDirty && hasSavedPrediction) ? '✓ Pronóstico guardado' : 'Guardar pronóstico'}
          </button>
          {onDelete && prediction?.home_score != null && (
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="font-bold text-xs px-3 py-2.5 rounded-xl transition-all active:scale-95 disabled:opacity-40"
              style={confirmDelete
                ? { backgroundColor: 'rgba(220,38,38,0.2)', color: '#F87171', border: '1px solid rgba(220,38,38,0.4)' }
                : { backgroundColor: 'rgba(255,255,255,0.05)', color: '#6B7280', border: '1px solid rgba(255,255,255,0.1)' }
              }>
              {deleting ? '...' : confirmDelete ? '¿Confirmar?' : '🗑'}
            </button>
          )}
          </div>
        </div>
      )}

      {/* Goalscorer + picks button */}
      <div className="px-5 pb-5">
        <GoalscorerSelector
          match={match}
          selectedId={goalscorerId}
          onSelect={handleGoalscorerSelect}
          disabled={locked}
        />
        {onViewPicks && (
          <div className="mt-3 pt-3 border-t border-white/10">
            <button
              onClick={e => { e.stopPropagation(); onViewPicks(match) }}
              className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-bold text-white active:scale-95 transition-transform"
              style={{ background: 'rgba(27,79,216,0.18)', border: '1px solid rgba(27,79,216,0.35)' }}>
              <span>👥 Picks del grupo</span>
              <span className="text-xs text-blue-400">Ver →</span>
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
