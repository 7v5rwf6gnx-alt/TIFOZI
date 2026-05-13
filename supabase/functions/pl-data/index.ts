import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const API_KEY  = Deno.env.get('APIFOOTBALL_KEY')!
const API_BASE = 'https://v3.football.api-sports.io'
const PL_LEAGUE = 39
const PL_SEASON = 2024  // 2024/25 — free plan covers up to season 2024

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false } }
)

const apiHeaders = { 'x-apisports-key': API_KEY }

async function apiFetch(path: string) {
  const res = await fetch(`${API_BASE}${path}`, { headers: apiHeaders })
  if (!res.ok) throw new Error(`API-Football ${res.status}: ${path}`)
  return res.json()
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  })
}

// ── STANDINGS ─────────────────────────────────────────────────────────────────
async function getStandings() {
  const data = await apiFetch(`/standings?league=${PL_LEAGUE}&season=${PL_SEASON}`)

  if (data.errors && Object.keys(data.errors).length > 0) {
    return json({ error: JSON.stringify(data.errors) }, 500)
  }

  const league = data.response?.[0]?.league
  if (!league?.standings?.[0]?.length) {
    return json({ error: 'No standings data in response', raw: data }, 500)
  }

  const rows = league.standings[0].map((t: any) => ({
    rank:          t.rank,
    teamId:        t.team.id,
    teamName:      t.team.name,
    logo:          t.team.logo,
    played:        t.all.played,
    won:           t.all.win,
    drawn:         t.all.draw,
    lost:          t.all.lose,
    goalsFor:      t.all.goals.for,
    goalsAgainst:  t.all.goals.against,
    goalDiff:      t.goalsDiff,
    points:        t.points,
    form:          t.form,
    description:   t.description ?? '',
  }))

  return json({ season: PL_SEASON, league: league.name, rows })
}

// ── SQUADS ────────────────────────────────────────────────────────────────────
const POSITION_MAP: Record<string, string> = {
  G: 'portero', D: 'defensa', M: 'mediocampista', F: 'delantero',
  Goalkeeper: 'portero', Defender: 'defensa', Midfielder: 'mediocampista',
  Attacker: 'delantero', Forward: 'delantero',
}

async function syncSquads() {
  // Get PL teams we've inserted (fotmob_id is their API-Football ID)
  const { data: plTeams } = await supabase
    .from('teams')
    .select('id, name, fotmob_id')
    .not('fotmob_id', 'is', null)
    .order('name')

  if (!plTeams?.length) return json({ error: 'No PL teams found' }, 400)

  let totalUpserted = 0
  const logs: string[] = []

  for (const team of plTeams) {
    try {
      const data = await apiFetch(`/players/squads?team=${team.fotmob_id}`)
      const players: any[] = data.response?.[0]?.players ?? []

      if (!players.length) {
        logs.push(`${team.name}: squad empty`)
        continue
      }

      const rows = players.map((p: any) => ({
        equipo_id:       team.id,
        sofascore_id:    p.id,   // reusing sofascore_id for API-Football player ID
        nombre:          p.name,
        numero_camiseta: p.number ?? null,
        posicion:        POSITION_MAP[p.position] ?? null,
        club_actual:     team.name,
      })).filter((r: any) => r.nombre && r.sofascore_id)

      const { error } = await supabase
        .from('jugadores')
        .upsert(rows, { onConflict: 'sofascore_id' })

      if (error) { logs.push(`${team.name}: ${error.message}`); continue }
      totalUpserted += rows.length
      logs.push(`✓ ${team.name}: ${rows.length} jugadores`)
    } catch (e: any) {
      logs.push(`${team.name}: ${e.message}`)
    }
  }

  return json({ totalUpserted, teamCount: plTeams.length, logs })
}

// ── Entry point ───────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, content-type',
      },
    })
  }
  try {
    const action = new URL(req.url).searchParams.get('action') ?? 'standings'
    if (action === 'standings') return await getStandings()
    if (action === 'squads')    return await syncSquads()
    return json({ error: `Unknown action: ${action}`, actions: ['standings', 'squads'] }, 400)
  } catch (err: any) {
    console.error(err)
    return json({ error: err.message }, 500)
  }
})
