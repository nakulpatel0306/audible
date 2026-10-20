import { activePlayers, rosterById, type Context } from './context.ts'
import { rosPoints, rosterCapacity, rosValue } from './lineup.ts'
import type { Player, Roster } from './types.ts'

export type TradeIdea = {
  partner: Roster
  give: Player[]
  get: Player[]
  myGain: number
  theirGain: number
}

// A team receiving more bodies than it sends has to cut someone; assume it cuts whoever
// projects the fewest rest-of-season points among players not in the deal
export function afterTrade(ctx: Context, roster: string[], out: string[], incoming: string[]): string[] {
  const next = [...roster.filter((id) => !out.includes(id)), ...incoming]
  const overflow = next.length - rosterCapacity(ctx)
  if (overflow <= 0) return next
  const cuts = next
    .filter((id) => !incoming.includes(id))
    .sort((a, b) => rosPoints(ctx, a) - rosPoints(ctx, b))
    .slice(0, overflow)
  return next.filter((id) => !cuts.includes(id))
}

export function evaluateTrade(ctx: Context, partnerId: number, give: string[], get: string[]): TradeIdea {
  const partner = rosterById(ctx, partnerId)
  const mine = activePlayers(ctx.me)
  const theirs = activePlayers(partner)
  const myGain = rosValue(ctx, afterTrade(ctx, mine, give, get)) - rosValue(ctx, mine)
  const theirGain = rosValue(ctx, afterTrade(ctx, theirs, get, give)) - rosValue(ctx, theirs)
  return idea(ctx, partner, give, get, myGain, theirGain)
}

function combos<T>(items: T[], maxSize: number): T[][] {
  const out: T[][] = items.map((x) => [x])
  if (maxSize >= 2) for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) out.push([items[i], items[j]])
  return out
}

export const tradesOpen = (ctx: Context) => ctx.week <= ctx.league.tradeDeadline

// Most balanced first: a lopsided "win" for you is one they'll decline
const balance = (a: TradeIdea, b: TradeIdea) => Math.min(b.myGain, b.theirGain) - Math.min(a.myGain, a.theirGain)

// Searches 1-for-1 up to 2-for-2 deals with one team where both starting lineups get better.
// Those are the trades another manager might actually accept: positional surplus for need.
export function tradesWith(ctx: Context, partner: Roster, { minGain = 3, assetsPerTeam = 8 } = {}): TradeIdea[] {
  const tradeable = (ids: string[]) =>
    ids
      .filter((id) => !['K', 'DEF'].includes(ctx.players.get(id)?.position ?? ''))
      .sort((a, b) => rosPoints(ctx, b) - rosPoints(ctx, a))
      .slice(0, assetsPerTeam)

  const mine = activePlayers(ctx.me)
  const myBase = rosValue(ctx, mine)
  const theirs = activePlayers(partner)
  const theirBase = rosValue(ctx, theirs)
  const found: TradeIdea[] = []
  for (const give of combos(tradeable(mine), 2)) {
    for (const get of combos(tradeable(theirs), 2)) {
      const myGain = rosValue(ctx, afterTrade(ctx, mine, give, get)) - myBase
      if (myGain < minGain) continue
      const theirGain = rosValue(ctx, afterTrade(ctx, theirs, get, give)) - theirBase
      if (theirGain < 0) continue
      found.push(idea(ctx, partner, give, get, myGain, theirGain))
    }
  }
  return distinct(found.sort(balance))
}

export function findTrades(ctx: Context, { minGain = 3, perPartner = 2, limit = 10, assetsPerTeam = 8 } = {}): TradeIdea[] {
  if (!tradesOpen(ctx)) return []
  return ctx.rosters
    .filter((r) => r.rosterId !== ctx.me.rosterId)
    .flatMap((partner) => tradesWith(ctx, partner, { minGain, assetsPerTeam }).slice(0, perPartner))
    .sort(balance)
    .slice(0, limit)
}

function idea(ctx: Context, partner: Roster, give: string[], get: string[], myGain: number, theirGain: number): TradeIdea {
  const toPlayers = (ids: string[]) => ids.map((id) => ctx.players.get(id)).filter((p): p is Player => !!p)
  return { partner, give: toPlayers(give), get: toPlayers(get), myGain, theirGain }
}

// Keep a partner's suggestions from being the same core deal with a throw-in swapped
function distinct(ideas: TradeIdea[]): TradeIdea[] {
  const seen = new Set<string>()
  return ideas.filter((idea) => {
    const key = `${idea.give[0].id}:${idea.get[0].id}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
