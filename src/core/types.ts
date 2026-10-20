export type Stats = Record<string, number>

export type Position = 'QB' | 'RB' | 'WR' | 'TE' | 'K' | 'DEF'

export type Player = {
  id: string
  name: string
  position: Position
  team: string | null
  injuryStatus: string | null
  injuryNotes: string | null
  espnId: string | null
  gsisId: string | null
}

export type Roster = {
  rosterId: number
  ownerId: string | null
  teamName: string
  players: string[]
  starters: string[]
  reserve: string[]
  // Dynasty taxi squad: rostered but can't start, and doesn't use a bench spot
  taxi: string[]
  wins: number
  losses: number
  ties: number
  pointsFor: number
  waiverPosition: number | null
}

export type League = {
  id: string
  name: string
  season: string
  numTeams: number
  slots: string[]
  benchSize: number
  scoring: Stats
  playoffTeams: number
  playoffWeekStart: number
  tradeDeadline: number
  lastScoredWeek: number
  waiverType: 'rolling' | 'reverse' | 'faab'
}

// One player's outlook for one week, already in this league's scoring
export type Projection = {
  mean: number
  sd: number
  opponent: string | null
  // Each source's number in this league's scoring, before blending, for showing the work
  sources: { sleeper: number; espn: number | null }
}

// One of a user's leagues, for choosing between them
export type LeagueOption = { id: string; name: string; status: string }

export type Matchup = { week: number; a: number; b: number }
