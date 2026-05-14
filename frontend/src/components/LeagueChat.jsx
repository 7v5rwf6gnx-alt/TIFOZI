import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { AvatarDisplay } from './AvatarDisplay'

const REACTION_EMOJIS = ['👍', '🔥', '😂', '😱', '💪', '🎯']

function timeLabel(ts) {
  const d = new Date(ts)
  const now = new Date()
  const diffMin = (now - d) / 60000
  if (diffMin < 1) return 'ahora'
  if (diffMin < 60) return `${Math.floor(diffMin)}m`
  if (diffMin < 1440) return `${Math.floor(diffMin / 60)}h`
  return d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })
}

function ReactionBar({ reactions = {}, messageId, userId, onReact }) {
  const [bouncing, setBouncing] = useState(null)
  const counts = {}
  for (const [emoji, users] of Object.entries(reactions)) {
    if (users.length > 0) counts[emoji] = { count: users.length, mine: users.includes(userId) }
  }

  function handleReact(id, emoji) {
    setBouncing(emoji)
    setTimeout(() => setBouncing(null), 350)
    onReact(id, emoji)
  }

  return (
    <div className="flex flex-wrap gap-1 mt-1.5">
      {Object.entries(counts).map(([emoji, { count, mine }]) => (
        <motion.button
          key={emoji}
          onClick={() => handleReact(messageId, emoji)}
          animate={bouncing === emoji ? { scale: [1, 1.4, 0.9, 1.1, 1] } : {}}
          transition={{ duration: 0.35 }}
          className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-xs transition-all border ${
            mine
              ? 'bg-[#1B4FD8]/20 border-[#1B4FD8]/40 text-[#1B4FD8]'
              : 'bg-white/5 border-white/10 text-gray-400 hover:border-white/25'
          }`}>
          <span>{emoji}</span>
          <span className="font-bold">{count}</span>
        </motion.button>
      ))}
      <div className="relative group">
        <button className="flex items-center px-1.5 py-0.5 rounded-full text-xs bg-white/5 border border-white/10 text-gray-600 hover:text-gray-300 hover:border-white/25 transition-all">
          +
        </button>
        <div className="absolute bottom-full left-0 mb-1 bg-[#1A1A1A] border border-white/15 rounded-xl p-1.5 flex gap-1 shadow-card-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none group-hover:pointer-events-auto z-10 whitespace-nowrap">
          {REACTION_EMOJIS.map(e => (
            <button key={e} onClick={() => handleReact(messageId, e)}
              className="text-base hover:scale-125 transition-transform active:scale-95">
              {e}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

export default function LeagueChat({ ligaId }) {
  const { user, profile } = useAuth()
  const [messages, setMessages] = useState([])
  const [profiles, setProfiles] = useState({})
  const [text, setText]         = useState('')
  const [sending, setSending]   = useState(false)
  const [loading, setLoading]   = useState(true)
  const [dbError, setDbError]   = useState(false)
  const bottomRef = useRef(null)
  const inputRef  = useRef(null)

  // Load initial messages + profiles
  useEffect(() => {
    async function load() {
      const { data: msgs, error } = await supabase
        .from('liga_messages')
        .select('id, user_id, content, reactions, created_at')
        .eq('liga_id', ligaId)
        .order('created_at', { ascending: true })
        .limit(100)

      if (error) {
        // Table doesn't exist yet — show setup notice
        setDbError(true)
        setLoading(false)
        return
      }

      const msgList = msgs || []
      setMessages(msgList)

      const userIds = [...new Set(msgList.map(m => m.user_id))]
      if (userIds.length > 0) {
        const { data: profs } = await supabase
          .from('profiles')
          .select('id, username, avatar_url')
          .in('id', userIds)
        const map = {}
        for (const p of profs || []) map[p.id] = p
        setProfiles(map)
      }
      setLoading(false)
    }
    load()
  }, [ligaId])

  // Real-time subscription
  useEffect(() => {
    const channel = supabase
      .channel(`chat:${ligaId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'liga_messages',
        filter: `liga_id=eq.${ligaId}`,
      }, async (payload) => {
        const msg = payload.new
        setMessages(prev => [...prev, msg])
        // Fetch profile if we don't have it
        if (!profiles[msg.user_id]) {
          const { data } = await supabase
            .from('profiles').select('id, username, avatar_url').eq('id', msg.user_id).single()
          if (data) setProfiles(prev => ({ ...prev, [data.id]: data }))
        }
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'liga_messages',
        filter: `liga_id=eq.${ligaId}`,
      }, (payload) => {
        setMessages(prev => prev.map(m => m.id === payload.new.id ? { ...m, reactions: payload.new.reactions } : m))
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [ligaId, profiles])

  // Auto-scroll to bottom
  useEffect(() => {
    if (!loading) bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  async function handleSend(e) {
    e.preventDefault()
    const content = text.trim()
    if (!content || sending) return
    setSending(true)
    setText('')
    await supabase.from('liga_messages').insert({ liga_id: ligaId, user_id: user.id, content })
    setSending(false)
    inputRef.current?.focus()
  }

  async function handleReact(messageId, emoji) {
    const msg = messages.find(m => m.id === messageId)
    if (!msg) return
    const reactions = { ...(msg.reactions || {}) }
    const users = reactions[emoji] ? [...reactions[emoji]] : []
    const idx = users.indexOf(user.id)
    if (idx >= 0) users.splice(idx, 1)
    else users.push(user.id)
    reactions[emoji] = users
    await supabase.from('liga_messages').update({ reactions }).eq('id', messageId)
  }

  if (loading) return <div className="text-center py-16 text-gray-500">Cargando chat...</div>

  if (dbError) return (
    <div className="text-center py-16">
      <div className="text-4xl mb-3">🔧</div>
      <p className="text-gray-400 font-semibold mb-2">Chat pendiente de configuración</p>
      <p className="text-gray-600 text-sm max-w-xs mx-auto">
        Ejecutá el SQL de <code className="text-[#1B4FD8]">liga_messages</code> en el
        Supabase SQL Editor para activar el chat en tiempo real.
      </p>
    </div>
  )

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 280px)', minHeight: 400 }}>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-1 pr-1 pb-2"
           style={{ scrollbarWidth: 'thin', scrollbarColor: '#333 transparent' }}>
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center py-12">
            <div className="text-5xl mb-3">💬</div>
            <p className="text-gray-500 font-semibold">Nadie ha escrito todavía</p>
            <p className="text-gray-600 text-sm mt-1">¡Sé el primero en romper el hielo!</p>
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {messages.map((msg, idx) => {
              const p          = profiles[msg.user_id] || {}
              const isMe       = msg.user_id === user.id
              const prevMsg    = messages[idx - 1]
              const sameAuthor = prevMsg?.user_id === msg.user_id &&
                (new Date(msg.created_at) - new Date(prevMsg.created_at)) < 120000

              return (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 14, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ duration: 0.22, ease: 'easeOut' }}
                  className={`flex gap-2 ${isMe ? 'flex-row-reverse' : ''} ${sameAuthor ? 'mt-0.5' : 'mt-3'}`}
                >
                  {/* Avatar */}
                  {!sameAuthor ? (
                    <AvatarDisplay avatarUrl={p.avatar_url} username={p.username} size={32}
                                   style={{ marginTop: 2, flexShrink: 0 }} />
                  ) : (
                    <div style={{ width: 32, flexShrink: 0 }} />
                  )}

                  <div className={`flex flex-col max-w-[72%] ${isMe ? 'items-end' : 'items-start'}`}>
                    {!sameAuthor && (
                      <div className={`flex items-baseline gap-1.5 mb-0.5 ${isMe ? 'flex-row-reverse' : ''}`}>
                        <span className="text-xs font-bold text-gray-300">@{p.username ?? '?'}</span>
                        <span className="text-[10px] text-gray-600">{timeLabel(msg.created_at)}</span>
                      </div>
                    )}
                    <div className={`px-3 py-2 rounded-2xl text-sm leading-snug break-words ${
                      isMe
                        ? 'text-white rounded-br-sm'
                        : 'text-gray-200 rounded-bl-sm'
                    }`}
                    style={{
                      background: isMe
                        ? 'linear-gradient(135deg, #1B4FD8, #2a5ef0)'
                        : 'rgba(255,255,255,0.07)',
                      border: isMe ? 'none' : '1px solid rgba(255,255,255,0.08)',
                    }}>
                      {msg.content}
                    </div>
                    {Object.keys(msg.reactions || {}).some(k => (msg.reactions[k] || []).length > 0) && (
                      <ReactionBar
                        reactions={msg.reactions}
                        messageId={msg.id}
                        userId={user.id}
                        onReact={handleReact}
                      />
                    )}
                  </div>
                </motion.div>
              )
            })}
          </AnimatePresence>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSend}
            className="flex gap-2 pt-3 mt-1 border-t border-white/10">
        <AvatarDisplay avatarUrl={profile?.avatar_url} username={profile?.username} size={36}
                       style={{ flexShrink: 0, alignSelf: 'flex-end', marginBottom: 2 }} />
        <input
          ref={inputRef}
          value={text}
          onChange={e => setText(e.target.value.slice(0, 500))}
          placeholder="Escribí un mensaje..."
          maxLength={500}
          className="input-dark flex-1 text-sm"
          style={{ borderRadius: '1rem', paddingTop: 10, paddingBottom: 10 }}
        />
        <button
          type="submit"
          disabled={!text.trim() || sending}
          className="shrink-0 w-10 h-10 rounded-xl flex items-center justify-center text-white disabled:opacity-30 transition-all hover:opacity-90 active:scale-95 self-end"
          style={{ backgroundColor: '#0A1628', color: '#FFD700' }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}
               className="w-4 h-4" style={{ transform: 'rotate(45deg)' }}>
            <path d="M12 19V5M5 12l7-7 7 7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </form>
    </div>
  )
}
