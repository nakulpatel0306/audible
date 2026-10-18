import { LAST_WEEK, projectionFor, type Context } from './context.ts'
import type { Player } from './types.ts'
import { freeAgents } from './waivers.ts'

export type StreamWeek = { week: number; opponent: string | null; mean: number }

export type StreamOption = { player: Player; owned: boolean; weeks: StreamWeek[]; next: number; window: number }

export type StreamPlan = {
  position: 'DEF' | 'K'
  mine: StreamOption[]
  options: StreamOption[]
  // Set when a free agent beats your current starter next week by enough to be worth a move
  swap: { add: Player; drop: Player; gain: number } | null
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

  let swap: StreamPlan['swap'] = null
  const current = mine[0]
  const best = options[0]
  if (best && (!current || best.next - current.next >= MIN_SWAP_GAIN)) {
    // Drop the one you own with the worst outlook over the window, not just next week
    const drop = [...mine].sort((a, b) => a.window - b.window)[0]
    if (drop) swap = { add: best.player, drop: drop.player, gain: best.next - (current?.next ?? 0) }
  }
  return { position, mine, options, swap }
}
