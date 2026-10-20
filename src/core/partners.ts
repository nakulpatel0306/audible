import { leagueProfiles } from './compare.ts'
import type { Context } from './context.ts'
import { ELIGIBLE } from './lineup.ts'
import { tradesOpen, tradesWith, type TradeIdea } from './trades.ts'
import type { Position, Roster } from './types.ts'

export type Partner = {
  roster: Roster
  // Their weakest and strongest starting spots, by league rank
  needs: Position[]
  strengths: Position[]
  // Where a deal could go: they're strong where you're weak, and the reverse
  helpsYou: Position[]
  helpsThem: Position[]
  deals: TradeIdea[]
}

// K and DEF are streamed off waivers; nobody trades for them
const TRADE_POSITIONS: Position[] = ['QB', 'RB', 'WR', 'TE']

// Top and bottom 30% of the league at a position, so a 10-team league marks ranks 1-3 and 8-10
const EDGE = 0.3

// Every other team, sized up as a trade partner: what each side has that the other lacks,
// and the best deals with them. Teams with a real two-way fit come first.
export function tradePartners(ctx: Context, { dealsPerPartner = 2 } = {}): Partner[] {
  if (!tradesOpen(ctx)) return []
  const profiles = leagueProfiles(ctx)
  const n = profiles.length
  const weak = (rank: number) => rank > n - Math.max(1, Math.round(n * EDGE))
  const strong = (rank: number) => rank <= Math.max(1, Math.round(n * EDGE))
  // A position no lineup slot can hold ranks everyone 0 points; it isn't a need or a strength
  const positions = TRADE_POSITIONS.filter((pos) => ctx.league.slots.some((s) => ELIGIBLE[s]?.includes(pos)))
  const mine = profiles.find((p) => p.roster.rosterId === ctx.me.rosterId)!
  const myNeeds = positions.filter((p) => weak(mine.ranks[p]))
  const myStrengths = positions.filter((p) => strong(mine.ranks[p]))

  const partners = profiles
    .filter((p) => p !== mine)
    .map((p) => {
      const needs = positions.filter((pos) => weak(p.ranks[pos]))
      const strengths = positions.filter((pos) => strong(p.ranks[pos]))
      return {
        roster: p.roster,
        needs,
        strengths,
        helpsYou: strengths.filter((pos) => !myStrengths.includes(pos) && mine.ranks[pos] > p.ranks[pos]),
        helpsThem: needs.filter((pos) => !myNeeds.includes(pos) && mine.ranks[pos] < p.ranks[pos]),
        deals: tradesWith(ctx, p.roster, { minGain: 1 }).slice(0, dealsPerPartner),
      }
    })
  const fit = (p: Partner) => Number(p.helpsYou.length > 0) + Number(p.helpsThem.length > 0)
  const bestDeal = (p: Partner) => (p.deals[0] ? Math.min(p.deals[0].myGain, p.deals[0].theirGain) : -Infinity)
  return partners.sort((a, b) => fit(b) - fit(a) || bestDeal(b) - bestDeal(a))
}
