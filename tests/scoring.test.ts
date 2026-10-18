import { describe, expect, test } from 'bun:test'
import { expectedStats, projectedScore, score } from '../src/core/scoring.ts'

const scoring = { rec: 1, rec_yd: 0.1, rec_td: 6, pts_allow_0: 10, pts_allow_14_20: 1, pts_allow_21_27: 0, pts_allow_28_34: -1, fgm_50_59: 5 }

describe('score', () => {
  test('is a weighted sum over stats the league scores', () => {
    expect(score({ rec: 5, rec_yd: 62, rec_td: 1, rush_att: 3 }, scoring)).toBe(17.2)
  })

  test('ignores stats the league gives no points for', () => {
    expect(score({ tkl: 9 }, scoring)).toBe(0)
  })
})

describe('expectedStats', () => {
  test('spreads a defense projection across points-allowed buckets', () => {
    const out = expectedStats({ pts_allow: 20.4, pts_allow_14_20: 1 }, scoring)
    const total = Object.entries(out).filter(([k]) => /^pts_allow_\d/.test(k)).reduce((t, [, v]) => t + v, 0)
    expect(total).toBeCloseTo(1, 5)
    // 20.4 sits on the edge of the 14-20 bucket, so 21-27 should be nearly as likely
    expect(out.pts_allow_14_20).toBeLessThan(0.5)
    expect(out.pts_allow_21_27).toBeGreaterThan(0.2)
  })

  test('a defense near a bucket edge no longer scores as if certain to land inside it', () => {
    const flagged = score({ pts_allow_14_20: 1 }, scoring)
    expect(projectedScore({ pts_allow: 20.4, pts_allow_14_20: 1 }, scoring)).toBeLessThan(flagged)
  })

  test('maps coarse 50+ kicker projections onto the league 50-59 bucket', () => {
    expect(projectedScore({ fgm_50p: 0.4 }, scoring)).toBe(2)
  })
})
