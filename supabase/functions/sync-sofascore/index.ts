import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ── Config ────────────────────────────────────────────────────────────────────
const TSDB_KEY  = Deno.env.get('THESPORTSDB_KEY') ?? '3'
const TSDB_BASE = `https://www.thesportsdb.com/api/v1/json/${TSDB_KEY}`
const TSDB_V2   = 'https://www.thesportsdb.com/api/v2/json'
const WC_LEAGUE = '4429'
const WC_SEASON = '2026'

const FINISHED_STATUSES = new Set(['FT', 'AET', 'PEN', 'Match Finished', 'After Extra Time', 'After Penalties'])
const LIVE_STATUSES     = new Set(['1H', 'HT', '2H', 'ET', 'PEN', 'Break Time', 'Extra Time', 'Half Time'])

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

async function sofaFetchDirect(teamId: number) {
  const res = await fetch(`https://api.sofascore.com/api/v1/team/${teamId}/players`, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      'Accept': 'application/json',
      'Referer': 'https://www.sofascore.com/',
    },
  })
  if (!res.ok) throw new Error(`SofaScore-direct ${res.status}: teamId=${teamId}`)
  return res.json()
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status, headers: { 'Content-Type': 'application/json' },
  })
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const POSITION_MAP: Record<string, string> = {
  Goalkeeper: 'portero',    G: 'portero',   GK: 'portero',
  Defender:   'defensa',    D: 'defensa',
  Midfielder: 'mediocampista', M: 'mediocampista',
  Attacker:   'delantero',  Forward: 'delantero', F: 'delantero',
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

// Fetch all live soccer events from V2, returns map idEvent → minute
async function fetchLiveMinutes(): Promise<Record<string, number | null>> {
  try {
    const data = await tsdbV2Fetch('/livescore/soccer')
    const map: Record<string, number | null> = {}
    for (const ev of data?.livescore ?? []) {
      if (ev.idEvent) map[String(ev.idEvent)] = ev.strProgress != null ? parseInt(ev.strProgress) : null
    }
    return map
  } catch { return {} }
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
    return (data?.lookup ?? data?.timeline ?? [])
      .filter((e: any) => (e.strTimeline ?? e.strType ?? '').toLowerCase() === 'goal')
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

// Score all unscored predictions for a finished match
async function scoreMatch(matchId: string, homeScore: number, awayScore: number, primerGoleadorRealId: string | null): Promise<number> {
  const realResult = homeScore > awayScore ? 'H' : homeScore < awayScore ? 'A' : 'D'
  const { data: preds } = await supabase
    .from('predictions')
    .select('id, home_score, away_score, primer_goleador_prediccion_id')
    .eq('match_id', matchId)
    .is('points_earned', null)

  if (!preds?.length) return 0
  let scored = 0
  for (const pred of preds) {
    if (pred.home_score == null || pred.away_score == null) continue
    const predResult = pred.home_score > pred.away_score ? 'H' : pred.home_score < pred.away_score ? 'A' : 'D'
    const exacto    = pred.home_score === homeScore && pred.away_score === awayScore
    const resultado = predResult === realResult
    const pts       = exacto ? 3 : resultado ? 1 : 0
    const bonus     = primerGoleadorRealId && pred.primer_goleador_prediccion_id === primerGoleadorRealId ? 1 : 0
    const { error } = await supabase.from('predictions').update({
      points_earned:        pts,
      bonus_goleador:       bonus,
      marcadores_exactos:   exacto ? 1 : 0,
      partidos_acertados:   resultado ? 1 : 0,
      goleadores_acertados: bonus > 0 ? 1 : 0,
    }).eq('id', pred.id)
    if (!error) scored++
  }
  return scored
}

// Close a finished match: fetch goals, resolve goleador, update DB, score predictions
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
  if (!error) await scoreMatch(matchId, homeScore, awayScore, primerGoleadorId)
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
    .select('id, sofascore_id, status, home_team_id, away_team_id, match_date, match_time, home_team:home_team_id(name), away_team:away_team_id(name)')
    .eq('competition', 'world_cup').neq('status', 'finished')
    .not('sofascore_id', 'is', null).lt('match_date', nowIso)

  if (dbErr) return json({ error: dbErr.message }, 500)
  if (!dbMatches?.length) return json({ message: 'Sin partidos WC pendientes de cierre', updated: 0 })

  const liveMinutes = await fetchLiveMinutes()
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
        if (!LIVE_STATUSES.has(status)) {
          // Match exists in DB as non-finished but hasn't kicked off yet — reset if wrongly set to live
          if ((match as any).status === 'live') {
            await supabase.from('matches').update({ status: 'scheduled', match_minute: null }).eq('id', match.id)
            logs.push(`↩ ${home} vs ${away}: reseteado a programado (status API: "${status}")`)
          } else {
            logs.push(`⏭ ${home} vs ${away}: aún no iniciado (${status || 'NS'})`)
          }
          continue
        }
        const liveHome = ev.intHomeScore != null ? parseInt(ev.intHomeScore) : null
        const liveAway = ev.intAwayScore != null ? parseInt(ev.intAwayScore) : null
        const minute   = liveMinutes[String(match.sofascore_id)] ?? (ev.intProgress != null ? parseInt(ev.intProgress) : null)
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

// ── ACTION: lineups — SofaScore probable/confirmed + TheSportsDB fallback ────────
const SOFA_DIRECT_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
  'Accept':     'application/json',
  'Referer':    'https://www.sofascore.com/',
}

const SOFA_POS_MAP: Record<string, string> = {
  G: 'portero', GK: 'portero', Goalkeeper: 'portero',
  D: 'defensa', Defender: 'defensa',
  M: 'mediocampista', Midfielder: 'mediocampista',
  F: 'delantero', A: 'delantero', Forward: 'delantero', Attacker: 'delantero',
}

async function syncLineups() {
  const today = new Date().toISOString().slice(0, 10)
  const in2d  = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

  const { data: dbMatches, error: dbErr } = await supabase
    .from('matches')
    .select('id, sofascore_id, sofa_event_id, match_date, home_team_name, home_team:home_team_id(name)')
    .neq('status', 'finished')
    .gte('match_date', today)
    .lte('match_date', in2d)
    .or('sofa_event_id.not.is.null,lineup_home.is.null')

  if (dbErr) return json({ error: dbErr.message }, 500)
  if (!dbMatches?.length) return json({ message: 'Sin partidos próximos para sincronizar', count: 0 })

  let updated = 0; const logs: string[] = []
  for (const match of dbMatches) {
    const label     = (match as any).home_team_name || (match as any).home_team?.name || `event ${match.sofascore_id}`
    const sofaEvId  = (match as any).sofa_event_id

    // ── SofaScore direct (probable / confirmed) ──────────────────────────────
    if (sofaEvId) {
      try {
        const res = await fetch(`https://api.sofascore.com/api/v1/event/${sofaEvId}/lineups`, { headers: SOFA_DIRECT_HEADERS })
        if (res.ok) {
          const data = await res.json()
          if (data.home?.players?.length) {
            const confirmed = data.confirmed ?? false
            const parseSide = (side: any) => (side?.players ?? [])
              .map((p: any) => ({
                name:         p.player?.name ?? p.player?.shortName ?? null,
                number:       p.jerseyNumber != null ? parseInt(String(p.jerseyNumber)) : (p.player?.jerseyNumber ?? null),
                position:     SOFA_POS_MAP[p.position] ?? SOFA_POS_MAP[p.player?.position] ?? null,
                sub:          p.substitute === true,
                sofascore_id: p.player?.id ?? null,
                confirmed,
              }))
              .filter((p: any) => p.name)
            const homeLineup = parseSide(data.home)
            const awayLineup = parseSide(data.away)
            if (homeLineup.length) {
              await supabase.from('matches').update({
                lineup_home: homeLineup,
                lineup_away: awayLineup.length ? awayLineup : null,
              }).eq('id', match.id)
              const tag = confirmed ? '✅ confirmada' : '🔵 probable'
              logs.push(`${tag} ${label}: ${homeLineup.filter((p: any) => !p.sub).length}+${awayLineup.filter((p: any) => !p.sub).length} titulares`)
              updated++
              continue
            }
          }
          logs.push(`Sin jugadores aún en SofaScore: ${label}`)
        } else {
          logs.push(`SofaScore ${res.status}: ${label}`)
        }
      } catch (e: any) { logs.push(`SofaScore error ${label}: ${e.message}`) }
    }

    // ── TheSportsDB fallback (solo si lineup_home es null) ────────────────────
    if (!sofaEvId && match.sofascore_id) {
      try {
        const data   = await tsdbV2Fetch(`/lookup/event_lineups/${match.sofascore_id}`)
        const lineup: any[] = data?.lineup ?? data?.lineups ?? []
        if (!lineup.length) { logs.push(`Sin alineación TSDB: ${label}`); continue }

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
        if (!homeLineup.length && !awayLineup.length) { logs.push(`Alineación vacía TSDB: ${label}`); continue }

        await supabase.from('matches').update({
          lineup_home: homeLineup.length ? homeLineup : null,
          lineup_away: awayLineup.length ? awayLineup : null,
        }).eq('id', match.id)
        logs.push(`✓ TSDB ${label}: ${homeLineup.filter((p: any) => !p.sub).length}+${awayLineup.filter((p: any) => !p.sub).length} titulares`)
        updated++
      } catch (e: any) { logs.push(`TSDB error ${label}: ${e.message}`) }
    }
  }
  return json({ checked: dbMatches.length, updated, logs })
}

// ── ACTION: sofa-event-ids — map SofaScore event IDs for all WC matches ──────
async function syncSofaEventIds(seedEventId?: string) {
  let tournamentId: number, seasonId: number

  if (seedEventId) {
    // Fast path: use known event ID to extract tournament + season
    const seedRes = await fetch(`https://api.sofascore.com/api/v1/event/${seedEventId}`, { headers: SOFA_DIRECT_HEADERS })
    if (!seedRes.ok) return json({ error: `Seed event fetch failed: ${seedRes.status}` }, 500)
    const seedData = await seedRes.json()
    const ev = seedData.event ?? seedData
    tournamentId = ev.tournament?.uniqueTournament?.id
    seasonId     = ev.season?.id
    if (!tournamentId || !seasonId) return json({ error: 'No se pudo extraer tournamentId/seasonId del evento seed', seedData }, 500)
  } else {
    // Bootstrap via Argentina's upcoming events
    const bootstrapRes = await fetch('https://api.sofascore.com/api/v1/team/768/events/next/0', { headers: SOFA_DIRECT_HEADERS })
    if (!bootstrapRes.ok) return json({ error: `Bootstrap failed: ${bootstrapRes.status}` }, 500)
    const bootstrapData = await bootstrapRes.json()

    const wcEvent = (bootstrapData.events ?? []).find((e: any) =>
      e.tournament?.uniqueTournament?.id === 16 ||
      (e.tournament?.name ?? '').toLowerCase().includes('world cup') ||
      (e.tournament?.uniqueTournament?.name ?? '').toLowerCase().includes('world cup')
    )
    if (!wcEvent) return json({ error: 'No se encontró el WC 2026 en los próximos eventos de Argentina' }, 404)

    tournamentId = wcEvent.tournament.uniqueTournament.id
    seasonId     = wcEvent.season.id
  }

  // Fetch all rounds for this tournament/season
  const roundsRes = await fetch(`https://api.sofascore.com/api/v1/unique-tournament/${tournamentId}/season/${seasonId}/rounds`, { headers: SOFA_DIRECT_HEADERS })
  if (!roundsRes.ok) return json({ error: `Rounds fetch failed: ${roundsRes.status}` }, 500)
  const roundsData = await roundsRes.json()
  const rounds: number[] = (roundsData.rounds ?? []).map((r: any) => r.round).filter((r: any) => r != null)

  // Load our DB matches without sofa_event_id
  const { data: dbMatches } = await supabase
    .from('matches')
    .select('id, match_date, home_team:home_team_id(sofascore_id), away_team:away_team_id(sofascore_id)')
    .eq('competition', 'world_cup')
    .is('sofa_event_id', null)

  if (!dbMatches?.length) return json({ message: 'Todos los partidos ya tienen sofa_event_id', tournamentId, seasonId })

  let mapped = 0; const logs: string[] = []; const unmapped: string[] = []
  for (const round of rounds) {
    try {
      await new Promise(r => setTimeout(r, 200))
      const evRes = await fetch(`https://api.sofascore.com/api/v1/unique-tournament/${tournamentId}/season/${seasonId}/events/round/${round}`, { headers: SOFA_DIRECT_HEADERS })
      if (!evRes.ok) { logs.push(`Round ${round}: HTTP ${evRes.status}`); continue }
      const evData = await evRes.json()

      for (const event of evData.events ?? []) {
        const eventDate = new Date(event.startTimestamp * 1000).toISOString().slice(0, 10)
        const homeId    = event.homeTeam?.id
        const awayId    = event.awayTeam?.id

        const match = dbMatches.find((m: any) => {
          const mDate   = m.match_date?.slice(0, 10)
          const mHomeId = m.home_team?.sofascore_id
          const mAwayId = m.away_team?.sofascore_id
          return mDate === eventDate && (mHomeId === homeId || mAwayId === awayId)
        })

        if (match) {
          await supabase.from('matches').update({ sofa_event_id: event.id }).eq('id', match.id)
          ;(match as any).sofa_event_id = event.id  // mark as done
          logs.push(`✓ R${round} ${event.homeTeam?.name} vs ${event.awayTeam?.name} → sofa_event_id=${event.id}`)
          mapped++
        } else {
          unmapped.push(`R${round} ${event.homeTeam?.name} vs ${event.awayTeam?.name} (${eventDate})`)
        }
      }
    } catch (e: any) { logs.push(`Round ${round} error: ${e.message}`) }
  }
  return json({ tournamentId, seasonId, totalRounds: rounds.length, mapped, unmapped, logs })
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
async function syncPlayers(force = false) {
  const { data: teams } = await supabase.from('teams').select('id, name, sofascore_id').not('sofascore_id', 'is', null)
  if (!teams?.length) return json({ error: 'Ningún equipo tiene sofascore_id. Primero corré action=team-ids.' }, 400)

  // Collect all jugador IDs referenced in predictions (cannot delete these)
  const { data: predRefs } = await supabase
    .from('predictions')
    .select('primer_goleador_prediccion_id')
    .not('primer_goleador_prediccion_id', 'is', null)
  const protectedIds = new Set((predRefs ?? []).map((r: any) => r.primer_goleador_prediccion_id))

  let totalUpserted = 0; let totalDeleted = 0; const logs: string[] = []
  for (const team of teams) {
    // Skip teams that already have players (unless force=true)
    if (!force) {
      const { count } = await supabase.from('jugadores').select('id', { count: 'exact', head: true }).eq('equipo_id', team.id)
      if ((count ?? 0) > 0) { logs.push(`⏭ ${team.name}: ya tiene jugadores`); continue }
    }
    try {
      await new Promise(r => setTimeout(r, 300))
      let data: any
      try {
        data = await sofaFetch(`/teams/get-squad?teamId=${team.sofascore_id}`)
      } catch (e: any) {
        if (e.message.includes('429')) {
          data = await sofaFetchDirect(team.sofascore_id as number)
        } else throw e
      }
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

      // Upsert new squad (insert new players, update existing ones)
      const { error: upsertErr } = await supabase.from('jugadores').upsert(rows, { onConflict: 'sofascore_id' })
      if (upsertErr) { logs.push(`${team.name}: upsert error — ${upsertErr.message}`); continue }
      totalUpserted += rows.length

      // Remove stale players: in this team but NOT in the new squad, and not referenced in predictions
      const newSofaIds = rows.map((r: any) => r.sofascore_id)
      const { data: stale } = await supabase
        .from('jugadores')
        .select('id')
        .eq('equipo_id', team.id)
        .or(`sofascore_id.is.null,sofascore_id.not.in.(${newSofaIds.join(',')})`)

      const deletable = (stale ?? []).filter((j: any) => !protectedIds.has(j.id))
      if (deletable.length) {
        const { error: delErr } = await supabase
          .from('jugadores')
          .delete()
          .in('id', deletable.map((j: any) => j.id))
        if (!delErr) totalDeleted += deletable.length
      }
      const kept = (stale ?? []).length - deletable.length
      logs.push(`✓ ${team.name}: ${rows.length} jugadores${deletable.length ? `, -${deletable.length} viejos eliminados` : ''}${kept ? `, ${kept} retenidos (en predicciones)` : ''}`)
    } catch (e: any) { logs.push(`${team.name}: ${e.message}`) }
  }
  return json({ totalUpserted, totalDeleted, teamCount: teams.length, logs })
}

// ── ACTION: team-ids — map SofaScore team IDs ────────────────────────────────
async function syncTeamIds() {
  const { data: dbTeams } = await supabase.from('teams').select('id, name, code').is('sofascore_id', null)
  if (!dbTeams?.length) return json({ message: 'Todos los equipos ya tienen sofascore_id' })

  const KNOWN_IDS: Record<string, number> = {
    // Americas
    'argentina': 768, 'brazil': 6, 'colombia': 735, 'mexico': 756,
    'united states': 73, 'unitedstates': 73,
    'canada': 99, 'ecuador': 722, 'uruguay': 17, 'paraguay': 68, 'panama': 65,
    'haiti': 3577,
    'curaçao': 36620, 'curacao': 36620,
    // Europe
    'france': 2, 'england': 9, 'spain': 7, 'germany': 3, 'portugal': 5,
    'netherlands': 21, 'belgium': 1, 'croatia': 3703, 'switzerland': 13,
    'turkey': 52, 'sweden': 18, 'norway': 16, 'austria': 40, 'czechia': 24,
    'scotland': 1437,
    'bosnia & herz.': 18058, 'bosniaherzeg': 18058,
    // Africa
    'morocco': 84, 'senegal': 60, 'ghana': 56, 'tunisia': 63,
    'algeria': 36630, 'egypt': 37,
    'ivory coast': 38, 'ivorycoast': 38,
    'dr congo': 43, 'drcongo': 43,
    'south africa': 206, 'southafrica': 206,
    'cape verde': 55580, 'capeverde': 55580,
    // Asia / Middle East
    'japan': 308, 'south korea': 44, 'southkorea': 44,
    'saudi arabia': 33, 'saudiarabia': 33,
    'iran': 22, 'iraq': 47, 'jordan': 51110, 'qatar': 3576,
    'uzbekistan': 3690,
    // Oceania
    'australia': 4,
    'new zealand': 150, 'newzealand': 150,
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

// ── ACTION: score — calculate points for all finished matches ─────────────────
async function scoreAll() {
  const { data: matches, error } = await supabase
    .from('matches')
    .select('id, home_score, away_score, primer_goleador_real_id, home_team_name, away_team_name, home_team:home_team_id(name), away_team:away_team_id(name)')
    .eq('status', 'finished')
    .not('home_score', 'is', null)

  if (error) return json({ error: error.message }, 500)
  if (!matches?.length) return json({ message: 'Sin partidos terminados', scored: 0 })

  let totalScored = 0; const logs: string[] = []
  for (const match of matches) {
    const home = (match as any).home_team_name || (match as any).home_team?.name || '?'
    const away = (match as any).away_team_name || (match as any).away_team?.name || '?'
    const scored = await scoreMatch(
      match.id, match.home_score as number, match.away_score as number,
      match.primer_goleador_real_id as string | null,
    )
    if (scored > 0) { logs.push(`✓ ${home} vs ${away}: ${scored} pred`); totalScored += scored }
  }
  logs.push(`Total: ${totalScored} predicciones puntuadas`)
  return json({ matchesChecked: matches.length, totalScored, logs })
}

// ── ACTION: backfill — populate goals + lineups for already-finished matches ──
async function backfill() {
  const logs: string[] = []
  let goalsUpdated = 0, lineupsUpdated = 0

  // 1. Finished matches with goals IS NULL
  const { data: noGoals, error: err1 } = await supabase
    .from('matches')
    .select('id, sofascore_id, home_team_name, away_team_name, home_team_id, away_team_id, home_team:home_team_id(name), away_team:away_team_id(name), home_score, away_score')
    .eq('status', 'finished')
    .not('sofascore_id', 'is', null)
    .is('goals', null)

  if (err1) return json({ error: err1.message }, 500)
  logs.push(`Partidos terminados sin goles: ${noGoals?.length ?? 0}`)

  for (const match of noGoals ?? []) {
    const homeLabel = (match as any).home_team_name || (match as any).home_team?.name || '?'
    const awayLabel = (match as any).away_team_name || (match as any).away_team?.name || '?'
    const label     = `${homeLabel} vs ${awayLabel}`
    try {
      const goals = await fetchGoals(match.sofascore_id as number)
      if (!goals.length) { logs.push(`Sin goles en API: ${label}`); continue }

      const firstGoalPlayer  = goals[0]?.player ?? null
      const primerGoleadorId = firstGoalPlayer
        ? await resolveGoleador(firstGoalPlayer, match.home_team_id as string | null, match.away_team_id as string | null)
        : null

      const update: Record<string, any> = { goals }
      if (primerGoleadorId) update.primer_goleador_real_id = primerGoleadorId

      const { error } = await supabase.from('matches').update(update).eq('id', match.id)
      if (error) { logs.push(`DB error ${label}: ${error.message}`); continue }
      logs.push(`⚽ ${label}: ${goals.length} goles${firstGoalPlayer ? ` (1er: ${firstGoalPlayer}${primerGoleadorId ? '' : ' — no en DB'})` : ''}`)
      goalsUpdated++
    } catch (e: any) { logs.push(`Error goles ${label}: ${e.message}`) }
  }

  // 2. Finished matches in last 14 days with lineup_home IS NULL
  const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const { data: noLineups, error: err2 } = await supabase
    .from('matches')
    .select('id, sofascore_id, home_team_name, home_team:home_team_id(name)')
    .eq('status', 'finished')
    .not('sofascore_id', 'is', null)
    .is('lineup_home', null)
    .gte('match_date', since)

  if (err2) return json({ error: err2.message }, 500)
  logs.push(`Partidos terminados sin alineaciones (últimos 14 días): ${noLineups?.length ?? 0}`)

  for (const match of noLineups ?? []) {
    const label = (match as any).home_team_name || (match as any).home_team?.name || `event ${match.sofascore_id}`
    try {
      const data   = await tsdbV2Fetch(`/lookup/event_lineups/${match.sofascore_id}`)
      const lineup: any[] = data?.lineup ?? data?.lineups ?? []
      if (!lineup.length) { logs.push(`Sin alineación en API: ${label}`); continue }

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

      const { error } = await supabase.from('matches').update({
        lineup_home: homeLineup.length ? homeLineup : null,
        lineup_away: awayLineup.length ? awayLineup : null,
      }).eq('id', match.id)
      if (error) { logs.push(`DB error alineación ${label}: ${error.message}`); continue }
      logs.push(`✓ Alineación ${label}: ${homeLineup.filter((p: any) => !p.sub).length}+${awayLineup.filter((p: any) => !p.sub).length} titulares`)
      lineupsUpdated++
    } catch (e: any) { logs.push(`Error alineación ${label}: ${e.message}`) }
  }

  return json({ goalsUpdated, lineupsUpdated, logs })
}

// ── ACTION: sync-photos — populate foto_url from TheSportsDB ─────────────────
async function syncPhotos() {
  const { data: teams, error } = await supabase.from('teams').select('id, name, code')
  if (error) return json({ error: error.message }, 500)

  const norm = (s: string) =>
    (s ?? '').toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9 ]/g, '').trim()

  const nameSimilarity = (a: string, b: string): number => {
    const aw = norm(a).split(/\s+/).filter(w => w.length > 1)
    const bw = norm(b).split(/\s+/).filter(w => w.length > 1)
    if (!aw.length || !bw.length) return 0
    let score = 0
    if (aw[aw.length - 1] === bw[bw.length - 1]) score += 4  // last name match
    for (const w of aw) if (w.length > 2 && bw.includes(w)) score += 1
    return score
  }

  const TSDB_NAME_MAP: Record<string, string> = {
    'Czechia':        'Czech Republic',
    'Bosnia & Herz.': 'Bosnia and Herzegovina',
  }
  // Teams with known TSDB IDs that don't match by name search
  const TSDB_ID_OVERRIDE: Record<string, string> = {
    'United States': '134514',  // USA Soccer
    'Ivory Coast':   '134502',  // Ivory Coast Soccer
  }

  const logs: string[] = []
  let totalUpdated = 0

  for (const team of teams ?? []) {
    try {
      let tsdbTeamId = TSDB_ID_OVERRIDE[team.name]
      if (!tsdbTeamId) {
        const searchName = TSDB_NAME_MAP[team.name] ?? team.name
        const searchData = await tsdbFetch(`/searchteams.php?t=${encodeURIComponent(searchName)}`)
        const tsdbTeams: any[] = searchData?.teams ?? []
        const tsdbTeam = tsdbTeams.find((t: any) => t.strSport === 'Soccer') ?? tsdbTeams[0]
        if (!tsdbTeam?.idTeam) { logs.push(`❌ ${team.name}: no encontrado`); continue }
        tsdbTeamId = tsdbTeam.idTeam
      }

      const playersData = await tsdbFetch(`/lookup_all_players.php?id=${tsdbTeamId}`)
      const tsdbPlayers: any[] = (playersData?.player ?? []).filter((p: any) => p.strThumb)
      if (!tsdbPlayers.length) { logs.push(`⚠️ ${team.name}: sin fotos en TSDB`); continue }

      const { data: dbPlayers } = await supabase
        .from('jugadores').select('id, nombre').eq('equipo_id', team.id)
      if (!dbPlayers?.length) { logs.push(`⚠️ ${team.name}: sin jugadores en DB`); continue }

      let matched = 0
      const updates: Promise<any>[] = []
      for (const dbp of dbPlayers) {
        let best: any = null, bestScore = 2
        for (const tp of tsdbPlayers) {
          const s = nameSimilarity(dbp.nombre, tp.strPlayer)
          if (s > bestScore) { bestScore = s; best = tp }
        }
        if (best?.strThumb) {
          updates.push(supabase.from('jugadores').update({ foto_url: best.strThumb }).eq('id', dbp.id))
          matched++
        }
      }
      await Promise.all(updates)
      totalUpdated += matched
      logs.push(`✅ ${team.name}: ${matched}/${dbPlayers.length} fotos`)
    } catch (e: any) { logs.push(`❌ ${team.name}: ${e.message}`) }
  }

  return json({ totalUpdated, logs })
}

// ── ACTION: probe — test a SofaScore teamId ───────────────────────────────────
async function probeTeam(teamId: string) {
  const data    = await sofaFetch(`/teams/get-squad?teamId=${teamId}`)
  const players: any[] = data.players ?? []
  return json({
    teamId,
    count: players.length,
    sample: players.slice(0, 3).map((p: any) => ({ name: p.player?.name, position: p.player?.position })),
  })
}

// ── Entry point ───────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  try {
    const url    = new URL(req.url)
    const action = url.searchParams.get('action') ?? 'discover'

    if (action === 'discover')    return await discover()
    if (action === 'matches')     return await syncMatches()
    if (action === 'results')     return await syncResults()
    if (action === 'results-wc')  return await syncResultsWC()
    if (action === 'lineups')        return await syncLineups()
    if (action === 'sofa-event-ids') return await syncSofaEventIds(url.searchParams.get('seed') ?? undefined)
    if (action === 'h2h')            return await syncH2H()
    if (action === 'players')     return await syncPlayers(url.searchParams.get('force') === 'true')
    if (action === 'team-ids')    return await syncTeamIds()
    if (action === 'backfill')    return await backfill()
    if (action === 'score')       return await scoreAll()
    if (action === 'sync-photos') return await syncPhotos()
    if (action === 'probe')       return await probeTeam(url.searchParams.get('teamId') ?? '')

    return json({
      error:   `Acción desconocida: "${action}"`,
      actions: ['discover', 'matches', 'results', 'results-wc', 'lineups', 'h2h', 'players', 'team-ids', 'backfill', 'score'],
    }, 400)
  } catch (err: any) {
    console.error(err)
    return json({ error: err.message }, 500)
  }
})
