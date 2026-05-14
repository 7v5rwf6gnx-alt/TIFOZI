import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'

const MOMENTS = [
  {
    id: '3pCPQDxZzfY',
    title: 'El Gol de Iniesta',
    subtitle: 'España campeona del Mundo',
    year: '2010',
    country: 'Sudáfrica',
  },
  {
    id: 'lu_0zOUTdPE',
    title: 'El Gol de Götze',
    subtitle: 'Alemania campeona del Mundo',
    year: '2014',
    country: 'Brasil',
  },
  {
    id: '0Y2Z7vCcLec',
    title: 'Grosso y el penal final',
    subtitle: 'Italia campeona del Mundo',
    year: '2006',
    country: 'Alemania',
  },
  {
    id: '6AwCLpeKq9I',
    title: 'La Mano de Dios',
    subtitle: 'Maradona eterno',
    year: '1986',
    country: 'México',
  },
  {
    id: '6PFijv0sFcc',
    title: 'Messi alza la Copa',
    subtitle: 'Argentina campeona del Mundo',
    year: '2022',
    country: 'Qatar',
  },
]

function VideoModal({ videoId, onClose }) {
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-8"
        style={{ backgroundColor: 'rgba(0,0,0,0.92)', backdropFilter: 'blur(8px)' }}>

        <motion.div
          initial={{ scale: 0.88, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.88, opacity: 0 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
          onClick={e => e.stopPropagation()}
          className="relative w-full max-w-4xl rounded-2xl overflow-hidden bg-black"
          style={{ aspectRatio: '16/9', boxShadow: '0 32px 80px rgba(0,0,0,0.8)' }}>

          <iframe
            src={`https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0&modestbranding=1`}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            className="absolute inset-0 w-full h-full"
            title="Video"
          />
        </motion.div>

        <button
          onClick={onClose}
          className="absolute top-4 right-4 w-9 h-9 rounded-full flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 transition-all text-xl font-light"
          aria-label="Cerrar">
          ✕
        </button>
      </motion.div>
    </AnimatePresence>
  )
}

export default function VideoCarousel() {
  const [current,    setCurrent]    = useState(0)
  const [activeId,   setActiveId]   = useState(null)
  const [hovered,    setHovered]    = useState(false)
  const [cardW,      setCardW]      = useState(320)
  const containerRef = useRef(null)
  const GAP = 16

  function getVisible() {
    if (typeof window === 'undefined') return 3
    if (window.innerWidth >= 1024) return 3
    if (window.innerWidth >= 640)  return 2
    return 1
  }

  // Measure card width dynamically
  useEffect(() => {
    function measure() {
      if (!containerRef.current) return
      const v  = getVisible()
      const cw = containerRef.current.offsetWidth
      setCardW((cw - GAP * (v - 1)) / v)
    }
    measure()
    const ro = new ResizeObserver(measure)
    if (containerRef.current) ro.observe(containerRef.current)
    return () => ro.disconnect()
  }, [])

  const maxIdx = MOMENTS.length - getVisible()

  // Auto-advance
  useEffect(() => {
    if (hovered || activeId) return
    const id = setInterval(() => {
      setCurrent(c => (c >= maxIdx ? 0 : c + 1))
    }, 5000)
    return () => clearInterval(id)
  }, [hovered, activeId, maxIdx])

  function prev() { setCurrent(c => Math.max(0, c - 1)) }
  function next() { setCurrent(c => (c >= maxIdx ? 0 : c + 1)) }

  const trackX = -(current * (cardW + GAP))

  return (
    <>
      {activeId && <VideoModal videoId={activeId} onClose={() => setActiveId(null)} />}

      <section className="py-12">
        {/* Header */}
        <div className="max-w-6xl mx-auto px-4 flex items-end justify-between mb-6">
          <div>
            <p className="font-display text-xs tracking-widest text-gray-500 uppercase mb-1">Historia del deporte</p>
            <h2 className="font-display text-4xl sm:text-5xl text-white tracking-wide">MOMENTOS ICÓNICOS</h2>
          </div>
          {/* Arrow buttons */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={prev}
              disabled={current === 0}
              className="w-9 h-9 rounded-xl flex items-center justify-center border transition-all disabled:opacity-20"
              style={{ borderColor: 'rgba(255,255,255,0.12)', backgroundColor: 'rgba(255,255,255,0.05)' }}>
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <button
              onClick={next}
              disabled={current >= maxIdx}
              className="w-9 h-9 rounded-xl flex items-center justify-center border transition-all disabled:opacity-20"
              style={{ borderColor: 'rgba(255,255,255,0.12)', backgroundColor: 'rgba(255,255,255,0.05)' }}>
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>

        {/* Track */}
        <div ref={containerRef} className="max-w-6xl mx-auto px-4 overflow-hidden"
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}>
          <motion.div
            className="flex"
            animate={{ x: trackX }}
            transition={{ type: 'spring', stiffness: 300, damping: 35 }}
            style={{ gap: GAP }}>
            {MOMENTS.map((m, i) => (
              <motion.div
                key={m.id}
                style={{ width: cardW, minWidth: cardW }}
                whileHover={{ y: -6 }}
                transition={{ duration: 0.2 }}
                onClick={() => setActiveId(m.id)}
                className="cursor-pointer rounded-2xl overflow-hidden shrink-0 group"
                style={{ width: cardW, minWidth: cardW }}
              >
                {/* Thumbnail */}
                <div className="relative overflow-hidden" style={{ aspectRatio: '16/9' }}>
                  <img
                    src={`https://img.youtube.com/vi/${m.id}/maxresdefault.jpg`}
                    alt={m.title}
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                    loading="lazy"
                  />
                  {/* Gradient overlay */}
                  <div className="absolute inset-0"
                    style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.15) 50%, transparent 100%)' }} />

                  {/* Play button */}
                  <div className="absolute inset-0 flex items-center justify-center">
                    <motion.div
                      initial={{ scale: 0.9, opacity: 0.7 }}
                      whileHover={{ scale: 1.08, opacity: 1 }}
                      className="w-14 h-14 rounded-full flex items-center justify-center"
                      style={{ backgroundColor: 'rgba(0,0,0,0.6)', border: '2px solid rgba(255,255,255,0.5)', backdropFilter: 'blur(4px)' }}>
                      <svg className="w-5 h-5 text-white ml-0.5" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M8 5v14l11-7z" />
                      </svg>
                    </motion.div>
                  </div>

                  {/* Year badge */}
                  <div className="absolute top-3 left-3">
                    <span className="font-display text-xs font-black px-2.5 py-1 rounded-lg"
                      style={{ backgroundColor: '#0A1628', color: '#FFD700', letterSpacing: '0.08em' }}>
                      {m.year}
                    </span>
                  </div>
                </div>

                {/* Info */}
                <div className="p-3.5" style={{ backgroundColor: '#1A1A1A' }}>
                  <p className="text-white font-black text-sm leading-tight truncate">{m.title}</p>
                  <p className="text-gray-500 text-xs mt-0.5">{m.subtitle} · {m.country}</p>
                </div>
              </motion.div>
            ))}
          </motion.div>
        </div>

        {/* Dot indicators */}
        <div className="flex justify-center gap-1.5 mt-5">
          {Array.from({ length: maxIdx + 1 }).map((_, i) => (
            <button key={i} onClick={() => setCurrent(i)}
              className="rounded-full transition-all"
              style={{
                width: current === i ? 20 : 6,
                height: 6,
                backgroundColor: current === i ? '#1B4FD8' : 'rgba(255,255,255,0.18)',
              }} />
          ))}
        </div>
      </section>
    </>
  )
}
