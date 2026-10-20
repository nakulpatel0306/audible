import { describe, expect, test } from 'bun:test'
import { tradePartners } from '../src/core/partners.ts'
import { rosterPlan } from '../src/core/plan.ts'
import { makeContext, player, roster } from './fixtures.ts'

describe('roster plan', () => {
  // KC is off in week 12, taking the QB, WR and DEF with it. One bench spot is open.
  const ctx = () => {
    const c = makeContext({
      players: [
        player('qb1', 'QB', 'KC'),
        player('rb1', 'RB', 'SF'),
        player('wr1', 'WR', 'KC'),
        player('def1', 'DEF', 'KC'),
        player('rb2', 'RB', 'SF'),
        player('qb2', 'QB', 'SF'),
        player('def2', 'DEF', 'SF'),
      ],
      rosters: [roster(1, ['qb1', 'rb1', 'wr1', 'def1', 'rb2']), roster(2, [])],
      means: { qb1: 20, rb1: 15, wr1: 12, def1: 8, rb2: 6, qb2: 15, def2: 6 },
    })
    c.byes = new Map([['KC', 12]])
    for (const id of ['qb1', 'wr1', 'def1']) c.projections.get(12)!.delete(id)
    return c
  }

  test('fills bye-week holes with pickups, using the open spot first', () => {
    const wk12 = rosterPlan(ctx()).find((w) => w.week === 12)!
    expect(wk12.holes).toEqual(['QB', 'WR', 'DEF'])
    expect(wk12.moves.map((m) => [m.add.id, m.drop?.id ?? null, m.reason])).toEqual([
      ['qb2', null, 'hole'],
      ['def2', 'rb2', 'hole'],
    ])
    expect(wk12.unfilled).toEqual(['WR'])
    expect(wk12.out.map((p) => p.id)).toEqual(['qb1', 'wr1', 'def1'])
  })

  test('makes no moves in weeks the roster already covers', () => {
    const plan = rosterPlan(ctx())
    expect(plan.filter((w) => w.week !== 12).every((w) => w.moves.length === 0)).toBe(true)
  })

  test('carries pickups into later weeks', () => {
    const wk13 = rosterPlan(ctx()).find((w) => w.week === 13)!
    const ids = wk13.before.slots.map((s) => s.player?.id)
    expect(ids).toContain('qb1')
    expect(wk13.before.mean).toBe(20 + 15 + 12 + 8)
  })

  test('gives win chances against the scheduled opponent', () => {
    const c = ctx()
    c.rosters[1] = roster(2, ['qb2'])
    c.schedule = [{ week: 10, a: 1, b: 2 }]
    const [wk10] = rosterPlan(c)
    expect(wk10.opponent).toBe(2)
    expect(wk10.winPct!).toBeGreaterThan(0.9)
    expect(rosterPlan(c)[1].winPct).toBeNull()
  })
})

describe('trade partners', () => {
  // You're deep at RB and thin at WR; team 2 is the mirror image
  const ctx = () =>
    makeContext({
      players: [
        player('qb1', 'QB'),
        player('rb1', 'RB'),
        player('rb2', 'RB'),
        player('wr1', 'WR'),
        player('qb2', 'QB'),
        player('rb3', 'RB'),
        player('wr2', 'WR'),
        player('wr3', 'WR'),
        player('qb3', 'QB'),
        player('rb4', 'RB'),
        player('wr4', 'WR'),
      ],
      rosters: [roster(1, ['qb1', 'rb1', 'rb2', 'wr1']), roster(2, ['qb2', 'rb3', 'wr2', 'wr3']), roster(3, ['qb3', 'rb4', 'wr4'])],
      means: { qb1: 11, rb1: 20, rb2: 18, wr1: 5, qb2: 10, rb3: 5, wr2: 20, wr3: 18, qb3: 12, rb4: 12, wr4: 12 },
    })

  test('puts the team with a two-way fit first, with a deal that helps both', () => {
    const [best] = tradePartners(ctx())
    expect(best.roster.rosterId).toBe(2)
    expect(best.helpsYou).toContain('WR')
    expect(best.helpsThem).toContain('RB')
    const deal = best.deals[0]
    expect(deal.myGain).toBeGreaterThan(0)
    expect(deal.theirGain).toBeGreaterThan(0)
    expect(deal.get.map((p) => p.position)).toContain('WR')
  })

  test('ignores positions the lineup has no slot for', () => {
    for (const p of tradePartners(ctx())) expect([...p.needs, ...p.strengths]).not.toContain('TE')
  })

  test('returns nothing after the trade deadline', () => {
    const c = ctx()
    c.week = 12
    expect(tradePartners(c)).toEqual([])
  })
})
