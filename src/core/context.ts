import { disagreement, disagreementSpread, espnScore, matchEspn } from './consensus.ts'
import { espnProjections, vegasLines, weekGames, type Game, type TeamLine } from './espn.ts'
import { byeWeeks } from './byes.ts'
import { injuryMultiplier, weeklySd } from './model.ts'
import { projectedScore } from './scoring.ts'
import * as sleeper from './sleeper.ts'
import type { League, LeagueOption, Matchup, Player, Position, Projection, Roster } from './types.ts'

export const LAST_WEEK = 17

// ESPN's projections are a second opinion for near-term decisions; fetching all remaining
// weeks quadruples load time in the browser for numbers that barely matter
const ESPN_WEEKS = 4

// Everything the analysis modules need, fetched once per run
export type Context = {
  league: League
  // Every league the user is in this season, for switching between them
  leagues: LeagueOption[]
  // The week being played, or about to be
  week: number
  // First week roster moves can still affect: next week once this one has kicked off
  planWeek: number
  // NFL teams whose game this week has started, so their players are locked
  started: Set<string>
  // This week's lineups as set in Sleeper, with points scored so far
  live: Map<number, { starters: string[]; points: Record<string, number> }>
  rosters: Roster[]
  me: Roster
  players: Map<string, Player>
  // projections.get(week).get(playerId)
  projections: Map<number, Map<string, Projection>>
  schedule: Matchup[]
  games: Game[]
  // Final team scores for every completed week
  results: { week: number; rosterId: number; points: number }[]
  // Vegas lines by NFL team, for the weeks books have posted (usually just the next one or two)
  vegas: Map<number, Map<string, TeamLine>>
  // NFL team -> its bye week
  byes: Map<string, number>
}

const FANTASY_POSITIONS = new Set(['QB', 'RB', 'WR', 'TE', 'K', 'DEF'])

function toLeague(raw: any): League {
  const s = raw.settings
  return {
    id: raw.league_id,
    name: raw.name,
    season: raw.season,
    numTeams: raw.total_rosters,
    slots: raw.roster_positions.filter((p: string) => p !== 'BN' && p !== 'IR'),
    benchSize: raw.roster_positions.filter((p: string) => p === 'BN').length,
    scoring: raw.scoring_settings,
    playoffTeams: s.playoff_teams,
    playoffWeekStart: s.playoff_week_start,
    tradeDeadline: s.trade_deadline,
    lastScoredWeek: s.last_scored_leg ?? 0,
    waiverType: s.waiver_type === 2 ? 'faab' : s.waiver_type === 1 ? 'reverse' : 'rolling',
  }
}

function toPlayer(raw: any): Player | null {
  const position = raw.position
  if (!FANTASY_POSITIONS.has(position)) return null
  const name = position === 'DEF' ? `${raw.first_name} ${raw.last_name}` : raw.full_name ?? `${raw.first_name} ${raw.last_name}`
  return {
    id: raw.player_id,
    name,
    position: position as Position,
    team: raw.team ?? null,
    injuryStatus: raw.injury_status ?? null,
    injuryNotes: raw.injury_notes ?? null,
    espnId: raw.espn_id ? String(raw.espn_id) : null,
    gsisId: raw.gsis_id ?? null,
  }
}

// Leagues being played come first; drafts and finished leagues after
const STATUS_ORDER = ['in_season', 'post_season', 'drafting', 'pre_draft', 'complete']

export async function listLeagues(username: string, season: string): Promise<{ userId: string; leagues: LeagueOption[] }> {
  const found = await sleeper.user(username)
  if (!found) throw new Error(`No Sleeper user named "${username}"`)
  const raw = await sleeper.userLeagues(found.user_id, season)
  const leagues = raw
    .map((l) => ({ id: l.league_id as string, name: l.name as string, status: l.status as string }))
    .sort((a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status))
  if (leagues.length === 0) throw new Error(`${username} isn't in any ${season} Sleeper leagues`)
  return { userId: found.user_id, leagues }
}

export async function loadContext(username: string, leagueId?: string, nflState?: sleeper.NflState): Promise<Context> {
  const state = nflState ?? (await sleeper.nflState())
  const season = state.season
  // The big downloads don't depend on the league, so start them before looking it up.
  // The week can only move later than Sleeper's current week, never earlier, so this range covers it.
  const fetchedWeeks = range(state.week, LAST_WEEK)
  const playersP = sleeper.players()
  const projP = Promise.all(fetchedWeeks.map((w) => sleeper.projections(season, w)))
  const espnP = Promise.all(fetchedWeeks.slice(0, ESPN_WEEKS).map((w) => espnProjections(season, w).catch(() => [])))
  // Byes are a nice-to-have; without them the rest of the analysis is unaffected
  const byesP = sleeper.schedule(season).then(byeWeeks).catch(() => new Map<string, number>())

  const { userId, leagues } = await listLeagues(username, season)
  // A remembered league can disappear (new season, user left it); fall back to the first one
  const chosen = leagues.find((l) => l.id === leagueId) ?? leagues[0]
  const [rawLeague, rawRosters, users, rawPlayers] = await Promise.all([
    sleeper.league(chosen.id),
    sleeper.rosters(chosen.id),
    sleeper.leagueUsers(chosen.id),
    playersP,
  ])
  const league = toLeague(rawLeague)
  // Decisions are about the next unplayed week; the in-progress week is already locked in part
  const week = Math.max(state.week, league.lastScoredWeek + 1)

  const players = new Map<string, Player>()
  for (const raw of Object.values(rawPlayers)) {
    const p = toPlayer(raw)
    if (p) players.set(p.id, p)
  }

  const names = new Map(users.map((u) => [u.user_id, u.metadata?.team_name || u.display_name]))
  const rosters: Roster[] = rawRosters.map((r) => ({
    rosterId: r.roster_id,
    ownerId: r.owner_id,
    teamName: names.get(r.owner_id) ?? `Team ${r.roster_id}`,
    players: r.players ?? [],
    starters: r.starters ?? [],
    reserve: r.reserve ?? [],
    taxi: r.taxi ?? [],
    wins: r.settings.wins,
    losses: r.settings.losses,
    ties: r.settings.ties,
    pointsFor: r.settings.fpts + (r.settings.fpts_decimal ?? 0) / 100,
    waiverPosition: r.settings.waiver_position ?? null,
  }))
  // Co-managers are listed separately from the owner but run the team just the same
  const mine = rawRosters.find((r) => r.owner_id === userId || r.co_owners?.includes(userId))
  const me = rosters.find((r) => r.rosterId === mine?.roster_id)
  if (!me) throw new Error(`${username} doesn't own a team in ${league.name}`)

  const scheduleWeeks = range(week, league.playoffWeekStart - 1)
  // ESPN is a second opinion, not a dependency: if it's down, Sleeper's numbers stand alone
  const pastWeeks = range(1, league.lastScoredWeek)
  const [allProj, espnProj, weekMatchups, pastMatchups, games, byes] = await Promise.all([
    projP,
    espnP,
    Promise.all(scheduleWeeks.map((w) => sleeper.matchups(league.id, w))),
    Promise.all(pastWeeks.map((w) => sleeper.matchups(league.id, w))),
    weekGames(league.season, week),
    byesP,
  ])
  const results = pastMatchups.flatMap((rows, i) => rows.map((r) => ({ week: pastWeeks[i], rosterId: r.roster_id, points: r.points })))
  const started = new Set(games.filter((g) => g.state !== 'pre').flatMap((g) => [g.home, g.away]))
  const planWeek = started.size > 0 && week < LAST_WEEK ? week + 1 : week
  const vegasWeeks = [...new Set([week, planWeek])]
  const vegasByWeek = await Promise.all(
    vegasWeeks.map(async (w) => vegasLines(w === week ? games.filter((g) => g.state === 'pre') : await weekGames(league.season, w)).catch(() => new Map())),
  )
  const vegas = new Map(vegasWeeks.map((w, i) => [w, vegasByWeek[i]]))
  const live = new Map((weekMatchups[0] ?? []).map((m) => [m.roster_id, { starters: m.starters ?? [], points: m.players_points ?? {} }]))

  const projections = new Map<number, Map<string, Projection>>()
  fetchedWeeks.forEach((w, i) => {
    if (w < week) return
    const espn = matchEspn(players, espnProj[i] ?? [])
    const byPlayer = new Map<string, Projection>()
    for (const row of allProj[i]) {
      const player = players.get(row.player_id)
      if (!player || !row.stats) continue
      const health = injuryMultiplier(player.injuryStatus, w - week)
      const theirs = espn.get(player.id)
      const mean = projectedScore(row.stats, league.scoring) * health
      const espnPts = theirs ? espnScore(row.stats, theirs, league.scoring) * health : null
      const sd = weeklySd(player.position, mean) * disagreementSpread(disagreement(mean, espnPts))
      byPlayer.set(player.id, { mean, sd, opponent: row.opponent ?? null, sources: { sleeper: mean, espn: espnPts } })
    }
    projections.set(w, byPlayer)
  })

  const schedule = toSchedule(scheduleWeeks, weekMatchups)
  return { league, leagues, week, planWeek, started, live, rosters, me, players, projections, schedule, games, results, vegas, byes }
}

function toSchedule(weeks: number[], all: sleeper.MatchupRow[][]): Matchup[] {
  const out: Matchup[] = []
  all.forEach((rows, i) => {
    const pairs = new Map<number, number[]>()
    for (const r of rows) {
      if (r.matchup_id == null) continue
      pairs.set(r.matchup_id, [...(pairs.get(r.matchup_id) ?? []), r.roster_id])
    }
    for (const [a, b] of pairs.values()) if (b !== undefined) out.push({ week: weeks[i], a, b })
  })
  return out
}

export function range(from: number, to: number): number[] {
  const out: number[] = []
  for (let i = from; i <= to; i++) out.push(i)
  return out
}

export const projectionFor = (ctx: Context, playerId: string, week: number): Projection =>
  ctx.projections.get(week)?.get(playerId) ?? { mean: 0, sd: 0, opponent: null, sources: { sleeper: 0, espn: null } }

export const rosterById = (ctx: Context, rosterId: number) => ctx.rosters.find((r) => r.rosterId === rosterId)!

// Players counted for lineups: IR and taxi slots hold players who can't start anyway
export const activePlayers = (roster: Roster) => roster.players.filter((p) => !roster.reserve.includes(p) && !roster.taxi.includes(p))

export const sleeperLeagueUrl = (league: League) => `https://sleeper.com/leagues/${league.id}`
