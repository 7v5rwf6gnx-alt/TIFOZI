import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ── Config ────────────────────────────────────────────────────────────────────
const TSDB_KEY  = Deno.env.get('THESPORTSDB_KEY') ?? '3'
const TSDB_BASE = `https://www.thesportsdb.com/api/v1/json/${TSDB_KEY}`
const TSDB_V2   = 'https://www.thesportsdb.com/api/v2/json'
const WC_LEAGUE = '4429'
const WC_SEASON = '2026'

const FINISHED_STATUSES = new Set(['FT', 'AET', 'PEN', 'Match Finished', 'After Extra Time', 'After Penalties'])

const SOFA_KEY  = Deno.env.get('RAPIDAPI_KEY')!
const SOFA_HOST = 'sofascore.p.rapidapi.com'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false } }
)

async function tsdbFetch(path: string) {
  const res = await fetch(`${TSDB_BASE}${path}`)
  if (!res.ok) throw new Error(`TheSportsDB V1 ${res.status}: ${path}`)
  return res.json()
}

async function tsdbV2Fetch(path: string) {
  const res = await fetch(`${TSDB_V2}${path}`, { headers: { 'X-API-KEY': TSDB_KEY } })
  if (!res.ok) throw new Error(`TheSportsDB V2 ${res.status}: ${path}`)
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
  Goalkeeper: 'portero', Defender: 'defensa',
  Midfielder: 'mediocampista', Attacker: 'delantero', Forward: 'delantero',
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

// True if 115+ min have elapsed since kickoff (match_time is Panama UTC-5)
function isTimeExpired(matchDate: string, matchTime: string | null): boolean {
  if (!matchTime) return false
  const [h, mm] = matchTime.split(':').map(Number)
  const kickoffUtc = new Date(matchDate.replace(' ', 'T').replace(/\+00$/, 'Z'))
  kickoffUtc.setUTCHours(h + 5, mm, 0, 0)
  return (Date.now() - kickoffUtc.getTime()) > 115 * 60 * 1000
}

// Fetch goals from V2 timeline — returns [] on error
async function fetchGoals(sofascoreId: number) {
  try {
    const data = await tsdbV2Fetch(`/lookup/event_timeline/${sofascoreId}`)
    return (data?.timeline ?? [])
      .filter((e: any) => (e.strType ?? '').toLowerCase() === 'goal')
      .map((e: any) => ({
        minute: parseInt(e.intTime ?? '') || 0,
        player: e.strPlayer ?? e.strPlayerName ?? null,
        team:   e.strTeam ?? null,
      }))
  } catch { return [] }
}

// Match first-goal player name to jugadores table
async function resolveGoleador(playerName: string, homeTeamId: string | null, awayTeamId: string | null) {
  if (!playerName || (!homeTeamId && !awayTeamId)) return null
  const conditions = [homeTeamId && `equipo_id.eq.${homeTeamId}`, awayTeamId && `equipo_id.eq.${awayTeamId}`].filter(Boolean)
  const { data: jugadores } = await supabase.from('jugadores').select('id, nombre').or(conditions.join(','))
  const norm   = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z]/g, '')
  const target = norm(playerName)
  const found  = jugadores?.find((j: any) => {
    const n = norm(j.nombre)
    return n === target || n.includes(target.slice(0, 6)) || target.includes(n.slice(0, 6))
  })
  return found?.id ?? null
}

// Close a finished match: fetch goals, resolve goleador, update DB
async function closeMatch(matchId: string, sofascoreId: number, homeScore: number, awayScore: number, homeTeamId: string | null, awayTeamId: string | null) {
  const goals            = await fetchGoals(sofascoreId)
  const firstGoalPlayer  = goals[0]?.player ?? null
  const primerGoleadorId = firstGoalPlayer ? await resolveGoleador(firstGoalPlayer, homeTeamId, awayTeamId) : null

  const update: Record<string, any> = {
    home_score: homeScore, away_score: awayScore,
    status: 'finished', match_minute: null,
    goals: goals.length > 0 ? goals : null,
  }
  if (primerGoleadorId) update.primer_goleador_real_id = primerGoleadorId

  const { error } = await supabase.from('matches').update(update).eq('id', matchId)
  return { error, firstGoalPlayer, primerGoleadorId, goalsCount: goals.length }
}

// ── ACTION: discover ──────────────────────────────────────────────────────────
async function discover() {
  const [wc, today] = await Promise.all([
    tsdbFetch(`/eventsseason.php?id=${WC_LEAGUE}&s=${WC_SEASON}`),
    tsdbFetch(`/eventsday.php?d=${new Date().toISOString().slice(0, 10)}&s=Soccer`),
  ])
  return json({ status: 'ok', wcMatches: (wc.events ?? []).length, todaySoccer: (today.events ?? []).length })
}

// ── ACTION: matches — assign sofascore_id to WC matches ───────────────────────
async function syncMatches() {
  const data = await tsdbFetch(`/eventsseason.php?id=${WC_LEAGUE}&s=${WC_SEASON}`)
  const events: any[] = data.events ?? []
  if (!events.length) return json({ error: 'TheSportsDB no devolvió partidos del WC 2026' }, 500)

  const { data: dbMatches } = await supabase
    .from('matches')
    .select('id, match_date, sofascore_id, home_team:home_team_id(name, code), away_team:away_team_id(name, code)')
    .eq('competition', 'world_cup').is('sofascore_id', null)

  if (!dbMatches?.length) return json({ message: 'Todos los partidos ya tienen ID externo', mapped: 0 })

  let mapped = 0; const unmapped: string[] = []
  for (const ev of events) {
    const evId = parseInt(ev.idEvent)
    const match = dbMatches.find(m => {
      if ((m as any).sofascore_id) return false
      const d = (m.match_date as string)?.slice(0, 10)
      if (Math.abs(new Date(d).getTime() - new Date(ev.dateEvent).getTime()) > 86400000) return false
      return namesMatch((m.home_team as any)?.name ?? '', ev.strHomeTeam ?? '')
          && namesMatch((m.away_team as any)?.name ?? '', ev.strAwayTeam ?? '')
    })
    if (!match) { unmapped.push(`${ev.strHomeTeam} vs ${ev.strAwayTeam} (${ev.dateEvent}) id=${evId}`); continue }
    await supabase.from('matches').update({ sofascore_id: evId }).eq('id', match.id)
    ;(match as any).sofascore_id = evId
    mapped++
  }
  return json({ apiEvents: events.length, mapped, unmapped })
}

// ── ACTION: results — batch WC update (legacy fallback) ───────────────────────
async function syncResults() {
  const data = await tsdbFetch(`/eventsseason.php?id=${WC_LEAGUE}&s=${WC_SEASON}`)
  const events: any[] = (data.events ?? []).filter((e: any) => e.intHomeScore != null && e.intAwayScore != null)
  if (!events.length) return json({ message: 'Sin resultados disponibles aún', updated: 0 })

  const tsdbIds = events.map((e: any) => parseInt(e.idEvent))
  const { data: dbMatches } = await supabase.from('matches')
    .select('id, sofascore_id, status').eq('competition', 'world_cup').in('sofascore_id', tsdbIds)

  let updated = 0; const logs: string[] = []
  for (const ev of events) {
    const match = dbMatches?.find(m => (m as any).sofascore_id === parseInt(ev.idEvent))
    if (!match || match.status === 'finished') continue
    const { error } = await supabase.from('matches')
      .update({ home_score: parseInt(ev.intHomeScore), away_score: parseInt(ev.intAwayScore), status: 'finished' })
      .eq('id', match.id)
    if (error) { logs.push(`DB error ${match.id}: ${error.message}`); continue }
    logs.push(`✓ ${ev.strHomeTeam} ${ev.intHomeScore}-${ev.intAwayScore} ${ev.strAwayTeam}`)
    updated++
  }
  return json({ updated, withResults: events.length, logs })
}

// ── ACTION: results-wc — per-event WC sync (live + goals) ────────────────────
async function syncResultsWC() {
  const nowIso = new Date().toISOString()
  const { data: dbMatches, error: dbErr } = await supabase
    .from('matches')
    .select('id, sofascore_id, home_team_id, away_team_id, match_date, match_time, home_team:home_team_id(name), away_team:away_team_id(name)')
    .eq('competition', 'world_cup').neq('status', 'finished')
    .not('sofascore_id', 'is', null).lt('match_date', nowIso)

  if (dbErr) return json({ error: dbErr.message }, 500)
  if (!dbMatches?.length) return json({ message: 'Sin partidos WC pendientes de cierre', updated: 0 })

  let updated = 0; const logs: string[] = []
  for (const match of dbMatches) {
    const home = (match.home_team as any)?.name ?? '?'
    const away = (match.away_team as any)?.name ?? '?'
    try {
      const data = await tsdbFetch(`/lookupevent.php?id=${match.sofascore_id}`)
      const ev   = data?.events?.[0]
      if (!ev) { logs.push(`Sin datos: ${home} vs ${away}`); continue }

      const status   = ev.strStatus ?? ''
      const finished = FINISHED_STATUSES.has(status) || isTimeExpired(match.match_date as string, match.match_time as string | null)

      if (!finished) {
        const liveHome = ev.intHomeScore != null ? parseInt(ev.intHomeScore) : null
        const liveAway = ev.intAwayScore != null ? parseInt(ev.intAwayScore) : null
        const minute   = ev.intProgress  != null ? parseInt(ev.intProgress)  : null
        await supabase.from('matches').update({
          home_score: liveHome, away_score: liveAway, status: 'live',
          ...(minute != null ? { match_minute: minute } : {}),
        }).eq('id', match.id)
        logs.push(`⏳ ${home} vs ${away}: ${status} ${liveHome ?? '?'}-${liveAway ?? '?'}${minute ? ` ${minute}'` : ''}`)
        continue
      }

      const homeScore = parseInt(ev.intHomeScore)
      const awayScore = parseInt(ev.intAwayScore)
      if (isNaN(homeScore) || isNaN(awayScore)) { logs.push(`Sin score: ${home} vs ${away}`); continue }

      const { error, firstGoalPlayer, primerGoleadorId, goalsCount } = await closeMatch(
        match.id, match.sofascore_id as number, homeScore, awayScore,
        match.home_team_id as string | null, match.away_team_id as string | null,
      )
      if (error) { logs.push(`DB error ${match.id}: ${error.message}`); continue }
      logs.push(`✓ ${home} ${homeScore}-${awayScore} ${away}${firstGoalPlayer ? ` (⚽ ${firstGoalPlayer}${primerGoleadorId ? '' : ' — no en DB'}, ${goalsCount} goles)` : ''}`)
      updated++
    } catch (e: any) { logs.push(`Error ${home} vs ${away}: ${e.message}`) }
  }
  return json({ checked: dbMatches.length, updated, logs })
}

// Convert HH:MM UTC to Panama time (UTC-5)
function utcToPanama(time?: string | null): string | null {
  if (!time) return null
  const [h, m] = time.split(':').map(Number)
  if (isNaN(h) || isNaN(m)) return null
  return `${String(((h - 5) + 24) % 24).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

// ── ACTION: premier — upsert upcoming/past PL matches ────────────────────────
async function syncPremier(startDate?: string, endDate?: string) {
  let dates: string[] = []
  if (startDate && endDate) {
    const start = new Date(startDate + 'T12:00:00Z')
    const end   = new Date(endDate   + 'T12:00:00Z')
    const cur   = new Date(start)
    while (cur <= end) { dates.push(cur.toISOString().slice(0, 10)); cur.setUTCDate(cur.getUTCDate() + 1) }
  } else {
    const now = new Date(); const day = now.getUTCDay()
    const daysToSat = day === 6 ? 0 : day === 0 ? -1 : 6 - day
    for (let i = 0; i <= 3; i++) {
      const d = new Date(now); d.setUTCDate(now.getUTCDate() + daysToSat + i)
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

  const inserted: any[] = []; const logs: string[] = []
  for (const ev of allMatches) {
    const isFinished = ev.intHomeScore != null && ev.intAwayScore != null
    const row = {
      competition: 'premier_league', sofascore_id: parseInt(ev.idEvent), stage: 'premier_league',
      home_team_name: ev.strHomeTeam ?? '', away_team_name: ev.strAwayTeam ?? '',
      match_date: ev.dateEvent ?? ev._date, match_time: utcToPanama(ev.strTime?.slice(0, 5)),
      status: isFinished ? 'finished' : 'scheduled',
      home_score: isFinished ? parseInt(ev.intHomeScore) : null,
      away_score: isFinished ? parseInt(ev.intAwayScore) : null,
    }
    const { data: up, error } = await supabase.from('matches')
      .upsert(row, { onConflict: 'sofascore_id' })
      .select('id, home_team_name, away_team_name, status').single()
    if (error) { logs.push(`Error: ${ev.strHomeTeam} vs ${ev.strAwayTeam}: ${error.message}`); continue }
    inserted.push({ id: up?.id, match: `${row.home_team_name} vs ${row.away_team_name}`, date: row.match_date })
    logs.push(isFinished
      ? `✓ ${row.home_team_name} ${row.home_score}-${row.away_score} ${row.away_team_name}`
      : `📅 ${row.home_team_name} vs ${row.away_team_name} @ ${row.match_date} ${row.match_time ?? ''}`)
  }
  return json({ dates, upserted: inserted.length, matches: inserted, logs })
}

// ── ACTION: results-pl — per-event PL sync (live + goals) ────────────────────
async function syncResultsPL() {
  const nowIso = new Date().toISOString()
  const { data: dbMatches, error: dbErr } = await supabase
    .from('matches')
    .select('id, sofascore_id, home_team_name, away_team_name, home_team_id, away_team_id, match_date, match_time')
    .eq('competition', 'premier_league').neq('status', 'finished')
    .not('sofascore_id', 'is', null).lt('match_date', nowIso)

  if (dbErr) return json({ error: dbErr.message }, 500)
  if (!dbMatches?.length) return json({ message: 'Sin partidos PL pendientes de cierre', updated: 0 })

  let updated = 0; const logs: string[] = []
  for (const match of dbMatches) {
    try {
      const data = await tsdbFetch(`/lookupevent.php?id=${match.sofascore_id}`)
      const ev   = data?.events?.[0]
      if (!ev) { logs.push(`Sin datos: ${match.home_team_name} vs ${match.away_team_name}`); continue }

      const status   = ev.strStatus ?? ''
      const finished = FINISHED_STATUSES.has(status) || isTimeExpired(match.match_date as string, match.match_time as string | null)

      if (!finished) {
        const liveHome = ev.intHomeScore != null ? parseInt(ev.intHomeScore) : null
        const liveAway = ev.intAwayScore != null ? parseInt(ev.intAwayScore) : null
        const minute   = ev.intProgress  != null ? parseInt(ev.intProgress)  : null
        await supabase.from('matches').update({
          home_score: liveHome, away_score: liveAway, status: 'live',
          ...(minute != null ? { match_minute: minute } : {}),
        }).eq('id', match.id)
        logs.push(`⏳ ${match.home_team_name} vs ${match.away_team_name}: ${status} ${liveHome ?? '?'}-${liveAway ?? '?'}${minute ? ` ${minute}'` : ''}`)
        continue
      }

      const homeScore = parseInt(ev.intHomeScore)
      const awayScore = parseInt(ev.intAwayScore)
      if (isNaN(homeScore) || isNaN(awayScore)) { logs.push(`Sin score: ${match.home_team_name} vs ${match.away_team_name}`); continue }

      const { error, firstGoalPlayer, primerGoleadorId, goalsCount } = await closeMatch(
        match.id, match.sofascore_id as number, homeScore, awayScore,
        match.home_team_id as string | null, match.away_team_id as string | null,
      )
      if (error) { logs.push(`DB error ${match.id}: ${error.message}`); continue }
      logs.push(`✓ ${match.home_team_name} ${homeScore}-${awayScore} ${match.away_team_name}${firstGoalPlayer ? ` (⚽ ${firstGoalPlayer}${primerGoleadorId ? '' : ' — no en DB'}, ${goalsCount} goles)` : ''}`)
      updated++
    } catch (e: any) { logs.push(`Error ${match.home_team_name} vs ${match.away_team_name}: ${e.message}`) }
  }
  return json({ checked: dbMatches.length, updated, logs })
}

// ── ACTION: lineups — fetch V2 starting XIs for upcoming matches ──────────────
async function syncLineups() {
  const today = new Date().toISOString().slice(0, 10)
  const in2d  = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

  const { data: dbMatches, error: dbErr } = await supabase
    .from('matches')
    .select('id, sofascore_id, home_team_name, home_team:home_team_id(name)')
    .not('sofascore_id', 'is', null)
    .neq('status', 'finished')
    .gte('match_date', today)
    .lte('match_date', in2d)
    .is('lineup_home', null)

  if (dbErr) return json({ error: dbErr.message }, 500)
  if (!dbMatches?.length) return json({ message: 'Sin partidos próximos sin alineaciones', count: 0 })

  let updated = 0; const logs: string[] = []
  for (const match of dbMatches) {
    const label = (match as any).home_team_name || (match as any).home_team?.name || `event ${match.sofascore_id}`
    try {
      const data   = await tsdbV2Fetch(`/lookup/event_lineups/${match.sofascore_id}`)
      const lineup: any[] = data?.lineup ?? data?.lineups ?? []
      if (!lineup.length) { logs.push(`Sin alineación aún: ${label}`); continue }

      const teamNames = [...new Set(lineup.map((p: any) => p.strTeam).filter(Boolean))]
      const parse = (teamName: string) => lineup
        .filter((p: any) => p.strTeam === teamName)
        .map((p: any) => ({
          name:     p.strPlayer ?? null,
          number:   p.intSquadNumber ? parseInt(p.intSquadNumber) : null,
          position: p.strPosition ?? null,
          sub:      p.strSubstitute === 'Yes' || p.strSubstitute === 'True',
        }))
        .filter((p: any) => p.name)
        .sort((a: any, b: any) => (a.number ?? 99) - (b.number ?? 99))

      const homeLineup = teamNames[0] ? parse(teamNames[0]) : []
      const awayLineup = teamNames[1] ? parse(teamNames[1]) : []
      if (!homeLineup.length && !awayLineup.length) { logs.push(`Alineación vacía: ${label}`); continue }

      await supabase.from('matches').update({
        lineup_home: homeLineup.length ? homeLineup : null,
        lineup_away: awayLineup.length ? awayLineup : null,
      }).eq('id', match.id)

      logs.push(`✓ ${label}: ${homeLineup.filter((p: any) => !p.sub).length}+${awayLineup.filter((p: any) => !p.sub).length} titulares`)
      updated++
    } catch (e: any) { logs.push(`Error ${label}: ${e.message}`) }
  }
  return json({ checked: dbMatches.length, updated, logs })
}

// ── ACTION: h2h — fetch V2 H2H history for upcoming matches ──────────────────
async function syncH2H() {
  const today = new Date().toISOString().slice(0, 10)
  const in7d  = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

  const { data: dbMatches, error: dbErr } = await supabase
    .from('matches')
    .select('id, sofascore_id, home_team_name, home_team:home_team_id(name)')
    .not('sofascore_id', 'is', null)
    .eq('status', 'scheduled')
    .gte('match_date', today)
    .lte('match_date', in7d)
    .is('h2h', null)

  if (dbErr) return json({ error: dbErr.message }, 500)
  if (!dbMatches?.length) return json({ message: 'Sin partidos próximos para H2H', count: 0 })

  let updated = 0; const logs: string[] = []
  for (const match of dbMatches) {
    const label = (match as any).home_team_name || (match as any).home_team?.name || `event ${match.sofascore_id}`
    try {
      const data = await tsdbV2Fetch(`/lookup/event_h2h/${match.sofascore_id}`)
      const meetings: any[] = data?.results ?? data?.events ?? data?.h2h ?? []
      if (!meetings.length) { logs.push(`Sin H2H: ${label}`); continue }

      const h2h = meetings.slice(0, 5).map((e: any) => ({
        date:      e.dateEvent ?? null,
        homeTeam:  e.strHomeTeam ?? null,
        awayTeam:  e.strAwayTeam ?? null,
        homeScore: e.intHomeScore != null ? parseInt(e.intHomeScore) : null,
        awayScore: e.intAwayScore != null ? parseInt(e.intAwayScore) : null,
      }))

      await supabase.from('matches').update({ h2h }).eq('id', match.id)
      logs.push(`✓ ${label}: ${h2h.length} partidos H2H`)
      updated++
    } catch (e: any) { logs.push(`H2H error ${label}: ${e.message}`) }
  }
  return json({ checked: dbMatches.length, updated, logs })
}

// ── ACTION: players — sync WC squad from SofaScore ───────────────────────────
async function syncPlayers() {
  const { data: teams } = await supabase.from('teams').select('id, name, sofascore_id').not('sofascore_id', 'is', null)
  if (!teams?.length) return json({ error: 'Ningún equipo tiene sofascore_id. Primero corré action=team-ids.' }, 400)

  let totalUpserted = 0; const logs: string[] = []
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
      const { error } = await supabase.from('jugadores').upsert(rows, { onConflict: 'sofascore_id' })
      if (error) { logs.push(`${team.name}: DB error — ${error.message}`); continue }
      totalUpserted += rows.length
      logs.push(`✓ ${team.name}: ${rows.length} jugadores`)
    } catch (e: any) { logs.push(`${team.name}: ${e.message}`) }
  }
  return json({ totalUpserted, teamCount: teams.length, logs })
}

// ── ACTION: team-ids — map SofaScore team IDs ────────────────────────────────
async function syncTeamIds() {
  const { data: dbTeams } = await supabase.from('teams').select('id, name, code').is('sofascore_id', null)
  if (!dbTeams?.length) return json({ message: 'Todos los equipos ya tienen sofascore_id' })

  const KNOWN_IDS: Record<string, number> = {
    'argentina': 768, 'brazil': 6, 'france': 2, 'england': 9, 'spain': 7,
    'germany': 3, 'portugal': 5, 'netherlands': 21, 'italy': 10, 'belgium': 1,
    'croatia': 3703, 'uruguay': 17, 'colombia': 735, 'mexico': 756, 'usa': 73,
    'canada': 99, 'australia': 4, 'japan': 308, 'morocco': 84, 'senegal': 60,
    'ecuador': 722, 'qatar': 3576, 'wales': 15, 'iran': 22,
    'south korea': 44, 'poland': 20, 'switzerland': 13, 'ghana': 56,
    'cameroon': 42, 'saudi arabia': 33, 'tunisia': 63, 'nigeria': 8,
  }

  let mapped = 0; const manual: string[] = []
  for (const team of dbTeams) {
    const sofaId = KNOWN_IDS[team.name.toLowerCase()] ?? KNOWN_IDS[normName(team.name)]
    if (!sofaId) { manual.push(`${team.name} (${team.code})`); continue }
    await supabase.from('teams').update({ sofascore_id: sofaId }).eq('id', team.id)
    mapped++
  }
  return json({ mapped, needsManual: manual })
}

// ── Entry point ───────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  try {
    const url    = new URL(req.url)
    const action = url.searchParams.get('action') ?? 'discover'
    const start  = url.searchParams.get('start') ?? undefined
    const end    = url.searchParams.get('end')   ?? undefined

    if (action === 'discover')    return await discover()
    if (action === 'matches')     return await syncMatches()
    if (action === 'results')     return await syncResults()
    if (action === 'results-wc')  return await syncResultsWC()
    if (action === 'results-pl')  return await syncResultsPL()
    if (action === 'premier')     return await syncPremier(start, end)
    if (action === 'lineups')     return await syncLineups()
    if (action === 'h2h')         return await syncH2H()
    if (action === 'players')     return await syncPlayers()
    if (action === 'team-ids')    return await syncTeamIds()

    return json({
      error:   `Acción desconocida: "${action}"`,
      actions: ['discover', 'matches', 'results', 'results-wc', 'results-pl', 'premier', 'lineups', 'h2h', 'players', 'team-ids'],
    }, 400)
  } catch (err: any) {
    console.error(err)
    return json({ error: err.message }, 500)
  }
})
