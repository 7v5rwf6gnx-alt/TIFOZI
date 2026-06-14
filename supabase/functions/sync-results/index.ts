import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const TSDB_BASE     = 'https://www.thesportsdb.com/api/v1/json/3'
const MATCH_MINUTES = 95   // minutes after kickoff to attempt sync (90min + ~5 stoppage)

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false } }
)

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status, headers: { 'Content-Type': 'application/json' },
  })
}

async function tsdbFetch(path: string) {
  const res = await fetch(`${TSDB_BASE}${path}`)
  if (!res.ok) throw new Error(`TheSportsDB ${res.status}: ${path}`)
  return res.json()
}

// ── Phase 1: Sync unfinished matches ─────────────────────────────────────────
async function syncResults() {
  const logs: string[] = []
  let updated = 0
  let scorersUpdated = 0

  // ── Phase 1: Sync score/status for unfinished matches ──
  const { data: pending } = await supabase
    .from('matches')
    .select('id, match_date, match_time, sofascore_id, home_team_id, away_team_id')
    .eq('competition', 'world_cup')
    .neq('status', 'finished')
    .not('sofascore_id', 'is', null)

  const cutoffMs = Date.now() - MATCH_MINUTES * 60_000
  const toSync = (pending ?? []).filter(m => {
    if (!m.match_time || !m.match_date) return false
    const [h, min] = (m.match_time as string).split(':').map(Number)
    const d = (m.match_date as string).slice(0, 10)
    const kickoff = new Date(`${d}T${String(h).padStart(2,'0')}:${String(min).padStart(2,'0')}:00-05:00`)
    return kickoff.getTime() < cutoffMs
  })

  for (const match of toSync) {
    try {
      const data = await tsdbFetch(`/lookupevent.php?id=${match.sofascore_id}`)
      const evt  = data?.events?.[0]

      if (!evt) { logs.push(`Sin datos: ${match.sofascore_id}`); continue }

      const status = (evt.strStatus as string)?.toUpperCase()
      if (status !== 'FT' && status !== 'AOT' && status !== 'AP') {
        logs.push(`En progreso: ${match.sofascore_id} (${evt.strStatus})`)
        continue
      }

      const homeScore = parseInt(evt.intHomeScore)
      const awayScore = parseInt(evt.intAwayScore)
      if (isNaN(homeScore) || isNaN(awayScore)) {
        logs.push(`Score inválido: ${match.sofascore_id}`)
        continue
      }

      // Fetch goal timeline
      const goals = await fetchGoals(match.sofascore_id)

      // Try to resolve first scorer to a jugadores record
      const scorerId = goals.length > 0
        ? await resolveScorer(goals[0].player, [match.home_team_id, match.away_team_id])
        : null

      const { error } = await supabase
        .from('matches')
        .update({
          home_score:               homeScore,
          away_score:               awayScore,
          status:                   'finished',
          goals:                    goals.length ? goals : null,
          primer_goleador_real_id:  scorerId,
        })
        .eq('id', match.id)

      if (error) { logs.push(`DB error ${match.id}: ${error.message}`); continue }

      // If scorer wasn't found yet the trigger still fires and sets bonus=0.
      // We'll catch it in Phase 2 on the next cron run.
      logs.push(`✓ ${match.sofascore_id}: ${homeScore}-${awayScore} (${goals.length} goles, goleador: ${scorerId ?? 'pendiente'})`)
      updated++
      await new Promise(r => setTimeout(r, 500))
    } catch (err: any) {
      logs.push(`Error ${match.sofascore_id}: ${err.message}`)
    }
  }

  // ── Phase 2: Backfill first scorer for finished matches still missing it ──
  const { data: noScorer } = await supabase
    .from('matches')
    .select('id, sofascore_id, home_score, away_score, home_team_id, away_team_id')
    .eq('competition', 'world_cup')
    .eq('status', 'finished')
    .is('primer_goleador_real_id', null)
    .not('sofascore_id', 'is', null)

  for (const match of noScorer ?? []) {
    // Skip 0-0 draws — no scorer possible
    if ((match.home_score ?? 0) + (match.away_score ?? 0) === 0) continue

    try {
      const goals = await fetchGoals(match.sofascore_id)
      if (goals.length === 0) {
        logs.push(`Timeline vacío aún: ${match.sofascore_id}`)
        await new Promise(r => setTimeout(r, 300))
        continue
      }

      const firstPlayer = goals[0].player
      const scorerId = await resolveScorer(firstPlayer, [match.home_team_id, match.away_team_id])

      if (!scorerId) {
        logs.push(`Sin jugador para "${firstPlayer}" (${match.sofascore_id}) — ajuste manual necesario`)
        await new Promise(r => setTimeout(r, 300))
        continue
      }

      // Update match
      await supabase.from('matches').update({
        primer_goleador_real_id: scorerId,
        goals: goals,
      }).eq('id', match.id)

      // Recalculate bonuses manually (trigger won't re-fire for already-finished match)
      await supabase.from('predictions')
        .update({ bonus_goleador: 1, goleadores_acertados: 1 })
        .eq('match_id', match.id)
        .eq('primer_goleador_prediccion_id', scorerId)

      // Zero out predictions that picked a different scorer
      await supabase.from('predictions')
        .update({ bonus_goleador: 0, goleadores_acertados: 0 })
        .eq('match_id', match.id)
        .not('primer_goleador_prediccion_id', 'eq', scorerId)
        .not('primer_goleador_prediccion_id', 'is', null)

      logs.push(`✓ Goleador: "${firstPlayer}" → jugador ${scorerId} (${match.sofascore_id})`)
      scorersUpdated++
      await new Promise(r => setTimeout(r, 500))
    } catch (err: any) {
      logs.push(`Error goleador ${match.sofascore_id}: ${err.message}`)
    }
  }

  if (!toSync.length && !noScorer?.length) {
    return json({ message: 'Sin partidos para procesar', updated: 0, scorersUpdated: 0 })
  }

  return json({ updated, scorersUpdated, total: toSync.length, logs })
}

// ── Fetch and sort goal events from TheSportsDB timeline ─────────────────────
async function fetchGoals(sofascore_id: number) {
  try {
    const tl = await tsdbFetch(`/eventtimeline.php?id=${sofascore_id}`)
    const events: any[] = tl?.timeline ?? []
    return events
      .filter(e => e.strType === 'Goal' || e.strType === 'PenScore')
      .map(e => ({
        player: e.strPlayer ?? e.strPlayer1 ?? '',
        team:   e.strTeam ?? '',
        minute: parseInt(e.intTime) || 0,
      }))
      .sort((a, b) => a.minute - b.minute)
  } catch {
    return []
  }
}

// ── Match a player name to a jugadores record within the match's teams ────────
// Uses unaccent so "Quinones" matches "Quiñones", "Alvarez" matches "Álvarez", etc.
async function resolveScorer(playerName: string, teamIds: string[]): Promise<string | null> {
  if (!playerName) return null

  const parts = playerName.toLowerCase().split(/[\s.]+/).filter(p => p.length > 2)

  for (const part of parts) {
    const { data: players } = await supabase
      .rpc('find_jugador_by_name_part', { p_name: part, p_team_ids: teamIds })

    if (players?.length === 1) return (players[0] as any).id
  }
  return null
}

// ── Entry point ───────────────────────────────────────────────────────────────
Deno.serve(async (_req) => {
  try {
    return await syncResults()
  } catch (err: any) {
    console.error(err)
    return json({ error: err.message }, 500)
  }
})
