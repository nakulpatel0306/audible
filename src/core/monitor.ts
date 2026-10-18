import { nameKey } from './consensus.ts'
import { activePlayers, projectionFor, type Context } from './context.ts'
import type { NewsItem } from './espn.ts'
import { bestLineup, candidates } from './lineup.ts'
import type { Player } from './types.ts'

export type LineupMove = { player: Player; points: number; reason: string | null }

export type LineupCheck = { week: number; gain: number; start: LineupMove[]; bench: LineupMove[] }

const myPlayers = (ctx: Context) => ctx.me.players.map((id) => ctx.players.get(id)).filter((p): p is Player => !!p)

function reason(ctx: Context, player: Player, week: number): string | null {
  if (player.injuryStatus) return player.injuryStatus
  return projectionFor(ctx, player.id, week).mean === 0 ? 'bye or no game' : null
}

// Compares the lineup set in Sleeper with the best one by projection. Catches byes, players
// ruled out, and better options on the bench. Players whose game has kicked off are locked,
// so only the open slots are reconsidered.
export function lineupCheck(ctx: Context, minGain = 0.5): LineupCheck | null {
  const week = ctx.week
  const locked = (id: string) => ctx.started.has(ctx.players.get(id)?.team ?? '')
  const openSlots = ctx.league.slots.filter((_, i) => !locked(ctx.me.starters[i] ?? ''))
  const starters = ctx.me.starters.filter((id) => !locked(id))
  const best = bestLineup(openSlots, candidates(ctx, activePlayers(ctx.me).filter((id) => !locked(id)), week))
  const current = starters.reduce((t, id) => t + projectionFor(ctx, id, week).mean, 0)
  if (best.mean - current < minGain) return null

  const bestIds = new Set(best.slots.map((s) => s.player?.id).filter((id): id is string => !!id))
  const move = (id: string): LineupMove | null => {
    const player = ctx.players.get(id)
    return player ? { player, points: projectionFor(ctx, id, week).mean, reason: reason(ctx, player, week) } : null
  }
  return {
    week,
    gain: best.mean - current,
    start: [...bestIds].filter((id) => !starters.includes(id)).map(move).filter((m): m is LineupMove => !!m),
    bench: starters.filter((id) => !bestIds.has(id)).map(move).filter((m): m is LineupMove => !!m),
  }
}

export type InjuryRow = { player: Player; starting: boolean }

export function injuryReport(ctx: Context): InjuryRow[] {
  return myPlayers(ctx)
    .filter((p) => p.injuryStatus)
    .map((player) => ({ player, starting: ctx.me.starters.includes(player.id) }))
    .sort((a, b) => Number(b.starting) - Number(a.starting))
}

export type PlayerNews = NewsItem & { players: Player[] }

// ESPN stories about players on your roster. Matches on ESPN id, then name, because Sleeper
// is missing ESPN ids for many players.
export function rosterNews(ctx: Context, news: NewsItem[]): PlayerNews[] {
  const mine = myPlayers(ctx).filter((p) => p.position !== 'DEF')
  const byEspnId = new Map(mine.filter((p) => p.espnId).map((p) => [p.espnId!, p]))
  const byName = new Map(mine.map((p) => [nameKey(p.name), p]))
  return news
    .map((item) => ({
      ...item,
      players: [...new Set(item.athletes.map((a) => byEspnId.get(a.espnId) ?? byName.get(nameKey(a.name))))].filter((p): p is Player => !!p),
    }))
    .filter((item) => item.players.length > 0)
}
