import { describe, expect, test } from 'bun:test'
import { byePlan, byeWeeks } from '../src/core/byes.ts'
import { makeContext, player, roster } from './fixtures.ts'

describe('bye weeks', () => {
  test('a team is on bye in the week it has no game', () => {
    const games = [
      { week: 1, home: 'KC', away: 'BUF' },
      { week: 1, home: 'SF', away: 'DAL' },
      { week: 2, home: 'KC', away: 'SF' },
      { week: 3, home: 'BUF', away: 'DAL' },
      { week: 3, home: 'SF', away: 'KC' },
    ]
    const byes = byeWeeks(games)
    expect(byes.get('BUF')).toBe(2)
    expect(byes.get('DAL')).toBe(2)
    expect(byes.has('KC')).toBe(false)
  })

  const ctx = () => {
    const c = makeContext({
      players: [player('qb1', 'QB', 'KC'), player('rb1', 'RB', 'SF'), player('wr1', 'WR', 'KC'), player('def1', 'DEF', 'KC'), player('rb2', 'RB', 'DAL')],
      rosters: [roster(1, ['qb1', 'rb1', 'wr1', 'def1', 'rb2'])],
      means: { qb1: 20, rb1: 15, wr1: 12, def1: 8, rb2: 6 },
    })
    c.byes = new Map([
      ['KC', 12],
      ['SF', 11],
      ['DAL', 11],
    ])
    return c
  }

  test('lists who is out each week and whether they would start', () => {
    const plan = byePlan(ctx())
    expect(plan.map((w) => w.week)).toEqual([11, 12])
    const wk11 = plan[0]
    expect(wk11.out.map((o) => [o.player.id, o.starter])).toEqual([
      ['rb1', true],
      ['rb2', false],
    ])
  })

  test('flags slots nobody can fill', () => {
    const [wk11, wk12] = byePlan(ctx())
    expect(wk11.empty).toEqual(['RB'])
    expect(wk12.empty).toEqual(['QB', 'WR', 'DEF'])
  })

  test('skips byes already played', () => {
    const c = ctx()
    c.planWeek = 12
    expect(byePlan(c).map((w) => w.week)).toEqual([12])
  })
})
