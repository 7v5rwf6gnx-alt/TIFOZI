import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import { createClient } from '@supabase/supabase-js'
import winston from 'winston'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// ── Validación de variables de entorno ────────────────────────────────────────
const REQUIRED_ENV = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'FRONTEND_URL']
const missing = REQUIRED_ENV.filter(k => !process.env[k])
if (missing.length) {
  console.error(`❌ Variables de entorno faltantes: ${missing.join(', ')}`)
  console.error('   Revisá el archivo .env — el servidor no puede arrancar sin ellas.')
  process.exit(1)
}

// ── Logger ────────────────────────────────────────────────────────────────────
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      ),
    }),
    new winston.transports.File({
      filename: path.join(__dirname, '../logs/error.log'),
      level: 'error',
    }),
    new winston.transports.File({
      filename: path.join(__dirname, '../logs/combined.log'),
    }),
  ],
})

// ── Supabase (service role — nunca exponer al cliente) ────────────────────────
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
)

// ── App ───────────────────────────────────────────────────────────────────────
const app = express()
const PORT = process.env.PORT || 3000

// Headers de seguridad (helmet)
app.use(helmet())
app.disable('x-powered-by')

// CORS — solo el dominio de la app
const allowedOrigins = (process.env.FRONTEND_URL || '').split(',').map(s => s.trim())
app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true)
    cb(new Error(`CORS bloqueado: ${origin}`))
  },
  credentials: true,
}))

app.use(express.json({ limit: '16kb' }))

// ── Rate limiters ─────────────────────────────────────────────────────────────

// Global: 100 req / min por IP
const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiadas solicitudes. Intentá de nuevo en un minuto.' },
})

// Predicciones: 10 saves / min por usuario (corre siempre después de requireAuth)
const predictionLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  keyGenerator: req => req.user.id,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Límite de predicciones alcanzado. Esperá un momento.' },
})

app.use(globalLimiter)

// ── Middleware de autenticación JWT ───────────────────────────────────────────
async function requireAuth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '')
  if (!token) return res.status(401).json({ error: 'No autorizado: falta token' })

  const { data: { user }, error } = await supabase.auth.getUser(token)
  if (error || !user) return res.status(401).json({ error: 'Token inválido o expirado' })

  req.user = user
  next()
}

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'quiniela-mundial-2026', ts: new Date().toISOString() })
})

// ── POST /api/predicciones ────────────────────────────────────────────────────
// Guarda o actualiza una predicción con validación server-side completa.
app.post('/api/predicciones', requireAuth, predictionLimiter, async (req, res, next) => {
  try {
    const { match_id, home_score, away_score, primer_goleador_prediccion_id } = req.body
    const user_id = req.user.id

    // Validar presencia
    if (!match_id) return res.status(400).json({ error: 'match_id requerido' })

    // Validar goles: enteros 0-30
    const hs = Number(home_score)
    const as_ = Number(away_score)
    if (!Number.isInteger(hs) || hs < 0 || hs > 30)
      return res.status(400).json({ error: 'home_score debe ser un entero entre 0 y 30' })
    if (!Number.isInteger(as_) || as_ < 0 || as_ > 30)
      return res.status(400).json({ error: 'away_score debe ser un entero entre 0 y 30' })

    // Obtener partido
    const { data: match, error: matchErr } = await supabase
      .from('matches')
      .select('id, match_date, match_time, status')
      .eq('id', match_id)
      .single()

    if (matchErr || !match)
      return res.status(404).json({ error: 'Partido no encontrado' })
    if (match.status === 'finished')
      return res.status(403).json({ error: 'El partido ya finalizó' })

    // Verificar bloqueo: 10 minutos antes del kickoff
    const dateStr = match.match_date?.slice(0, 10)
    if (dateStr && match.match_time) {
      const [h, m] = match.match_time.split(':').map(Number)
      const kickoff = new Date(
        `${dateStr}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00-05:00`
      )
      if (Date.now() >= kickoff.getTime() - 10 * 60 * 1000) {
        return res.status(403).json({
          error: 'El partido está bloqueado (faltan menos de 10 minutos para el kickoff)',
        })
      }
    }

    // Upsert
    const { data, error: upsertErr } = await supabase
      .from('predictions')
      .upsert(
        {
          user_id,
          match_id,
          home_score: hs,
          away_score: as_,
          primer_goleador_prediccion_id: primer_goleador_prediccion_id ?? null,
        },
        { onConflict: 'user_id,match_id' }
      )
      .select('match_id, home_score, away_score, points_earned, bonus_goleador, primer_goleador_prediccion_id')
      .single()

    if (upsertErr) {
      logger.error('Error al guardar predicción', { error: upsertErr.message, user_id, match_id })
      return res.status(500).json({ error: 'Error al guardar la predicción' })
    }

    res.json(data)
  } catch (err) {
    next(err)
  }
})

// ── 404 ───────────────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: 'Endpoint no encontrado' })
})

// ── Global error handler (nunca expone stack traces al cliente) ───────────────
app.use((err, req, res, _next) => {
  logger.error('Error no manejado', {
    message: err.message,
    stack:   err.stack,
    method:  req.method,
    url:     req.url,
  })
  res.status(500).json({ error: 'Error interno del servidor' })
})

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  logger.info(`⚽ Servidor corriendo en http://localhost:${PORT}`)
})
