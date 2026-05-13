import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function ProtectedRoute({ children, adminOnly = false }) {
  const { user, profile, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <span className="text-slate-400">Cargando...</span>
      </div>
    )
  }

  if (!user) return <Navigate to="/auth" replace />
  if (adminOnly && !profile?.is_admin) return <Navigate to="/" replace />

  return children
}
