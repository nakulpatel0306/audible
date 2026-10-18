import type { Context } from '../src/core/context.ts'
import type { Player, Position, Projection, Roster } from '../src/core/types.ts'

export const player = (id: string, position: Position, team = 'KC'): Player => ({
  id,
  name: id,
  position,
  team,
  injuryStatus: null,
  injuryNotes: null,
  espnId: null,
  gsisId: null,
})

export const roster = (rosterId: number, players: string[], extra: Partial<Roster> = {}): Roster => ({
  rosterId,
  ownerId: `owner${rosterId}`,
  teamName: `Team ${rosterId}`,
  players,
  starters: [],
  reserve: [],
  wins: 0,
  losses: 0,
  ties: 0,
  pointsFor: 0,
  waiverPosition: null,
  ...extra,
})

// A tiny league with no FLEX, so a surplus RB can't paper over a missing WR. 2 bench spots.
// `means` gives every player the same projection in each week from `week` to 17.
export function makeContext(opts: {
  players: Player[]
  rosters: Roster[]
  means: Record<string, number>
  week?: number
  schedule?: Context['schedule']
}): Context {
  const week = opts.week ?? 10
  const projections = new Map<number, Map<string, Projection>>()
  for (let w = week; w <= 17; w++) {
    projections.set(w, new Map(Object.entries(opts.means).map(([id, mean]) => [id, { mean, sd: mean * 0.5, opponent: 'OPP', sources: { sleeper: mean, espn: null } }])))
  }
  return {
    league: {
      id: 'L',
      name: 'Test',
      season: '2026',
      numTeams: opts.rosters.length,
      slots: ['QB', 'RB', 'WR', 'DEF'],
      benchSize: 2,
      scoring: {},
      playoffTeams: 2,
      playoffWeekStart: 15,
      tradeDeadline: 11,
      lastScoredWeek: week - 1,
      waiverType: 'rolling',
    },
    week,
    planWeek: week,
    started: new Set(),
    live: new Map(),
    rosters: opts.rosters,
    me: opts.rosters[0],
    players: new Map(opts.players.map((p) => [p.id, p])),
    projections,
    schedule: opts.schedule ?? [],
    games: [],
    results: [],
    vegas: new Map(),
  }
}
