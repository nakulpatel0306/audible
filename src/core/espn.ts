import type { Stats } from './types.ts'

export type NewsItem = {
  id: string
  headline: string
  description: string
  published: string
  url: string | null
  athletes: { espnId: string; name: string }[]
}

export type Game = {
  id: string
  home: string
  away: string
  state: 'pre' | 'in' | 'post'
  // Share of the game still to play: 1 before kickoff, 0 once it's over
  remaining: number
  kickoff: string
}

// Vegas view of one team's game: the market's best guess at how many points it scores
export type TeamLine = { opponent: string; spread: number; total: number; implied: number }

const SITE_API = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl'
const CORE_API = 'https://sports.core.api.espn.com/v2/sports/football/leagues/nfl'
const FANTASY_API = 'https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl'

// ESPN rejects Bun's default User-Agent with a 403. Browsers send their own and setting one
// there would force a CORS preflight ESPN doesn't answer, so only the CLI overrides it.
async function espnGet<T>(url: string, headers: Record<string, string> = {}): Promise<T> {
  const ua: Record<string, string> = 'document' in globalThis ? {} : { 'User-Agent': 'audible/1.0' }
  const res = await fetch(url, { headers: { ...ua, ...headers } })
  if (!res.ok) throw new Error(`ESPN ${res.status} on ${new URL(url).pathname}`)
  return res.json() as Promise<T>
}

// ESPN's public site API; no key, and it tags each story with the athletes it's about
export async function nflNews(limit = 50): Promise<NewsItem[]> {
  const body = await espnGet<{ articles: any[] }>(`${SITE_API}/news?limit=${limit}`)
  return body.articles
    .filter((a) => a.type !== 'Media')
    .map((a) => ({
      id: String(a.id),
      headline: a.headline,
      description: (a.description ?? '').trim(),
      published: a.published,
      url: a.links?.web?.href ?? null,
      athletes: (a.categories ?? [])
        .filter((c: any) => c.type === 'athlete' && c.athleteId)
        .map((c: any) => ({ espnId: String(c.athleteId), name: c.description ?? '' })),
    }))
}

// ESPN abbreviates Washington differently from Sleeper; every other team matches
const TEAM_ALIASES: Record<string, string> = { WSH: 'WAS' }
const team = (abbr: string) => TEAM_ALIASES[abbr] ?? abbr

// Four 15-minute quarters; overtime counts as nothing left, since it's usually decided fast
function remaining(status: any): number {
  const state = status?.type?.state
  if (state === 'pre' || !state) return 1
  if (state === 'post') return 0
  const period = status.period ?? 1
  if (period > 4) return 0
  return Math.min(1, Math.max(0, ((4 - period) * 900 + (status.clock ?? 0)) / 3600))
}

export async function weekGames(season: string, week: number): Promise<Game[]> {
  const body = await espnGet<{ events: any[] }>(`${SITE_API}/scoreboard?week=${week}&seasontype=2&dates=${season}`)
  return body.events.map((e) => {
    const sides = e.competitions[0].competitors
    return {
      id: String(e.id),
      home: team(sides.find((c: any) => c.homeAway === 'home').team.abbreviation),
      away: team(sides.find((c: any) => c.homeAway === 'away').team.abbreviation),
      state: e.status?.type?.state ?? 'pre',
      remaining: remaining(e.status),
      kickoff: e.date,
    }
  })
}

// Pregame DraftKings line per game. Live lines are skipped: they describe a game in progress.
export async function vegasLines(games: Game[]): Promise<Map<string, TeamLine>> {
  const lines = new Map<string, TeamLine>()
  await Promise.all(
    games.map(async (g) => {
      const body = await espnGet<{ items: any[] }>(`${CORE_API}/events/${g.id}/competitions/${g.id}/odds`).catch(() => ({ items: [] }))
      const odds = body.items.find((o) => o.overUnder && !/live/i.test(o.provider?.name ?? ''))
      if (!odds) return
      // "LAR -13.5" names the favorite; "EVEN" means a pick'em
      const [fav, line] = String(odds.details ?? '').split(' ')
      const spread = line ? Math.abs(Number(line)) : 0
      const favorite = team(fav)
      const total = Number(odds.overUnder)
      for (const [me, opp] of [[g.home, g.away], [g.away, g.home]]) {
        const signed = me === favorite ? -spread : opp === favorite ? spread : 0
        lines.set(me, { opponent: opp, spread: signed, total, implied: (total - signed) / 2 })
      }
    }),
  )
  return lines
}

// ESPN fantasy stat ids -> Sleeper stat keys, offense only. Kicker and defense stats use
// different bucket edges on ESPN, so those positions stay single-source.
const ESPN_STATS: Record<string, string> = {
  0: 'pass_att',
  1: 'pass_cmp',
  3: 'pass_yd',
  4: 'pass_td',
  19: 'pass_2pt',
  20: 'pass_int',
  23: 'rush_att',
  24: 'rush_yd',
  25: 'rush_td',
  26: 'rush_2pt',
  42: 'rec_yd',
  43: 'rec_td',
  44: 'rec_2pt',
  53: 'rec',
  58: 'rec_tgt',
  72: 'fum_lost',
}

export const SHARED_STAT_KEYS = new Set(Object.values(ESPN_STATS))

// QB, RB, WR, TE slot ids in ESPN's player filter
const OFFENSE_SLOTS = [0, 2, 4, 6]

export type EspnProjection = { espnId: string; name: string; position: string; stats: Stats }

const ESPN_POSITIONS: Record<number, string> = { 1: 'QB', 2: 'RB', 3: 'WR', 4: 'TE' }

// ESPN's own weekly projections, in Sleeper stat keys
export async function espnProjections(season: string, week: number): Promise<EspnProjection[]> {
  const filter = {
    players: {
      filterSlotIds: { value: OFFENSE_SLOTS },
      filterStatsForTopScoringPeriodIds: { value: 1, additionalValue: [`11${season}${week}`] },
      sortPercOwned: { sortPriority: 1, sortAsc: false },
      limit: 600,
    },
  }
  const body = await espnGet<{ players: any[] }>(
    `${FANTASY_API}/seasons/${season}/segments/0/leaguedefaults/3?view=kona_player_info&scoringPeriodId=${week}`,
    { 'x-fantasy-filter': JSON.stringify(filter) },
  )
  const out: EspnProjection[] = []
  for (const { player } of body.players) {
    const proj = player.stats?.find((s: any) => s.statSourceId === 1 && s.scoringPeriodId === week)
    if (!proj?.stats || Object.keys(proj.stats).length === 0) continue
    const stats: Stats = {}
    for (const [id, value] of Object.entries(proj.stats)) {
      const key = ESPN_STATS[id]
      if (key) stats[key] = value as number
    }
    out.push({ espnId: String(player.id), name: player.fullName, position: ESPN_POSITIONS[player.defaultPositionId] ?? '', stats })
  }
  return out
}
