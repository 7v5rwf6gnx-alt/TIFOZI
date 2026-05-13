export const AVATAR_OPTIONS = [
  '⚽','🏆','🥅','🏟','🎽','👕','🦁','🐺',
  '🦅','🐉','⭐','🔥','💪','🎯','🌟','🏅',
  '🎖','👑','🦊','🐻','🌍','⚡','🧢','🤺',
  '🐯','🦋','🚀','🎪',
]

export default function AvatarPicker({ selected, onSelect, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
         onClick={onClose}>
      <div className="w-full max-w-sm card p-5 animate-slide-up" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display text-xl text-white tracking-wide">ELEGÍ TU AVATAR</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors text-xl leading-none">×</button>
        </div>

        <div className="grid grid-cols-7 gap-2 mb-4">
          {AVATAR_OPTIONS.map(emoji => (
            <button
              key={emoji}
              onClick={() => { onSelect(emoji); onClose() }}
              className={`w-10 h-10 rounded-xl flex items-center justify-center text-2xl transition-all hover:scale-110 active:scale-95 ${
                selected === emoji ? 'ring-2 ring-[#1B4FD8] ring-offset-1 ring-offset-[#1A1A1A]' : ''
              }`}
              style={{
                background: selected === emoji
                  ? 'linear-gradient(135deg, #1e3a8a, #6B2FA0)'
                  : 'rgba(255,255,255,0.06)',
              }}
            >
              {emoji}
            </button>
          ))}
        </div>

        <p className="text-gray-600 text-xs text-center">Pronto: subir foto propia</p>
      </div>
    </div>
  )
}
