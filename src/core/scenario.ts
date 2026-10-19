import { activePlayers, LAST_WEEK, rosterById, type Context } from './context.ts'
import { rosValue, weekLineup, type Lineup } from './lineup.ts'
import { simulateSeason, type TeamOdds } from './sim.ts'
import { afterTrade } from './trades.ts'
import type { Roster } from './types.ts'

// A roster move: players leaving and joining one team
export type Change = { rosterId: number; out: string[]; in: string[] }

export type Side = {
  roster: Roster
  lineupBefore: Lineup
  lineupAfter: Lineup
  weekly: { week: number; before: number; after: number }[]
  rosBefore: number
  rosAfter: number
  oddsBefore: TeamOdds
  oddsAfter: TeamOdds
}

// Same context with the given rosters swapped in, so every analysis can run on "what if"
export function applyChanges(ctx: Context, changes: Change[]): Context {
  const rosters = ctx.rosters.map((r) => {
    const change = changes.find((c) => c.rosterId === r.rosterId)
    if (!change) return r
    const kept = activePlayers(r)
    return { ...r, players: [...afterTrade(ctx, kept, change.out, change.in), ...r.reserve] }
  })
  return { ...ctx, rosters, me: rosters.find((r) => r.rosterId === ctx.me.rosterId)! }
}

// Fewer runs than the main odds table keeps this snappy; both sides share a seed so the
// difference reflects the move, not simulation noise
const SCENARIO_RUNS = 4000

export function beforeAfter(ctx: Context, changes: Change[]): Side[] {
  const next = applyChanges(ctx, changes)
  const oddsBefore = simulateSeason(ctx, SCENARIO_RUNS)
  const oddsAfter = simulateSeason(next, SCENARIO_RUNS)
  return changes.map(({ rosterId }) => {
    const before = activePlayers(rosterById(ctx, rosterId))
    const after = activePlayers(rosterById(next, rosterId))
    const weekly = []
    for (let w = ctx.planWeek; w <= LAST_WEEK; w++) {
      weekly.push({ week: w, before: weekLineup(ctx, before, w).mean, after: weekLineup(next, after, w).mean })
    }
    return {
      roster: rosterById(next, rosterId),
      lineupBefore: weekLineup(ctx, before, ctx.planWeek),
      lineupAfter: weekLineup(next, after, ctx.planWeek),
      weekly,
      rosBefore: rosValue(ctx, before),
      rosAfter: rosValue(next, after),
      oddsBefore: oddsBefore.find((t) => t.rosterId === rosterId)!,
      oddsAfter: oddsAfter.find((t) => t.rosterId === rosterId)!,
    }
  })
}

export const tradeChanges = (ctx: Context, partnerId: number, give: string[], get: string[]): Change[] => [
  { rosterId: ctx.me.rosterId, out: give, in: get },
  { rosterId: partnerId, out: get, in: give },
]

export const waiverChanges = (ctx: Context, add: string, drop: string | null): Change[] => [
  { rosterId: ctx.me.rosterId, out: drop ? [drop] : [], in: [add] },
]
