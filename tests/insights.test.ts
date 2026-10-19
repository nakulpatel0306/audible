import { describe, expect, test } from 'bun:test'
import { leagueProfiles } from '../src/core/compare.ts'
import { disagreement, disagreementSpread, espnScore, matchEspn } from '../src/core/consensus.ts'
import { rosterNews } from '../src/core/monitor.ts'
import { reviewOffer } from '../src/core/review.ts'
import { beforeAfter, tradeChanges, waiverChanges } from '../src/core/scenario.ts'
import { parseCsv, trend, usageSignal } from '../src/core/usage.ts'
import { makeContext, player, roster } from './fixtures.ts'

const players = [
  player('qbA', 'QB'), player('rbA', 'RB'), player('wrA', 'WR'), player('rbA2', 'RB'), player('defA', 'DEF'),
  player('qbB', 'QB'), player('rbB', 'RB'), player('wrB', 'WR'), player('wrB2', 'WR'), player('defB', 'DEF'),
  player('faWR', 'WR'),
]
const means = { qbA: 20, rbA: 15, wrA: 10, rbA2: 14, defA: 5, qbB: 20, rbB: 9, wrB: 16, wrB2: 15, defB: 7, faWR: 12 }
const ctx = () =>
  makeContext({
    players,
    means,
    rosters: [roster(1, ['qbA', 'rbA', 'wrA', 'rbA2', 'defA'], { wins: 2 }), roster(2, ['qbB', 'rbB', 'wrB', 'wrB2', 'defB'], { losses: 2 })],
    schedule: [{ week: 10, a: 1, b: 2 }, { week: 11, a: 1, b: 2 }],
  })

describe('consensus', () => {
  const scoring = { rec: 1, rec_yd: 0.1, rec_fd: 0.5 }
  test('swaps in ESPN only for stats both sources project, keeping Sleeper-only bonuses', () => {
    // Sleeper: 5 rec, 50 yds, 3 first downs. ESPN: 6 rec, 70 yds, no first-down projection.
    expect(espnScore({ rec: 5, rec_yd: 50, rec_fd: 3 }, { rec: 6, rec_yd: 70 }, scoring)).toBe(6 + 7 + 1.5)
  })

  test('disagreement widens the range, capped so one wild number cannot explode it', () => {
    expect(disagreement(10, 13)).toBeCloseTo(0.3)
    expect(disagreementSpread(0)).toBe(1)
    expect(disagreementSpread(5)).toBe(disagreementSpread(0.6))
  })

  test('matches ESPN rows by id, then by unambiguous name', () => {
    const roster = new Map([
      ['1', { ...player('1', 'WR'), name: 'D.J. Moore', espnId: null }],
      ['2', { ...player('2', 'QB'), name: 'Josh Allen' }],
      ['3', { ...player('3', 'QB'), name: 'Josh Allen' }],
      ['4', { ...player('4', 'RB'), name: 'Someone', espnId: '99' }],
    ])
    const matched = matchEspn(roster, [
      { espnId: 'x', name: 'DJ Moore', position: 'WR', stats: { rec: 1 } },
      { espnId: 'y', name: 'Josh Allen', position: 'QB', stats: { pass_td: 2 } },
      { espnId: '99', name: 'Different Name', position: 'RB', stats: { rush_td: 1 } },
    ])
    expect([...matched.keys()].sort()).toEqual(['1', '4'])
  })
})

describe('league comparison', () => {
  test('ranks teams by rest-of-season lineup strength and positions within the league', () => {
    const [first, second] = leagueProfiles(ctx())
    expect(first.roster.rosterId).toBe(2)
    expect(first.ranks.WR).toBe(1)
    expect(second.ranks.RB).toBe(1)
    expect(first.weekly).toHaveLength(8)
  })

  test('all-play record compares each week against every other team', () => {
    const c = ctx()
    c.results = [
      { week: 1, rosterId: 1, points: 100 },
      { week: 1, rosterId: 2, points: 90 },
      { week: 2, rosterId: 1, points: 80 },
      { week: 2, rosterId: 2, points: 95 },
    ]
    const mine = leagueProfiles(c).find((t) => t.roster.rosterId === 1)!
    expect(mine.allPlay).toEqual({ wins: 1, losses: 1 })
    // 2-0 actual against a .500 all-play record: one win of schedule luck
    expect(mine.luck).toBe(1)
  })
})

describe('before and after', () => {
  test('a pickup shows its effect on the lineup and every remaining week', () => {
    const [side] = beforeAfter(ctx(), waiverChanges(ctx(), 'faWR', null))
    expect(side.lineupAfter.mean - side.lineupBefore.mean).toBe(2)
    expect(side.weekly.every((w) => w.after - w.before === 2)).toBe(true)
    expect(side.rosAfter).toBeGreaterThan(side.rosBefore)
  })

  test('a trade produces a before and after for both teams', () => {
    const c = ctx()
    const sides = beforeAfter(c, tradeChanges(c, 2, ['rbA2'], ['wrB2']))
    expect(sides.map((s) => s.roster.rosterId)).toEqual([1, 2])
    expect(sides[0].roster.players).toContain('wrB2')
    expect(sides[1].roster.players).toContain('rbA2')
  })
})

describe('roster news', () => {
  test('keeps stories that mention your players', () => {
    const c = ctx()
    const news = [
      { id: '1', headline: 'qbA limited', description: '', published: '', url: null, athletes: [{ espnId: '5', name: 'qbA' }] },
      { id: '2', headline: 'qbB sharp', description: '', published: '', url: null, athletes: [{ espnId: '6', name: 'qbB' }] },
    ]
    expect(rosterNews(c, news).map((n) => n.id)).toEqual(['1'])
  })
})

describe('usage', () => {
  test('parses quoted fields that contain commas', () => {
    const rows = parseCsv('name,url,week\nA,"https://x/f_auto,q_auto/a",3\n')
    expect(rows).toEqual([{ name: 'A', url: 'https://x/f_auto,q_auto/a', week: '3' }])
  })

  test('flags a role change but not ordinary noise', () => {
    const weeks = (shares: number[]) => shares.map((targetShare, i) => ({ week: i + 1, targetShare, targets: 0, carries: 0 }))
    expect(usageSignal(trend(weeks([0.1, 0.1, 0.22, 0.24, 0.2]))!)?.direction).toBe('up')
    expect(usageSignal(trend(weeks([0.18, 0.2, 0.19, 0.21, 0.2]))!)).toBeNull()
  })
})

describe('offer review', () => {
  test('accepts an offer that fills a hole, explains why, and skips counters', () => {
    const review = reviewOffer(ctx(), 2, ['rbA2'], ['wrB2'])
    expect(review.verdict).toBe('accept')
    expect(review.counters).toEqual([])
    expect(review.reasons[0]).toMatch(/^Adds/)
  })

  test('declines a downgrade and finds counters that work for both sides', () => {
    // Swapping your RB1 for their weaker RB costs you every week
    const review = reviewOffer(ctx(), 2, ['rbA'], ['rbB'])
    expect(review.verdict).toBe('decline')
    expect(review.ranks).toEqual([{ position: 'RB', before: 1, after: 2 }])
    expect(review.counters.length).toBeGreaterThan(0)
    for (const c of review.counters) {
      expect(c.myGain).toBeGreaterThanOrEqual(2)
      expect(c.theirGain).toBeGreaterThan(-2)
    }
  })

  test('flags an injured player coming back', () => {
    const c = ctx()
    c.players.get('wrB2')!.injuryStatus = 'Out'
    expect(reviewOffer(c, 2, ['rbA2'], ['wrB2']).reasons.some((r) => r.includes('listed Out'))).toBe(true)
  })
})
