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
    expect(plan.swap?.drop.id).toBe('defA')
    expect(plan.swap?.gain).toBe(4)
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
