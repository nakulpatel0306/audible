import { activePlayers, LAST_WEEK, projectionFor, range, type Context } from './context.ts'
import { bestLineup, candidates, type Candidate } from './lineup.ts'
import type { ScheduleGame } from './sleeper.ts'
import type { Player } from './types.ts'

export type ByeWeek = {
  week: number
  out: { player: Player; starter: boolean }[]
  // Lineup slots nobody left on the roster can fill that week
  empty: string[]
}

// A team's bye is the week inside the season it has no game
export function byeWeeks(games: ScheduleGame[]): Map<string, number> {
  const playing = new Map<number, Set<string>>()
  for (const g of games) {
    const teams = playing.get(g.week) ?? new Set()
    teams.add(g.home).add(g.away)
    playing.set(g.week, teams)
  }
  const teams = new Set(games.flatMap((g) => [g.home, g.away]))
  const byes = new Map<string, number>()
  for (const [week, here] of [...playing].sort((a, b) => a[0] - b[0])) {
    for (const t of teams) if (!here.has(t) && !byes.has(t)) byes.set(t, week)
  }
  return byes
}

// Who would start in a normal week, judged by average projection outside their bye
function usualStarters(ctx: Context, ids: string[], weeks: number[]): Set<string> {
  const pool: Candidate[] = []
  for (const id of ids) {
    const player = ctx.players.get(id)
    if (!player) continue
    const playing = weeks.filter((w) => ctx.byes.get(player.team ?? '') !== w)
    const mean = playing.reduce((t, w) => t + projectionFor(ctx, id, w).mean, 0) / Math.max(playing.length, 1)
    pool.push({ id, position: player.position, mean, sd: 0 })
  }
  return new Set(bestLineup(ctx.league.slots, pool).slots.flatMap((s) => (s.player ? [s.player.id] : [])))
}

export function byePlan(ctx: Context): ByeWeek[] {
  const ids = activePlayers(ctx.me)
  const weeks = range(ctx.planWeek, LAST_WEEK)
  const starters = usualStarters(ctx, ids, weeks)
  const plan: ByeWeek[] = []
  for (const week of weeks) {
    const out = ids
      .map((id) => ctx.players.get(id))
      .filter((p): p is Player => !!p && ctx.byes.get(p.team ?? '') === week)
      .map((player) => ({ player, starter: starters.has(player.id) }))
    if (out.length === 0) continue
    const available = ids.filter((id) => !out.some((o) => o.player.id === id))
    const lineup = bestLineup(ctx.league.slots, candidates(ctx, available, week))
    plan.push({ week, out, empty: lineup.slots.filter((s) => !s.player).map((s) => s.slot) })
  }
  return plan
}
