import { LAST_WEEK, projectionFor, type Context } from './context.ts'
import { TEAM_SPREAD } from './model.ts'
import type { Position } from './types.ts'

export const ELIGIBLE: Record<string, Position[]> = {
  QB: ['QB'],
  RB: ['RB'],
  WR: ['WR'],
  TE: ['TE'],
  K: ['K'],
  DEF: ['DEF'],
  FLEX: ['RB', 'WR', 'TE'],
  WRRB_FLEX: ['RB', 'WR'],
  REC_FLEX: ['WR', 'TE'],
  SUPER_FLEX: ['QB', 'RB', 'WR', 'TE'],
}

export type Candidate = { id: string; position: Position; mean: number; sd: number }
export type LineupSlot = { slot: string; player: Candidate | null }
export type Lineup = { slots: LineupSlot[]; mean: number; sd: number }

const isFlex = (slot: string) => (ELIGIBLE[slot]?.length ?? 0) > 1

// Two flex types overlap without nesting when each takes a position the other doesn't,
// like WRRB_FLEX next to REC_FLEX
function overlapping(slots: string[]): boolean {
  const types = [...new Set(slots.filter(isFlex))].map((s) => ELIGIBLE[s])
  const within = (a: Position[], b: Position[]) => a.every((p) => b.includes(p))
  return types.some((a, i) => types.slice(i + 1).some((b) => !within(a, b) && !within(b, a)))
}

// The best assignment of the remaining players to the flex slots, by trying them all.
// Only the top few at each position can matter: never more than one per flex slot.
function fillFlex(flex: { slot: string; i: number }[], remaining: Candidate[], filled: LineupSlot[]) {
  const shortlist: Candidate[] = []
  const perPosition = new Map<Position, number>()
  for (const c of remaining) {
    const n = perPosition.get(c.position) ?? 0
    if (n < flex.length) shortlist.push(c)
    perPosition.set(c.position, n + 1)
  }
  let best = { total: -1, picks: [] as (Candidate | null)[] }
  const picks: (Candidate | null)[] = []
  const taken = new Set<string>()
  const search = (k: number, total: number) => {
    if (k === flex.length) {
      if (total > best.total) best = { total, picks: [...picks] }
      return
    }
    const eligible = ELIGIBLE[flex[k].slot]
    let any = false
    for (const c of shortlist) {
      if (taken.has(c.id) || !eligible.includes(c.position)) continue
      any = true
      taken.add(c.id)
      picks.push(c)
      search(k + 1, total + c.mean)
      picks.pop()
      taken.delete(c.id)
    }
    if (!any) {
      picks.push(null)
      search(k + 1, total)
      picks.pop()
    }
  }
  search(0, 0)
  flex.forEach(({ i }, k) => (filled[i].player = best.picks[k]))
}

// Filling the narrowest slots first is optimal for nested slot types like QB/RB/WR/TE/FLEX.
// Overlapping flex types aren't nested, so those slots are solved exactly instead.
export function bestLineup(slots: string[], candidates: Candidate[]): Lineup {
  const pool = [...candidates].sort((a, b) => b.mean - a.mean)
  const used = new Set<string>()
  const order = slots.map((slot, i) => ({ slot, i })).sort((a, b) => (ELIGIBLE[a.slot]?.length ?? 9) - (ELIGIBLE[b.slot]?.length ?? 9))
  const filled: LineupSlot[] = slots.map((slot) => ({ slot, player: null }))
  const exact = overlapping(slots)
  for (const { slot, i } of order) {
    if (exact && isFlex(slot)) continue
    const eligible = ELIGIBLE[slot] ?? []
    const pick = pool.find((c) => !used.has(c.id) && eligible.includes(c.position))
    if (!pick) continue
    used.add(pick.id)
    filled[i].player = pick
  }
  if (exact) fillFlex(order.filter(({ slot }) => isFlex(slot)), pool.filter((c) => !used.has(c.id)), filled)
  let mean = 0
  let variance = 0
  for (const { player } of filled) {
    if (!player) continue
    mean += player.mean
    variance += player.sd ** 2
  }
  return { slots: filled, mean, sd: Math.sqrt(variance) * TEAM_SPREAD }
}

export function candidates(ctx: Context, playerIds: string[], week: number): Candidate[] {
  const out: Candidate[] = []
  for (const id of playerIds) {
    const player = ctx.players.get(id)
    if (!player) continue
    const { mean, sd } = projectionFor(ctx, id, week)
    out.push({ id, position: player.position, mean, sd })
  }
  return out
}

export const weekLineup = (ctx: Context, playerIds: string[], week: number) =>
  bestLineup(ctx.league.slots, candidates(ctx, playerIds, week))

// Later weeks are worth less: projections get less reliable and rosters will change anyway
export const WEEKLY_DISCOUNT = 0.93

// Rest-of-season starting-lineup points, the common currency for waivers and trades
export function rosValue(ctx: Context, playerIds: string[], fromWeek = ctx.planWeek): number {
  let total = 0
  for (let w = fromWeek; w <= LAST_WEEK; w++) {
    total += weekLineup(ctx, playerIds, w).mean * WEEKLY_DISCOUNT ** (w - fromWeek)
  }
  return total
}

// Raw rest-of-season projected points, ignoring whether the player would start
export function rosPoints(ctx: Context, playerId: string, fromWeek = ctx.planWeek): number {
  let total = 0
  for (let w = fromWeek; w <= LAST_WEEK; w++) total += projectionFor(ctx, playerId, w).mean
  return total
}

export const rosterCapacity = (ctx: Context) => ctx.league.slots.length + ctx.league.benchSize
