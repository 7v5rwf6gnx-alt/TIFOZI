import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '../lib/supabase'
import { isLocked } from './MatchPredictionCard'
import { AvatarDisplay } from './AvatarDisplay'

export default function LigaPicksModal({ match, ligaId, userId, onClose }) {
  const [rows, setRows]       = useState([])
  const [loading, setLoading] = useState(true)
  const hi = url => url?.replace(/\/w\d+\//, '/w80/') ?? ''
  const locked   = isLocked(match)
  const finished = match.status === 'finished'

  useEffect(() => {
    async function load() {
      const { data: members } = await supabase
        .from('liga_miembros').select('usuario_id').eq('liga_id', ligaId)
      const ids = (members ?? []).map(m => m.usuario_id)
      if (!ids.length) { setLoading(false); return }

      const [{ data: preds }, { data: profiles }] = await Promise.all([
        supabase.from('predictions')
          .select('user_id, home_score, away_score, points_earned, bonus_goleador, primer_goleador_prediccion_id')
          .eq('match_id', match.id).in('user_id', ids),
        supabase.from('profiles').select('id, username, avatar_url').in('id', ids),
      ])

      const profileMap = Object.fromEntries((profiles ?? []).map(p => [p.id, p]))
      const predMap    = Object.fromEntries((preds ?? []).map(p => [p.user_id, p]))

      const scorerIds = [...new Set((preds ?? []).map(p => p.primer_goleador_prediccion_id).filter(Boolean))]
      let scorerMap = {}
      if (scorerIds.length) {
        const { data: scorers } = await supabase.from('jugadores').select('id, nombre').in('id', scorerIds)
        scorerMap = Object.fromEntries((scorers ?? []).map(s => [s.id, s.nombre]))
      }

      const result = ids.map(id => {
        const prof = profileMap[id] || {}
        const pred = predMap[id]
        return {
          userId: id,
          username: prof.username,
          avatarUrl: prof.avatar_url,
          pred,
          scorerName: pred?.primer_goleador_prediccion_id ? scorerMap[pred.primer_goleador_prediccion_id] : null,
        }
      }).sort((a, b) => {
        const totalA = (a.pred?.points_earned ?? -1) + (a.pred?.bonus_goleador ?? 0)
        const totalB = (b.pred?.points_earned ?? -1) + (b.pred?.bonus_goleador ?? 0)
        return totalB - totalA
      })

      setRows(result)
      setLoading(false)
    }
    if (locked) load()
    else setLoading(false)
  }, [match.id, ligaId, locked])

  const picks    = rows.filter(r => r.pred?.home_score != null)
  const total    = picks.length || 1
  const homeW    = picks.filter(r => r.pred.home_score > r.pred.away_score).length
  const draws    = picks.filter(r => r.pred.home_score === r.pred.away_score).length
  const awayW    = picks.filter(r => r.pred.home_score < r.pred.away_score).length
  const scoreCounts = picks.reduce((acc, r) => {
    const k = `${r.pred.home_score}-${r.pred.away_score}`
    acc[k] = (acc[k] || 0) + 1
    return acc
  }, {})
  const topScore = Object.entries(scoreCounts).sort((a, b) => b[1] - a[1])[0]

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
        style={{ backgroundColor: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)' }}
        onClick={onClose}
      >
        <motion.div
          initial={{ y: 80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 80, opacity: 0 }}
          transition={{ type: 'spring', damping: 26, stiffness: 300 }}
          className="w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl overflow-hidden"
          style={{ background: '#111', border: '1px solid rgba(255,255,255,0.08)', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center gap-3 px-5 pt-5 pb-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <img src={hi(match.home_team?.flag_url)} style={{ width: 32, height: 32, borderRadius: 6, objectFit: 'cover' }} />
            <div className="flex-1 min-w-0">
              <p className="text-white text-sm font-bold truncate">{match.home_team?.name} vs {match.away_team?.name}</p>
              {finished
                ? <p className="text-gray-500 text-xs">Resultado: <span className="text-white font-bold">{match.home_score}-{match.away_score}</span> {topScore && `· Pick popular: ${topScore[0]}`}</p>
                : <p className="text-gray-500 text-xs">Picks ocultos hasta el cierre del partido</p>
              }
            </div>
            <img src={hi(match.away_team?.flag_url)} style={{ width: 32, height: 32, borderRadius: 6, objectFit: 'cover' }} />
            <button onClick={onClose} className="text-gray-500 hover:text-white ml-1 shrink-0 text-lg leading-none">✕</button>
          </div>

          {/* Stats bar */}
          {locked && picks.length > 0 && (
            <div className="px-5 py-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <div className="flex rounded-lg overflow-hidden h-2 gap-px">
                {homeW > 0 && <div style={{ flex: homeW, background: '#1B4FD8' }} />}
                {draws > 0  && <div style={{ flex: draws,  background: '#6B7280' }} />}
                {awayW > 0  && <div style={{ flex: awayW,  background: '#E8122D' }} />}
              </div>
              <div className="flex justify-between mt-1.5">
                <span className="text-[11px] text-blue-400">{Math.round(homeW / total * 100)}% local</span>
                <span className="text-[11px] text-gray-400">{Math.round(draws / total * 100)}% empate</span>
                <span className="text-[11px] text-red-400">{Math.round(awayW / total * 100)}% visitante</span>
              </div>
            </div>
          )}

          {/* List */}
          <div className="overflow-y-auto flex-1 py-2">
            {!locked ? (
              <p className="text-center text-gray-500 text-sm py-10">Los picks se revelan cuando cierre el partido</p>
            ) : loading ? (
              <div className="flex items-center justify-center py-10">
                <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
              </div>
            ) : rows.map((row, i) => {
              const isMe = row.userId === userId
              const pred = row.pred
              const pts  = (pred?.points_earned ?? 0) + (pred?.bonus_goleador ?? 0)
              return (
                <div key={row.userId}
                  className="flex items-center gap-3 px-5 py-2.5"
                  style={{ background: isMe ? 'rgba(27,79,216,0.08)' : i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)' }}
                >
                  <AvatarDisplay avatarUrl={row.avatarUrl} username={row.username} size={28} />
                  <span className={`text-xs font-semibold truncate min-w-0 flex-1 ${isMe ? 'text-blue-400' : 'text-white'}`}>{row.username}</span>
                  {!pred || pred.home_score == null ? (
                    <span className="text-gray-600 text-xs">Sin pick</span>
                  ) : (
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`font-display text-base px-2 py-0.5 rounded-lg ${
                        !finished ? 'text-white bg-white/8' :
                        pred.points_earned === 3 ? 'text-green-400 bg-green-900/40' :
                        pred.points_earned >= 1  ? 'text-yellow-400 bg-yellow-900/40' :
                        'text-red-400 bg-red-900/40'
                      }`}>{pred.home_score}-{pred.away_score}</span>
                      {row.scorerName && (
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-md truncate max-w-[72px] ${pred.bonus_goleador > 0 ? 'text-green-400 bg-green-900/30' : 'text-gray-500 bg-white/5'}`}>
                          {row.scorerName.split(' ')[0]}
                        </span>
                      )}
                      {finished && <span className="text-[11px] font-bold text-gray-400 w-8 text-right">{pts}pt</span>}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
