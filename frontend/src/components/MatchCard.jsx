function TeamSide({ team, reverse = false }) {
  return (
    <div className={`flex items-center gap-3 flex-1 ${reverse ? 'flex-row-reverse' : ''}`}>
      <img
        src={team?.flag_url}
        alt={team?.name}
        className="w-8 h-auto rounded-sm shrink-0"
        onError={e => { e.target.style.display = 'none' }}
      />
      <span className={`text-white font-medium text-sm leading-tight ${reverse ? 'text-right' : ''}`}>
        {team?.name}
      </span>
    </div>
  )
}

export default function MatchCard({ match }) {
  const date = new Date(match.match_date + 'T12:00:00')
  const formattedDate = date.toLocaleDateString('es-AR', {
    weekday: 'short', day: 'numeric', month: 'short',
  })

  const isFinished = match.status === 'finished'

  return (
    <div className="bg-slate-800 rounded-lg border border-slate-700 px-4 py-3 hover:border-slate-600 transition-colors">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-slate-500">#{match.match_number}</span>
        <span className="text-xs text-slate-400">{formattedDate}</span>
        <span className="text-xs font-semibold text-mundial-gold">Grupo {match.group?.name}</span>
      </div>

      <div className="flex items-center gap-4">
        <TeamSide team={match.home_team} />
        <div className="shrink-0 text-center w-12">
          {isFinished ? (
            <span className="text-white font-bold text-lg">
              {match.home_score}–{match.away_score}
            </span>
          ) : (
            <span className="text-slate-500 font-bold text-sm">vs</span>
          )}
        </div>
        <TeamSide team={match.away_team} reverse />
      </div>
    </div>
  )
}
