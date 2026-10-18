import { LAST_WEEK, projectionFor, type Context } from './context.ts'
import type { Position } from './types.ts'

const ELIGIBLE: Record<string, Position[]> = {
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

// Filling the narrowest slots first is optimal for nested slot types like QB/RB/WR/TE/FLEX
export function bestLineup(slots: string[], candidates: Candidate[]): Lineup {
  const pool = [...candidates].sort((a, b) => b.mean - a.mean)
  const used = new Set<string>()
  const order = slots.map((slot, i) => ({ slot, i })).sort((a, b) => (ELIGIBLE[a.slot]?.length ?? 9) - (ELIGIBLE[b.slot]?.length ?? 9))
  const filled: LineupSlot[] = slots.map((slot) => ({ slot, player: null }))
  let mean = 0
  let variance = 0
  for (const { slot, i } of order) {
    const eligible = ELIGIBLE[slot] ?? []
    const pick = pool.find((c) => !used.has(c.id) && eligible.includes(c.position))
    if (!pick) continue
    used.add(pick.id)
    filled[i].player = pick
    mean += pick.mean
    variance += pick.sd ** 2
  }
  return { slots: filled, mean, sd: Math.sqrt(variance) }
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
