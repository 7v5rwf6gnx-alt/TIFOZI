import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { AvatarDisplay } from '../components/AvatarDisplay'
import { Flag } from '../components/FlagPair'

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────
const KICKOFF_UTC = new Date('2026-06-11T19:00:00Z')
const WC_LOGO    = 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e5/2026_FIFA_World_Cup_emblem_%28without_trophy%29.svg/500px-2026_FIFA_World_Cup_emblem_%28without_trophy%29.svg.png'
const NEWS_URL        = 'https://api.rss2json.com/v1/api.json?rss_url=https%3A%2F%2Fwww.espn.com%2Fespn%2Frss%2Fsoccer%2Fnews&count=8'

const GROUP_COLORS = {
  A:'#1B4FD8',B:'#E8122D',C:'#00A550',D:'#1B4FD8',
  E:'#F97316',F:'#EC4899',G:'#0891B2',H:'#D97706',
  I:'#2563EB',J:'#059669',K:'#DC2626',L:'#0369A1',
}
const MEDALS = ['👑','🥈','🥉']

// ─────────────────────────────────────────────────────────────────────────────
// SMALL HELPERS
// ─────────────────────────────────────────────────────────────────────────────
function matchKickoff(match) {
  const d = match.match_date?.slice(0, 10)
  if (!d) return new Date(0)
  if (match.match_time) {
    const [h, m] = match.match_time.split(':').map(Number)
    return new Date(`${d}T${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:00-05:00`)
  }
  return new Date(`${d}T00:00:00Z`)
}

function fmtTime(t) {
  if (!t) return ''
  const [h, m] = t.split(':').map(Number)
  return `${h % 12 || 12}:${String(m).padStart(2,'0')} ${h >= 12 ? 'PM' : 'AM'}`
}

function fmtMatchDay(match) {
  const d = match.match_date?.slice(0, 10)
  if (!d) return ''
  const date = new Date(d + 'T12:00:00')
  const today = new Date()
  const tmw   = new Date(); tmw.setDate(tmw.getDate() + 1)
  if (date.toDateString() === today.toDateString()) return 'HOY'
  if (date.toDateString() === tmw.toDateString())   return 'MAÑANA'
  return date.toLocaleDateString('es-AR', { weekday: 'short', day:'numeric', month:'short' }).toUpperCase()
}

function timeAgo(str) {
  const ms = Date.now() - new Date(str)
  const h  = Math.floor(ms / 3600000)
  const d  = Math.floor(ms / 86400000)
  if (h < 1)  return 'Ahora'
  if (h < 24) return `Hace ${h}h`
  return `Hace ${d}d`
}

// ─────────────────────────────────────────────────────────────────────────────
// HOOKS
// ─────────────────────────────────────────────────────────────────────────────
function useGlobalCd() {
  const [cd, setCd] = useState({ days:0, hours:0, minutes:0, seconds:0, started:false })
  useEffect(() => {
    function tick() {
      const ms = Math.max(0, KICKOFF_UTC - Date.now())
      const s  = Math.floor(ms / 1000)
      setCd({ days:Math.floor(s/86400), hours:Math.floor((s%86400)/3600),
              minutes:Math.floor((s%3600)/60), seconds:s%60, started:ms<=0 })
    }
    tick(); const id = setInterval(tick, 1000); return () => clearInterval(id)
  }, [])
  return cd
}

function useMatchCd(match) {
  const [label, setLabel] = useState('')
  useEffect(() => {
    const ko = matchKickoff(match)
    function tick() {
      const ms = ko - Date.now()
      if (ms <= 0) { setLabel('EN VIVO'); return }
      const s = Math.floor(ms/1000), h = Math.floor(s/3600), m = Math.floor((s%3600)/60), sec = s%60
      if (h > 24)    setLabel(`${Math.floor(h/24)}d ${h%24}h`)
      else if (h > 0) setLabel(`${h}h ${String(m).padStart(2,'0')}m`)
      else if (m > 0) setLabel(`${m}m ${String(sec).padStart(2,'0')}s`)
      else            setLabel(`${sec}s`)
    }
    tick(); const id = setInterval(tick, 1000); return () => clearInterval(id)
  }, [match])
  return label
}

function useCountUp(target, trigger) {
  const [count, setCount] = useState(0)
  useEffect(() => {
    if (!trigger) return
    if (target === 0) { setCount(0); return }
    const steps = 50, inc = target / steps
    let cur = 0
    const id = setInterval(() => {
      cur += inc
      if (cur >= target) { setCount(target); clearInterval(id) } else setCount(Math.floor(cur))
    }, 1200 / steps)
    return () => clearInterval(id)
  }, [target, trigger])
  return count
}

function useScrollReveal(threshold = 0.15) {
  const ref    = useRef(null)
  const [vis, setVis] = useState(false)
  useEffect(() => {
    const el = ref.current; if (!el) return
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setVis(true); obs.disconnect() } }, { threshold })
    obs.observe(el); return () => obs.disconnect()
  }, [threshold])
  return [ref, vis]
}

// ─────────────────────────────────────────────────────────────────────────────
// SCROLL-REVEAL WRAPPER
// ─────────────────────────────────────────────────────────────────────────────
function FadeIn({ children, delay = 0, y = 40, className = '' }) {
  const [ref, vis] = useScrollReveal(0.12)
  return (
    <motion.div ref={ref} className={className}
      initial={{ opacity:0, y }}
      animate={vis ? { opacity:1, y:0 } : {}}
      transition={{ duration:0.65, delay, ease:[0.25,0.46,0.45,0.94] }}>
      {children}
    </motion.div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// FOOTBALL PARTICLES
// ─────────────────────────────────────────────────────────────────────────────
const BALLS = Array.from({ length: 20 }, (_, i) => ({
  id: i,
  left: `${(i * 5.1 + 2) % 100}%`,
  size: 14 + (i % 4) * 6,
  delay: (i * 0.65) % 10,
  dur:   16 + (i % 5) * 3,
  opacity: 0.03 + (i % 4) * 0.025,
}))

function FootballParticles() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none select-none" aria-hidden="true">
      {BALLS.map(b => (
        <div key={b.id} className="absolute ball-float"
          style={{ left:b.left, bottom:'-8%', fontSize:b.size, opacity:b.opacity,
                   animationDuration:`${b.dur}s`, animationDelay:`${b.delay}s` }}>
          ⚽
        </div>
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// COUNTDOWN BOX
// ─────────────────────────────────────────────────────────────────────────────
function CdBox({ value, label }) {
  return (
    <div className="flex flex-col items-center">
      <div className="bg-white/10 border border-white/20 rounded-2xl w-[66px] sm:w-[80px] py-3 text-center backdrop-blur-sm">
        <span className="font-display text-4xl sm:text-5xl text-white leading-none tabular-nums">
          {String(value).padStart(2,'0')}
        </span>
      </div>
      <span className="text-white/35 text-[10px] font-bold tracking-widest uppercase mt-2">{label}</span>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION DIVIDER
// ─────────────────────────────────────────────────────────────────────────────
function Divider({ from = '#0D1B4B', to = '#111111', h = 56 }) {
  return <div style={{ height:h, background:`linear-gradient(to bottom, ${from}, ${to})` }} />
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. HERO — GUEST
// ─────────────────────────────────────────────────────────────────────────────
function HeroGuest() {
  const { days, hours, minutes, seconds, started } = useGlobalCd()

  return (
    <section className="relative overflow-hidden h-[70vh] sm:h-screen flex flex-col justify-center py-16 px-4 text-center">
      <div className="relative z-10 max-w-4xl mx-auto w-full">
        <motion.div initial={{ opacity:0, scale:0.8 }} animate={{ opacity:1, scale:1 }}
          transition={{ duration:0.7, ease:'backOut' }} className="flex justify-center mb-6">
          <img src={WC_LOGO} alt="FIFA World Cup 2026" className="h-20 sm:h-28 object-contain drop-shadow-2xl" />
        </motion.div>

        <motion.div initial={{ opacity:0, y:10 }} animate={{ opacity:1, y:0 }}
          transition={{ delay:0.2 }} className="flex justify-center mb-6">
          <div className="inline-flex items-center gap-2 bg-white/10 border border-white/20 rounded-full px-4 py-1.5">
            <span className="w-2 h-2 bg-[#FFD700] rounded-full animate-pulse" />
            <span className="text-white/80 text-xs font-bold tracking-widest uppercase">USA · Canada · México 2026</span>
          </div>
        </motion.div>

        <motion.div initial={{ opacity:0, y:30 }} animate={{ opacity:1, y:0 }}
          transition={{ delay:0.35, duration:0.7 }}>
          <h1 className="font-display font-black text-7xl sm:text-[10rem] leading-none tracking-widest mb-10"
              style={{ color:'#FFD700', textShadow:'0 2px 32px rgba(0,0,0,0.8)' }}>POLLAWC26</h1>
        </motion.div>

        <motion.div initial={{ opacity:0, y:20 }} animate={{ opacity:1, y:0 }}
          transition={{ delay:0.55 }} className="mb-10">
          {started ? (
            <p className="font-display text-3xl text-green-400 tracking-widest animate-pulse">¡EL MUNDIAL YA COMENZÓ!</p>
          ) : (
            <>
              <p className="text-white/35 text-xs font-bold tracking-widest uppercase mb-5">
                Primer partido · 11 jun · 2:00 PM Panamá
              </p>
              <div className="flex justify-center items-start gap-2 sm:gap-3">
                <CdBox value={days}    label="Días"  />
                <span className="font-display text-3xl text-white/15 mt-4">:</span>
                <CdBox value={hours}   label="Horas" />
                <span className="font-display text-3xl text-white/15 mt-4">:</span>
                <CdBox value={minutes} label="Min"   />
                <span className="font-display text-3xl text-white/15 mt-4">:</span>
                <CdBox value={seconds} label="Seg"   />
              </div>
            </>
          )}
        </motion.div>

        <motion.div initial={{ opacity:0, y:20 }} animate={{ opacity:1, y:0 }}
          transition={{ delay:0.7 }}
          className="flex flex-wrap justify-center gap-4">
          <Link to="/auth"
            className="font-display font-black text-lg px-10 py-4 rounded-2xl tracking-wide text-[#111] active:scale-95 transition-all"
            style={{ backgroundColor:'#FFD700', boxShadow:'0 0 40px rgba(255,215,0,0.3)' }}>
            CREAR CUENTA →
          </Link>
          <Link to="/auth"
            className="font-bold text-base px-10 py-4 rounded-2xl bg-white/10 border border-white/20 text-white hover:bg-white/15 transition-all">
            Iniciar sesión
          </Link>
        </motion.div>
      </div>
    </section>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. HERO — LOGGED IN
// ─────────────────────────────────────────────────────────────────────────────
function HeroUser({ profile, stats }) {
  const { totalPoints, predictionCount, leagueCount, globalRank } = stats

  return (
    <section className="relative overflow-hidden h-[50vh] sm:h-[65vh] flex items-center px-4">
      <div className="relative z-10 max-w-5xl mx-auto w-full">
        <motion.div initial={{ opacity:0, y:20 }} animate={{ opacity:1, y:0 }}
          transition={{ duration:0.55 }}
          className="flex flex-col sm:flex-row items-center gap-6 sm:gap-10">

          {/* Avatar */}
          <motion.div initial={{ scale:0.7, opacity:0 }} animate={{ scale:1, opacity:1 }}
            transition={{ duration:0.5, ease:'backOut' }}
            className="glow-pulse rounded-full shrink-0">
            <AvatarDisplay avatarUrl={profile?.avatar_url} username={profile?.username}
              size={88} rank={globalRank && globalRank <= 3 ? globalRank : null} />
          </motion.div>

          {/* Text + stats */}
          <div className="text-center sm:text-left flex-1 min-w-0">
            <p className="text-white/40 text-xs font-bold tracking-widest uppercase mb-1">Bienvenido de vuelta</p>
            <h1 className="font-display text-3xl sm:text-5xl text-white tracking-wide mb-5 truncate">
              ¡HOLA, {(profile?.username || 'CAMPEÓN').toUpperCase()}!
            </h1>

            <div className="flex flex-wrap justify-center sm:justify-start gap-3">
              {[
                { val: totalPoints,     label:'Puntos',      color:'#FFD700' },
                { val: predictionCount, label:'Pronósticos', color:'#1B4FD8' },
                { val: leagueCount,     label:'Ligas',       color:'#E8122D' },
              ].map(s => (
                <div key={s.label}
                  className="rounded-2xl px-5 py-3 text-center border"
                  style={{ background:'rgba(255,255,255,0.05)', borderColor:'rgba(255,255,255,0.09)' }}>
                  <p className="font-display text-3xl leading-none" style={{ color:s.color }}>{s.val}</p>
                  <p className="text-gray-500 text-[11px] font-bold uppercase tracking-wide mt-1">{s.label}</p>
                </div>
              ))}
              {globalRank && totalPoints > 0 && (
                <div className="rounded-2xl px-5 py-3 text-center border"
                  style={{ background:'rgba(0,165,80,0.08)', borderColor:'rgba(0,165,80,0.25)' }}>
                  <p className="font-display text-3xl leading-none text-[#00A550]">#{globalRank}</p>
                  <p className="text-gray-500 text-[11px] font-bold uppercase tracking-wide mt-1">Global</p>
                </div>
              )}
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. MIS LIGAS
// ─────────────────────────────────────────────────────────────────────────────
function rankStyle(rank, total) {
  if (!rank) return { text:'#9CA3AF', bg:'rgba(255,255,255,0.06)', border:'rgba(255,255,255,0.1)' }
  if (rank === 1)           return { text:'#00A550', bg:'rgba(0,165,80,0.12)',   border:'rgba(0,165,80,0.3)' }
  if (rank >= total)        return { text:'#E8122D', bg:'rgba(232,18,45,0.12)', border:'rgba(232,18,45,0.3)' }
  return                           { text:'#FFD700', bg:'rgba(255,215,0,0.12)', border:'rgba(255,215,0,0.3)' }
}

function LeagueCard({ liga, index }) {
  const col = rankStyle(liga.myRank, liga.memberCount)

  return (
    <motion.div
      initial={{ opacity:0, x:-20 }}
      animate={{ opacity:1, x:0 }}
      transition={{ delay: index * 0.07, duration:0.4 }}
      whileHover={{ y:-5, boxShadow:'0 14px 45px rgba(0,0,0,0.65)' }}
    >
      <Link to={`/liga/${liga.id}`} className="block rounded-2xl border transition-colors"
        style={{ background:'#1A1A1A', borderColor:'rgba(255,255,255,0.08)' }}>
        <div className="p-4 flex items-start gap-4">

          {/* Icon */}
          <div className="w-12 h-12 rounded-xl flex items-center justify-center text-xl shrink-0"
               style={{ background:'linear-gradient(135deg, #1B4FD8, #E8122D)' }}>
            🏆
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <p className="text-white font-black text-sm truncate">{liga.nombre}</p>
              <span className="shrink-0 font-black text-xs px-2 py-0.5 rounded-lg border"
                style={{ color:col.text, background:col.bg, borderColor:col.border }}>
                {liga.myRank ? `#${liga.myRank}` : '—'}
              </span>
            </div>
            <p className="text-xs mt-0.5 mb-2">
              <span style={{ color: '#1B4FD8' }}>Mundial 2026</span>
              <span className="text-gray-600"> · {liga.memberCount} {liga.memberCount === 1 ? 'miembro' : 'miembros'}</span>
            </p>
            <div className="flex items-center justify-between">
              <span className="text-gray-600 text-xs">
                <span className="text-[#FFD700] font-bold">{liga.myPoints ?? 0}</span> pts
              </span>
              <span className="text-gray-600 text-xs">Ver liga →</span>
            </div>
          </div>
        </div>
      </Link>
    </motion.div>
  )
}

function LeaguesSection({ ligas, loading }) {
  const navigate = useNavigate()
  const [code, setCode] = useState('')

  return (
    <FadeIn className="max-w-6xl mx-auto px-4 py-12">
      <div className="flex items-end justify-between mb-6">
        <div>
          <p className="font-display text-xs tracking-widest text-gray-500 uppercase mb-1">Tu espacio</p>
          <h2 className="font-display text-4xl sm:text-5xl text-white tracking-wide">MIS LIGAS</h2>
        </div>
        <Link to="/crear-liga" className="btn-gradient shrink-0 text-sm">+ Crear</Link>
      </div>

      {loading ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
          {[...Array(3)].map((_,i) => <div key={i} className="skeleton h-24 rounded-2xl" />)}
        </div>
      ) : ligas.length === 0 ? (
        <div className="card p-12 text-center mb-4">
          <div className="text-5xl mb-3">🏆</div>
          <p className="text-white font-black text-lg mb-1">Sin ligas todavía</p>
          <p className="text-gray-500 text-sm mb-5">Creá una o uníte con un código.</p>
          <Link to="/crear-liga" className="btn-primary">Crear mi primera liga</Link>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
          {ligas.map((l, i) => <LeagueCard key={l.id} liga={l} index={i} />)}
        </div>
      )}

      {/* Quick join */}
      <form onSubmit={e => { e.preventDefault(); if (code.trim()) navigate(`/unirse/${code.trim().toUpperCase()}`) }}
        className="flex gap-2 p-3 rounded-2xl border border-white/8"
        style={{ backgroundColor:'#181818' }}>
        <input value={code} onChange={e => setCode(e.target.value)}
          placeholder="Código de invitación (ej: A3F7B2)..."
          className="input-dark flex-1 text-sm" />
        <button type="submit" className="btn-secondary shrink-0 text-sm">Unirse</button>
      </form>
    </FadeIn>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. UPCOMING MATCHES
// ─────────────────────────────────────────────────────────────────────────────
function MatchCard({ match, hasPrediction, index }) {
  const countdown = useMatchCd(match)
  const isLive    = match.status === 'live'
  const grpColor  = match.group?.name ? (GROUP_COLORS[match.group.name] ?? '#1B4FD8') : '#9B59D0'

  return (
    <motion.div
      initial={{ opacity:0, y:20 }}
      animate={{ opacity:1, y:0 }}
      transition={{ delay: index * 0.06, duration:0.4 }}
      whileHover={{ y:-5 }}
      className="shrink-0 w-[268px] sm:w-[290px] rounded-2xl border border-white/8 overflow-hidden"
      style={{ background:'linear-gradient(160deg, #1E1E1E, #181818)' }}>
      <Link to="/mis-pronosticos" className="block p-4">

        {/* Date row */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-1.5">
            {isLive && <span className="blink-dot w-1.5 h-1.5 rounded-full bg-green-400 inline-block" />}
            <span className="font-display text-xs tracking-wider font-bold" style={{ color:grpColor }}>
              {fmtMatchDay(match)}
            </span>
            {match.match_time && (
              <span className="text-gray-600 text-xs">· {fmtTime(match.match_time)}</span>
            )}
          </div>
          <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${
            isLive ? 'text-green-400 bg-green-900/30 border-green-500/30'
                   : 'text-gray-400 border-white/10'
          }`} style={!isLive ? { background:'rgba(255,255,255,0.05)' } : {}}>
            {isLive ? '🔴 EN VIVO' : countdown}
          </span>
        </div>

        {/* Teams */}
        <div className="flex items-center gap-3 mb-3">
          <div className="flex-1 flex flex-col items-center gap-1.5">
            <Flag src={match.home_team?.flag_url} alt={match.home_team?.name} size={38} />
            <span className="text-white text-xs font-bold text-center leading-tight line-clamp-2">
              {match.home_team?.name}
            </span>
          </div>
          <div className="font-display text-2xl text-gray-700 shrink-0">VS</div>
          <div className="flex-1 flex flex-col items-center gap-1.5">
            <Flag src={match.away_team?.flag_url} alt={match.away_team?.name} size={38} />
            <span className="text-white text-xs font-bold text-center leading-tight line-clamp-2">
              {match.away_team?.name}
            </span>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-white/8 pt-2.5">
          <span className="text-gray-600 text-xs">
            {match.group?.name ? `Grupo ${match.group.name}` : (match.stage ?? 'Fase de grupos')}
          </span>
          {hasPrediction != null && (
            hasPrediction
              ? <span className="text-green-400 text-xs font-bold">✅ Predicho</span>
              : <span className="text-amber-400 text-xs font-bold">⚠️ Sin pronóstico</span>
          )}
        </div>
      </Link>
    </motion.div>
  )
}

function UpcomingSection({ matches, predSet, isLoggedIn }) {
  return (
    <FadeIn className="py-12">
      <div className="max-w-6xl mx-auto px-4 mb-6">
        <p className="font-display text-xs tracking-widest text-gray-500 uppercase mb-1">No te pierdas nada</p>
        <h2 className="font-display text-4xl sm:text-5xl text-white tracking-wide">PRÓXIMOS PARTIDOS</h2>
      </div>

      {matches.length === 0 ? (
        <div className="max-w-6xl mx-auto px-4">
          <div className="card p-12 text-center">
            <div className="text-5xl mb-3">📅</div>
            <p className="text-white font-black text-lg mb-1">Fixture próximamente</p>
            <p className="text-gray-500 text-sm">Los partidos se cargarán aquí antes del torneo.</p>
          </div>
        </div>
      ) : (
        <div className="flex gap-4 overflow-x-auto px-4 sm:px-8 pb-3"
             style={{ scrollbarWidth:'none', msOverflowStyle:'none' }}>
          {matches.map((m,i) => (
            <MatchCard key={m.id} match={m} index={i}
              hasPrediction={isLoggedIn ? predSet.has(m.id) : null} />
          ))}
          <div className="w-2 shrink-0" />
        </div>
      )}
    </FadeIn>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. GLOBAL LEADERBOARD
// ─────────────────────────────────────────────────────────────────────────────
function LeaderboardSection({ topUsers, myEntry, loading }) {
  return (
    <FadeIn className="max-w-2xl mx-auto px-4 py-12">
      <div className="flex items-end justify-between mb-6">
        <div>
          <p className="font-display text-xs tracking-widest text-gray-500 uppercase mb-1">Competencia global</p>
          <h2 className="font-display text-4xl sm:text-5xl text-white tracking-wide">TOP JUGADORES</h2>
        </div>
        <Link to="/dashboard" className="text-sm text-gray-500 hover:text-white transition-colors shrink-0">Mis ligas →</Link>
      </div>

      <div className="card overflow-hidden">
        {loading ? (
          <div className="p-6 space-y-3">
            {[...Array(5)].map((_,i) => <div key={i} className="skeleton h-12 rounded-xl" />)}
          </div>
        ) : topUsers.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-5xl mb-3">🏆</p>
            <p className="text-gray-500 font-semibold">El ranking global estará disponible cuando comiencen los partidos.</p>
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {topUsers.map((u, i) => (
              <motion.div key={u.user_id}
                initial={{ opacity:0, x:-20 }} animate={{ opacity:1, x:0 }}
                transition={{ delay: i * 0.055 }}
                className={`flex items-center gap-4 px-5 py-3.5 ${i === 0 ? 'bg-[#FFD700]/5' : ''}`}>

                <div className="w-7 text-center shrink-0">
                  {i < 3
                    ? <span className={`text-lg ${i===0 ? 'animate-bounce-in' : ''}`}>{MEDALS[i]}</span>
                    : <span className="text-gray-600 font-black text-sm">#{i+1}</span>
                  }
                </div>

                <AvatarDisplay avatarUrl={u.avatar_url} username={u.username}
                  size={34} rank={i < 3 ? i+1 : null} />

                <div className="flex-1 min-w-0">
                  <p className={`font-bold text-sm truncate ${i===0 ? 'text-[#FFD700]' : 'text-white'}`}>
                    @{u.username ?? '?'}
                  </p>
                </div>

                <div className="text-right shrink-0">
                  <p className="font-display text-xl leading-none"
                    style={{ color: i===0?'#FFD700': i===1?'#9CA3AF': i===2?'#CD7F32':'#6B7280' }}>
                    {u.points}
                  </p>
                  <p className="text-gray-700 text-xs">pts</p>
                </div>
              </motion.div>
            ))}

            {/* My row if outside top 5 */}
            {myEntry && !topUsers.slice(0,5).some(u => u.user_id === myEntry.user_id) && (
              <>
                <div className="px-5 py-1.5 text-center text-gray-700 text-xs tracking-wider">· · ·</div>
                <div className="flex items-center gap-4 px-5 py-3.5 border-l-4"
                  style={{ backgroundColor:'rgba(27,79,216,0.08)', borderLeftColor:'#1B4FD8' }}>
                  <div className="w-7 text-center shrink-0">
                    <span className="text-[#1B4FD8] font-black text-sm">#{myEntry.rank}</span>
                  </div>
                  <AvatarDisplay avatarUrl={myEntry.avatar_url} username={myEntry.username} size={34} />
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm text-[#1B4FD8] truncate">@{myEntry.username} <span className="text-white/30 font-normal">(tú)</span></p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-display text-xl text-[#1B4FD8] leading-none">{myEntry.points}</p>
                    <p className="text-gray-700 text-xs">pts</p>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </FadeIn>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. NOTICIAS
// ─────────────────────────────────────────────────────────────────────────────
function NewsCard({ item, index }) {
  return (
    <motion.a href={item.link} target="_blank" rel="noopener noreferrer"
      initial={{ opacity:0, y:20 }} animate={{ opacity:1, y:0 }}
      transition={{ delay: index * 0.06 }}
      whileHover={{ y:-5 }}
      className="shrink-0 w-60 sm:w-72 rounded-2xl overflow-hidden border border-white/8 block"
      style={{ background:'#1A1A1A' }}>
      {item.thumbnail && item.thumbnail.startsWith('http') ? (
        <div className="h-36 overflow-hidden bg-[#111]">
          <img src={item.thumbnail} alt="" className="w-full h-full object-cover" loading="lazy" />
        </div>
      ) : (
        <div className="h-36 flex items-center justify-center text-4xl"
             style={{ background:'linear-gradient(135deg, #1B4FD8 0%, #E8122D 100%)' }}>
          ⚽
        </div>
      )}
      <div className="p-3.5">
        <p className="text-white text-xs font-bold leading-snug line-clamp-2 mb-2">{item.title}</p>
        <div className="flex items-center justify-between">
          <span className="text-gray-600 text-[11px] truncate">{item.author || 'ESPN'}</span>
          <span className="text-gray-600 text-[11px] shrink-0 ml-1">{timeAgo(item.pubDate)}</span>
        </div>
      </div>
    </motion.a>
  )
}

function NewsSection({ news, loading }) {
  return (
    <FadeIn className="py-12">
      <div className="max-w-6xl mx-auto px-4 mb-6">
        <p className="font-display text-xs tracking-widest text-gray-500 uppercase mb-1">Mantenete informado</p>
        <h2 className="font-display text-4xl sm:text-5xl text-white tracking-wide">NOTICIAS</h2>
      </div>

      {loading ? (
        <div className="flex gap-4 px-4 sm:px-8 overflow-hidden">
          {[...Array(4)].map((_,i) => <div key={i} className="skeleton shrink-0 w-64 h-52 rounded-2xl" />)}
        </div>
      ) : news.length === 0 ? (
        <div className="max-w-6xl mx-auto px-4">
          <div className="card p-12 text-center">
            <div className="text-5xl mb-3">🗞️</div>
            <p className="text-white font-black text-lg mb-1">Noticias del Mundial próximamente</p>
            <p className="text-gray-500 text-sm">Seguí el torneo con las últimas noticias aquí.</p>
          </div>
        </div>
      ) : (
        <div className="flex gap-4 overflow-x-auto px-4 sm:px-8 pb-3"
             style={{ scrollbarWidth:'none', msOverflowStyle:'none' }}>
          {news.map((item,i) => <NewsCard key={i} item={item} index={i} />)}
          <div className="w-2 shrink-0" />
        </div>
      )}
    </FadeIn>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. STATS GLOBALES
// ─────────────────────────────────────────────────────────────────────────────
function StatCounter({ value, suffix = '', label, color, trigger }) {
  const count = useCountUp(value, trigger)
  return (
    <div className="text-center py-10 px-4">
      <p className="font-display font-black text-5xl sm:text-6xl leading-none mb-2" style={{ color }}>
        {count}{suffix}
      </p>
      <p className="text-gray-500 text-xs font-bold uppercase tracking-widest">{label}</p>
    </div>
  )
}

function StatsSection() {
  const ref = useRef(null)
  const [inView, setInView] = useState(false)
  useEffect(() => {
    const el = ref.current; if (!el) return
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setInView(true); obs.disconnect() } }, { threshold:0.3 })
    obs.observe(el); return () => obs.disconnect()
  }, [])

  return (
    <motion.section ref={ref}
      initial={{ opacity:0, y:30 }}
      animate={inView ? { opacity:1, y:0 } : {}}
      transition={{ duration:0.6 }}
      className="border-y border-white/5"
      style={{ backgroundColor:'#131313' }}>
      <div className="max-w-4xl mx-auto grid grid-cols-2 sm:grid-cols-4 divide-x divide-y sm:divide-y-0 divide-white/5">
        <StatCounter value={150} suffix="+" label="Jugadores"   color="#1B4FD8" trigger={inView} />
        <StatCounter value={48}  suffix=""  label="Equipos"     color="#E8122D" trigger={inView} />
        <StatCounter value={104} suffix=""  label="Partidos"    color="#00A550" trigger={inView} />
        <div className="text-center py-10 px-4">
          <p className="font-display font-black text-5xl sm:text-6xl leading-none mb-2" style={{ color:'#FFD700' }}>?</p>
          <p className="text-gray-500 text-xs font-bold uppercase tracking-widest">Campeón</p>
        </div>
      </div>
    </motion.section>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────────────────────
export default function Home() {
  const { user, profile, loading: authLoading } = useAuth()
  const [ligas,       setLigas]     = useState([])
  const [matches,     setMatches]   = useState([])
  const [predSet,     setPredSet]   = useState(new Set())
  const [topUsers,    setTopUsers]  = useState([])
  const [myEntry,     setMyEntry]   = useState(null)
  const [stats,       setStats]     = useState({ totalPoints:0, predictionCount:0, leagueCount:0, globalRank:null })
  const [news,            setNews]            = useState([])
  const [dataLoading,     setDataLoading]     = useState(true)
  const [newsLoading,     setNewsLoading]     = useState(true)

  // News fetches (independent)
  useEffect(() => {
    fetch(NEWS_URL)
      .then(r => r.json())
      .then(d => { if (d.status === 'ok') setNews(d.items || []) })
      .catch(() => {})
      .finally(() => setNewsLoading(false))
  }, [])

  // Main data fetch
  useEffect(() => {
    if (authLoading) return
    loadData()
  }, [authLoading, user?.id])

  async function loadData() {
    setDataLoading(true)

    // Always load upcoming matches
    const { data: matchData } = await supabase
      .from('matches')
      .select('id, match_date, match_time, status, stage, competition, home_team:home_team_id(id, name, code, flag_url), away_team:away_team_id(id, name, code, flag_url), group:group_id(name)')
      .neq('status', 'finished')
      .neq('status', 'live')
      .order('match_date')
      .limit(7)

    const upcomingMatches = matchData || []
    setMatches(upcomingMatches)

    if (!user) { setDataLoading(false); return }

    const matchIds = upcomingMatches.map(m => m.id)
    const safeMatchIds = matchIds.length > 0 ? matchIds : ['00000000-0000-0000-0000-000000000000']

    const [
      { data: memberships },
      { data: scoredPreds },
      { data: myUpcomingPreds },
      { data: allMyPreds },
    ] = await Promise.all([
      supabase.from('liga_miembros')
        .select('liga_id, ligas(id, nombre, codigo_invitacion, torneo)')
        .eq('usuario_id', user.id),
      supabase.from('predictions')
        .select('user_id, points_earned, bonus_goleador')
        .not('points_earned', 'is', null),
      supabase.from('predictions')
        .select('match_id, home_score')
        .eq('user_id', user.id)
        .in('match_id', safeMatchIds),
      supabase.from('predictions')
        .select('match_id')
        .eq('user_id', user.id)
        .not('home_score', 'is', null),
    ])

    // Prediction set for upcoming matches
    setPredSet(new Set((myUpcomingPreds || []).filter(p => p.home_score !== null).map(p => p.match_id)))

    // Aggregate global points per user
    const totals = {}
    for (const p of scoredPreds || []) {
      if (!totals[p.user_id]) totals[p.user_id] = 0
      totals[p.user_id] += (p.points_earned || 0) + (p.bonus_goleador || 0)
    }
    const sorted = Object.entries(totals).sort(([,a],[,b]) => b - a)
    const myTotal = totals[user.id] || 0
    const globalRank = myTotal > 0 ? sorted.findIndex(([uid]) => uid === user.id) + 1 : null

    // Fetch profiles for top 10
    const top10Ids = sorted.slice(0, 10).map(([uid]) => uid)
    const { data: topProfiles } = top10Ids.length > 0
      ? await supabase.from('profiles').select('id, username, avatar_url').in('id', top10Ids)
      : { data: [] }

    const topList = sorted.slice(0, 10).map(([uid, pts]) => ({
      user_id: uid, points: pts,
      ...(topProfiles?.find(p => p.id === uid) || { username: '?', avatar_url: null }),
    }))
    setTopUsers(topList)

    const myIdx = sorted.findIndex(([uid]) => uid === user.id)
    if (myIdx >= 0) {
      setMyEntry({ user_id:user.id, username:profile?.username||'?',
        avatar_url:profile?.avatar_url, points:myTotal, rank:myIdx+1 })
    }

    // Leagues with rank + member count
    const ligaIds = (memberships || []).map(m => m.liga_id)
    if (ligaIds.length > 0) {
      const [{ data: leaderRows }, { data: memberRows }] = await Promise.all([
        supabase.from('liga_leaderboard').select('liga_id, rank, total_points')
          .in('liga_id', ligaIds).eq('user_id', user.id),
        supabase.from('liga_miembros').select('liga_id').in('liga_id', ligaIds),
      ])
      const rankMap  = Object.fromEntries((leaderRows  || []).map(r => [r.liga_id, r]))
      const countMap = (memberRows || []).reduce((acc, r) => { acc[r.liga_id] = (acc[r.liga_id]||0)+1; return acc }, {})
      setLigas((memberships || []).map(m => ({
        ...m.ligas,
        myRank:    rankMap[m.liga_id]?.rank         || null,
        myPoints:  rankMap[m.liga_id]?.total_points || 0,
        memberCount: countMap[m.liga_id] || 0,
      })))
      setStats({ totalPoints:myTotal, predictionCount:(allMyPreds||[]).length, leagueCount:ligaIds.length, globalRank })
    } else {
      setStats({ totalPoints:myTotal, predictionCount:(allMyPreds||[]).length, leagueCount:0, globalRank })
    }

    setDataLoading(false)
  }

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="font-display text-2xl text-gray-600 tracking-widest animate-pulse">CARGANDO...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen">

      {/* 1. Hero — transparent so fixed video behind shows through */}
      {user ? <HeroUser profile={profile} stats={stats} /> : <HeroGuest />}

      {/* Everything below hero gets a solid background */}
      <div style={{ backgroundColor:'#111111' }}>

      {/* 2. Mis Ligas */}
      {user && <LeaguesSection ligas={ligas} loading={dataLoading} />}

      {/* 3. Stats */}
      <StatsSection />

      <Divider from="#131313" to="#111111" />

      {/* 4. Upcoming Matches */}
      <UpcomingSection matches={matches} predSet={predSet} isLoggedIn={!!user} />

      <Divider from="#111111" to="#131313" />

      {/* 5. Global Leaderboard */}
      <div style={{ backgroundColor:'#131313' }}>
        <LeaderboardSection topUsers={topUsers} myEntry={myEntry} loading={dataLoading && !!user} />
      </div>

      <Divider from="#131313" to="#111111" />

      {/* 6. News */}
      <div style={{ backgroundColor:'#131313' }}>
        <NewsSection news={news} loading={newsLoading} />
      </div>

      {/* 7. Stats globales */}
      <StatsSection />

      <Divider from="#111111" to="#0D1B4B" />

      {/* Guest CTA */}
      {!user && (
        <section className="py-20 px-4 text-center"
          style={{ background:'linear-gradient(160deg, #0D1B4B 0%, #1B0820 100%)' }}>
          <div className="relative max-w-2xl mx-auto">
            <h2 className="font-display font-black text-5xl sm:text-6xl text-white mb-4 tracking-wide">
              ¿LISTO PARA JUGAR?
            </h2>
            <p className="text-gray-400 mb-8 max-w-sm mx-auto">
              Registrate gratis, creá tu liga y empezá a competir con todos tus amigos.
            </p>
            <div className="flex justify-center gap-4 flex-wrap">
              <Link to="/auth"
                className="font-display font-black text-lg px-12 py-4 rounded-2xl tracking-wide text-[#111] active:scale-95 transition-all"
                style={{ backgroundColor:'#FFD700' }}>
                EMPEZAR AHORA →
              </Link>
              <Link to="/grupos"
                className="font-bold text-base px-10 py-4 rounded-2xl bg-white/10 border border-white/20 text-white hover:bg-white/15 transition-all">
                Ver grupos
              </Link>
            </div>
          </div>
        </section>
      )}

      </div>{/* end below-hero solid bg */}
    </div>
  )
}
