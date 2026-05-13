import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const RAPIDAPI_KEY  = Deno.env.get('RAPIDAPI_KEY')!
const RAPIDAPI_HOST = Deno.env.get('RAPIDAPI_HOST') ?? 'fotmob-api.p.rapidapi.com'
const API_BASE      = `https://${RAPIDAPI_HOST}`

// Overridable via env var; call ?action=discover to find the right ID for WC 2026
const WC_FOTMOB_ID   = parseInt(Deno.env.get('WC_FOTMOB_LEAGUE_ID') ?? '77')
const MATCH_DURATION = 120  // minutes after kickoff before we try to finalize

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

// Parse "2 - 1" → { home: 2, away: 1 }
function parseScore(scoreStr: string): { home: number; away: number } | null {
  if (!scoreStr) return null
  const parts = scoreStr.trim().split(' - ')
  if (parts.length !== 2) return null
  const home = parseInt(parts[0]), away = parseInt(parts[1])
  if (isNaN(home) || isNaN(away)) return null
  return { home, away }
}

function toFmtDate(dateStr: string): string {
  return (dateStr as string).slice(0, 10).replace(/-/g, '') // YYYYMMDD
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

function nameMatch(a: string, b: string): boolean {
  const clean = (s: string) => s.replace(/[^a-z]/g, '')
  const ca = clean(a), cb = clean(b)
  return ca.startsWith(cb.slice(0, 4)) || cb.startsWith(ca.slice(0, 4))
    || ca.includes(cb.slice(0, 5)) || cb.includes(ca.slice(0, 5))
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status, headers: { 'Content-Type': 'application/json' },
  })
}

// ── Sync World Cup results ────────────────────────────────────────────────────
async function syncResults() {
  const { data: pending } = await supabase
    .from('matches')
    .select('id, match_date, match_time, fotmob_id')
    .eq('competition', 'world_cup')
    .neq('status', 'finished')
    .not('fotmob_id', 'is', null)

  if (!pending?.length) return json({ message: 'Sin partidos pendientes', updated: 0 })

  const cutoffMs = Date.now() - MATCH_DURATION * 60_000
  const toSync = pending.filter(m => {
    if (!m.match_time || !m.match_date) return false
    const [h, min] = (m.match_time as string).split(':').map(Number)
    const d = (m.match_date as string).slice(0, 10)
    const kickoff = new Date(`${d}T${String(h).padStart(2,'0')}:${String(min).padStart(2,'0')}:00-05:00`)
    return kickoff.getTime() < cutoffMs
  })

  if (!toSync.length) return json({ message: 'Ningún partido listo para sincronizar', updated: 0 })

  const byDate: Record<string, typeof toSync> = {}
  for (const m of toSync) {
    const key = toFmtDate(m.match_date as string)
    ;(byDate[key] ??= []).push(m)
  }

  let updated = 0
  const logs: string[] = []

  for (const [date, matches] of Object.entries(byDate)) {
    const data = await apiFetch(`/matches?date=${date}`)
    const leagues: any[] = data.leagues ?? []

    const league = leagues.find(l => l.id === WC_FOTMOB_ID)
      ?? leagues.find(l => (l.name as string)?.toLowerCase().includes('world cup'))

    if (!league) { logs.push(`No WC league for ${date}`); continue }

    const byId: Record<string, any> = {}
    for (const f of (league.matches ?? [])) byId[String(f.id)] = f

    for (const match of matches) {
      const fixture = byId[String(match.fotmob_id)]
      if (!fixture) { logs.push(`Sin fixture fotmob_id=${match.fotmob_id}`); continue }

      if (!fixture.status?.finished) {
        logs.push(`Partido ${match.fotmob_id} aún en progreso`)
        continue
      }

      const score = parseScore(fixture.status.scoreStr)
      if (!score) { logs.push(`No se pudo parsear scoreStr="${fixture.status.scoreStr}"`); continue }

      const { error } = await supabase
        .from('matches')
        .update({ home_score: score.home, away_score: score.away, status: 'finished' })
        .eq('id', match.id)

      if (error) { logs.push(`Error actualizando ${match.id}: ${error.message}`); continue }

      logs.push(`✓ Partido ${match.fotmob_id}: ${score.home}-${score.away}`)
      updated++
    }
  }

  return json({ updated, total: toSync.length, logs })
}

// ── Populate fotmob_id for WC matches (one-time) ─────────────────────────────
async function populateIds() {
  const { data: matches } = await supabase
    .from('matches')
    .select('id, match_date, fotmob_id, home_team:home_team_id(name, code), away_team:away_team_id(name, code)')
    .eq('competition', 'world_cup')
    .is('fotmob_id', null)

  if (!matches?.length) return json({ message: 'Todos los partidos ya tienen fotmob_id' })

  const dates = [...new Set(matches.map(m => toFmtDate(m.match_date as string)))]
  const allFixtures: any[] = []

  for (const date of dates) {
    const data = await apiFetch(`/matches?date=${date}`)
    const leagues: any[] = data.leagues ?? []
    const league = leagues.find(l => l.id === WC_FOTMOB_ID)
      ?? leagues.find(l => (l.name as string)?.toLowerCase().includes('world cup'))
    if (league?.matches) {
      const isoDate = `${date.slice(0,4)}-${date.slice(4,6)}-${date.slice(6,8)}`
      allFixtures.push(...league.matches.map((m: any) => ({ ...m, _date: isoDate })))
    }
  }

  let mapped = 0
  const unmapped: string[] = []

  for (const fixture of allFixtures) {
    const fHome = (fixture.home?.name as string)?.toLowerCase() ?? ''
    const fAway = (fixture.away?.name as string)?.toLowerCase() ?? ''
    const fDate = fixture._date as string

    const match = matches.find(m => {
      if ((m as any).fotmob_id) return false
      const d  = (m.match_date as string).slice(0, 10)
      const d1 = addDays(d, -1), d2 = addDays(d, 1)
      if (![d, d1, d2].includes(fDate)) return false
      const home = (m.home_team as any)?.name?.toLowerCase() ?? ''
      const away = (m.away_team as any)?.name?.toLowerCase() ?? ''
      return nameMatch(home, fHome) && nameMatch(away, fAway)
    })

    if (!match) {
      unmapped.push(`${fixture.id}: ${fixture.home?.name} vs ${fixture.away?.name} (${fDate})`)
      continue
    }

    await supabase.from('matches').update({ fotmob_id: fixture.id }).eq('id', match.id)
    ;(match as any).fotmob_id = fixture.id
    mapped++
  }

  return json({ mapped, unmapped })
}

// ── Discover available leagues for today (debug helper) ───────────────────────
async function discoverLeagues() {
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const data = await apiFetch(`/matches?date=${today}`)
  const leagues = (data.leagues ?? []).map((l: any) => ({
    id: l.id, name: l.name, matchCount: l.matches?.length ?? 0,
  }))
  return json({ date: today, leagueCount: leagues.length, leagues })
}

// ── Entry point ───────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  try {
    const action = new URL(req.url).searchParams.get('action')
    if (action === 'populate') return await populateIds()
    if (action === 'discover') return await discoverLeagues()
    return await syncResults()
  } catch (err: any) {
    console.error(err)
    return json({ error: err.message }, 500)
  }
})
