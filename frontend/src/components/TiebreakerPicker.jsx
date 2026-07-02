import { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Flag } from './FlagPair'

const DEADLINE_UTC = new Date('2026-07-04T16:50:00Z') // sábado 4 jul 11:50 AM Panamá (UTC-5)

function useCountdown(target) {
  const [label, setLabel] = useState('')
  useEffect(() => {
    function tick() {
      const ms = target.getTime() - Date.now()
      if (ms <= 0) { setLabel('CERRADO'); return }
      const s = Math.floor(ms / 1000)
      const d = Math.floor(s / 86400)
      const h = Math.floor((s % 86400) / 3600)
      const m = Math.floor((s % 3600) / 60)
      if (d > 0)      setLabel(`${d}d ${h}h ${m}m`)
      else if (h > 0) setLabel(`${h}h ${m}m`)
      else            setLabel(`${m}m`)
    }
    tick(); const id = setInterval(tick, 30_000); return () => clearInterval(id)
  }, [target])
  return label
}

function TeamOption({ team, selected, onClick, disabled }) {
  return (
    <button type="button" disabled={disabled} onClick={onClick}
      className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all border ${
        selected
          ? 'text-white'
          : disabled
            ? 'bg-white/[0.02] border-white/5 text-gray-700 opacity-40 cursor-not-allowed'
            : 'bg-white/5 border-white/10 text-gray-300 hover:border-white/25'
      }`}
      style={selected ? { backgroundColor: 'rgba(255,215,0,0.15)', borderColor: 'rgba(255,215,0,0.5)', color: '#FCD34D' } : {}}>
      <Flag src={team.flag_url} size={16} />
      <span className="truncate max-w-[92px]">{team.name}</span>
    </button>
  )
}

export default function TiebreakerPicker() {
  const { user } = useAuth()
  const [teams, setTeams]                 = useState([])
  const [pick, setPick]                   = useState({ campeon: null, subcampeon: null, tercer: null })
  const [savedPick, setSavedPick]         = useState({ campeon: null, subcampeon: null, tercer: null })
  const [loading, setLoading]             = useState(true)
  const [saving, setSaving]               = useState(false)
  const [saveError, setSaveError]         = useState(null)
  const [showToast, setShowToast]         = useState(false)
  const [collapsed, setCollapsed]         = useState(false)
  const cdLabel = useCountdown(DEADLINE_UTC)
  const closed  = Date.now() >= DEADLINE_UTC.getTime()

  useEffect(() => {
    if (!user) return
    async function load() {
      const [{ data: matchData }, { data: pickData }] = await Promise.all([
        supabase.from('matches')
          .select('winner_team_id, winner:winner_team_id(id, name, flag_url)')
          .eq('stage', 'round_of_32'),
        supabase.from('tiebreaker_picks')
          .select('campeon_team_id, subcampeon_team_id, tercer_team_id')
          .eq('user_id', user.id)
          .maybeSingle(),
      ])
      const winners = (matchData || []).map(m => m.winner).filter(Boolean)
      const uniq    = Array.from(new Map(winners.map(w => [w.id, w])).values())
      uniq.sort((a, b) => a.name.localeCompare(b.name))
      setTeams(uniq)

      if (pickData) {
        const p = { campeon: pickData.campeon_team_id, subcampeon: pickData.subcampeon_team_id, tercer: pickData.tercer_team_id }
        setPick(p); setSavedPick(p)
      }
      setLoading(false)
    }
    load()
  }, [user])

  const isDirty = useMemo(() =>
    pick.campeon    !== savedPick.campeon    ||
    pick.subcampeon !== savedPick.subcampeon ||
    pick.tercer     !== savedPick.tercer,
    [pick, savedPick])

  function selectSlot(slot, teamId) {
    setPick(prev => {
      const next = { ...prev }
      // If team already selected in another slot, swap
      for (const k of ['campeon', 'subcampeon', 'tercer']) {
        if (next[k] === teamId && k !== slot) next[k] = prev[slot]
      }
      next[slot] = teamId
      return next
    })
  }

  async function handleSave() {
    if (!pick.campeon || !pick.subcampeon || !pick.tercer) {
      setSaveError('Elegí los 3 equipos'); return
    }
    setSaving(true); setSaveError(null)
    const { error } = await supabase.from('tiebreaker_picks').upsert({
      user_id: user.id,
      campeon_team_id: pick.campeon,
      subcampeon_team_id: pick.subcampeon,
      tercer_team_id: pick.tercer,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' })
    setSaving(false)
    if (error) { setSaveError(error.message); return }
    setSavedPick({ ...pick })
    setShowToast(true)
    setTimeout(() => setShowToast(false), 2500)
  }

  if (!user) return null
  if (loading) {
    return (
      <div className="max-w-3xl mx-auto px-4 pt-6">
        <div className="skeleton h-48 rounded-2xl" />
      </div>
    )
  }
  if (teams.length === 0) return null

  const remaining = 16 - teams.length
  const hasSaved  = !!savedPick.campeon

  const slots = [
    { key: 'campeon',    label: 'Campeón',     medal: '🥇', color: '#FFD700' },
    { key: 'subcampeon', label: 'Subcampeón',  medal: '🥈', color: '#9CA3AF' },
    { key: 'tercer',     label: '3er lugar',   medal: '🥉', color: '#CD7F32' },
  ]

  return (
    <section className="max-w-3xl mx-auto px-4 pt-6">
      <div className="rounded-2xl overflow-hidden border"
           style={{ background: 'linear-gradient(160deg, #1A1A1A 0%, #141414 100%)',
                    borderColor: 'rgba(255,215,0,0.25)',
                    boxShadow: '0 4px 24px rgba(255,215,0,0.06)' }}>

        {/* Header */}
        <button type="button" onClick={() => setCollapsed(v => !v)}
          className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-white/[0.02] transition-colors">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                 style={{ background: 'rgba(255,215,0,0.15)', border: '1px solid rgba(255,215,0,0.3)' }}>
              <span style={{ fontSize: 20 }}>🏆</span>
            </div>
            <div className="min-w-0">
              <p className="text-white font-black text-sm">Desempate del Mundial</p>
              <p className="text-gray-500 text-xs mt-0.5 truncate">
                {closed
                  ? 'Cerrado'
                  : hasSaved
                    ? <>Guardado · Cierra en <span className="text-amber-400 font-bold">{cdLabel}</span></>
                    : <>Cierra en <span className="text-amber-400 font-bold">{cdLabel}</span></>
                }
              </p>
            </div>
          </div>
          <span className="text-gray-500 text-xs shrink-0 ml-2">{collapsed ? '▼' : '▲'}</span>
        </button>

        {!collapsed && (
          <div className="px-5 pb-5 space-y-4">
            <p className="text-gray-400 text-xs leading-relaxed">
              Elegí quién va a ganar el Mundial, el subcampeón y el tercer lugar. <span className="text-white font-semibold">Solo se usa como desempate</span> si dos o más jugadores empatan en puntos peleando por los primeros puestos.
              <span className="block mt-1.5 text-gray-500">
                Orden: primero se compara el Campeón, si siguen empatados el Subcampeón, y por último el 3er lugar.
              </span>
              {remaining > 0 && (
                <span className="block mt-1.5 text-amber-400">
                  Faltan {remaining} equipo{remaining !== 1 ? 's' : ''} por definir en 16avos — los que ganen se agregan acá automático.
                </span>
              )}
            </p>

            {slots.map(({ key, label, medal, color }) => (
              <div key={key}>
                <p className="text-[11px] font-bold uppercase tracking-widest text-gray-500 mb-2 flex items-center gap-1.5">
                  <span>{medal}</span>
                  <span style={{ color }}>{label}</span>
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {teams.map(team => {
                    const selected = pick[key] === team.id
                    const usedInOther = ['campeon', 'subcampeon', 'tercer'].some(k => k !== key && pick[k] === team.id)
                    return (
                      <TeamOption key={team.id} team={team}
                        selected={selected}
                        disabled={closed || (usedInOther && !selected)}
                        onClick={() => !closed && selectSlot(key, team.id)} />
                    )
                  })}
                </div>
              </div>
            ))}

            {saveError && (
              <p className="text-red-400 text-xs font-semibold">{saveError}</p>
            )}

            {!closed && (
              <div className="flex items-center gap-3 pt-1 relative">
                <AnimatePresence>
                  {showToast && (
                    <motion.div key="toast"
                      initial={{ y: 8, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -6, opacity: 0 }}
                      className="absolute -top-7 left-0 right-0 flex justify-center pointer-events-none">
                      <span className="inline-flex items-center gap-1.5 bg-green-900/50 border border-green-500/40 text-green-400 text-xs font-bold px-3 py-1 rounded-full">
                        ✓ Guardado
                      </span>
                    </motion.div>
                  )}
                </AnimatePresence>
                <button type="button" onClick={handleSave}
                  disabled={saving || !isDirty}
                  className="font-bold text-sm px-5 py-2 rounded-xl transition-all disabled:opacity-40 active:scale-95"
                  style={{ backgroundColor: '#0A1628', color: '#FFD700', border: '1px solid rgba(255,215,0,0.35)' }}>
                  {saving ? 'Guardando...' : hasSaved ? 'Actualizar' : 'Guardar desempate'}
                </button>
                {hasSaved && !isDirty && <span className="text-xs text-gray-600">✓ Tus picks están guardados</span>}
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  )
}
