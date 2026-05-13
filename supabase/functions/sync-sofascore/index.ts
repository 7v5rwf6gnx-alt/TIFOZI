import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ── Config ────────────────────────────────────────────────────────────────────
// TheSportsDB — gratis, sin auth, key pública = "3"
const TSDB_BASE    = 'https://www.thesportsdb.com/api/v1/json/3'
const WC_LEAGUE    = '4429'   // FIFA World Cup
const PL_LEAGUE    = '4328'   // English Premier League
const WC_SEASON    = '2026'
const PL_SEASON    = '2025-2026'

// SofaScore RapidAPI — para squads de jugadores
const SOFA_KEY     = Deno.env.get('RAPIDAPI_KEY')!
const SOFA_HOST    = 'sofascore.p.rapidapi.com'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false } }
)

async function tsdbFetch(path: string) {
  const res = await fetch(`${TSDB_BASE}${path}`)
  if (!res.ok) throw new Error(`TheSportsDB ${res.status}: ${path}`)
  return res.json()
}

async function sofaFetch(path: string) {
  const res = await fetch(`https://${SOFA_HOST}${path}`, {
    headers: { 'X-RapidAPI-Key': SOFA_KEY, 'X-RapidAPI-Host': SOFA_HOST },
  })
  if (!res.ok) throw new Error(`SofaScore ${res.status}: ${path}`)
  return res.json()
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status, headers: { 'Content-Type': 'application/json' },
  })
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const POSITION_MAP: Record<string, string> = {
  Goalkeeper:  'portero',
  Defender:    'defensa',
  Midfielder:  'mediocampista',
  Attacker:    'delantero',
  Forward:     'delantero',
}

function normName(s: string) {
  return (s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z]/g, '')
}

function namesMatch(a: string, b: string) {
  const na = normName(a), nb = normName(b)
  if (!na || !nb) return false
  return na === nb
    || na.startsWith(nb.slice(0, 6)) || nb.startsWith(na.slice(0, 6))
    || na.includes(nb.slice(0, 7))   || nb.includes(na.slice(0, 7))
}

// ── ACTION: discover ──────────────────────────────────────────────────────────
async function discover() {
  const [wc, pl, today] = await Promise.all([
    tsdbFetch(`/eventsseason.php?id=${WC_LEAGUE}&s=${WC_SEASON}`),
    tsdbFetch(`/eventsseason.php?id=${PL_LEAGUE}&s=${PL_SEASON}`),
    tsdbFetch(`/eventsday.php?d=${new Date().toISOString().slice(0,10)}&s=Soccer`),
  ])
  return json({
    status:       'ok',
    wcMatches:    (wc.events ?? []).length,
    plMatches:    (pl.events ?? []).length,
    todaySoccer:  (today.events ?? []).length,
    firstWC:      (wc.events ?? [])[0] ?? null,
  })
}

// ── ACTION: matches ───────────────────────────────────────────────────────────
// Asigna sofascore_id (TheSportsDB event ID) a partidos existentes del Mundial.
async function syncMatches() {
  const data = await tsdbFetch(`/eventsseason.php?id=${WC_LEAGUE}&s=${WC_SEASON}`)
  const events: any[] = data.events ?? []
  if (!events.length) return json({ error: 'TheSportsDB no devolvió partidos del WC 2026' }, 500)

  const { data: dbMatches } = await supabase
    .from('matches')
    .select('id, match_date, sofascore_id, home_team:home_team_id(name, code), away_team:away_team_id(name, code)')
    .eq('competition', 'world_cup')
    .is('sofascore_id', null)

  if (!dbMatches?.length) return json({ message: 'Todos los partidos ya tienen ID externo', mapped: 0 })

  let mapped = 0
  const unmapped: string[] = []

  for (const ev of events) {
    const evDate  = ev.dateEvent ?? ''
    const evHome  = ev.strHomeTeam ?? ''
    const evAway  = ev.strAwayTeam ?? ''
    const evId    = parseInt(ev.idEvent)

    const match = dbMatches.find(m => {
      if ((m as any).sofascore_id) return false
      const d = (m.match_date as string)?.slice(0, 10)
      if (Math.abs(new Date(d).getTime() - new Date(evDate).getTime()) > 86400000) return false
      const home = (m.home_team as any)?.name ?? ''
      const away = (m.away_team as any)?.name ?? ''
      return namesMatch(home, evHome) && namesMatch(away, evAway)
    })

    if (!match) { unmapped.push(`${evHome} vs ${evAway} (${evDate}) id=${evId}`); continue }

    await supabase.from('matches').update({ sofascore_id: evId }).eq('id', match.id)
    ;(match as any).sofascore_id = evId
    mapped++
  }

  return json({ apiEvents: events.length, mapped, unmapped })
}

// ── ACTION: results ───────────────────────────────────────────────────────────
// Actualiza scores del Mundial desde TheSportsDB.
async function syncResults() {
  const data = await tsdbFetch(`/eventsseason.php?id=${WC_LEAGUE}&s=${WC_SEASON}`)
  const events: any[] = (data.events ?? []).filter((e: any) =>
    e.intHomeScore != null && e.intAwayScore != null
  )

  if (!events.length) return json({ message: 'Sin resultados disponibles aún', updated: 0 })

  const tsdbIds = events.map((e: any) => parseInt(e.idEvent))
  const { data: dbMatches } = await supabase
    .from('matches')
    .select('id, sofascore_id, status')
    .eq('competition', 'world_cup')
    .in('sofascore_id', tsdbIds)

  let updated = 0
  const logs: string[] = []

  for (const ev of events) {
    const match = dbMatches?.find(m => (m as any).sofascore_id === parseInt(ev.idEvent))
    if (!match || match.status === 'finished') continue

    const homeScore = parseInt(ev.intHomeScore)
    const awayScore = parseInt(ev.intAwayScore)

    const { error } = await supabase
      .from('matches')
      .update({ home_score: homeScore, away_score: awayScore, status: 'finished' })
      .eq('id', match.id)

    if (error) { logs.push(`DB error ${match.id}: ${error.message}`); continue }
    logs.push(`✓ ${ev.strHomeTeam} ${homeScore}-${awayScore} ${ev.strAwayTeam}`)
    updated++
  }

  return json({ updated, withResults: events.length, logs })
}

// ── ACTION: premier ───────────────────────────────────────────────────────────
// Sincroniza partidos de PL. Si se pasan ?start=YYYY-MM-DD&end=YYYY-MM-DD
// escanea ese rango; de lo contrario usa el fin de semana actual.
async function syncPremier(startDate?: string, endDate?: string) {
  let dates: string[] = []

  if (startDate && endDate) {
    const start = new Date(startDate + 'T12:00:00Z')
    const end   = new Date(endDate   + 'T12:00:00Z')
    const cur   = new Date(start)
    while (cur <= end) {
      dates.push(cur.toISOString().slice(0, 10))
      cur.setUTCDate(cur.getUTCDate() + 1)
    }
  } else {
    const now   = new Date()
    const day   = now.getUTCDay()
    const daysToSat = day === 6 ? 0 : day === 0 ? -1 : 6 - day
    for (let i = 0; i <= 3; i++) {
      const d = new Date(now)
      d.setUTCDate(now.getUTCDate() + daysToSat + i)
      dates.push(d.toISOString().slice(0, 10))
    }
  }

  const allMatches: any[] = []
  for (const date of dates) {
    const data = await tsdbFetch(`/eventsday.php?d=${date}&s=Soccer`)
    const plMatches = (data.events ?? []).filter((e: any) =>
      (e.strLeague ?? '').toLowerCase().includes('premier league')
    )
    allMatches.push(...plMatches.map((e: any) => ({ ...e, _date: date })))
  }

  if (!allMatches.length) return json({ message: 'Sin partidos de PL en el rango indicado', dates })

  const inserted: any[] = []
  const logs:     string[] = []

  for (const ev of allMatches) {
    const isFinished = ev.intHomeScore != null && ev.intAwayScore != null

    const row = {
      competition:    'premier_league',
      sofascore_id:   parseInt(ev.idEvent),
      stage:          'premier_league',
      home_team_name: ev.strHomeTeam ?? '',
      away_team_name: ev.strAwayTeam ?? '',
      match_date:     ev.dateEvent ?? ev._date,
      match_time:     ev.strTime?.slice(0, 5) ?? null,
      status:         isFinished ? 'finished' : 'scheduled',
      home_score:     isFinished ? parseInt(ev.intHomeScore) : null,
      away_score:     isFinished ? parseInt(ev.intAwayScore) : null,
    }

    const { data: upserted, error } = await supabase
      .from('matches')
      .upsert(row, { onConflict: 'sofascore_id' })
      .select('id, home_team_name, away_team_name, status, home_score, away_score')
      .single()

    if (error) { logs.push(`Error: ${ev.strHomeTeam} vs ${ev.strAwayTeam}: ${error.message}`); continue }

    inserted.push({ id: upserted?.id, match: `${row.home_team_name} vs ${row.away_team_name}`, date: row.match_date, score: isFinished ? `${row.home_score}-${row.away_score}` : null })
    logs.push(isFinished
      ? `✓ ${row.home_team_name} ${row.home_score}-${row.away_score} ${row.away_team_name}`
      : `📅 ${row.home_team_name} vs ${row.away_team_name} @ ${row.match_date} ${row.match_time ?? ''}`)
  }

  return json({ dates, upserted: inserted.length, matches: inserted, logs })
}

// ── ACTION: players ───────────────────────────────────────────────────────────
// Sincroniza planteles del Mundial desde SofaScore RapidAPI.
// Requiere que los equipos tengan sofascore_id (SofaScore team ID) en la DB.
async function syncPlayers() {
  const { data: teams } = await supabase
    .from('teams')
    .select('id, name, sofascore_id')
    .not('sofascore_id', 'is', null)

  if (!teams?.length) {
    return json({ error: 'Ningún equipo tiene sofascore_id. Primero corré action=team-ids.' }, 400)
  }

  let totalUpserted = 0
  const logs: string[] = []

  for (const team of teams) {
    try {
      const data    = await sofaFetch(`/teams/get-squad?teamId=${team.sofascore_id}`)
      const players: any[] = data.players ?? []

      if (!players.length) { logs.push(`${team.name}: sin jugadores (squad no publicado)`); continue }

      const rows = players.map((p: any) => ({
        equipo_id:       team.id,
        sofascore_id:    p.player?.id ?? null,
        nombre:          p.player?.name ?? p.player?.shortName ?? null,
        numero_camiseta: p.player?.shirtNumber ?? p.player?.jerseyNumber ?? null,
        posicion:        POSITION_MAP[p.player?.position] ?? null,
        club_actual:     p.player?.team?.name ?? null,
      })).filter((r: any) => r.nombre && r.sofascore_id)

      if (!rows.length) { logs.push(`${team.name}: sin jugadores válidos`); continue }

      const { error } = await supabase
        .from('jugadores')
        .upsert(rows, { onConflict: 'sofascore_id' })

      if (error) { logs.push(`${team.name}: DB error — ${error.message}`); continue }

      totalUpserted += rows.length
      logs.push(`✓ ${team.name}: ${rows.length} jugadores`)
    } catch (e: any) {
      logs.push(`${team.name}: ${e.message}`)
    }
  }

  return json({ totalUpserted, teamCount: teams.length, logs })
}

// ── ACTION: team-ids ──────────────────────────────────────────────────────────
// Mapea sofascore_id (SofaScore team ID) a cada equipo del Mundial.
// SofaScore national team IDs: https://www.sofascore.com/team/football/{slug}/{id}
async function syncTeamIds() {
  const { data: dbTeams } = await supabase
    .from('teams')
    .select('id, name, code')
    .is('sofascore_id', null)

  if (!dbTeams?.length) return json({ message: 'Todos los equipos ya tienen sofascore_id' })

  // IDs conocidos de selecciones en SofaScore (confirmados)
  const KNOWN_IDS: Record<string, number> = {
    'argentina': 768, 'brazil': 6, 'france': 2, 'england': 9, 'spain': 7,
    'germany': 3, 'portugal': 5, 'netherlands': 21, 'italy': 10, 'belgium': 1,
    'croatia': 3703, 'uruguay': 17, 'colombia': 735, 'mexico': 756, 'usa': 73,
    'canada': 99, 'australia': 4, 'japan': 308, 'morocco': 84, 'senegal': 60,
    'ecuador': 722, 'qatar': 3576, 'wales': 15, 'iran': 22,
    'south korea': 44, 'poland': 20, 'switzerland': 13, 'ghana': 56,
    'cameroon': 42, 'saudi arabia': 33, 'tunisia': 63, 'nigeria': 8,
  }

  let mapped = 0
  const manual: string[] = []

  for (const team of dbTeams) {
    const key = normName(team.name)
    const sofaId = KNOWN_IDS[team.name.toLowerCase()] ?? KNOWN_IDS[key]

    if (!sofaId) { manual.push(`${team.name} (${team.code})`); continue }

    await supabase.from('teams').update({ sofascore_id: sofaId }).eq('id', team.id)
    mapped++
  }

  return json({ mapped, needsManual: manual })
}

// ── Entry point ───────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  try {
    const action = new URL(req.url).searchParams.get('action') ?? 'discover'

    const url   = new URL(req.url)
    const start = url.searchParams.get('start') ?? undefined
    const end   = url.searchParams.get('end')   ?? undefined

    if (action === 'discover')  return await discover()
    if (action === 'matches')   return await syncMatches()
    if (action === 'results')   return await syncResults()
    if (action === 'premier')   return await syncPremier(start, end)
    if (action === 'players')   return await syncPlayers()
    if (action === 'team-ids')  return await syncTeamIds()

    return json({
      error:   `Acción desconocida: "${action}"`,
      actions: ['discover', 'matches', 'results', 'premier', 'players', 'team-ids'],
    }, 400)
  } catch (err: any) {
    console.error(err)
    return json({ error: err.message }, 500)
  }
})
