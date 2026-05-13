import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const RAPIDAPI_KEY  = Deno.env.get('RAPIDAPI_KEY')!
const RAPIDAPI_HOST = Deno.env.get('RAPIDAPI_HOST') ?? 'fotmob-api.p.rapidapi.com'
const API_BASE      = `https://${RAPIDAPI_HOST}`
const PL_FOTMOB_ID  = 47  // Premier League

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false } }
)

const apiHeaders = {
  'X-RapidAPI-Key':  RAPIDAPI_KEY,
  'X-RapidAPI-Host': RAPIDAPI_HOST,
}

async function apiFetch(path: string) {
  const res = await fetch(`${API_BASE}${path}`, { headers: apiHeaders })
  if (!res.ok) throw new Error(`FotMob API ${res.status}: ${await res.text()}`)
  return res.json()
}

function parseScore(scoreStr: string): { home: number; away: number } | null {
  if (!scoreStr) return null
  const parts = scoreStr.trim().split(' - ')
  if (parts.length !== 2) return null
  const home = parseInt(parts[0]), away = parseInt(parts[1])
  if (isNaN(home) || isNaN(away)) return null
  return { home, away }
}

// Fetch goalscorers from matchDetails endpoint
async function getGoalscorers(matchId: number): Promise<string[]> {
  try {
    const data = await apiFetch(`/matchDetails?matchId=${matchId}`)
    const events: any[] = data?.content?.matchFacts?.events?.events ?? []
    return events
      .filter((e: any) => e.type === 'Goal' || e.type === 'goal')
      .map((e: any) => `${e.player?.name ?? 'Desconocido'} (${e.time}')`)
  } catch {
    return []
  }
}

// Determine target dates:
//   ?date=20260516            → specific date (YYYYMMDD)
//   ?date=20260516,20260517   → multiple dates
//   (no param)                → this weekend (Sat + Sun + Mon UTC)
function getTargetDates(dateParam: string | null): string[] {
  if (dateParam) {
    return dateParam.split(',').map(d => d.trim())
  }
  const now = new Date()
  const day = now.getUTCDay() // 0=Sun, 6=Sat

  const daysToSat = day === 6 ? 0 : day === 0 ? -1 : 6 - day
  const sat = new Date(now)
  sat.setUTCDate(now.getUTCDate() + daysToSat)
  const sun = new Date(sat)
  sun.setUTCDate(sat.getUTCDate() + 1)
  const mon = new Date(sat)
  mon.setUTCDate(sat.getUTCDate() + 2)

  const fmt = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, '')
  const dates = [fmt(sat), fmt(sun), fmt(mon)]

  if (day === 0 || day === 1 || day === 6) dates.unshift(fmt(now))

  return [...new Set(dates)]
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status, headers: { 'Content-Type': 'application/json' },
  })
}

// ── Main: sync PL weekend matches ─────────────────────────────────────────────
async function sincronizarPremier(dateParam: string | null) {
  const dates    = getTargetDates(dateParam)
  const inserted: any[] = []
  const synced:   any[] = []
  const logs:     string[] = []

  for (const date of dates) {
    const data = await apiFetch(`/matches?date=${date}`)
    const leagues: any[] = data.leagues ?? []

    const plLeague = leagues.find(l => l.id === PL_FOTMOB_ID)
      ?? leagues.find(l => (l.name as string)?.toLowerCase().includes('premier league'))

    if (!plLeague) { logs.push(`No PL found for ${date}`); continue }

    const matches: any[] = plLeague.matches ?? []
    logs.push(`${date}: ${matches.length} partidos de PL`)

    for (const f of matches) {
      const utcTime: string     = f.status?.utcTime ?? ''
      const matchDateRaw        = utcTime.slice(0, 10)   // YYYY-MM-DD
      const matchTimeUTC        = utcTime.slice(11, 16)  // HH:MM UTC
      const isFinished: boolean = f.status?.finished === true
      const score               = isFinished ? parseScore(f.status?.scoreStr) : null

      const goalscorers = isFinished ? await getGoalscorers(Number(f.id)) : []

      const row = {
        competition:    'premier_league',
        fotmob_id:      Number(f.id),
        stage:          'premier_league',
        home_team_name: f.home?.name ?? '',
        away_team_name: f.away?.name ?? '',
        match_date:     matchDateRaw,
        match_time:     matchTimeUTC,
        status:         isFinished ? 'finished' : 'scheduled',
        home_score:     score?.home ?? null,
        away_score:     score?.away ?? null,
      }

      const { data: upserted, error } = await supabase
        .from('matches')
        .upsert(row, { onConflict: 'fotmob_id' })
        .select('id, home_team_name, away_team_name, status, home_score, away_score')
        .single()

      if (error) {
        logs.push(`Error ${f.home?.name} vs ${f.away?.name}: ${error.message}`)
        continue
      }

      const entry = {
        id:         upserted?.id,
        match:      `${f.home?.name} vs ${f.away?.name}`,
        kickoff:    utcTime,
        score,
        goalscorers,
      }

      if (isFinished) {
        synced.push(entry)
        logs.push(`✓ ${f.home?.name} ${score?.home}-${score?.away} ${f.away?.name}${
          goalscorers.length ? ` | Goles: ${goalscorers.join(', ')}` : ''
        }`)
      } else {
        inserted.push(entry)
        logs.push(`📅 ${f.home?.name} vs ${f.away?.name} @ ${utcTime} UTC`)
      }
    }
  }

  return json({
    dates,
    scheduled: inserted.length,
    finished:  synced.length,
    matches:   [...inserted, ...synced],
    logs,
  })
}

// ── Entry point ───────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  try {
    const url  = new URL(req.url)
    const date = url.searchParams.get('date')
    return await sincronizarPremier(date)
  } catch (err: any) {
    console.error(err)
    return json({ error: err.message }, 500)
  }
})
