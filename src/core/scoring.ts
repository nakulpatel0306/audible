import { normalCdf } from './math.ts'
import type { Stats } from './types.ts'

// Sleeper stat keys and scoring keys share names, so actual points are a dot product
export function score(stats: Stats, scoring: Stats): number {
  let total = 0
  for (const key in stats) {
    const weight = scoring[key]
    if (weight) total += stats[key] * weight
  }
  return Math.round(total * 100) / 100
}

const PTS_ALLOW_BUCKETS: [string, number, number][] = [
  ['pts_allow_0', -Infinity, 0.5],
  ['pts_allow_1_6', 0.5, 6.5],
  ['pts_allow_7_13', 6.5, 13.5],
  ['pts_allow_14_20', 13.5, 20.5],
  ['pts_allow_21_27', 20.5, 27.5],
  ['pts_allow_28_34', 27.5, 34.5],
  ['pts_allow_35p', 34.5, Infinity],
]

const YDS_ALLOW_BUCKETS: [string, number, number][] = [
  ['yds_allow_0_100', -Infinity, 100],
  ['yds_allow_100_199', 100, 200],
  ['yds_allow_200_299', 200, 300],
  ['yds_allow_300_349', 300, 350],
  ['yds_allow_350_399', 350, 400],
  ['yds_allow_400_449', 400, 450],
  ['yds_allow_450_499', 450, 500],
  ['yds_allow_500_549', 500, 550],
  ['yds_allow_550p', 550, Infinity],
]

// Spread of NFL single-game points and yards allowed around a projected mean
const PTS_ALLOW_SD = 9.5
const YDS_ALLOW_SD = 70

function bucketProbabilities(mean: number, sd: number, buckets: [string, number, number][]): Stats {
  const out: Stats = {}
  for (const [key, lo, hi] of buckets) {
    const p = normalCdf((hi - mean) / sd) - normalCdf((lo - mean) / sd)
    if (p > 0) out[key] = p
  }
  return out
}

// Projections arrive as means, so a defense projected to allow 20.4 points is flagged
// pts_allow_14_20 = 1 even though 21+ is nearly as likely. Replace those all-or-nothing
// flags with probabilities, and fold coarse kicker buckets into the league's finer ones.
export function expectedStats(stats: Stats, scoring: Stats): Stats {
  const out: Stats = { ...stats }
  if (stats.pts_allow !== undefined) {
    for (const [key] of PTS_ALLOW_BUCKETS) delete out[key]
    Object.assign(out, bucketProbabilities(stats.pts_allow, PTS_ALLOW_SD, PTS_ALLOW_BUCKETS))
  }
  if (stats.yds_allow !== undefined) {
    for (const [key] of YDS_ALLOW_BUCKETS) delete out[key]
    Object.assign(out, bucketProbabilities(stats.yds_allow, YDS_ALLOW_SD, YDS_ALLOW_BUCKETS))
  }
  for (const kind of ['fgm', 'fgmiss'] as const) {
    const coarse = stats[`${kind}_50p`]
    if (coarse && !scoring[`${kind}_50p`] && stats[`${kind}_50_59`] === undefined) {
      out[`${kind}_50_59`] = coarse
      delete out[`${kind}_50p`]
    }
  }
  return out
}

export const projectedScore = (stats: Stats, scoring: Stats) => score(expectedStats(stats, scoring), scoring)
