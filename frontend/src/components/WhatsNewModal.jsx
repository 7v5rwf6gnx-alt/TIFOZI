import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

const VERSION_KEY = 'whats_new_v3'

const FEATURES = [
  {
    icon: '👥',
    title: 'Picks del grupo',
    desc: 'En cada partido de tus pronósticos podés tocar "Picks del grupo" para ver qué apostaron todos los miembros de tu liga, con la distribución de resultados y puntos.',
  },
  {
    icon: '−',
    title: 'Minimizar partidos',
    desc: 'Los partidos terminados tienen un botón − para reducirlos a una fila chica (banderas + marcador). Así encontrás más rápido los próximos partidos.',
  },
  {
    icon: '📅',
    title: 'Filtro por fecha',
    desc: 'En la tab Partidos ahora hay un filtro "Hoy" para ver solo los partidos del día y apostar más rápido sin scrollear por todos los grupos.',
  },
]

export default function WhatsNewModal() {
  const [open, setOpen] = useState(() => {
    try { return !localStorage.getItem(VERSION_KEY) }
    catch { return false }
  })

  function dismiss() {
    try { localStorage.setItem(VERSION_KEY, '1') } catch {}
    setOpen(false)
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center px-4 pb-4 sm:pb-0"
          style={{ backgroundColor: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)' }}
          onClick={dismiss}
        >
          <motion.div
            initial={{ y: 60, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 60, opacity: 0 }}
            transition={{ type: 'spring', damping: 28, stiffness: 320 }}
            className="w-full sm:max-w-md rounded-3xl overflow-hidden"
            style={{ background: '#111', border: '1px solid rgba(255,255,255,0.1)' }}
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="px-6 pt-6 pb-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[11px] font-bold text-blue-400 uppercase tracking-widest mb-1">Novedades</p>
                  <h2 className="font-display text-2xl text-white tracking-wide">POLLAWC26</h2>
                </div>
                <button onClick={dismiss} className="text-gray-600 hover:text-white transition-colors text-xl leading-none">✕</button>
              </div>
            </div>

            {/* Features */}
            <div className="px-6 py-4 space-y-4">
              {FEATURES.map((f, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.1 + i * 0.08 }}
                  className="flex gap-4 items-start"
                >
                  <div className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 text-lg font-bold"
                       style={{ background: 'rgba(27,79,216,0.2)', border: '1px solid rgba(27,79,216,0.3)', color: '#93C5FD' }}>
                    {f.icon}
                  </div>
                  <div>
                    <p className="text-white text-sm font-bold mb-0.5">{f.title}</p>
                    <p className="text-gray-400 text-xs leading-relaxed">{f.desc}</p>
                  </div>
                </motion.div>
              ))}
            </div>

            {/* CTA */}
            <div className="px-6 pb-6 pt-2">
              <button
                onClick={dismiss}
                className="w-full py-3 rounded-2xl font-bold text-sm transition-all active:scale-95"
                style={{ background: '#1B4FD8', color: 'white' }}>
                Entendido
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
