import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

const RANK_COLORS = ['#FFD700', '#9CA3AF', '#D97706']

function LeagueCard({ liga, myRank, memberCount }) {
  return (
    <Link to={`/liga/${liga.id}`}
      className="card card-hover p-5 block group animate-slide-up">
      <div className="flex items-start justify-between mb-4">
        <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl shrink-0"
             style={{ backgroundColor: '#0A1628' }}>
          🏆
        </div>
        <span className="text-xs text-gray-500 font-mono bg-white/10 px-2 py-1 rounded-lg">
          #{liga.codigo_invitacion}
        </span>
      </div>
      <h3 className="text-white font-black text-lg leading-tight mb-1 group-hover:text-[#1B4FD8] transition-colors">
        {liga.nombre}
      </h3>
      {liga.descripcion && (
        <p className="text-gray-500 text-sm mb-3 line-clamp-1">{liga.descripcion}</p>
      )}
      <div className="flex items-center justify-between mt-4 pt-4 border-t border-white/5">
        <div className="flex items-center gap-1.5">
          <div className="flex -space-x-1">
            {[...Array(Math.min(memberCount, 4))].map((_, i) => (
              <div key={i} className="w-6 h-6 rounded-full border-2 border-[#1A1A1A]"
                   style={{ background: `hsl(${i * 60 + 200}, 70%, 60%)` }} />
            ))}
          </div>
          <span className="text-gray-500 text-xs ml-1">
            {memberCount} {memberCount === 1 ? 'miembro' : 'miembros'}
          </span>
        </div>
        {myRank && (
          <div className="flex items-center gap-1.5 bg-white/5 px-3 py-1 rounded-full border border-white/10">
            <span className="text-gray-500 text-xs">Posición</span>
            <span className="font-black text-sm" style={{ color: RANK_COLORS[myRank - 1] ?? '#9CA3AF' }}>
              #{myRank}
            </span>
          </div>
        )}
      </div>
    </Link>
  )
}

function PublicLeagueCard({ liga, isMember, requestStatus, memberCount, myRank, onRequest, requesting }) {
  return (
    <div className="rounded-2xl overflow-hidden mb-8"
         style={{ border: '1px solid rgba(27,79,216,0.3)', background: 'linear-gradient(135deg, #0A1628 0%, #111827 100%)' }}>
      {/* top strip */}
      <div className="h-1.5" style={{ background: 'linear-gradient(90deg, #1B4FD8, #E8122D)' }} />

      <div className="p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-3xl shrink-0"
                 style={{ backgroundColor: 'rgba(27,79,216,0.15)', border: '1px solid rgba(27,79,216,0.3)' }}>
              🏆
            </div>
            <div>
              <p className="font-display text-xs tracking-widest text-[#1B4FD8] uppercase mb-0.5">Liga oficial</p>
              <h2 className="font-display text-2xl text-white tracking-wide">{liga.nombre}</h2>
              {liga.descripcion && <p className="text-gray-500 text-sm mt-0.5">{liga.descripcion}</p>}
            </div>
          </div>

          {isMember ? (
            <Link to={`/liga/${liga.id}`}
              className="shrink-0 font-bold text-sm px-5 py-2.5 rounded-xl text-white transition-all active:scale-95"
              style={{ backgroundColor: '#1B4FD8' }}>
              Ver liga →
            </Link>
          ) : requestStatus === 'pending' ? (
            <div className="shrink-0 text-xs font-bold px-4 py-2.5 rounded-xl text-amber-400 border border-amber-500/30 bg-amber-900/20">
              ⏳ Solicitud enviada
            </div>
          ) : requestStatus === 'rejected' ? (
            <div className="shrink-0 text-xs font-bold px-4 py-2.5 rounded-xl text-red-400 border border-red-500/30 bg-red-900/20">
              ✕ Acceso denegado
            </div>
          ) : (
            <button onClick={onRequest} disabled={requesting}
              className="shrink-0 font-bold text-sm px-5 py-2.5 rounded-xl text-white transition-all active:scale-95 disabled:opacity-50"
              style={{ backgroundColor: '#1B4FD8' }}>
              {requesting ? 'Enviando...' : 'Solicitar acceso'}
            </button>
          )}
        </div>

        <div className="flex items-center gap-6 mt-5 pt-5 border-t border-white/5">
          <div className="text-center">
            <p className="font-display text-2xl text-white">{memberCount}</p>
            <p className="text-gray-600 text-xs">miembros</p>
          </div>
          {isMember && myRank && (
            <div className="text-center">
              <p className="font-display text-2xl" style={{ color: RANK_COLORS[myRank - 1] ?? '#9CA3AF' }}>
                #{myRank}
              </p>
              <p className="text-gray-600 text-xs">tu posición</p>
            </div>
          )}
          <div className="text-center">
            <p className="font-display text-2xl" style={{ color: '#FFD700' }}>
              {liga.sistema_puntos?.exacto ?? 3}
            </p>
            <p className="text-gray-600 text-xs">pts exacto</p>
          </div>
          <div className="text-center">
            <p className="font-display text-2xl" style={{ color: '#1B4FD8' }}>
              {liga.sistema_puntos?.resultado ?? 1}
            </p>
            <p className="text-gray-600 text-xs">pt resultado</p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function Dashboard() {
  const { user } = useAuth()
  const [publicLiga, setPublicLiga]           = useState(null)
  const [isMember, setIsMember]               = useState(false)
  const [requestStatus, setRequestStatus]     = useState(null)
  const [publicMemberCount, setPublicMemberCount] = useState(0)
  const [myRank, setMyRank]                   = useState(null)
  const [ligas, setLigas]                     = useState([])
  const [loading, setLoading]                 = useState(true)
  const [requesting, setRequesting]           = useState(false)

  useEffect(() => {
    async function load() {
      const [
        { data: pubLiga },
        { data: memberships },
      ] = await Promise.all([
        supabase.from('ligas').select('*').eq('publica', true).single(),
        supabase.from('liga_miembros').select('liga_id, ligas(*)').eq('usuario_id', user.id),
      ])

      if (pubLiga) {
        setPublicLiga(pubLiga)

        const [{ count }, { data: rankData }, { data: myRequest }] = await Promise.all([
          supabase.from('liga_miembros').select('*', { count: 'exact', head: true }).eq('liga_id', pubLiga.id),
          supabase.from('liga_leaderboard').select('rank').eq('liga_id', pubLiga.id).eq('user_id', user.id).single(),
          supabase.from('liga_solicitudes').select('status').eq('liga_id', pubLiga.id).eq('user_id', user.id).single(),
        ])

        setPublicMemberCount(count || 0)
        setMyRank(rankData?.rank || null)

        const memberIds = (memberships || []).map(m => m.liga_id)
        setIsMember(memberIds.includes(pubLiga.id))
        setRequestStatus(myRequest?.status ?? null)
      }

      // Other leagues (non-public)
      const others = (memberships || []).filter(m => m.liga_id !== pubLiga?.id)
      if (others.length > 0) {
        const ligasData = await Promise.all(
          others.map(async m => {
            const [{ count }, { data: rankData }] = await Promise.all([
              supabase.from('liga_miembros').select('*', { count: 'exact', head: true }).eq('liga_id', m.liga_id),
              supabase.from('liga_leaderboard').select('rank').eq('liga_id', m.liga_id).eq('user_id', user.id).single(),
            ])
            return { ...m.ligas, memberCount: count || 0, myRank: rankData?.rank || null }
          })
        )
        setLigas(ligasData)
      }

      setLoading(false)
    }
    load()
  }, [user.id])

  async function handleRequest() {
    if (!publicLiga) return
    setRequesting(true)
    const { error } = await supabase.from('liga_solicitudes').insert({ liga_id: publicLiga.id, user_id: user.id })
    if (!error) setRequestStatus('pending')
    setRequesting(false)
  }

  if (loading) return (
    <div className="max-w-6xl mx-auto px-4 py-10 text-center text-gray-500">Cargando...</div>
  )

  return (
    <div className="max-w-6xl mx-auto px-4 py-10">

      {/* Public league */}
      {publicLiga && (
        <PublicLeagueCard
          liga={publicLiga}
          isMember={isMember}
          requestStatus={requestStatus}
          memberCount={publicMemberCount}
          myRank={myRank}
          onRequest={handleRequest}
          requesting={requesting}
        />
      )}

      {/* Other leagues */}
      {ligas.length > 0 && (
        <>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display text-2xl text-white tracking-wide">OTRAS LIGAS</h2>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {ligas.map(liga => (
              <LeagueCard key={liga.id} liga={liga} myRank={liga.myRank} memberCount={liga.memberCount} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
