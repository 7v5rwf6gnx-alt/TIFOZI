const RANK_STYLE = {
  1: { outline: '3px solid #FFD700', boxShadow: '0 0 14px #FFD70055, 0 0 4px #FFD70088' },
  2: { outline: '3px solid #9CA3AF', boxShadow: '0 0 10px #9CA3AF44' },
  3: { outline: '3px solid #CD7F32', boxShadow: '0 0 10px #CD7F3244' },
}

export function AvatarDisplay({ avatarUrl, username, size = 36, rank = null, style = {} }) {
  const ring   = rank ? RANK_STYLE[rank] : {}
  const radius = { borderRadius: '50%', flexShrink: 0 }

  if (avatarUrl?.startsWith('http')) {
    return (
      <img src={avatarUrl} alt={username || ''}
           style={{ width: size, height: size, objectFit: 'cover', ...radius, ...ring, ...style }} />
    )
  }

  const emoji = avatarUrl && !avatarUrl.startsWith('http') ? avatarUrl : null

  return (
    <div style={{
      width: size, height: size,
      background: '#1B4FD8',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: 'white', fontWeight: 900,
      fontSize: emoji ? Math.round(size * 0.48) : Math.round(size * 0.4),
      lineHeight: 1,
      overflow: 'hidden',
      ...radius, ...ring, ...style,
    }}>
      {emoji ?? (username?.[0]?.toUpperCase() ?? '?')}
    </div>
  )
}
