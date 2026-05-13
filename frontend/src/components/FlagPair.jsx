import { Link } from 'react-router-dom'

// Upgrade flagcdn.com URL from w40 → higher resolution
function hiresSrc(flagUrl, w) {
  return flagUrl?.replace(/\/w\d+\//, `/w${w}/`) ?? ''
}

// Individual flag sticker — square, rounded corners, white border, hi-res
export function Flag({ src, alt = '', size = 32 }) {
  const radius = Math.round(size * 0.27)
  const src80  = hiresSrc(src, 80)
  const src160 = hiresSrc(src, 160)
  return (
    <div style={{
      width: size, height: size, flexShrink: 0,
      borderRadius: radius,
      border: '2px solid white',
      boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
      overflow: 'hidden',
    }}>
      <img
        src={src80 || src}
        srcSet={src80 ? `${src80} 1x, ${src160} 2x` : undefined}
        alt={alt}
        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        onError={e => { e.target.style.display = 'none' }}
      />
    </div>
  )
}

// Overlapping flag pair — home top-left (z2 / on top), away bottom-right (z1)
export function MatchFlags({ homeSrc, awaySrc, size = 44 }) {
  const offset = 14
  const total  = size + offset
  const radius = Math.round(size * 0.27)

  const boxStyle = (pos) => ({
    position: 'absolute',
    width: size, height: size,
    borderRadius: radius,
    border: '2px solid white',
    boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
    overflow: 'hidden',
    ...pos,
  })

  const imgStyle = { width: '100%', height: '100%', objectFit: 'cover', display: 'block' }

  return (
    <div style={{ position: 'relative', width: total, height: total, flexShrink: 0 }}>
      {/* Away — bottom-right, behind */}
      <div style={boxStyle({ bottom: 0, right: 0, zIndex: 1 })}>
        <img
          src={hiresSrc(awaySrc, 80)}
          srcSet={`${hiresSrc(awaySrc, 80)} 1x, ${hiresSrc(awaySrc, 160)} 2x`}
          alt=""
          style={imgStyle}
          onError={e => { e.target.style.display = 'none' }}
        />
      </div>
      {/* Home — top-left, on top */}
      <div style={boxStyle({ top: 0, left: 0, zIndex: 2 })}>
        <img
          src={hiresSrc(homeSrc, 80)}
          srcSet={`${hiresSrc(homeSrc, 80)} 1x, ${hiresSrc(homeSrc, 160)} 2x`}
          alt=""
          style={imgStyle}
          onError={e => { e.target.style.display = 'none' }}
        />
      </div>
    </div>
  )
}

// Team block: large flag above team name — 48px mobile / 56px desktop
// Pass `code` to make it a clickable link to /equipos/[code]
export function TeamBlock({ flagUrl, name, code }) {
  const src80  = hiresSrc(flagUrl, 80)
  const src160 = hiresSrc(flagUrl, 160)
  const Wrapper = code ? Link : 'div'
  const wrapperProps = code ? { to: `/equipos/${code}` } : {}

  return (
    <Wrapper
      {...wrapperProps}
      className={`flex-1 flex flex-col items-center gap-2 ${code ? 'group' : ''}`}
    >
      <div
        className={`w-12 h-12 sm:w-14 sm:h-14 rounded-xl border-2 border-white overflow-hidden shrink-0 transition-all duration-200 ${
          code ? 'group-hover:brightness-110 group-hover:shadow-[0_0_14px_rgba(255,255,255,0.18)]' : ''
        }`}
        style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.25)' }}
      >
        <img
          src={src80}
          srcSet={src80 ? `${src80} 1x, ${src160} 2x` : undefined}
          alt={name || ''}
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          onError={e => { e.target.style.display = 'none' }}
        />
      </div>
      <span className={`font-display text-base sm:text-lg text-white text-center leading-tight ${
        code ? 'group-hover:underline underline-offset-2 decoration-white/40' : ''
      }`}>
        {name}
      </span>
    </Wrapper>
  )
}

export default MatchFlags
