import { useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { AvatarDisplay } from './AvatarDisplay'

export const AVATAR_OPTIONS = [
  '⚽','🏆','🥅','🏟','🎽','👕','🦁','🐺',
  '🦅','🐉','⭐','🔥','💪','🎯','🌟','🏅',
  '🎖','👑','🦊','🐻','🌍','⚡','🧢','🤺',
  '🐯','🦋','🚀','🎪',
]

export default function AvatarPicker({ selected, onSelect, onClose }) {
  const { user } = useAuth()
  const [uploading, setUploading] = useState(false)
  const [customEmoji, setCustomEmoji]   = useState('')
  const [error, setError]               = useState('')
  const fileRef = useRef()

  async function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 5 * 1024 * 1024) { setError('La foto no puede superar 5MB'); return }
    setUploading(true)
    setError('')
    const { error: uploadErr } = await supabase.storage
      .from('avatars')
      .upload(user.id, file, { upsert: true, contentType: file.type })
    if (uploadErr) { setError(uploadErr.message); setUploading(false); return }
    const { data } = supabase.storage.from('avatars').getPublicUrl(user.id)
    onSelect(data.publicUrl + '?t=' + Date.now())
    onClose()
    setUploading(false)
  }

  function handleCustomEmoji() {
    const trimmed = customEmoji.trim()
    if (!trimmed) return
    onSelect(trimmed)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
         onClick={onClose}>
      <div className="w-full max-w-sm card p-5 animate-slide-up" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display text-xl text-white tracking-wide">ELEGÍ TU AVATAR</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors text-xl leading-none">×</button>
        </div>

        {/* Photo upload */}
        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="w-full mb-3 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold transition-all border border-white/15 hover:border-[#1B4FD8] text-gray-300 hover:text-white disabled:opacity-50"
          style={{ background: 'rgba(27,79,216,0.1)' }}
        >
          {uploading ? '⏳ Subiendo...' : '📷  Subir foto de tu cámara o galería'}
        </button>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />

        {/* Custom emoji input */}
        <div className="flex gap-2 mb-4">
          <input
            value={customEmoji}
            onChange={e => setCustomEmoji(e.target.value)}
            placeholder="Pegá cualquier emoji  🌮🦄🎸🐧"
            className="input-dark flex-1 text-center text-lg"
            maxLength={8}
          />
          <button
            onClick={handleCustomEmoji}
            disabled={!customEmoji.trim()}
            className="px-4 rounded-xl font-bold text-sm text-white disabled:opacity-40 transition-all"
            style={{ background: '#1B4FD8' }}
          >
            OK
          </button>
        </div>

        <p className="text-gray-600 text-xs text-center uppercase tracking-wide font-bold mb-2">
          o elegí uno rápido
        </p>

        {/* Quick emoji grid */}
        <div className="grid grid-cols-7 gap-2">
          {AVATAR_OPTIONS.map(emoji => (
            <button
              key={emoji}
              onClick={() => { onSelect(emoji); onClose() }}
              className={`w-10 h-10 rounded-xl flex items-center justify-center text-2xl transition-all hover:scale-110 active:scale-95 ${
                selected === emoji ? 'ring-2 ring-[#1B4FD8] ring-offset-1 ring-offset-[#1A1A1A]' : ''
              }`}
              style={{
                background: selected === emoji
                  ? 'linear-gradient(135deg, #1e3a8a, #1B4FD8)'
                  : 'rgba(255,255,255,0.06)',
              }}
            >
              {emoji}
            </button>
          ))}
        </div>

        {/* Preview of current photo if it's a URL */}
        {selected?.startsWith('http') && (
          <div className="mt-4 flex items-center gap-3 px-3 py-2 rounded-xl bg-white/5">
            <AvatarDisplay avatarUrl={selected} username="" size={36} />
            <span className="text-gray-400 text-xs flex-1">Foto actual</span>
            <button
              onClick={() => { onSelect('⚽'); onClose() }}
              className="text-red-400 text-xs hover:text-red-300"
            >
              Quitar
            </button>
          </div>
        )}

        {error && <p className="text-red-400 text-xs text-center mt-3">{error}</p>}
      </div>
    </div>
  )
}
