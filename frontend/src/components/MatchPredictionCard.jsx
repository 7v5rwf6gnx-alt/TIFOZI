import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '../lib/supabase'
import { Flag, TeamBlock } from './FlagPair'

export const GROUP_COLORS = {
  A: '#1B4FD8', B: '#E8122D', C: '#00A550', D: '#6B2FA0',
  E: '#F97316', F: '#EC4899', G: '#0891B2', H: '#D97706',
  I: '#7C3AED', J: '#059669', K: '#DC2626', L: '#0369A1',
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
      type="number"
      inputMode="numeric"
      min="0" max="20"
      value={value}
      onChange={e => {
        const v = e.target.value
        if (v === '' || (Number(v) >= 0 && Number(v) <= 20)) onChange(v)
      }}
      className="
        w-14 h-14 sm:w-16 sm:h-16 text-center font-display text-3xl sm:text-4xl text-white
        bg-[#242424] border-2 rounded-xl
        focus:outline-none focus:border-[#1B4FD8] focus:bg-[#2A2A2A]
        active:scale-95 transition-all no-spinners
      "
      style={{ borderColor: '#444' }}
    />
  )
}

// ── Score Display ─────────────────────────────────────────────────────────────
function ScoreDisplay({ value }) {
  const hasValue = value !== '' && value != null
  return (
    <div className="w-14 h-14 sm:w-16 sm:h-16 flex items-center justify-center rounded-xl"
         style={{ backgroundColor: '#1C1C1C', border: '2px solid rgba(255,255,255,0.07)' }}>
      <span className="font-display text-3xl sm:text-4xl" style={{ color: hasValue ? 'white' : '#374151' }}>
        {hasValue ? value : '–'}
      </span>
    </div>
  )
}

// ── Goalscorer Selector ───────────────────────────────────────────────────────
function GoalscorerSelector({ match, selectedId, onSelect, disabled }) {
  const [open, setOpen]         = useState(false)
  const [players, setPlayers]   = useState({ home: [], away: [] })
  const [loading, setLoading]   = useState(false)
  const [fetchError, setFetchError] = useState(false)

  const allPlayers     = [...players.home, ...players.away]
  const selectedPlayer = selectedId ? allPlayers.find(p => p.id === selectedId) : null

  useEffect(() => {
    if (!open) return
    const homeId = match.home_team?.id
    const awayId = match.away_team?.id
    if (!homeId || !awayId) return
    setLoading(true)
    setFetchError(false)

    supabase
      .from('jugadores')
      .select('id, nombre, numero_camiseta, posicion, equipo_id')
      .in('equipo_id', [homeId, awayId])
      .order('numero_camiseta')
      .then(({ data, error }) => {
        if (error) { setFetchError(true); setLoading(false); return }
        const all = data || []
        setPlayers({
          home: all.filter(p => p.equipo_id === homeId),
          away: all.filter(p => p.equipo_id === awayId),
        })
        setLoading(false)
      })
  }, [open, match.home_team?.id, match.away_team?.id])

  function handleSelect(player) { onSelect(player.id); setOpen(false) }
  function handleClear(e)       { e.stopPropagation(); onSelect(null) }

  const hasPlayers  = players.home.length > 0 || players.away.length > 0
  const teamsConfig = [
    { team: match.home_team, list: players.home },
    { team: match.away_team, list: players.away },
  ]

  return (
    <div className="mt-3 pt-3 border-t border-white/10">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-gray-500 font-bold uppercase tracking-wide">
          ⚡ Primer goleador <span className="text-gray-600 font-normal">(+2 pts)</span>
        </span>
        {selectedPlayer && !disabled && (
          <button onClick={handleClear} className="text-xs text-gray-500 hover:text-red-400 transition-colors">
            Quitar
          </button>
        )}
      </div>

      {disabled ? (
        selectedPlayer ? (
          <div className="flex items-center gap-2 bg-yellow-900/20 border border-yellow-500/30 rounded-xl px-3 py-2">
            <span className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-black shrink-0"
                  style={{ backgroundColor: '#FFD700' }}>
              {selectedPlayer.numero_camiseta}
            </span>
            <span className="text-yellow-400 text-xs font-bold truncate">{selectedPlayer.nombre}</span>
          </div>
        ) : (
          <p className="text-gray-600 text-xs">Sin predicción de goleador</p>
        )
      ) : (
        <>
          <button
            onClick={() => setOpen(v => !v)}
            className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl border-2 text-xs transition-all font-semibold ${
              selectedPlayer
                ? 'bg-yellow-900/20 border-yellow-500/40 text-yellow-400'
                : 'bg-[#242424] border-[#444] text-gray-500 hover:border-[#1B4FD8] hover:text-[#1B4FD8]'
            }`}
          >
            <span className="truncate">
              {selectedPlayer
                ? `#${selectedPlayer.numero_camiseta} ${selectedPlayer.nombre}`
                : 'Seleccionar goleador...'}
            </span>
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
                <div className="grid grid-cols-2 divide-x divide-white/5 max-h-64 overflow-y-auto">
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
                          <button key={p.id} onClick={() => handleSelect(p)}
                            className={`w-full flex items-center gap-2 px-3 py-2 text-left transition-all hover:bg-[#1B4FD8]/10 ${
                              selectedId === p.id ? 'bg-yellow-900/20' : ''
                            }`}>
                            <span className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-black shrink-0 text-white"
                                  style={{ backgroundColor: selectedId === p.id ? '#FFD700' : '#333' }}>
                              {p.numero_camiseta}
                            </span>
                            <div className="min-w-0">
                              <p className={`text-xs font-semibold leading-tight truncate ${
                                selectedId === p.id ? 'text-yellow-400' : 'text-gray-200'
                              }`}>{p.nombre}</p>
                              <p className="text-gray-600 text-[10px] capitalize">{p.posicion}</p>
                            </div>
                          </button>
                        ))
                      )}
                    </div>
                  ))}
                </div>
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
      const h = Math.floor(s / 3600)
      const m = Math.floor((s % 3600) / 60)
      const sec = s % 60
      if (h > 0)       setLabel(`${h}h ${String(m).padStart(2,'0')}m`)
      else if (m > 0)  setLabel(`${m}m ${String(sec).padStart(2,'0')}s`)
      else             setLabel(`${sec}s`)
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [match])

  return label
}

// ── Kickoff countdown hook (colored) ─────────────────────────────────────────
function useKickoffCd(match) {
  const [label, setLabel] = useState('')
  const [cdColor, setCdColor] = useState('#9CA3AF')
  const [cdBg, setCdBg] = useState('rgba(255,255,255,0.06)')
  const [cdBorder, setCdBorder] = useState('rgba(255,255,255,0.12)')

  useEffect(() => {
    function tick() {
      const ms = kickoffUtc(match).getTime() - Date.now()
      if (ms <= 0) { setLabel(''); return }
      const totalMins = Math.floor(ms / 60000)
      const s = Math.floor(ms / 1000)
      const h = Math.floor(s / 3600)
      const m = Math.floor((s % 3600) / 60)
      const sec = s % 60

      if (h > 48) setLabel(`${Math.floor(h / 24)}d`)
      else if (h > 0) setLabel(`${h}h ${String(m).padStart(2, '0')}m`)
      else if (m > 0) setLabel(`${m}m ${String(sec).padStart(2, '0')}s`)
      else setLabel(`${sec}s`)

      if (totalMins > 60) {
        setCdColor('#00A550'); setCdBg('rgba(0,165,80,0.1)'); setCdBorder('rgba(0,165,80,0.25)')
      } else if (totalMins > 10) {
        setCdColor('#F97316'); setCdBg('rgba(249,115,22,0.1)'); setCdBorder('rgba(249,115,22,0.25)')
      } else {
        setCdColor('#E8122D'); setCdBg('rgba(232,18,45,0.12)'); setCdBorder('rgba(232,18,45,0.4)')
      }
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [match])

  return { label, cdColor, cdBg, cdBorder }
}

// ── Tension Bar ───────────────────────────────────────────────────────────────
function TensionBar({ stats, homeTeam, awayTeam }) {
  if (!stats || stats.total < 3) return null
  const homeP = Math.round((stats.homeWins / stats.total) * 100)
  const drawP = Math.round((stats.draws / stats.total) * 100)
  const awayP = 100 - homeP - drawP

  return (
    <div className="px-5 py-2 border-t border-white/5">
      <div className="flex items-center justify-between text-[10px] mb-1.5">
        <div className="flex items-center gap-1.5">
          {homeTeam?.flag_url && (
            <img src={homeTeam.flag_url} alt="" className="w-4 h-3 object-cover rounded-sm" />
          )}
          <span className="text-white font-bold">{homeP}%</span>
        </div>
        {drawP > 0 && <span className="text-gray-600 font-bold">{drawP}% X</span>}
        <div className="flex items-center gap-1.5">
          <span className="text-white font-bold">{awayP}%</span>
          {awayTeam?.flag_url && (
            <img src={awayTeam.flag_url} alt="" className="w-4 h-3 object-cover rounded-sm" />
          )}
        </div>
      </div>
      <div className="flex rounded-full overflow-hidden h-1.5 gap-px">
        <motion.div initial={{ width: 0 }} animate={{ width: `${homeP}%` }}
          transition={{ duration: 0.9, ease: 'easeOut' }}
          style={{ backgroundColor: '#1B4FD8', minWidth: homeP > 0 ? 3 : 0 }} />
        {drawP > 0 && (
          <motion.div initial={{ width: 0 }} animate={{ width: `${drawP}%` }}
            transition={{ duration: 0.9, delay: 0.1, ease: 'easeOut' }}
            style={{ backgroundColor: '#4B5563', minWidth: drawP > 0 ? 3 : 0 }} />
        )}
        <motion.div initial={{ width: 0 }} animate={{ width: `${awayP}%` }}
          transition={{ duration: 0.9, delay: 0.2, ease: 'easeOut' }}
          style={{ backgroundColor: '#E8122D', minWidth: awayP > 0 ? 3 : 0 }} />
      </div>
      <p className="text-center text-[10px] text-gray-700 mt-1">{stats.total} pronósticos</p>
    </div>
  )
}

// ── Main Card ─────────────────────────────────────────────────────────────────
export function MatchPredictionCard({ match, prediction, onSave, onSaveGoalscorer, tensionStats = null }) {
  const locked      = isLocked(match)
  const closingSoon = !locked && minsToLock(match) <= 30
  const finished    = match.status === 'finished'
  const [homeScore, setHomeScore] = useState(prediction?.home_score ?? '')
  const [awayScore, setAwayScore] = useState(prediction?.away_score ?? '')
  const [saving, setSaving]       = useState(false)
  const [saved, setSaved]         = useState(false)
  const [shake, setShake]         = useState(false)
  const [showToast, setShowToast] = useState(false)
  const countdown = useLiveCountdown(match)
  const { label: cdLabel, cdColor, cdBg, cdBorder } = useKickoffCd(match)

  function triggerShake() {
    setShake(true)
    setTimeout(() => setShake(false), 420)
  }

  const isPL             = match.competition === 'premier_league'
  const pts              = prediction?.points_earned
  const bonus            = prediction?.bonus_goleador
  const goalscorerPredId = prediction?.primer_goleador_prediccion_id
  const groupColor       = isPL ? '#9B59D0' : (GROUP_COLORS[match.group?.name] ?? '#1B4FD8')

  async function handleSave() {
    if (homeScore === '' || awayScore === '') return
    setSaving(true)
    await onSave(match.id, parseInt(homeScore), parseInt(awayScore))
    setSaving(false)
    setSaved(true)
    setShowToast(true)
    setTimeout(() => setSaved(false), 2000)
    setTimeout(() => setShowToast(false), 2500)
  }

  const pointsLabel = finished && pts != null
    ? pts === 3 ? '3 pts' : pts === 1 ? '1 pt' : '0 pts'
    : null

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

  return (
    <div
      onClick={locked && !finished ? triggerShake : undefined}
      className={`overflow-hidden rounded-2xl transition-all duration-200 ${
        !locked ? 'hover:shadow-[0_8px_40px_rgba(0,0,0,0.7)] hover:-translate-y-0.5' : ''
      } ${locked && !finished ? 'cursor-not-allowed opacity-80' : ''} ${shake ? 'animate-shake' : ''}`}
      style={{
        background: 'linear-gradient(160deg, #1E1E1E 0%, #181818 100%)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderLeft: `4px solid ${finished ? '#00A550' : groupColor}`,
        boxShadow: `0 2px 12px rgba(0,0,0,0.5), inset 3px 0 20px ${groupColor}18`,
      }}
    >
      {/* Closing-soon warning with live countdown */}
      {closingSoon && countdown && (
        <div className="px-5 py-2 flex items-center justify-center gap-2"
             style={{ backgroundColor: 'rgba(217,119,6,0.12)', borderBottom: '1px solid rgba(217,119,6,0.25)' }}>
          <span className="blink-dot w-1.5 h-1.5 rounded-full bg-amber-400 inline-block" />
          <span className="text-amber-400 text-xs font-bold">
            Cierra en {countdown}
          </span>
        </div>
      )}

      {/* Meta row */}
      <div className="px-5 pt-3.5 pb-0 flex items-center justify-between">
        <div className="flex items-center gap-2 flex-wrap">
          {isPL ? (
            <span className="font-display text-sm tracking-wider" style={{ color: groupColor }}>PREMIER LEAGUE</span>
          ) : (
            <>
              <span className="text-gray-600 text-xs font-mono">#{match.match_number}</span>
              <span className="text-gray-700">·</span>
              <span className="font-display text-sm tracking-wider" style={{ color: groupColor }}>
                GRUPO {match.group?.name}
              </span>
            </>
          )}
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
          {match.status === 'live' && (
            <span className="flex items-center gap-1 text-xs font-bold text-green-400 bg-green-900/30 px-2 py-0.5 rounded-full border border-green-500/30">
              <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse inline-block" />
              EN VIVO
            </span>
          )}
          {!locked && !finished && cdLabel && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border"
                  style={{ color: cdColor, backgroundColor: cdBg, borderColor: cdBorder }}>
              {cdLabel}
            </span>
          )}
        </div>
      </div>

      {/* Teams + scores */}
      <div className="flex items-center gap-3 sm:gap-5 px-5 py-5">
        <TeamBlock
          flagUrl={match.home_team?.flag_url}
          name={match.home_team?.name}
          code={match.home_team?.code}
        />

        <div className="shrink-0 flex items-center gap-1 sm:gap-2">
          {locked ? (
            <>
              <ScoreDisplay value={homeScore} />
              <span className="font-display text-2xl sm:text-3xl text-gray-600">—</span>
              <ScoreDisplay value={awayScore} />
            </>
          ) : (
            <>
              <ScoreInput value={homeScore} onChange={setHomeScore} />
              <span className="font-display text-2xl sm:text-3xl text-gray-600">—</span>
              <ScoreInput value={awayScore} onChange={setAwayScore} />
            </>
          )}
        </div>

        <TeamBlock
          flagUrl={match.away_team?.flag_url}
          name={match.away_team?.name}
          code={match.away_team?.code}
        />
      </div>

      {/* Actual result */}
      {finished && (
        <div className="px-5 pb-2 text-center text-xs text-gray-500">
          Resultado real:{' '}
          <span className="font-display text-lg text-gray-300">
            {match.home_score}–{match.away_score}
          </span>
        </div>
      )}

      {/* Tension bar */}
      <TensionBar stats={tensionStats} homeTeam={match.home_team} awayTeam={match.away_team} />

      {/* Save button */}
      {!locked && (
        <div className="px-5 pb-4 flex justify-center relative">
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
              saved
                ? 'bg-green-900/30 text-green-400 border border-green-500/30 animate-count-flash'
                : 'text-white'
            }`}
            style={!saved ? { backgroundColor: '#0A1628', color: '#FFD700', border: '1px solid rgba(255,215,0,0.3)', boxShadow: '0 4px 15px rgba(10,22,40,0.6)' } : {}}
          >
            {saving ? 'Guardando...' : saved ? '✓ Guardado' : 'Guardar pronóstico'}
          </button>
        </div>
      )}

      {/* Goalscorer */}
      <div className="px-5 pb-5">
        <GoalscorerSelector
          match={match}
          selectedId={goalscorerPredId}
          onSelect={playerId => onSaveGoalscorer(match.id, playerId)}
          disabled={locked}
        />
      </div>
    </div>
  )
}
