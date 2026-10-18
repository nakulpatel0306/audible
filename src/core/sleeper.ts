// Sleeper's public API is read-only by design; this module only ever issues GETs
const API = 'https://api.sleeper.app'
const POSITIONS = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF']

export type RawWeekRow = {
  player_id: string
  opponent?: string | null
  stats?: Record<string, number>
  player?: { position?: string; team?: string; first_name?: string; last_name?: string; injury_status?: string | null }
}

async function get<T>(path: string): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(API + path)
    if (res.ok) return res.json() as Promise<T>
    // 429 means we're over Sleeper's rate limit; back off rather than fail the run
    if (res.status === 429 && attempt < 3) {
      await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt))
      continue
    }
    throw new Error(`Sleeper ${res.status} on ${path}`)
  }
}

export type NflState = { week: number; season: string; season_type: string; display_week: number }

export const nflState = () => get<NflState>('/v1/state/nfl')

export const user = (usernameOrId: string) =>
  get<{ user_id: string; username: string; display_name: string } | null>(`/v1/user/${usernameOrId}`)

export const userLeagues = (userId: string, season: string) => get<any[]>(`/v1/user/${userId}/leagues/nfl/${season}`)

export const league = (leagueId: string) => get<any>(`/v1/league/${leagueId}`)

export const rosters = (leagueId: string) => get<any[]>(`/v1/league/${leagueId}/rosters`)

export const leagueUsers = (leagueId: string) => get<any[]>(`/v1/league/${leagueId}/users`)

export type MatchupRow = {
  roster_id: number
  matchup_id: number | null
  points: number
  starters?: string[]
  players_points?: Record<string, number>
}

export const matchups = (leagueId: string, week: number) => get<MatchupRow[]>(`/v1/league/${leagueId}/matchups/${week}`)

export const players = () => get<Record<string, any>>('/v1/players/nfl?active=true')

export const trending = (type: 'add' | 'drop', hours = 24, limit = 50) =>
  get<{ player_id: string; count: number }[]>(`/v1/players/nfl/trending/${type}?lookback_hours=${hours}&limit=${limit}`)

const positionQuery = POSITIONS.map((p) => `position[]=${p}`).join('&')

// Not part of the documented API, but it's what the Sleeper app itself uses for projections
export const projections = (season: string, week: number) =>
  get<RawWeekRow[]>(`/projections/nfl/${season}/${week}?season_type=regular&${positionQuery}`)
