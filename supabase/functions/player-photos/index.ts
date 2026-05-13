import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Prefer direct API-Football key; fall back to RapidAPI
const APIFOOTBALL_KEY = Deno.env.get('APIFOOTBALL_KEY')
const RAPIDAPI_KEY    = Deno.env.get('RAPIDAPI_KEY')!
const USE_DIRECT      = Boolean(APIFOOTBALL_KEY)
const API_BASE        = USE_DIRECT
  ? 'https://v3.football.api-sports.io'
  : 'https://api-football-v1.p.rapidapi.com/v3'
const SEASON = 2025

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false } }
)

const apiHeaders = USE_DIRECT
  ? { 'x-apisports-key': APIFOOTBALL_KEY! }
  : { 'X-RapidAPI-Key': RAPIDAPI_KEY, 'X-RapidAPI-Host': 'api-football-v1.p.rapidapi.com' }

async function apiFetch(path: string) {
  const res = await fetch(`${API_BASE}${path}`, { headers: apiHeaders })
  if (!res.ok) throw new Error(`API-Football ${res.status}: ${await res.text()}`)
  return res.json()
}

function normalize(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z\s]/g, '')
    .trim()
}

function nameSimilarity(fullName: string, apiName: string): number {
  const nFull = normalize(fullName)
  const nApi  = normalize(apiName)

  if (nFull === nApi) return 1.0

  const fullWords = nFull.split(/\s+/)
  const apiWords  = nApi.split(/\s+/)

  // Handle abbreviated first name: "l messi" vs "lionel messi"
  // API name looks like "x lastname" where x is a single letter
  if (apiWords.length >= 2 && apiWords[0].length === 1) {
    const apiInitial  = apiWords[0]
    const apiLastName = apiWords.slice(1).join(' ')
    const fullInitial = fullWords[0]?.[0] ?? ''
    const fullLast    = fullWords.slice(1).join(' ')
    if (fullInitial === apiInitial && fullLast === apiLastName) return 0.92
    if (fullInitial === apiInitial && fullLast.includes(apiLastName)) return 0.75
    if (fullLast === apiLastName) return 0.65  // same last name, different first initial
  }

  // Last-name-only match (both have same last word)
  const lastA = fullWords[fullWords.length - 1]
  const lastB = apiWords[apiWords.length - 1]
  if (lastA && lastA === lastB && fullWords[0]?.[0] === apiWords[0]?.[0]) return 0.70

  // Jaccard fallback
  const setA = new Set(fullWords)
  const setB = new Set(apiWords)
  const intersection = [...setA].filter(w => setB.has(w)).length
  const union = new Set([...setA, ...setB]).size
  return union > 0 ? intersection / union : 0
}

async function findApiFootballTeamId(teamName: string, teamCode: string): Promise<number | null> {
  for (const q of [teamName, teamCode]) {
    const key = teamName === q ? 'name' : 'code'
    try {
      const data = await apiFetch(`/teams?${key}=${encodeURIComponent(q)}`)
      const teams: any[] = data.response ?? []
      // Prefer national teams (type === 'National')
      const national = teams.find(t => t.team?.type === 'National')
      if (national) return national.team.id
      if (teams.length > 0) return teams[0].team.id
    } catch { /* try next */ }
    await new Promise(r => setTimeout(r, 300))
  }
  return null
}

async function fetchAllPlayers(teamId: number): Promise<any[]> {
  // Try /players/squads first (works for national teams without season param)
  try {
    const squad = await apiFetch(`/players/squads?team=${teamId}`)
    const players: any[] = (squad.response ?? []).flatMap((r: any) =>
      (r.players ?? []).map((p: any) => ({ player: p }))
    )
    if (players.length > 0) return players
  } catch { /* fall through */ }

  // Fall back to paginated /players endpoint (works for clubs)
  const players: any[] = []
  let page = 1
  while (true) {
    const data = await apiFetch(`/players?team=${teamId}&season=${SEASON}&page=${page}`)
    players.push(...(data.response ?? []))
    if (page >= (data.paging?.total ?? 1)) break
    page++
    await new Promise(r => setTimeout(r, 350))
  }
  return players
}

async function processTeam(team: any): Promise<{ updated: number; notFound: number; logs: string[] }> {
  const logs: string[] = []
  let apiTeamId: number | null = team.api_football_id

  if (!apiTeamId) {
    logs.push(`Searching for: ${team.name} (${team.code})`)
    apiTeamId = await findApiFootballTeamId(team.name, team.code)
    if (!apiTeamId) {
      logs.push(`❌ Not found in API-Football: ${team.name}`)
      return { updated: 0, notFound: 0, logs }
    }
    await supabase.from('teams').update({ api_football_id: apiTeamId }).eq('id', team.id)
    logs.push(`✓ Team ID = ${apiTeamId}`)
  }

  const apiPlayers = await fetchAllPlayers(apiTeamId)
  logs.push(`API-Football: ${apiPlayers.length} players for team ${apiTeamId}`)

  const { data: ourPlayers } = await supabase
    .from('jugadores')
    .select('id, nombre, api_football_id')
    .eq('equipo_id', team.id)

  if (!ourPlayers?.length) {
    logs.push('No players in jugadores table for this team')
    return { updated: 0, notFound: 0, logs }
  }

  let updated = 0, notFound = 0

  for (const player of ourPlayers) {
    if (player.api_football_id) {
      logs.push(`↩  ${player.nombre}: already set (${player.api_football_id})`)
      continue
    }

    let best: any = null
    let bestScore = 0

    for (const ap of apiPlayers) {
      const score = nameSimilarity(player.nombre, ap.player.name)
      if (score > bestScore) { bestScore = score; best = ap }
    }

    if (best && bestScore >= 0.45) {
      await supabase.from('jugadores')
        .update({ api_football_id: best.player.id })
        .eq('id', player.id)
      updated++
      logs.push(`✓ ${player.nombre} → ${best.player.name} [${best.player.id}] score=${bestScore.toFixed(2)}`)
    } else {
      notFound++
      logs.push(`✗ ${player.nombre}: no match (best="${best?.player.name ?? '—'}" score=${bestScore.toFixed(2)})`)
    }
  }

  return { updated, notFound, logs }
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' } })
  }

  try {
    const url      = new URL(req.url)
    const teamCode = url.searchParams.get('team')    // e.g. ?team=ARG
    const force    = url.searchParams.get('force') === '1'  // re-process already-set players

    let query = supabase.from('teams').select('id, name, code, api_football_id')
    if (teamCode) query = query.eq('code', teamCode.toUpperCase())

    const { data: teams, error } = await query
    if (error) return json({ error: error.message }, 500)
    if (!teams?.length) return json({ error: 'No teams found' }, 404)

    // If force, clear existing IDs first
    if (force && teams.length > 0) {
      const teamIds = teams.map(t => t.id)
      await supabase.from('jugadores')
        .update({ api_football_id: null })
        .in('equipo_id', teamIds)
    }

    const results: any[] = []
    for (const team of teams) {
      const r = await processTeam(team)
      results.push({ team: team.name, code: team.code, ...r })
      await new Promise(r => setTimeout(r, 400))
    }

    const totalUpdated  = results.reduce((s, r) => s + r.updated,  0)
    const totalNotFound = results.reduce((s, r) => s + r.notFound, 0)

    return json({ totalUpdated, totalNotFound, teams: results.length, results })
  } catch (err: any) {
    console.error(err)
    return json({ error: err.message }, 500)
  }
})
