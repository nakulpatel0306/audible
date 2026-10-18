import { nameKey } from './consensus.ts'
import type { Player } from './types.ts'

// nflverse's weekly player stats: free, updated nightly in season, and the only free source
// of target share. GitHub release downloads don't allow browser requests, so the dashboard
// reads a same-origin copy: the dev server proxies it, and the Pages build snapshots it
// (see vite.config.ts and scripts/nflverse.ts).
export const NFLVERSE_RELEASES = 'https://github.com/nflverse/nflverse-data/releases/download'

export const usagePath = (season: string) => `stats_player/stats_player_week_${season}.csv`

// Minimal RFC 4180 parsing: nflverse quotes fields that contain commas (headshot URLs)
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') field += text[++i]
      else if (c === '"') quoted = false
      else field += c
    } else if (c === '"') quoted = true
    else if (c === ',') {
      row.push(field)
      field = ''
    } else if (c === '\n') {
      row.push(field.replace(/\r$/, ''))
      rows.push(row)
      row = []
      field = ''
    } else field += c
  }
  if (field || row.length) rows.push([...row, field])
  const [header, ...body] = rows
  return body.map((cells) => Object.fromEntries(header.map((h, i) => [h, cells[i] ?? ''])))
}

export type UsageWeek = { week: number; targetShare: number; targets: number; carries: number }

export type UsageTrend = {
  recent: { targetShare: number; carries: number }
  earlier: { targetShare: number; carries: number }
  weeks: UsageWeek[]
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)

// Last three games against everything before them. Projections already price in usage, so
// this is shown as context: it explains a projection rather than changing it.
export function trend(weeks: UsageWeek[], recentGames = 3): UsageTrend | null {
  if (weeks.length < recentGames + 1) return null
  const sorted = [...weeks].sort((a, b) => a.week - b.week)
  const recent = sorted.slice(-recentGames)
  const earlier = sorted.slice(0, -recentGames)
  const summary = (ws: UsageWeek[]) => ({ targetShare: avg(ws.map((w) => w.targetShare)), carries: avg(ws.map((w) => w.carries)) })
  return { recent: summary(recent), earlier: summary(earlier), weeks: sorted }
}

export async function fetchUsageRows(season: string, source = NFLVERSE_RELEASES): Promise<Record<string, string>[]> {
  const res = await fetch(`${source}/${usagePath(season)}`)
  if (!res.ok) throw new Error(`nflverse ${res.status}`)
  return parseCsv(await res.text()).filter((r) => r.season_type === 'REG' && ['QB', 'RB', 'WR', 'TE'].includes(r.position))
}

export function usageTrends(rows: Record<string, string>[], players: Map<string, Player>): Map<string, UsageTrend> {

  const byGsis = new Map<string, string>()
  const byName = new Map<string, string>()
  for (const p of players.values()) {
    if (p.gsisId) byGsis.set(p.gsisId, p.id)
    byName.set(`${nameKey(p.name)}|${p.position}`, p.id)
  }
  const weeks = new Map<string, UsageWeek[]>()
  for (const r of rows) {
    const id = byGsis.get(r.player_id) ?? byName.get(`${nameKey(r.player_display_name)}|${r.position}`)
    if (!id) continue
    const list = weeks.get(id) ?? []
    list.push({ week: Number(r.week), targetShare: Number(r.target_share) || 0, targets: Number(r.targets) || 0, carries: Number(r.carries) || 0 })
    weeks.set(id, list)
  }
  const out = new Map<string, UsageTrend>()
  for (const [id, ws] of weeks) {
    const t = trend(ws)
    if (t) out.set(id, t)
  }
  return out
}

export type UsageSignal = { direction: 'up' | 'down'; text: string }

// Only changes big enough to mean a role change, not week-to-week noise
export function usageSignal(t: UsageTrend | undefined): UsageSignal | null {
  if (!t) return null
  const share = t.recent.targetShare - t.earlier.targetShare
  if (Math.abs(share) >= 0.05) {
    const pct = (x: number) => `${Math.round(x * 100)}%`
    return { direction: share > 0 ? 'up' : 'down', text: `Target share ${pct(t.recent.targetShare)} last 3 games, ${pct(t.earlier.targetShare)} before` }
  }
  const carries = t.recent.carries - t.earlier.carries
  if (Math.abs(carries) >= 4) {
    return { direction: carries > 0 ? 'up' : 'down', text: `${t.recent.carries.toFixed(1)} carries a game lately, ${t.earlier.carries.toFixed(1)} before` }
  }
  return null
}
