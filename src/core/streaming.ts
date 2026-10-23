import { activePlayers, LAST_WEEK, projectionFor, type Context } from './context.ts'
import { rosterCapacity, rosValue, weekLineup } from './lineup.ts'
import type { Player } from './types.ts'
import { freeAgents } from './waivers.ts'

export type StreamWeek = { week: number; opponent: string | null; mean: number }

export type StreamOption = { player: Player; owned: boolean; weeks: StreamWeek[]; next: number; window: number }

export type StreamPlan = {
  position: 'DEF' | 'K'
  mine: StreamOption[]
  options: StreamOption[]
  // Set when a free agent beats your current starter next week by enough to be worth a move.
  // No drop means the add goes into an open roster spot.
  swap: { add: Player; drop: Player | null; gain: number } | null
}

// Below this, churning the position isn't worth burning waiver priority
const MIN_SWAP_GAIN = 1.5

function option(ctx: Context, player: Player, owned: boolean, horizon: number): StreamOption {
  const weeks: StreamWeek[] = []
  for (let w = ctx.planWeek; w < ctx.planWeek + horizon && w <= LAST_WEEK; w++) {
    const { mean, opponent } = projectionFor(ctx, player.id, w)
    weeks.push({ week: w, opponent, mean })
  }
  return { player, owned, weeks, next: weeks[0]?.mean ?? 0, window: weeks.reduce((t, w) => t + w.mean, 0) }
}

// DEF and K points mostly come from the opponent, so pick by matchup each week rather than by name
export function streamPlan(ctx: Context, position: 'DEF' | 'K', horizon = 3): StreamPlan {
  const mine = ctx.me.players
    .map((id) => ctx.players.get(id))
    .filter((p): p is Player => p?.position === position)
    .map((p) => option(ctx, p, true, horizon))
    .sort((a, b) => b.next - a.next)
  const options = freeAgents(ctx)
    .filter((p) => p.position === position)
    .map((p) => option(ctx, p, false, horizon))
    .sort((a, b) => b.next - a.next)
    .slice(0, 8)

  // A swap has to win next week by enough to be worth a claim, and can't give back more over
  // the rest of the season than it wins now: dropping the defense with the better schedule
  // for one good matchup is a loss
  let swap: StreamPlan['swap'] = null
  const roster = activePlayers(ctx.me)
  const current = weekLineup(ctx, roster, ctx.planWeek).mean
  const later = rosValue(ctx, roster, ctx.planWeek + 1)
  // With nobody rostered at the position the slot scores zero, so there's no one of theirs to
  // drop: use an open spot, or else cut whoever the lineup misses least
  const drops: (Player | null)[] =
    mine.length > 0
      ? mine.map((o) => o.player)
      : roster.length < rosterCapacity(ctx)
        ? [null]
        : roster.map((id) => ctx.players.get(id)).filter((p): p is Player => !!p && p.position !== 'K' && p.position !== 'DEF')
  let bestScore = 0
  for (const add of options) {
    for (const drop of drops) {
      const next = [...roster.filter((id) => id !== drop?.id), add.player.id]
      const gain = weekLineup(ctx, next, ctx.planWeek).mean - current
      if (gain < MIN_SWAP_GAIN) continue
      const score = gain + rosValue(ctx, next, ctx.planWeek + 1) - later
      if (score > bestScore) {
        bestScore = score
        swap = { add: add.player, drop, gain }
      }
    }
  }
  return { position, mine, options, swap }
}
