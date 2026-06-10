import { useState } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { AvatarDisplay } from './AvatarDisplay'
import AvatarPicker from './AvatarPicker'

const NAV_BG = '#0A1628'

export default function Navbar() {
  const { user, profile, updateProfile, signOut } = useAuth()
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen]         = useState(false)
  const [pickerOpen, setPickerOpen]     = useState(false)
  const [savingAvatar, setSavingAvatar] = useState(false)

  async function handleSignOut() {
    await signOut()
    navigate('/')
    setMenuOpen(false)
  }

  async function handleAvatarSelect(emoji) {
    setSavingAvatar(true)
    await updateProfile({ avatar_url: emoji })
    setSavingAvatar(false)
    setPickerOpen(false)
  }

  const navLink = ({ isActive }) =>
    `hidden md:flex px-3 py-1.5 text-sm font-semibold transition-colors duration-150 border-b-2 ${
      isActive
        ? 'text-white border-[#FFD700]'
        : 'text-white/70 hover:text-white border-transparent'
    }`

  return (
    <>
      <nav className="sticky top-0 z-50" style={{ backgroundColor: NAV_BG, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">

          {/* Logo */}
          <Link to="/" className="flex items-center gap-3 shrink-0">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border border-white/20"
                 style={{ backgroundColor: 'rgba(255,255,255,0.08)' }}>
              <span className="text-white font-black text-xs leading-none tracking-wider">26</span>
            </div>
            <span className="font-display text-2xl text-white leading-none tracking-widest drop-shadow hidden sm:block">
              POLLAWC26
            </span>
          </Link>

          {/* Nav links */}
          <div className="flex items-stretch gap-0.5">
            {user ? (
              <>
                <NavLink to="/dashboard"       className={navLink}>Ligas</NavLink>
                <NavLink to="/mis-pronosticos" className={navLink}>Pronósticos</NavLink>
                <NavLink to="/ranking"         className={navLink}>Ranking</NavLink>
                <NavLink to="/grupos"          className={navLink}>Grupos</NavLink>
                {profile?.is_admin && (
                  <NavLink to="/admin"
                    className={({ isActive }) =>
                      `hidden md:flex px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                        isActive ? 'text-yellow-300' : 'text-yellow-400/70 hover:text-yellow-300'
                      }`}>
                    ⚙ Admin
                  </NavLink>
                )}

                {/* User menu */}
                <div className="relative ml-2">
                  <button
                    onClick={() => setMenuOpen(!menuOpen)}
                    className="flex items-center gap-2 rounded-xl px-2 py-1.5 transition-all border border-white/15 hover:border-white/30"
                    style={{ backgroundColor: 'rgba(255,255,255,0.07)' }}
                  >
                    {savingAvatar ? (
                      <div className="w-7 h-7 rounded-full bg-white/20 animate-pulse" />
                    ) : (
                      <AvatarDisplay
                        avatarUrl={profile?.avatar_url}
                        username={profile?.username || user.email}
                        size={28}
                        goldBorder
                      />
                    )}
                    <span className="text-white text-sm font-semibold hidden sm:block">
                      {profile?.username || user.email.split('@')[0]}
                    </span>
                    <svg className="w-3 h-3 text-white/40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {menuOpen && (
                    <div className="absolute right-0 top-full mt-2 w-48 bg-[#1A1A1A] border border-white/10 rounded-2xl shadow-card-lg py-1 animate-fade-in">
                      <div className="px-4 py-3 border-b border-white/5">
                        <div className="flex items-center gap-2">
                          <AvatarDisplay avatarUrl={profile?.avatar_url} username={profile?.username} size={32} />
                          <div className="min-w-0">
                            <p className="text-white text-sm font-bold truncate">@{profile?.username}</p>
                            <p className="text-gray-500 text-[11px] truncate">{user.email}</p>
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={() => { setPickerOpen(true); setMenuOpen(false) }}
                        className="w-full text-left px-4 py-2.5 text-sm text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
                      >
                        Cambiar avatar
                      </button>
                      <button
                        onClick={handleSignOut}
                        className="w-full text-left px-4 py-2.5 text-sm text-gray-400 hover:text-white hover:bg-white/5 transition-colors rounded-b-2xl"
                      >
                        Cerrar sesión
                      </button>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <>
                <NavLink to="/grupos"   className={navLink}>Grupos</NavLink>
                <NavLink to="/partidos" className={navLink}>Partidos</NavLink>
                <NavLink to="/ranking"  className={navLink}>Ranking</NavLink>
                <Link to="/auth"
                  className="ml-3 font-bold text-sm px-4 py-2 rounded-xl transition-all text-[#0A1628] bg-white hover:bg-gray-100 shadow-sm">
                  Ingresar
                </Link>
              </>
            )}
          </div>
        </div>

        {menuOpen && (
          <div className="fixed inset-0 z-[-1]" onClick={() => setMenuOpen(false)} />
        )}
      </nav>

      {pickerOpen && (
        <AvatarPicker
          selected={profile?.avatar_url}
          onSelect={handleAvatarSelect}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </>
  )
}
