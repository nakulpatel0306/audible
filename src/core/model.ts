import type { Position } from './types.ts'

// Fraction of a healthy projection we expect, by weeks from now (0 = the coming week).
// Upstream projections usually zero out a ruled-out player for the coming week but not beyond.
export function injuryMultiplier(status: string | null, weeksAhead: number): number {
  switch (status) {
    case 'Out':
      return weeksAhead === 0 ? 0 : 0.85
    case 'Doubtful':
      return weeksAhead === 0 ? 0.25 : 0.9
    case 'Questionable':
      return weeksAhead === 0 ? 0.85 : 1
    case 'IR':
    case 'PUP':
    case 'NFI':
      return weeksAhead < 3 ? 0 : 0.6
    case 'Sus':
      return weeksAhead === 0 ? 0 : 0.9
    default:
      return 1
  }
}

// Spread of actual weekly points around the projection, as a fraction of it.
// Measured on 2026 weeks 3-5 (809 player-weeks projected for 4+ points).
const POSITION_CV: Record<Position, number> = {
  QB: 0.51,
  RB: 0.73,
  WR: 0.81,
  TE: 0.76,
  K: 0.61,
  DEF: 0.79,
}

export function weeklySd(position: Position, mean: number): number {
  return Math.max(2, mean * POSITION_CV[position])
}

// Adding up each starter's spread overstates how far a whole lineup's total swings. Across
// 2,345 team-weeks in 40 leagues (2026 weeks 1-5), actual totals landed 0.77 as far from
// their projection as the summed spreads said; using it improved held-out win odds
// (Brier 0.2154 -> 0.2140 on weeks 4-5). Without it, odds sit too close to a coin flip.
export const TEAM_SPREAD = 0.77
