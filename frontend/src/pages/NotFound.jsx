import { Link } from 'react-router-dom'

export default function NotFound() {
  return (
    <div className="min-h-[calc(100vh-64px)] flex items-center justify-center px-4 text-center">
      <div>
        <p className="font-display text-[10rem] leading-none text-white/5 select-none mb-0">
          404
        </p>
        <h1 className="font-display text-5xl text-white tracking-wide -mt-6 mb-3">
          PÁGINA NO ENCONTRADA
        </h1>
        <p className="text-gray-500 mb-8 max-w-sm mx-auto">
          El link que seguiste no existe o fue movido.
        </p>
        <Link
          to="/"
          className="font-display font-black text-lg px-10 py-4 rounded-2xl tracking-wide
                     text-[#111] active:scale-95 transition-all"
          style={{ backgroundColor: '#FFD700' }}
        >
          VOLVER AL INICIO
        </Link>
      </div>
    </div>
  )
}
