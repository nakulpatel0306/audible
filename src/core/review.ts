import { leagueProfiles, POSITIONS } from './compare.ts'
import { activePlayers, LAST_WEEK, rosterById, type Context } from './context.ts'
import { rosPoints, weekLineup } from './lineup.ts'
import { applyChanges, tradeChanges } from './scenario.ts'
import { evaluateTrade, type TradeIdea } from './trades.ts'
import type { Player, Position } from './types.ts'
import { usageSignal, type UsageTrend } from './usage.ts'

export type Verdict = 'accept' | 'close' | 'counter' | 'decline'

export type OfferReview = {
  offer: TradeIdea
  verdict: Verdict
  reasons: string[]
  // Your league rank at each position the trade moves (1 = best)
  ranks: { position: Position; before: number; after: number }[]
  counters: TradeIdea[]
}

// Rest-of-season starting points. Below ±2 a trade is noise next to weekly variance.
const CLEAR_WIN = 3
const NOISE = 2

const names = (ps: Player[]) => ps.map((p) => p.name).join(', ')

function verdictFor(myGain: number): Verdict {
  if (myGain >= CLEAR_WIN) return 'accept'
  if (myGain >= 0) return 'close'
  if (myGain > -CLEAR_WIN) return 'counter'
  return 'decline'
}

function myRanks(ctx: Context): Record<Position, number> {
  return leagueProfiles(ctx).find((t) => t.roster.rosterId === ctx.me.rosterId)!.ranks
}

// Small edits to an offer that would make it worth taking: drop one of your players from
// it, ask for one more of theirs, or send a lesser player in place of one of yours. Ranked
// by how much the other team still gains, since that's what gets a counter accepted.
export function findCounters(ctx: Context, partnerId: number, give: string[], get: string[], limit = 3): TradeIdea[] {
  const partner = rosterById(ctx, partnerId)
  const byValue = (ids: string[]) => [...ids].sort((a, b) => rosPoints(ctx, b) - rosPoints(ctx, a))
  const theirExtras = byValue(activePlayers(partner).filter((id) => !get.includes(id))).slice(0, 10)
  const myOthers = activePlayers(ctx.me).filter((id) => !give.includes(id))

  const options: [string[], string[]][] = []
  if (give.length > 1) for (const g of give) options.push([give.filter((id) => id !== g), get])
  for (const extra of theirExtras) options.push([give, [...get, extra]])
  for (const g of give) {
    for (const swap of myOthers) {
      if (rosPoints(ctx, swap) < rosPoints(ctx, g)) options.push([give.map((id) => (id === g ? swap : id)), get])
    }
  }

  const seen = new Set<string>()
  return options
    .map(([g, r]) => evaluateTrade(ctx, partnerId, g, r))
    .filter((t) => t.myGain >= NOISE && t.theirGain > -NOISE)
    .sort((a, b) => b.theirGain - a.theirGain || b.myGain - a.myGain)
    .filter((t) => {
      const key = t.give.map((p) => p.id).sort().join() + '|' + t.get.map((p) => p.id).sort().join()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .slice(0, limit)
}

export function reviewOffer(
  ctx: Context,
  partnerId: number,
  give: string[],
  get: string[],
  usage: Map<string, UsageTrend> | null = null,
): OfferReview {
  const offer = evaluateTrade(ctx, partnerId, give, get)
  const verdict = verdictFor(offer.myGain)
  const reasons: string[] = []

  const gain = offer.myGain
  reasons.push(
    Math.abs(gain) < NOISE
      ? `Barely changes your starting lineup (${gain >= 0 ? '+' : ''}${gain.toFixed(1)} points the rest of the season).`
      : `${gain > 0 ? 'Adds' : 'Costs you'} ${Math.abs(gain).toFixed(1)} starting-lineup points over the rest of the season.`,
  )
  if (offer.theirGain >= NOISE && gain >= NOISE) reasons.push(`It helps them too (+${offer.theirGain.toFixed(1)}), which is why they offered it.`)
  else if (offer.theirGain >= NOISE) reasons.push(`They gain ${offer.theirGain.toFixed(1)}: the deal is built for them.`)

  const next = applyChanges(ctx, tradeChanges(ctx, partnerId, give, get))
  const before = myRanks(ctx)
  const after = myRanks(next)
  const ranks = POSITIONS.filter((p) => before[p] !== after[p]).map((position) => ({ position, before: before[position], after: after[position] }))
  for (const r of ranks) {
    reasons.push(`Your ${r.position} group goes from ${r.before}${ordinal(r.before)} to ${r.after}${ordinal(r.after)} in the league.`)
  }

  // The single week that swings most tells you if this is a bye-week patch or a real upgrade
  const mine = activePlayers(ctx.me)
  const afterMine = activePlayers(next.me)
  let swing = { week: 0, delta: 0 }
  for (let w = ctx.planWeek; w <= LAST_WEEK; w++) {
    const delta = weekLineup(next, afterMine, w).mean - weekLineup(ctx, mine, w).mean
    if (Math.abs(delta) > Math.abs(swing.delta)) swing = { week: w, delta }
  }
  if (Math.abs(swing.delta) >= NOISE) {
    reasons.push(`Biggest swing is week ${swing.week}: ${swing.delta > 0 ? '+' : ''}${swing.delta.toFixed(1)} points.`)
  }

  const hurt = offer.get.filter((p) => p.injuryStatus && p.injuryStatus !== 'Questionable')
  if (hurt.length) reasons.push(`You'd be getting ${names(hurt)} while listed ${hurt.map((p) => p.injuryStatus).join(', ')}.`)
  for (const p of offer.get) {
    const s = usageSignal(usage?.get(p.id))
    if (s) reasons.push(`${p.name}: ${s.text.charAt(0).toLowerCase() + s.text.slice(1)}.`)
  }
  for (const p of offer.give) {
    const s = usageSignal(usage?.get(p.id))
    if (s?.direction === 'up') reasons.push(`You'd be selling ${p.name} as his role grows: ${s.text.charAt(0).toLowerCase() + s.text.slice(1)}.`)
  }

  const counters = verdict === 'accept' ? [] : findCounters(ctx, partnerId, give, get)
  return { offer, verdict, reasons, ranks, counters }
}

function ordinal(n: number): string {
  const tens = n % 100
  if (tens >= 11 && tens <= 13) return 'th'
  return ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'
}
