import { activePlayers, projectionFor, type Context } from './context.ts'
import { rosPoints, rosterCapacity, rosValue } from './lineup.ts'
import type { Player, Position } from './types.ts'

export type WaiverPick = {
  add: Player
  drop: Player | null
  // Change in rest-of-season starting-lineup points
  gain: number
  nextWeek: number
  trendingAdds: number
}

export function freeAgents(ctx: Context): Player[] {
  const rostered = new Set(ctx.rosters.flatMap((r) => r.players))
  return [...ctx.players.values()].filter((p) => !rostered.has(p.id) && p.team)
}

// Ranks pickups by how much they'd improve the lineups you'd actually start, paired with
// the drop that costs the least. K and DEF are left to the streaming module.
export function waiverTargets(
  ctx: Context,
  trending: Map<string, number> = new Map(),
  { limit = 10, perPosition = 3, positions = ['QB', 'RB', 'WR', 'TE'] as Position[] } = {},
): WaiverPick[] {
  const mine = activePlayers(ctx.me)
  const base = rosValue(ctx, mine)
  const hasOpenSpot = mine.length < rosterCapacity(ctx)

  // Scoring every free agent against every drop is wasteful; the top of the raw ROS list plus
  // anyone the rest of Sleeper is grabbing covers every realistic pickup
  const pool = freeAgents(ctx)
    .filter((p) => positions.includes(p.position))
    .map((p) => ({ p, ros: rosPoints(ctx, p.id) }))
    .filter(({ p, ros }) => ros > 10 || trending.has(p.id))
    .sort((a, b) => b.ros - a.ros)
    .slice(0, 60)

  const drops = mine.filter((id) => !['K', 'DEF'].includes(ctx.players.get(id)?.position ?? ''))
  const picks: WaiverPick[] = []
  for (const { p } of pool) {
    let best = { value: -Infinity, drop: null as string | null }
    if (hasOpenSpot) best = { value: rosValue(ctx, [...mine, p.id]), drop: null }
    for (const drop of drops) {
      const value = rosValue(ctx, [...mine.filter((id) => id !== drop), p.id])
      if (value > best.value) best = { value, drop }
    }
    const gain = best.value - base
    if (gain < 0.5) continue
    picks.push({
      add: p,
      drop: best.drop ? ctx.players.get(best.drop) ?? null : null,
      gain,
      nextWeek: projectionFor(ctx, p.id, ctx.planWeek).mean,
      trendingAdds: trending.get(p.id) ?? 0,
    })
  }
  // Ten near-identical backup tight ends isn't a useful list; show the best few at each spot
  const shown = new Map<Position, number>()
  return picks
    .sort((a, b) => b.gain - a.gain)
    .filter((pick) => {
      const n = shown.get(pick.add.position) ?? 0
      shown.set(pick.add.position, n + 1)
      return n < perPosition
    })
    .slice(0, limit)
}
