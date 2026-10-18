import { activePlayers, LAST_WEEK, type Context } from './context.ts'
import { WEEKLY_DISCOUNT, weekLineup } from './lineup.ts'
import type { Position, Roster } from './types.ts'

export const POSITIONS: Position[] = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF']

export type TeamProfile = {
  roster: Roster
  // Rest-of-season starting-lineup points; the power ranking
  strength: number
  // Best-lineup projection for each remaining week
  weekly: { week: number; points: number }[]
  // Rest-of-season starting points coming from each position, and its league rank (1 = best)
  byPosition: Record<Position, number>
  ranks: Record<Position, number>
  // Record if this team had played every other team every week so far
  allPlay: { wins: number; losses: number }
  // Actual wins minus all-play expected wins: positive means the schedule has been kind
  luck: number
}

function profile(ctx: Context, roster: Roster): Omit<TeamProfile, 'ranks' | 'allPlay' | 'luck'> {
  const byPosition = Object.fromEntries(POSITIONS.map((p) => [p, 0])) as Record<Position, number>
  const weekly: TeamProfile['weekly'] = []
  let strength = 0
  for (let w = ctx.planWeek; w <= LAST_WEEK; w++) {
    const lineup = weekLineup(ctx, activePlayers(roster), w)
    const weight = WEEKLY_DISCOUNT ** (w - ctx.planWeek)
    weekly.push({ week: w, points: lineup.mean })
    strength += lineup.mean * weight
    for (const { player } of lineup.slots) if (player) byPosition[player.position] += player.mean * weight
  }
  return { roster, strength, weekly, byPosition }
}

function allPlay(ctx: Context, rosterId: number) {
  let wins = 0
  let losses = 0
  const weeks = new Set(ctx.results.map((r) => r.week))
  for (const week of weeks) {
    const scores = ctx.results.filter((r) => r.week === week)
    const mine = scores.find((r) => r.rosterId === rosterId)?.points ?? 0
    for (const other of scores) {
      if (other.rosterId === rosterId) continue
      if (mine > other.points) wins++
      else if (mine < other.points) losses++
    }
  }
  return { wins, losses }
}

// Every team in the league, strongest rest-of-season lineup first
export function leagueProfiles(ctx: Context): TeamProfile[] {
  const base = ctx.rosters.map((r) => profile(ctx, r))
  const ranks = new Map(base.map((b) => [b.roster.rosterId, {} as Record<Position, number>]))
  for (const pos of POSITIONS) {
    ;[...base].sort((a, b) => b.byPosition[pos] - a.byPosition[pos]).forEach((b, i) => (ranks.get(b.roster.rosterId)![pos] = i + 1))
  }
  return base
    .map((b) => {
      const ap = allPlay(ctx, b.roster.rosterId)
      const games = b.roster.wins + b.roster.losses + b.roster.ties
      const expectedWins = ap.wins + ap.losses > 0 ? (ap.wins / (ap.wins + ap.losses)) * games : 0
      return { ...b, ranks: ranks.get(b.roster.rosterId)!, allPlay: ap, luck: b.roster.wins - expectedWins }
    })
    .sort((a, b) => b.strength - a.strength)
}
