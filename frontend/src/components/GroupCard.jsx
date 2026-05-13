export default function GroupCard({ group }) {
  return (
    <div className="bg-slate-800 rounded-xl overflow-hidden border border-slate-700 hover:border-mundial-gold/50 transition-colors">
      <div className="bg-mundial-blue px-4 py-3">
        <span className="text-mundial-gold text-xl font-black">Grupo {group.name}</span>
      </div>
      <div className="divide-y divide-slate-700">
        {group.teams?.map(team => (
          <div key={team.id} className="flex items-center gap-3 px-4 py-3">
            <img
              src={team.flag_url}
              alt={team.name}
              className="w-7 h-auto rounded-sm shrink-0"
              onError={e => { e.target.style.display = 'none' }}
            />
            <span className="text-white text-sm font-medium flex-1">{team.name}</span>
            <span className="text-slate-400 text-xs font-mono">{team.code}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
