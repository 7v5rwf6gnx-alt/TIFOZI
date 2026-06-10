import { NavLink, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const NAV_BG = '#0A1628'

export default function BottomNav() {
  const { user, profile } = useAuth()
  const { pathname } = useLocation()

  if (!user) return null

  const tabs = [
    {
      to: '/mis-pronosticos',
      label: 'Pronósticos',
      icon: (active) => (
        <svg viewBox="0 0 24 24" fill={active ? 'currentColor' : 'none'} stroke="currentColor"
             strokeWidth={active ? 0 : 1.8} className="w-6 h-6">
          <path strokeLinecap="round" strokeLinejoin="round"
            d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z"/>
        </svg>
      ),
    },
    {
      to: '/dashboard',
      label: 'Ligas',
      icon: (active) => (
        <svg viewBox="0 0 24 24" fill={active ? 'currentColor' : 'none'} stroke="currentColor"
             strokeWidth={active ? 0 : 1.8} className="w-6 h-6">
          <path strokeLinecap="round" strokeLinejoin="round"
            d="M8 21h8M12 17v4M5 3h14a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2zm7 5l-2 2-2-2"/>
        </svg>
      ),
    },
    {
      to: '/ranking',
      label: 'Ranking',
      icon: (active) => (
        <svg viewBox="0 0 24 24" fill={active ? 'currentColor' : 'none'} stroke="currentColor"
             strokeWidth={active ? 0 : 1.8} className="w-6 h-6">
          <path strokeLinecap="round" strokeLinejoin="round"
            d="M3 3h7v10H3zM14 8h7v5h-7zM14 16h7v5h-7zM3 16h7v5H3z"/>
        </svg>
      ),
    },
    {
      to: '/grupos',
      label: 'Grupos',
      icon: (active) => (
        <svg viewBox="0 0 24 24" fill={active ? 'currentColor' : 'none'} stroke="currentColor"
             strokeWidth={active ? 0 : 1.8} className="w-6 h-6">
          <path strokeLinecap="round" strokeLinejoin="round"
            d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 004 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
        </svg>
      ),
    },
  ]

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 flex items-stretch"
         style={{
           backgroundColor: NAV_BG,
           borderTop: '1px solid rgba(255,255,255,0.08)',
           paddingBottom: 'env(safe-area-inset-bottom)',
         }}>
      {tabs.map(({ to, label, icon }) => {
        const active = pathname === to || pathname.startsWith(to + '/')
        return (
          <NavLink key={to} to={to}
            className="flex-1 flex flex-col items-center justify-center gap-0.5 py-2.5 transition-colors"
            style={{ color: active ? '#FFD700' : 'rgba(255,255,255,0.4)' }}>
            {icon(active)}
            <span className="text-[10px] font-bold tracking-wide">{label}</span>
          </NavLink>
        )
      })}
    </nav>
  )
}
