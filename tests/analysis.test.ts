import { describe, expect, test } from 'bun:test'
import { bestLineup, rosValue } from '../src/core/lineup.ts'
import { injuryMultiplier } from '../src/core/model.ts'
import { lineupCheck } from '../src/core/monitor.ts'
import { myGames, seededRandom, simulateSeason } from '../src/core/sim.ts'
import { streamPlan } from '../src/core/streaming.ts'
import { evaluateTrade, findTrades } from '../src/core/trades.ts'
import { waiverTargets } from '../src/core/waivers.ts'
import { makeContext, player, roster } from './fixtures.ts'

describe('bestLineup', () => {
  test('solves overlapping flex slots exactly instead of greedily', () => {
    // Greedy puts wr1 in WRRB_FLEX and leaves REC_FLEX with wr2 (21). Best is rb1 + wr1 (35).
    const lineup = bestLineup(['WRRB_FLEX', 'REC_FLEX'], [
      { id: 'wr1', position: 'WR', mean: 20, sd: 1 },
      { id: 'rb1', position: 'RB', mean: 15, sd: 1 },
      { id: 'wr2', position: 'WR', mean: 1, sd: 1 },
    ])
    expect(lineup.mean).toBe(35)
    expect(lineup.slots.map((s) => s.player?.id)).toEqual(['rb1', 'wr1'])
  })

  test('fills fixed slots first so FLEX gets the best leftover', () => {
    const lineup = bestLineup(['FLEX', 'RB', 'WR'], [
      { id: 'rb1', position: 'RB', mean: 20, sd: 1 },
      { id: 'rb2', position: 'RB', mean: 15, sd: 1 },
      { id: 'wr1', position: 'WR', mean: 12, sd: 1 },
    ])
    expect(lineup.slots.map((s) => s.player?.id)).toEqual(['rb2', 'rb1', 'wr1'])
    expect(lineup.mean).toBe(47)
  })

  test('leaves a slot empty when nobody is eligible', () => {
    expect(bestLineup(['DEF'], [{ id: 'qb', position: 'QB', mean: 20, sd: 1 }]).slots[0].player).toBeNull()
  })
})

describe('injuryMultiplier', () => {
  test('zeroes ruled-out players this week but expects most of them back later', () => {
    expect(injuryMultiplier('Out', 0)).toBe(0)
    expect(injuryMultiplier('Out', 1)).toBeGreaterThan(0.5)
    expect(injuryMultiplier('IR', 2)).toBe(0)
    expect(injuryMultiplier(null, 0)).toBe(1)
  })
})

const players = [
  player('qbA', 'QB'), player('rbA', 'RB'), player('wrA', 'WR'), player('rbA2', 'RB'), player('defA', 'DEF'),
  player('qbB', 'QB'), player('rbB', 'RB'), player('wrB', 'WR'), player('wrB2', 'WR'), player('defB', 'DEF'),
  player('faTE', 'WR'), player('faDEF', 'DEF'), player('faDEF2', 'DEF'),
]
const means = {
  qbA: 20, rbA: 15, wrA: 10, rbA2: 14, defA: 5,
  qbB: 20, rbB: 9, wrB: 16, wrB2: 15, defB: 7,
  faTE: 12, faDEF: 9, faDEF2: 6,
}

// Team A is deep at RB and weak at WR; team B is the reverse. A swap helps both.
const ctx = () =>
  makeContext({
    players,
    means,
    rosters: [roster(1, ['qbA', 'rbA', 'wrA', 'rbA2', 'defA']), roster(2, ['qbB', 'rbB', 'wrB', 'wrB2', 'defB'])],
    schedule: [{ week: 10, a: 1, b: 2 }, { week: 11, a: 1, b: 2 }],
  })

describe('waivers', () => {
  test('values a pickup by how much it improves the starting lineup', () => {
    const [pick] = waiverTargets(ctx())
    // faTE (12) would start at WR over wrA (10): +2 a week for weeks 10-17, discounted
    expect(pick.add.id).toBe('faTE')
    expect(pick.drop).toBeNull()
    expect(pick.gain).toBeGreaterThan(2)
  })
})

describe('streaming', () => {
  test('recommends a defense swap only when the free agent is clearly better', () => {
    const plan = streamPlan(ctx(), 'DEF')
    expect(plan.swap?.add.id).toBe('faDEF')
    expect(plan.swap?.drop?.id).toBe('defA')
    expect(plan.swap?.gain).toBe(4)
  })

  test('skips a swap that wins next week but loses more over the rest of the season', () => {
    const c = ctx()
    // faDEF has one great matchup, then projects worse than defA every week after
    for (let w = 11; w <= 17; w++) c.projections.get(w)!.set('faDEF', { mean: 2, sd: 1, opponent: 'OPP', sources: { sleeper: 2, espn: null } })
    expect(streamPlan(c, 'DEF').swap).toBeNull()
  })

  test('fills an empty position into an open roster spot', () => {
    const c = ctx()
    c.me.players = c.me.players.filter((id) => id !== 'defA')
    const plan = streamPlan(c, 'DEF')
    expect(plan.mine).toHaveLength(0)
    expect(plan.swap?.add.id).toBe('faDEF')
    expect(plan.swap?.drop).toBeNull()
    expect(plan.swap?.gain).toBe(9)
  })

  test('fills an empty position on a full roster by cutting the least useful player', () => {
    const c = ctx()
    c.me.players = ['qbA', 'rbA', 'wrA', 'rbA2', 'faTE', 'wrB2']
    const plan = streamPlan(c, 'DEF')
    // With no FLEX, only qbA, rbA and wrB2 start; any of the other three is free to cut
    expect(plan.swap?.add.id).toBe('faDEF')
    expect(['wrA', 'rbA2', 'faTE']).toContain(plan.swap?.drop?.id ?? '')
  })
})

describe('trades', () => {
  test('finds the positional swap that helps both teams', () => {
    const [idea] = findTrades(ctx(), { minGain: 1 })
    expect(idea.give.map((p) => p.position)).toEqual(['RB'])
    expect(idea.get.map((p) => p.position)).toEqual(['WR'])
    expect(idea.myGain).toBeGreaterThan(0)
    expect(idea.theirGain).toBeGreaterThan(0)
  })

  test('grades a lopsided trade as a loss for the giver', () => {
    expect(evaluateTrade(ctx(), 2, ['qbA'], ['rbB']).myGain).toBeLessThan(0)
  })

  test('rosValue is the discounted sum of weekly best lineups', () => {
    const c = ctx()
    const weekly = 20 + 15 + 10 + 5
    expect(rosValue(c, c.me.players, 17)).toBe(weekly)
  })
})

describe('simulation', () => {
  test('the same seed gives the same odds', () => {
    const a = simulateSeason(ctx(), 2000, seededRandom(1))
    const b = simulateSeason(ctx(), 2000, seededRandom(1))
    expect(a).toEqual(b)
  })

  test('both teams make a 2-team playoff in a 2-team league', () => {
    for (const t of simulateSeason(ctx(), 500)) expect(t.playoffPct).toBe(1)
  })

  test('game odds favor the higher projected lineup', () => {
    const c = ctx()
    c.rosters[1].players = ['qbB', 'rbB', 'defB']
    expect(myGames(c)[0].winPct).toBeGreaterThan(0.7)
  })

  test('counts locked-in live points once a week kicks off', () => {
    const c = ctx()
    c.started = new Set(['KC'])
    c.live = new Map<number, { starters: string[]; points: Record<string, number> }>([
      [1, { starters: ['qbA'], points: { qbA: 40 } }],
      [2, { starters: ['qbB'], points: { qbB: 3 } }],
    ])
    const [game] = myGames(c)
    expect(game.myMean).toBe(40)
    expect(game.winPct).toBe(1)
  })

  test('keeps points scored apart from projections for games not yet played', () => {
    const c = ctx()
    c.players.get('rbA')!.team = 'SF'
    c.started = new Set(['KC'])
    c.live = new Map<number, { starters: string[]; points: Record<string, number> }>([
      [1, { starters: ['qbA', 'rbA'], points: { qbA: 40 } }],
      [2, { starters: ['qbB'], points: { qbB: 3 } }],
    ])
    const [game] = myGames(c)
    expect(game.myScored).toBe(40)
    expect(game.myMean).toBeGreaterThan(40)
    expect(game.theirScored).toBe(3)
  })

  test('adds the unplayed share of a projection for a game in progress', () => {
    const c = ctx()
    c.started = new Set(['KC'])
    // Halftime: qbA has 12 of a 20-point projection, with half the game to go
    c.games = [{ id: 'g', home: 'KC', away: 'BUF', state: 'in', remaining: 0.5, kickoff: '' }]
    c.live = new Map<number, { starters: string[]; points: Record<string, number> }>([
      [1, { starters: ['qbA'], points: { qbA: 12 } }],
      [2, { starters: ['qbB'], points: { qbB: 12 } }],
    ])
    const [game] = myGames(c)
    expect(game.myScored).toBe(12)
    expect(game.myMean).toBe(22)
    expect(game.winPct).toBeCloseTo(0.5, 5)
  })

  test('has no scored points before a week kicks off', () => {
    const [game] = myGames(ctx())
    expect(game.myScored).toBeNull()
    expect(game.theirScored).toBeNull()
  })
})

describe('lineup check', () => {
  test('flags a bench player who should be starting', () => {
    const c = ctx()
    c.me.starters = ['qbA', 'rbA', 'wrA', 'defA']
    c.me.players.push('faTE')
    const check = lineupCheck(c)
    expect(check?.start.map((m) => m.player.id)).toEqual(['faTE'])
    expect(check?.bench.map((m) => m.player.id)).toEqual(['wrA'])
    expect(check?.gain).toBe(2)
  })

  test('stays quiet when the set lineup is already best', () => {
    const c = ctx()
    c.me.starters = ['qbA', 'rbA', 'wrA', 'defA']
    expect(lineupCheck(c)).toBeNull()
  })

  test('does not suggest moves for players whose game already started', () => {
    const c = ctx()
    c.me.starters = ['qbA', 'rbA', 'wrA', 'defA']
    c.me.players.push('faTE')
    c.started = new Set(['KC'])
    expect(lineupCheck(c)).toBeNull()
  })
})
