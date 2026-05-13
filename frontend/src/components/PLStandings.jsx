import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const ANON_KEY     = import.meta.env.VITE_SUPABASE_ANON_KEY

export default function PLStandings() {
  const [rows, setRows]       = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)
  const [season, setSeason]   = useState(null)

  useEffect(() => {
    async function load() {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        const token = session?.access_token ?? ANON_KEY
        const res = await fetch(
          `${SUPABASE_URL}/functions/v1/pl-data?action=standings`,
          { headers: { Authorization: `Bearer ${token}` } }
        )
        const data = await res.json()
        if (data.error) { setError(data.error); setLoading(false); return }
        setRows(data.rows || [])
        setSeason(data.season)
      } catch (e) {
        setError(e.message)
      }
      setLoading(false)
    }
    load()
  }, [])

  if (loading) return (
    <div className="text-center py-16 text-gray-500">Cargando tabla...</div>
  )
  if (error) return (
    <div className="text-center py-16 text-red-400 text-sm">Error: {error}</div>
  )

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-display text-lg text-white tracking-wide">PREMIER LEAGUE</h2>
        {season && (
          <span className="text-gray-600 text-xs">{season}/{(season + 1).toString().slice(2)}</span>
        )}
      </div>

      <div className="rounded-2xl overflow-hidden border border-white/10"
           style={{ background: 'linear-gradient(160deg, #1A1A1A 0%, #161616 100%)' }}>
        {/* Header */}
        <div className="grid text-[10px] font-bold text-gray-600 uppercase tracking-widest px-3 py-2 border-b border-white/10 select-none"
             style={{ gridTemplateColumns: '28px 28px 1fr 30px 30px 30px 30px 30px 30px 36px 36px' }}>
          <span className="text-center">#</span>
          <span />
          <span>Equipo</span>
          <span className="text-center">PJ</span>
          <span className="text-center">PG</span>
          <span className="text-center">PE</span>
          <span className="text-center">PP</span>
          <span className="text-center">GF</span>
          <span className="text-center">GC</span>
          <span className="text-center">DG</span>
          <span className="text-center">Pts</span>
        </div>

        {rows.map((row, idx) => {
          const isChampions   = row.rank <= 4
          const isEuropa      = row.rank === 5
          const isConference  = row.rank === 6
          const isRelegation  = row.rank >= 18

          let rowBg = idx % 2 === 0 ? 'bg-white/[0.015]' : ''
          if (isChampions)  rowBg = 'bg-blue-900/10'
          if (isEuropa)     rowBg = 'bg-orange-900/10'
          if (isConference) rowBg = 'bg-green-900/10'
          if (isRelegation) rowBg = 'bg-red-900/10'

          let rankColor = 'text-gray-500'
          if (isChampions)  rankColor = 'text-blue-400'
          if (isEuropa)     rankColor = 'text-orange-400'
          if (isConference) rankColor = 'text-green-400'
          if (isRelegation) rankColor = 'text-red-400'

          const gdStr = row.goalDiff > 0 ? `+${row.goalDiff}` : String(row.goalDiff)

          return (
            <div
              key={row.teamId}
              className={`grid items-center px-3 py-2.5 border-b border-white/5 last:border-0 ${rowBg}`}
              style={{ gridTemplateColumns: '28px 28px 1fr 30px 30px 30px 30px 30px 30px 36px 36px' }}
            >
              {/* Rank */}
              <span className={`font-display text-base text-center ${rankColor}`}>{row.rank}</span>

              {/* Logo */}
              <div className="flex items-center justify-center">
                <img src={row.logo} alt={row.teamName}
                     style={{ width: 20, height: 20, objectFit: 'contain' }}
                     onError={e => { e.target.style.display = 'none' }} />
              </div>

              {/* Name */}
              <span className="text-white text-xs font-semibold truncate pr-2">{row.teamName}</span>

              {/* Stats */}
              {[row.played, row.won, row.drawn, row.lost, row.goalsFor, row.goalsAgainst].map((v, i) => (
                <span key={i} className="text-gray-400 text-xs text-center font-mono">{v}</span>
              ))}
              <span className={`text-xs text-center font-mono font-bold ${
                row.goalDiff > 0 ? 'text-green-400' : row.goalDiff < 0 ? 'text-red-400' : 'text-gray-500'
              }`}>{gdStr}</span>
              <span className="font-display text-base text-white text-center">{row.points}</span>
            </div>
          )
        })}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 mt-3 px-1">
        {[
          { color: 'bg-blue-400',   label: 'Champions League (top 4)' },
          { color: 'bg-orange-400', label: 'Europa League' },
          { color: 'bg-green-400',  label: 'Conference League' },
          { color: 'bg-red-400',    label: 'Descenso' },
        ].map(({ color, label }) => (
          <div key={label} className="flex items-center gap-1.5">
            <div className={`w-2.5 h-2.5 rounded-full ${color} shrink-0`} />
            <span className="text-[10px] text-gray-600">{label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
