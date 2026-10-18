import { activePlayers, projectionFor, type Context } from './context.ts'
import { weekLineup } from './lineup.ts'
import { normalCdf } from './math.ts'

export type TeamOdds = {
  rosterId: number
  teamName: string
  wins: number
  losses: number
  projectedWins: number
  playoffPct: number
  byePct: number
  firstSeedPct: number
}

export type GameOdds = { week: number; opponent: number; winPct: number; myMean: number; theirMean: number }

// Deterministic so the same data always produces the same odds (and tests can pin them)
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function normal(rand: () => number): number {
  const u = 1 - rand()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand())
}

// Once a week kicks off, lineups are set: count real points for players whose game has
// started and projections for the rest
function liveOutlook(ctx: Context, rosterId: number) {
  const { starters, points } = ctx.live.get(rosterId)!
  let mean = 0
  let variance = 0
  for (const id of starters) {
    const team = ctx.players.get(id)?.team
    if (team && ctx.started.has(team)) {
      mean += points[id] ?? 0
      continue
    }
    const proj = projectionFor(ctx, id, ctx.week)
    mean += proj.mean
    variance += proj.sd ** 2
  }
  return { mean, sd: Math.sqrt(variance) }
}

function weeklyOutlook(ctx: Context) {
  const outlook = new Map<string, { mean: number; sd: number }>()
  for (const m of ctx.schedule) {
    for (const rosterId of [m.a, m.b]) {
      const key = `${m.week}:${rosterId}`
      if (outlook.has(key)) continue
      const inProgress = m.week === ctx.week && ctx.started.size > 0 && ctx.live.has(rosterId)
      const roster = ctx.rosters.find((r) => r.rosterId === rosterId)!
      outlook.set(key, inProgress ? liveOutlook(ctx, rosterId) : weekLineup(ctx, activePlayers(roster), m.week))
    }
  }
  return outlook
}

export function myGames(ctx: Context): GameOdds[] {
  const outlook = weeklyOutlook(ctx)
  const me = ctx.me.rosterId
  return ctx.schedule
    .filter((m) => m.a === me || m.b === me)
    .map((m) => {
      const opponent = m.a === me ? m.b : m.a
      const mine = outlook.get(`${m.week}:${me}`)!
      const theirs = outlook.get(`${m.week}:${opponent}`)!
      const spread = Math.hypot(mine.sd, theirs.sd)
      const winPct = spread === 0 ? Number(mine.mean > theirs.mean) : normalCdf((mine.mean - theirs.mean) / spread)
      return { week: m.week, opponent, winPct, myMean: mine.mean, theirMean: theirs.mean }
    })
    .sort((a, b) => a.week - b.week)
}

// Plays out the rest of the regular season many times with current rosters.
// Seeding is by wins, then points for (Sleeper's default).
export function simulateSeason(ctx: Context, runs = 10000, rand = seededRandom(2026)): TeamOdds[] {
  const outlook = weeklyOutlook(ctx)
  const teams = ctx.rosters
  const playoff = new Map<number, number>()
  const bye = new Map<number, number>()
  const first = new Map<number, number>()
  const totalWins = new Map<number, number>()
  // Sleeper gives the top two seeds a bye in a 6-team bracket; other sizes have none
  const byeSpots = ctx.league.playoffTeams === 6 ? 2 : 0

  for (let run = 0; run < runs; run++) {
    const wins = new Map(teams.map((t) => [t.rosterId, t.wins + t.ties / 2]))
    const points = new Map(teams.map((t) => [t.rosterId, t.pointsFor]))
    for (const m of ctx.schedule) {
      const a = outlook.get(`${m.week}:${m.a}`)!
      const b = outlook.get(`${m.week}:${m.b}`)!
      const sa = a.mean + a.sd * normal(rand)
      const sb = b.mean + b.sd * normal(rand)
      points.set(m.a, points.get(m.a)! + sa)
      points.set(m.b, points.get(m.b)! + sb)
      const winner = sa > sb ? m.a : m.b
      wins.set(winner, wins.get(winner)! + 1)
    }
    const standings = [...teams].sort((x, y) => wins.get(y.rosterId)! - wins.get(x.rosterId)! || points.get(y.rosterId)! - points.get(x.rosterId)!)
    standings.forEach((t, seed) => {
      if (seed < ctx.league.playoffTeams) playoff.set(t.rosterId, (playoff.get(t.rosterId) ?? 0) + 1)
      if (seed < byeSpots) bye.set(t.rosterId, (bye.get(t.rosterId) ?? 0) + 1)
      if (seed === 0) first.set(t.rosterId, (first.get(t.rosterId) ?? 0) + 1)
      totalWins.set(t.rosterId, (totalWins.get(t.rosterId) ?? 0) + wins.get(t.rosterId)!)
    })
  }

  return teams
    .map((t) => ({
      rosterId: t.rosterId,
      teamName: t.teamName,
      wins: t.wins,
      losses: t.losses,
      projectedWins: totalWins.get(t.rosterId)! / runs,
      playoffPct: (playoff.get(t.rosterId) ?? 0) / runs,
      byePct: (bye.get(t.rosterId) ?? 0) / runs,
      firstSeedPct: (first.get(t.rosterId) ?? 0) / runs,
    }))
    .sort((a, b) => b.playoffPct - a.playoffPct || b.projectedWins - a.projectedWins)
}
