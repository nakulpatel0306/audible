import { SHARED_STAT_KEYS, type EspnProjection } from './espn.ts'
import { projectedScore, score } from './scoring.ts'
import type { Player, Stats } from './types.ts'

function shared(stats: Stats): Stats {
  const out: Stats = {}
  for (const key in stats) if (SHARED_STAT_KEYS.has(key)) out[key] = stats[key]
  return out
}

// ESPN's projection in this league's scoring. ESPN doesn't project bonus stats like first
// downs, so those come from Sleeper; only the stats both sources cover are swapped.
export function espnScore(sleeper: Stats, espn: Stats, scoring: Stats): number {
  return projectedScore(sleeper, scoring) + score(espn, scoring) - score(shared(sleeper), scoring)
}

// Relative gap between the two sources' projections
export const disagreement = (sleeperPts: number, espnPts: number | null) =>
  espnPts === null ? 0 : Math.abs(sleeperPts - espnPts) / Math.max(sleeperPts, 1)

// Averaging the sources didn't beat Sleeper alone out of sample (2026 wks 1-5, 1073
// player-weeks), but their disagreement did predict misses: the most-split quarter missed
// by 65% of projection vs 50% for the least-split. So a split widens the range instead of
// moving the mean.
export function disagreementSpread(gap: number): number {
  return 1 + 1.25 * Math.min(gap, 0.6)
}

// "D.J. Moore Jr." and "DJ Moore" should match
export const nameKey = (name: string) =>
  name.toLowerCase().replace(/[^a-z ]/g, '').replace(/ (jr|sr|ii|iii|iv|v)$/, '').trim()

// Sleeper only carries ESPN ids for some players, so fall back to name + position,
// skipping any name that's ambiguous (two Josh Allens can't both be matched by name)
export function matchEspn(players: Map<string, Player>, rows: EspnProjection[]): Map<string, Stats> {
  const byEspnId = new Map<string, string>()
  const byName = new Map<string, string | null>()
  for (const p of players.values()) {
    if (p.espnId) byEspnId.set(p.espnId, p.id)
    const key = `${nameKey(p.name)}|${p.position}`
    byName.set(key, byName.has(key) ? null : p.id)
  }
  const out = new Map<string, Stats>()
  for (const row of rows) {
    const id = byEspnId.get(row.espnId) ?? byName.get(`${nameKey(row.name)}|${row.position}`)
    if (id) out.set(id, row.stats)
  }
  return out
}
