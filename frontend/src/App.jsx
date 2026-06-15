import { BrowserRouter, Routes, Route, useLocation, Outlet } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { AuthProvider } from './context/AuthContext'
import { useAuth } from './context/AuthContext'
import Navbar from './components/Navbar'
import BottomNav from './components/BottomNav'
import ProtectedRoute from './components/ProtectedRoute'
import ErrorBoundary from './components/ErrorBoundary'
import OnboardingModal from './components/OnboardingModal'
import WhatsNewModal from './components/WhatsNewModal'
import Home from './pages/Home'
import Auth from './pages/Auth'
import Groups from './pages/Groups'
import Matches from './pages/Matches'
import Predictions from './pages/Predictions'
import Dashboard from './pages/Dashboard'
import CreateLeague from './pages/CreateLeague'
import JoinLeague from './pages/JoinLeague'
import LeaguePage from './pages/LeaguePage'
import Admin from './pages/Admin'
import Teams from './pages/Teams'
import TeamDetail from './pages/TeamDetail'
import Leaderboard from './pages/Leaderboard'
import NotFound from './pages/NotFound'
import { useState } from 'react'

const HERO_VIDEO_ID = '4kFYJjQ4cz4'

function PersistentHeroVideo() {
  const { pathname } = useLocation()
  const isHome = pathname === '/'
  return (
    <div
      aria-hidden="true"
      style={{
        position: 'fixed', inset: 0, zIndex: -1,
        pointerEvents: 'none', overflow: 'hidden',
        opacity: isHome ? 1 : 0,
        transition: 'opacity 0.6s',
      }}
    >
      <iframe
        src={`https://www.youtube.com/embed/${HERO_VIDEO_ID}?autoplay=1&mute=1&loop=1&controls=0&showinfo=0&rel=0&modestbranding=1&playlist=${HERO_VIDEO_ID}&iv_load_policy=3&disablekb=1&playsinline=1`}
        allow="autoplay; encrypted-media"
        tabIndex={-1}
        style={{
          position: 'absolute', top: '50%', left: '50%',
          width: 'max(100%, calc(100vh * 16 / 9))',
          height: 'max(100%, calc(100vw * 9 / 16))',
          transform: 'translate(-50%, -50%) scale(1.08)',
          border: 'none', pointerEvents: 'none',
        }}
      />
      <div style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.60)' }} />
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 220,
                    background: 'linear-gradient(to bottom, transparent 0%, #111111 100%)' }} />
    </div>
  )
}

function RouteBackground({ children }) {
  const { pathname } = useLocation()
  return (
    <div className="min-h-screen"
         style={{ backgroundColor: pathname !== '/' ? '#111111' : 'transparent' }}>
      {children}
    </div>
  )
}

function AnimatedRoutes() {
  const { pathname } = useLocation()
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div key={pathname}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -4 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}>
        <Outlet />
      </motion.div>
    </AnimatePresence>
  )
}

function OnboardingGate({ children }) {
  const { user, profile, loading } = useAuth()
  const [dismissed, setDismissed]  = useState(
    () => Boolean(localStorage.getItem('onboarding_done'))
  )

  const needsOnboarding = !loading && user && profile && !profile.avatar_url && !dismissed

  function handleComplete() {
    localStorage.setItem('onboarding_done', '1')
    setDismissed(true)
  }

  return (
    <>
      {children}
      {needsOnboarding && <OnboardingModal onComplete={handleComplete} />}
      <WhatsNewModal />
    </>
  )
}

export default function App() {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <AuthProvider>
        <ErrorBoundary>
          <OnboardingGate>
            <PersistentHeroVideo />
            <RouteBackground>
              <Navbar />
              <div className="pb-20 md:pb-0">
              <Routes>
                <Route element={<AnimatedRoutes />}>
                  <Route path="/"                element={<Home />} />
                  <Route path="/auth"            element={<Auth />} />
                  <Route path="/grupos"          element={<Groups />} />
                  <Route path="/partidos"        element={<Matches />} />
                  <Route path="/unirse/:codigo"  element={<JoinLeague />} />
                  <Route path="/equipos"         element={<Teams />} />
                  <Route path="/equipos/:codigo" element={<TeamDetail />} />
                  <Route path="/ranking"         element={<Leaderboard />} />

                  <Route path="/dashboard" element={
                    <ProtectedRoute><Dashboard /></ProtectedRoute>
                  } />
                  <Route path="/crear-liga" element={
                    <ProtectedRoute><CreateLeague /></ProtectedRoute>
                  } />
                  <Route path="/liga/:id" element={
                    <ProtectedRoute><LeaguePage /></ProtectedRoute>
                  } />
                  <Route path="/mis-pronosticos" element={
                    <ProtectedRoute><Predictions /></ProtectedRoute>
                  } />
                  <Route path="/admin" element={
                    <ProtectedRoute adminOnly><Admin /></ProtectedRoute>
                  } />

                  <Route path="*" element={<NotFound />} />
                </Route>
              </Routes>
              </div>
              <BottomNav />
            </RouteBackground>
          </OnboardingGate>
        </ErrorBoundary>
      </AuthProvider>
    </BrowserRouter>
  )
}
