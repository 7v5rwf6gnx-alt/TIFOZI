import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '../lib/supabase'

const CONF_ORDER = ['CONMEBOL', 'UEFA', 'CONCACAF', 'CAF', 'AFC', 'OFC']

const CONF_COLORS = {
  CONMEBOL: '#1B4FD8',
  UEFA:     '#E8122D',
  CONCACAF: '#00A550',
  CAF:      '#6B2FA0',
  AFC:      '#F97316',
  OFC:      '#0891B2',
}

function TeamCard({ team, index, color }) {
  const navigate = useNavigate()
  return (
    <motion.button
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04, duration: 0.35 }}
      whileHover={{ y: -4, boxShadow: `0 12px 40px rgba(0,0,0,0.6)` }}
      onClick={() => navigate(`/equipos/${team.code}`)}
      className="relative overflow-hidden rounded-2xl p-4 text-left w-full group transition-all"
      style={{
        background: 'linear-gradient(160deg, #1A1A1A, #161616)',
        border: '1px solid rgba(255,255,255,0.07)',
      }}
    >
      {/* Subtle colored glow on hover */}
      <div
        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none rounded-2xl"
        style={{ background: `radial-gradient(ellipse at 20% 50%, ${color}18, transparent 60%)` }}
      />

      <div className="relative flex items-center gap-3">
        {/* Big flag */}
        <div className="w-14 h-10 rounded-lg overflow-hidden shrink-0 shadow-lg">
          {team.flag_url ? (
            <img src={team.flag_url} alt={team.name} className="w-full h-full object-cover" />
          ) : (
            <div
              className="w-full h-full flex items-center justify-center text-xs font-black text-white/40"
              style={{ backgroundColor: color + '30' }}
            >
              {team.code}
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-white font-bold text-sm leading-tight truncate group-hover:text-white transition-colors">
            {team.name}
          </p>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-xs font-bold" style={{ color }}>{team.confederacion}</span>
            <span className="text-gray-600 text-xs">· Grupo {team.group_name}</span>
          </div>
        </div>
        <span className="text-gray-700 text-xs font-mono shrink-0">{team.code}</span>
      </div>
    </motion.button>
  )
}

export default function Teams() {
  const [teams, setTeams] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [confFilter, setConfFilter] = useState('all')

  useEffect(() => {
    supabase
      .from('teams')
      .select('id, name, code, flag_url, confederacion, group:group_id(name)')
      .order('name')
      .then(({ data }) => {
        const normalized = (data || []).map(t => ({
          ...t,
          group_name: t.group?.name ?? '—',
          confederacion: t.confederacion ?? 'Otra',
        }))
        setTeams(normalized)
        setLoading(false)
      })
  }, [])

  const filtered = teams.filter(t => {
    const matchSearch =
      !search ||
      t.name.toLowerCase().includes(search.toLowerCase()) ||
      t.code.toLowerCase().includes(search.toLowerCase())
    const matchConf = confFilter === 'all' || t.confederacion === confFilter
    return matchSearch && matchConf
  })

  const byConf = CONF_ORDER.reduce((acc, conf) => {
    const list = filtered.filter(t => t.confederacion === conf)
    if (list.length) acc[conf] = list
    return acc
  }, {})
  const others = filtered.filter(t => !CONF_ORDER.includes(t.confederacion))
  if (others.length) byConf['Otra'] = others

  return (
    <div className="max-w-5xl mx-auto px-4 py-10">
      {/* Animated header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45 }}
        className="mb-8"
      >
        <p className="font-display text-sm tracking-widest text-gray-500 uppercase mb-1">Mundial 2026</p>
        <h1 className="font-display text-5xl text-white tracking-wide">EQUIPOS</h1>
        <p className="text-gray-500 text-sm mt-1">48 selecciones clasificadas</p>
      </motion.div>

      {/* Search + Confederation filter tabs */}
      <div className="mb-6 space-y-4">
        {/* Search */}
        <input
          type="text"
          placeholder="Buscar equipo o país..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="input-dark w-full max-w-sm"
        />

        {/* Confederation filter tabs */}
        <div className="flex flex-wrap gap-2">
          {['all', ...CONF_ORDER].map(conf => {
            const color = conf === 'all' ? '#1B4FD8' : (CONF_COLORS[conf] ?? '#1B4FD8')
            const count = conf === 'all' ? teams.length : teams.filter(t => t.confederacion === conf).length
            return (
              <motion.button
                key={conf}
                onClick={() => setConfFilter(conf)}
                whileTap={{ scale: 0.95 }}
                className="px-3 py-1.5 rounded-xl text-xs font-bold transition-all"
                style={
                  confFilter === conf
                    ? { backgroundColor: color, color: '#fff', boxShadow: `0 4px 15px ${color}40` }
                    : { backgroundColor: 'rgba(255,255,255,0.05)', color: '#9CA3AF', border: '1px solid rgba(255,255,255,0.1)' }
                }
              >
                {conf === 'all' ? 'Todos' : conf}{' '}
                {count > 0 && <span className="opacity-60 ml-0.5">{count}</span>}
              </motion.button>
            )
          })}
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {[...Array(12)].map((_, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: i * 0.04 }}
              className="skeleton h-[72px] rounded-2xl"
            />
          ))}
        </div>
      ) : confFilter !== 'all' ? (
        /* Flat grid when a specific confederation is selected */
        <AnimatePresence mode="wait">
          <motion.div
            key={confFilter}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3"
          >
            {filtered.length > 0 ? (
              filtered.map((team, i) => (
                <TeamCard
                  key={team.id}
                  team={team}
                  index={i}
                  color={CONF_COLORS[team.confederacion] ?? '#1B4FD8'}
                />
              ))
            ) : (
              <p className="col-span-3 text-center py-16 text-gray-500">
                Sin resultados para &ldquo;{search}&rdquo;
              </p>
            )}
          </motion.div>
        </AnimatePresence>
      ) : (
        /* Grouped by confederation when "Todos" is selected */
        <div className="space-y-10">
          {Object.entries(byConf).map(([conf, list]) => {
            const color = CONF_COLORS[conf] ?? '#1B4FD8'
            let cardIndex = 0
            return (
              <div key={conf}>
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                  className="flex items-center gap-3 mb-4"
                >
                  <div className="w-1 h-6 rounded-full" style={{ backgroundColor: color }} />
                  <p className="font-display text-lg tracking-wider text-gray-300 uppercase">
                    {conf}
                  </p>
                  <span className="text-gray-600 text-xs">{list.length} equipos</span>
                </motion.div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {list.map((team, i) => (
                    <TeamCard key={team.id} team={team} index={cardIndex++} color={color} />
                  ))}
                </div>
              </div>
            )
          })}
          {filtered.length === 0 && (
            <p className="text-center py-16 text-gray-500">
              Sin resultados para &ldquo;{search}&rdquo;
            </p>
          )}
        </div>
      )}
    </div>
  )
}
