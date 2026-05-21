import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Flag } from '../components/FlagPair'

// ── Goalscorer selector ───────────────────────────────────────────────────────
function GoalscorerSelect({ match, onUpdateGoalscorer }) {
  const [players, setPlayers] = useState([])
  const [loading, setLoading] = useState(true)
  const [value, setValue]     = useState(match.primer_goleador_real_id ?? '')
  const [saving, setSaving]   = useState(false)
  const [saved, setSaved]     = useState(false)

  useEffect(() => {
    if (match.status !== 'finished') { setLoading(false); return }
    Promise.all([
      supabase.from('jugadores').select('id, nombre, numero_camiseta')
        .eq('equipo_id', match.home_team_id).order('numero_camiseta'),
      supabase.from('jugadores').select('id, nombre, numero_camiseta')
        .eq('equipo_id', match.away_team_id).order('numero_camiseta'),
    ]).then(([{ data: h }, { data: a }]) => {
      setPlayers([
        { label: match.home_team?.name, players: h || [] },
        { label: match.away_team?.name, players: a || [] },
      ])
      setLoading(false)
    })
  }, [match.status, match.home_team_id, match.away_team_id, match.home_team?.name, match.away_team?.name])

  async function handleSave() {
    setSaving(true)
    await onUpdateGoalscorer(match.id, value || null)
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  if (match.status !== 'finished') return <span className="text-gray-600 text-xs">—</span>
  if (loading) return <span className="text-gray-500 text-xs">...</span>

  const hasPlayers = players.some(g => g.players.length > 0)

  return (
    <div className="flex items-center gap-2">
      {hasPlayers ? (
        <select
          value={value}
          onChange={e => { setValue(e.target.value); setSaved(false) }}
          className="bg-[#242424] border border-white/10 rounded-lg px-2 py-1 text-gray-200 text-xs
                     focus:outline-none focus:border-[#1B4FD8] min-w-0 max-w-[200px]"
        >
          <option value="">Sin goleador / 0-0</option>
          {players.map(group => (
            <optgroup key={group.label} label={group.label}>
              {group.players.map(p => (
                <option key={p.id} value={p.id}>#{p.numero_camiseta} {p.nombre}</option>
              ))}
            </optgroup>
          ))}
        </select>
      ) : (
        <span className="text-gray-600 text-xs italic">Sin plantel</span>
      )}
      <button onClick={handleSave} disabled={saving}
        className={`text-xs font-bold px-2.5 py-1 rounded-lg transition-all shrink-0 ${
          saved
            ? 'bg-green-900/30 text-green-400 border border-green-500/30'
            : 'bg-white/10 text-gray-400 hover:bg-[#0A1628] hover:text-[#FFD700] border border-white/10'
        }`}>
        {saving ? '...' : saved ? '✓' : 'OK'}
      </button>
    </div>
  )
}

// ── Match row ─────────────────────────────────────────────────────────────────
function MatchRow({ match, onUpdate, onUpdateGoalscorer }) {
  const [home, setHome]   = useState(match.home_score ?? '')
  const [away, setAway]   = useState(match.away_score ?? '')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved]   = useState(false)

  async function handleSave() {
    if (home === '' || away === '') return
    setSaving(true)
    await onUpdate(match.id, parseInt(home), parseInt(away))
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const statusConfig = {
    scheduled: { label: 'Pendiente', cls: 'bg-white/10 text-gray-400' },
    live:      { label: 'En vivo',   cls: 'bg-green-900/30 text-green-400' },
    finished:  { label: 'Final',     cls: 'bg-blue-900/20 text-[#1B4FD8]' },
  }
  const sc = statusConfig[match.status] ?? statusConfig.scheduled

  const TeamCell = ({ team }) => (
    <div className="flex items-center gap-2">
      <Flag src={team?.flag_url} size={20} />
      <span className="text-white text-sm font-semibold">{team?.name}</span>
    </div>
  )

  return (
    <tr className="border-b border-white/5 hover:bg-white/5 transition-colors">
      <td className="py-3 px-4 text-gray-500 text-xs font-mono">
        #{match.match_number}
      </td>
      <td className="py-3 px-4"><TeamCell team={match.home_team} /></td>
      <td className="py-3 px-2 text-gray-600 text-xs text-center">vs</td>
      <td className="py-3 px-4"><TeamCell team={match.away_team} /></td>
      <td className="py-3 px-4 text-center">
        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${sc.cls}`}>{sc.label}</span>
      </td>
      <td className="py-3 px-4">
        <div className="flex items-center gap-2 justify-end">
          <input type="number" min="0" max="20" value={home} onChange={e => setHome(e.target.value)}
            className="w-11 text-center bg-[#242424] border border-white/10 rounded-lg py-1 text-white
                       text-sm font-bold focus:outline-none focus:border-[#1B4FD8] no-spinners" />
          <span className="text-gray-600">–</span>
          <input type="number" min="0" max="20" value={away} onChange={e => setAway(e.target.value)}
            className="w-11 text-center bg-[#242424] border border-white/10 rounded-lg py-1 text-white
                       text-sm font-bold focus:outline-none focus:border-[#1B4FD8] no-spinners" />
          <button onClick={handleSave} disabled={saving || home === '' || away === ''}
            className={`text-xs font-bold px-3 py-1.5 rounded-lg transition-all ml-1 disabled:opacity-40 ${
              saved
                ? 'bg-green-900/30 text-green-400 border border-green-500/30'
                : 'text-white hover:opacity-80'
            }`}
            style={!saved ? { backgroundColor: '#1B4FD8' } : {}}>
            {saving ? '...' : saved ? '✓' : 'OK'}
          </button>
        </div>
      </td>
      <td className="py-3 px-4">
        <GoalscorerSelect match={match} onUpdateGoalscorer={onUpdateGoalscorer} />
      </td>
    </tr>
  )
}

// ── Partidos tab ──────────────────────────────────────────────────────────────
function PartidosTab() {
  const [matches, setMatches] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter]   = useState('all')

  const MATCH_JOIN = `
    id, match_number, match_date, match_time, home_score, away_score, status, competition,
    primer_goleador_real_id, home_team_id, away_team_id,
    home_team:home_team_id(name, flag_url),
    away_team:away_team_id(name, flag_url),
    group:group_id(name)
  `

  useEffect(() => {
    supabase.from('matches').select(MATCH_JOIN)
      .eq('competition', 'world_cup').order('match_number')
      .then(({ data }) => { setMatches(data || []); setLoading(false) })
  }, [])

  async function handleUpdate(matchId, home, away) {
    const { data } = await supabase
      .from('matches')
      .update({ home_score: home, away_score: away, status: 'finished' })
      .eq('id', matchId).select().single()
    if (!data) return
    setMatches(prev => prev.map(m => m.id === matchId
      ? { ...m, home_score: home, away_score: away, status: 'finished' } : m))
  }

  async function handleUpdateGoalscorer(matchId, playerId) {
    await supabase.from('matches').update({ primer_goleador_real_id: playerId }).eq('id', matchId)
    setMatches(prev => prev.map(m => m.id === matchId ? { ...m, primer_goleador_real_id: playerId } : m))
  }

  const filtered  = filter === 'all' ? matches : matches.filter(m => m.status === filter)
  const filterLabels = { all: 'Todos', scheduled: 'Pendientes', live: 'En vivo', finished: 'Finalizados' }

  return (
    <div>
      {/* Status filter */}
      <div className="flex gap-2 mb-5">
        {Object.entries(filterLabels).map(([key, label]) => (
          <button key={key} onClick={() => setFilter(key)}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              filter === key
                ? 'text-white'
                : 'bg-white/5 text-gray-400 border border-white/10 hover:border-white/25'
            }`}
            style={filter === key ? { backgroundColor: '#1B4FD8' } : {}}>
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-20 text-gray-500">Cargando...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-gray-500">Sin partidos</div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/5 bg-[#242424] text-left">
                  <th className="py-3 px-4 text-xs text-gray-500 font-bold uppercase tracking-wider">#</th>
                  <th className="py-3 px-4 text-xs text-gray-500 font-bold uppercase tracking-wider">Local</th>
                  <th />
                  <th className="py-3 px-4 text-xs text-gray-500 font-bold uppercase tracking-wider">Visitante</th>
                  <th className="py-3 px-4 text-xs text-gray-500 font-bold uppercase tracking-wider text-center">Estado</th>
                  <th className="py-3 px-4 text-xs text-gray-500 font-bold uppercase tracking-wider text-right">Resultado</th>
                  <th className="py-3 px-4 text-xs text-gray-500 font-bold uppercase tracking-wider">Goleador</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(m => (
                  <MatchRow
                    key={m.id}
                    match={m}
                    onUpdate={handleUpdate}
                    onUpdateGoalscorer={handleUpdateGoalscorer}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Usuarios tab ──────────────────────────────────────────────────────────────
function UsuariosTab() {
  const [users, setUsers]       = useState([])
  const [loading, setLoading]   = useState(true)
  const [predCounts, setPredCounts] = useState({})

  useEffect(() => {
    async function load() {
      const [{ data: profiles }, { data: preds }] = await Promise.all([
        supabase.from('profiles')
          .select('id, username, full_name, email, is_admin, created_at')
          .order('created_at'),
        supabase.from('predictions').select('user_id'),
      ])
      setUsers(profiles || [])
      const counts = {}
      for (const p of preds || []) counts[p.user_id] = (counts[p.user_id] || 0) + 1
      setPredCounts(counts)
      setLoading(false)
    }
    load()
  }, [])

  if (loading) return <div className="text-center py-20 text-gray-500">Cargando...</div>

  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-white/5 bg-[#242424] text-left">
              <th className="py-3 px-4 text-xs text-gray-500 font-bold uppercase tracking-wider">Usuario</th>
              <th className="py-3 px-4 text-xs text-gray-500 font-bold uppercase tracking-wider">Email</th>
              <th className="py-3 px-4 text-xs text-gray-500 font-bold uppercase tracking-wider text-center">Pronósticos</th>
              <th className="py-3 px-4 text-xs text-gray-500 font-bold uppercase tracking-wider text-center">Admin</th>
              <th className="py-3 px-4 text-xs text-gray-500 font-bold uppercase tracking-wider">Registro</th>
            </tr>
          </thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                <td className="py-3 px-4">
                  <div>
                    <p className="text-white text-sm font-bold">@{u.username}</p>
                    {u.full_name && <p className="text-gray-500 text-xs">{u.full_name}</p>}
                  </div>
                </td>
                <td className="py-3 px-4 text-gray-400 text-sm">{u.email}</td>
                <td className="py-3 px-4 text-center">
                  <span className="font-display text-lg text-white">{predCounts[u.id] || 0}</span>
                </td>
                <td className="py-3 px-4 text-center">
                  {u.is_admin && (
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-yellow-900/20 text-yellow-400 border border-yellow-500/30">
                      Admin
                    </span>
                  )}
                </td>
                <td className="py-3 px-4 text-gray-500 text-xs">
                  {new Date(u.created_at).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="px-4 py-3 border-t border-white/5 text-gray-600 text-xs">
          {users.length} usuario{users.length !== 1 ? 's' : ''} registrados
        </div>
      </div>
    </div>
  )
}

// ── Ligas tab ─────────────────────────────────────────────────────────────────
function LigasTab() {
  const [ligas, setLigas]     = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.from('ligas')
      .select(`
        id, nombre, descripcion, torneo, created_at,
        admin:admin_id(username, full_name),
        members:liga_miembros(count)
      `)
      .order('created_at', { ascending: false })
      .then(({ data }) => { setLigas(data || []); setLoading(false) })
  }, [])

  if (loading) return <div className="text-center py-20 text-gray-500">Cargando...</div>

  const torneoConfig = {
    mundial_2026: { label: 'Mundial 2026', color: '#1B4FD8', emoji: '🏆' },
  }

  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-white/5 bg-[#242424] text-left">
              <th className="py-3 px-4 text-xs text-gray-500 font-bold uppercase tracking-wider">Liga</th>
              <th className="py-3 px-4 text-xs text-gray-500 font-bold uppercase tracking-wider">Torneo</th>
              <th className="py-3 px-4 text-xs text-gray-500 font-bold uppercase tracking-wider">Admin</th>
              <th className="py-3 px-4 text-xs text-gray-500 font-bold uppercase tracking-wider text-center">Miembros</th>
              <th className="py-3 px-4 text-xs text-gray-500 font-bold uppercase tracking-wider">Creada</th>
              <th className="py-3 px-4 text-xs text-gray-500 font-bold uppercase tracking-wider">Ver</th>
            </tr>
          </thead>
          <tbody>
            {ligas.map(l => {
              const tc = torneoConfig[l.torneo] ?? { label: l.torneo, color: '#555', emoji: '—' }
              const memberCount = l.members?.[0]?.count ?? 0
              return (
                <tr key={l.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                  <td className="py-3 px-4">
                    <div>
                      <p className="text-white text-sm font-bold">{l.nombre}</p>
                      {l.descripcion && <p className="text-gray-500 text-xs truncate max-w-[200px]">{l.descripcion}</p>}
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full border"
                          style={{ color: tc.color, borderColor: `${tc.color}40`, backgroundColor: `${tc.color}15` }}>
                      {tc.emoji} {tc.label}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-gray-400 text-sm">
                    @{l.admin?.username ?? '—'}
                  </td>
                  <td className="py-3 px-4 text-center">
                    <span className="font-display text-lg text-white">{memberCount}</span>
                  </td>
                  <td className="py-3 px-4 text-gray-500 text-xs">
                    {new Date(l.created_at).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })}
                  </td>
                  <td className="py-3 px-4">
                    <Link to={`/liga/${l.id}`}
                      className="text-xs font-bold px-3 py-1.5 rounded-lg bg-white/5 text-gray-400
                                 border border-white/10 hover:border-[#1B4FD8] hover:text-[#1B4FD8] transition-all">
                      Ver →
                    </Link>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <div className="px-4 py-3 border-t border-white/5 text-gray-600 text-xs">
          {ligas.length} liga{ligas.length !== 1 ? 's' : ''} creadas
        </div>
      </div>
    </div>
  )
}

// ── Main Admin page ───────────────────────────────────────────────────────────
export default function Admin() {
  const [tab, setTab] = useState('partidos')

  const tabs = [
    { key: 'partidos', label: 'Partidos' },
    { key: 'usuarios', label: 'Usuarios' },
    { key: 'ligas',    label: 'Ligas'    },
  ]

  return (
    <div className="max-w-7xl mx-auto px-4 py-10">
      <div className="mb-8">
        <p className="font-display text-sm tracking-widest text-gray-500 uppercase mb-1">⚙ Panel</p>
        <h1 className="font-display text-5xl text-white tracking-wide">ADMINISTRACIÓN</h1>
        <p className="text-gray-500 text-sm mt-1">
          Los puntos se calculan automáticamente al guardar un resultado.
        </p>
      </div>

      {/* Tab nav */}
      <div className="flex gap-1.5 mb-8 p-1 rounded-2xl w-fit" style={{ backgroundColor: 'rgba(255,255,255,0.05)' }}>
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-6 py-2.5 rounded-xl font-display text-xs tracking-wider transition-all ${
              tab === t.key ? 'text-white shadow-sm' : 'text-gray-500 hover:text-gray-300'
            }`}
            style={tab === t.key ? { backgroundColor: '#0A1628', color: '#FFD700' } : {}}>
            {t.label.toUpperCase()}
          </button>
        ))}
      </div>

      {tab === 'partidos' && <PartidosTab />}
      {tab === 'usuarios' && <UsuariosTab />}
      {tab === 'ligas'    && <LigasTab />}
    </div>
  )
}
