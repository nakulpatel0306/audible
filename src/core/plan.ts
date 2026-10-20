import { activePlayers, LAST_WEEK, projectionFor, range, rosterById, type Context } from './context.ts'
import { rosterCapacity, rosValue, weekLineup, type Lineup, type LineupSlot } from './lineup.ts'
import { normalCdf } from './math.ts'
import type { Player, Position } from './types.ts'
import { freeAgents } from './waivers.ts'

export type PlannedMove = {
  week: number
  add: Player
  drop: Player | null
  // Points the move adds to that week's starting lineup
  gain: number
  // hole: fills a slot nobody could start in; stream: K/DEF matchup play; upgrade: just better
  reason: 'hole' | 'stream' | 'upgrade'
}

export type PlanWeek = {
  week: number
  opponent: number | null
  winPct: number | null
  // Best lineup with the roster as it enters the week, after earlier planned moves
  before: Lineup
  after: Lineup
  // Slots nobody could fill before the moves, and those still empty after
  holes: string[]
  unfilled: string[]
  // Rostered players whose NFL team is off this week
  out: Player[]
  moves: PlannedMove[]
}

// A claim costs waiver priority and a roster spot; below this a week's gain isn't worth one
const MIN_GAIN = 2
// Two moves covers the worst realistic week (a TE and a DEF on bye together)
const MAX_MOVES_PER_WEEK = 2
// The best few free agents at each position, by that week's projection, cover every
// pickup worth making; scoring the whole pool against every drop is wasted work
const POOL_PER_POSITION = 6
const PLAN_POSITIONS: Position[] = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF']

const isHole = (s: LineupSlot) => !s.player || s.player.mean === 0

function pool(ctx: Context, available: Player[], week: number): Player[] {
  return PLAN_POSITIONS.flatMap((position) =>
    available
      .filter((p) => p.position === position)
      .map((p) => ({ p, mean: projectionFor(ctx, p.id, week).mean }))
      .filter((x) => x.mean > 0)
      .sort((a, b) => b.mean - a.mean)
      .slice(0, POOL_PER_POSITION)
      .map((x) => x.p),
  )
}

// The single add/drop that most helps this week without costing more later than it gains now
function bestMove(ctx: Context, roster: string[], week: number, available: Player[]) {
  const current = weekLineup(ctx, roster, week).mean
  const future = rosValue(ctx, roster, week + 1)
  const drops: (string | null)[] = roster.length < rosterCapacity(ctx) ? [null, ...roster] : roster
  let best: { add: Player; drop: string | null; gain: number; score: number } | null = null
  for (const add of pool(ctx, available, week)) {
    for (const drop of drops) {
      const next = [...roster.filter((id) => id !== drop), add.id]
      const gain = weekLineup(ctx, next, week).mean - current
      if (gain < MIN_GAIN) continue
      const score = gain + rosValue(ctx, next, week + 1) - future
      if (score > 0 && (!best || score > best.score)) best = { add, drop, gain, score }
    }
  }
  return best
}

function reasonFor(before: Lineup, after: Lineup, add: Player): PlannedMove['reason'] {
  const slot = after.slots.findIndex((s) => s.player?.id === add.id)
  if (slot >= 0 && isHole(before.slots[slot])) return 'hole'
  return add.position === 'K' || add.position === 'DEF' ? 'stream' : 'upgrade'
}

function winChance(ctx: Context, week: number, mine: Lineup) {
  const game = ctx.schedule.find((m) => m.week === week && (m.a === ctx.me.rosterId || m.b === ctx.me.rosterId))
  if (!game) return { opponent: null, winPct: null }
  const opponent = game.a === ctx.me.rosterId ? game.b : game.a
  const theirs = weekLineup(ctx, activePlayers(rosterById(ctx, opponent)), week)
  const spread = Math.hypot(mine.sd, theirs.sd)
  return { opponent, winPct: spread === 0 ? Number(mine.mean > theirs.mean) : normalCdf((mine.mean - theirs.mean) / spread) }
}

// Walks the rest of the season a week at a time, making the pickups each week needs (byes,
// streaming matchups) and carrying the roster forward. It assumes today's free agents stay
// available, so later weeks are a sketch to revisit, not a schedule.
export function rosterPlan(ctx: Context): PlanWeek[] {
  let roster = activePlayers(ctx.me)
  const dropped = new Set<string>()
  const added = new Set<string>()
  const fas = freeAgents(ctx)
  const plan: PlanWeek[] = []

  for (const week of range(ctx.planWeek, LAST_WEEK)) {
    const before = weekLineup(ctx, roster, week)
    const moves: PlannedMove[] = []
    for (let i = 0; i < MAX_MOVES_PER_WEEK; i++) {
      // Re-adding someone the plan already cut would just be churn
      const available = fas.filter((p) => !added.has(p.id) && !dropped.has(p.id))
      const move = bestMove(ctx, roster, week, available)
      if (!move) break
      const prior = weekLineup(ctx, roster, week)
      roster = [...roster.filter((id) => id !== move.drop), move.add.id]
      added.add(move.add.id)
      if (move.drop) dropped.add(move.drop)
      moves.push({
        week,
        add: move.add,
        drop: move.drop ? ctx.players.get(move.drop) ?? null : null,
        gain: move.gain,
        reason: reasonFor(prior, weekLineup(ctx, roster, week), move.add),
      })
    }
    const after = weekLineup(ctx, roster, week)
    const out = roster
      .map((id) => ctx.players.get(id))
      .filter((p): p is Player => !!p && ctx.byes.get(p.team ?? '') === week)
    plan.push({
      week,
      ...winChance(ctx, week, after),
      before,
      after,
      holes: before.slots.filter(isHole).map((s) => s.slot),
      unfilled: after.slots.filter(isHole).map((s) => s.slot),
      out,
      moves,
    })
  }
  return plan
}
