import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { AVATAR_OPTIONS } from './AvatarPicker'
import { AvatarDisplay } from './AvatarDisplay'

const STEPS = ['Avatar', 'Usuario', 'Reglas', 'Listo']

export default function OnboardingModal({ onComplete }) {
  const { user, profile, refreshProfile } = useAuth()
  const navigate = useNavigate()
  const [step, setStep]         = useState(0)
  const [avatar, setAvatar]     = useState(profile?.avatar_url ?? '')
  const [username, setUsername] = useState(profile?.username ?? '')
  const [saving, setSaving]     = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError]       = useState('')
  const [customEmoji, setCustomEmoji] = useState('')
  const fileRef = useRef()

  function handleUsernameChange(val) {
    setUsername(val.replace(/\s/g, '').toLowerCase())
  }

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
    setAvatar(data.publicUrl + '?t=' + Date.now())
    setUploading(false)
  }

  function handleCustomEmoji() {
    const trimmed = customEmoji.trim()
    if (!trimmed) return
    setAvatar(trimmed)
    setCustomEmoji('')
  }

  async function handleSave() {
    if (!avatar) { setError('Elegí un avatar'); return }
    if (username.length < 3) { setError('El apodo debe tener al menos 3 caracteres'); return }
    setError('')
    setSaving(true)
    const { error: err } = await supabase
      .from('profiles')
      .update({ avatar_url: avatar, username: username.trim() })
      .eq('id', user.id)
    if (err) { setError(err.message); setSaving(false); return }
    await refreshProfile()
    setSaving(false)
    setStep(2)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
         style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)' }}>
      <div className="w-full max-w-md animate-slide-up">

        {/* Progress bar */}
        <div className="flex gap-1.5 mb-6">
          {STEPS.map((s, i) => (
            <div key={s} className="flex-1 flex flex-col items-center gap-1">
              <div className="w-full h-1 rounded-full transition-all duration-300"
                   style={{ backgroundColor: i <= step ? '#1B4FD8' : 'rgba(255,255,255,0.1)' }} />
              <span className={`text-[10px] font-bold transition-colors ${i === step ? 'text-[#1B4FD8]' : 'text-gray-600'}`}>
                {s}
              </span>
            </div>
          ))}
        </div>

        <div className="card p-6">

          {/* Step 0: Avatar */}
          {step === 0 && (
            <>
              <div className="text-center mb-5">
                <h2 className="font-display text-3xl text-white tracking-wide mb-1">BIENVENIDO</h2>
                <p className="text-gray-500 text-sm">Elegí tu avatar para empezar</p>
              </div>

              {/* Preview */}
              {avatar && (
                <div className="flex justify-center mb-4">
                  <AvatarDisplay avatarUrl={avatar} username={username} size={72} />
                </div>
              )}

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

              {/* Custom emoji */}
              <div className="flex gap-2 mb-4">
                <input
                  value={customEmoji}
                  onChange={e => setCustomEmoji(e.target.value)}
                  placeholder="Pegá cualquier emoji  🌮🦄🎸"
                  className="input-dark flex-1 text-center text-lg"
                  maxLength={8}
                />
                <button
                  onClick={handleCustomEmoji}
                  disabled={!customEmoji.trim()}
                  className="px-4 rounded-xl font-bold text-sm text-white disabled:opacity-40"
                  style={{ background: '#1B4FD8' }}
                >
                  OK
                </button>
              </div>

              <p className="text-gray-600 text-xs text-center uppercase tracking-wide font-bold mb-2">
                o elegí uno rápido
              </p>

              {/* Quick emoji grid */}
              <div className="grid grid-cols-7 gap-2 mb-5">
                {AVATAR_OPTIONS.map(emoji => (
                  <button key={emoji} onClick={() => setAvatar(emoji)}
                    className={`w-10 h-10 rounded-xl flex items-center justify-center text-2xl transition-all hover:scale-110 active:scale-95 ${
                      avatar === emoji ? 'ring-2 ring-[#1B4FD8] ring-offset-1 ring-offset-[#1A1A1A]' : ''
                    }`}
                    style={{ background: avatar === emoji ? '#1B4FD8' : 'rgba(255,255,255,0.06)' }}>
                    {emoji}
                  </button>
                ))}
              </div>

              <button onClick={() => avatar ? setStep(1) : setError('Elegí un avatar')}
                className="btn-primary w-full text-base py-3" style={{ backgroundColor: '#0A1628', color: '#FFD700' }}>
                Siguiente →
              </button>
              {error && <p className="text-red-400 text-sm text-center mt-2">{error}</p>}
            </>
          )}

          {/* Step 1: Username */}
          {step === 1 && (
            <>
              <div className="text-center mb-6">
                <AvatarDisplay avatarUrl={avatar} username={username} size={64} style={{ margin: '0 auto 12px' }} />
                <h2 className="font-display text-2xl text-white tracking-wide">TU APODO</h2>
                <p className="text-gray-500 text-sm mt-1">Así te verán los demás en el ranking</p>
              </div>

              <div className="mb-4">
                <label className="text-xs text-gray-500 font-bold block mb-1.5 uppercase tracking-wide">
                  Apodo / usuario *
                </label>
                <input
                  type="text" required minLength={3} maxLength={30}
                  value={username} onChange={e => handleUsernameChange(e.target.value)}
                  className="input-dark text-center text-lg font-bold"
                  placeholder="juancho10"
                />
                <p className="text-gray-600 text-[11px] mt-1 text-center">Sin espacios · mínimo 3 caracteres</p>
              </div>

              {error && <p className="text-red-400 text-sm text-center mb-3">{error}</p>}

              <div className="flex gap-3">
                <button onClick={() => setStep(0)} className="btn-secondary flex-1">← Volver</button>
                <button onClick={handleSave} disabled={saving}
                  className="btn-primary flex-1 disabled:opacity-50" style={{ backgroundColor: '#0A1628', color: '#FFD700' }}>
                  {saving ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            </>
          )}

          {/* Step 2: Reglas */}
          {step === 2 && (
            <div className="py-2">
              <div className="text-center mb-5">
                <h2 className="font-display text-3xl text-white tracking-wide mb-1">LAS REGLAS</h2>
                <p className="text-gray-500 text-sm">Todo lo que necesitás saber para jugar</p>
              </div>

              <div className="space-y-3 mb-6">
                {/* Deadline */}
                <div className="flex items-start gap-3 p-3 rounded-2xl" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
                  <span className="text-xl mt-0.5">⏰</span>
                  <div>
                    <p className="text-white font-bold text-sm">Cierre de predicciones</p>
                    <p className="text-gray-400 text-xs mt-0.5">Las predicciones se cierran <span className="text-white font-semibold">15 minutos antes</span> de cada partido. Pasado ese tiempo no podés modificar tu pronóstico.</p>
                  </div>
                </div>

                {/* Exact score */}
                <div className="flex items-start gap-3 p-3 rounded-2xl" style={{ background: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.2)' }}>
                  <span className="text-xl mt-0.5">🎯</span>
                  <div>
                    <p className="text-white font-bold text-sm">Marcador exacto <span className="font-display text-lg text-[#4ade80] ml-1">3 pts</span></p>
                    <p className="text-gray-400 text-xs mt-0.5">Acertás el resultado exacto de ambos equipos.</p>
                  </div>
                </div>

                {/* Correct winner */}
                <div className="flex items-start gap-3 p-3 rounded-2xl" style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.2)' }}>
                  <span className="text-xl mt-0.5">✅</span>
                  <div>
                    <p className="text-white font-bold text-sm">Ganador o empate <span className="font-display text-lg text-[#fbbf24] ml-1">1 pt</span></p>
                    <p className="text-gray-400 text-xs mt-0.5">Acertás quién gana el partido (o que empata), aunque el marcador exacto no coincida.</p>
                  </div>
                </div>

                {/* Goalscorer */}
                <div className="flex items-start gap-3 p-3 rounded-2xl" style={{ background: 'rgba(27,79,216,0.1)', border: '1px solid rgba(27,79,216,0.25)' }}>
                  <span className="text-xl mt-0.5">⚽</span>
                  <div>
                    <p className="text-white font-bold text-sm">Primer goleador <span className="font-display text-lg text-[#1B4FD8] ml-1">+1 pt</span></p>
                    <p className="text-gray-400 text-xs mt-0.5">Elegís quién mete el primer gol del partido. Si acertás, sumás 1 punto extra encima de los puntos por resultado.</p>
                  </div>
                </div>
              </div>

              <button onClick={() => setStep(3)}
                className="btn-primary w-full text-base py-3" style={{ backgroundColor: '#0A1628', color: '#FFD700' }}>
                Entendido →
              </button>
            </div>
          )}

          {/* Step 3: Done */}
          {step === 3 && (
            <div className="text-center py-4">
              <div className="text-5xl mb-4">🏆</div>
              <h2 className="font-display text-3xl text-white tracking-wide mb-2">¡LISTO!</h2>
              <p className="text-gray-500 text-sm mb-2">Hola, <span className="text-white font-bold">@{username}</span></p>
              <p className="text-gray-600 text-sm mb-8">Ya podés crear o unirte a una liga y hacer tus pronósticos.</p>

              <div className="space-y-3">
                <button onClick={() => { onComplete(); navigate('/crear-liga') }}
                  className="btn-primary w-full text-base py-3" style={{ backgroundColor: '#0A1628', color: '#FFD700' }}>
                  Crear mi primera liga
                </button>
                <button onClick={() => { onComplete(); navigate('/dashboard') }}
                  className="btn-secondary w-full">
                  Ir al Dashboard
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
