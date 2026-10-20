import { useMemo } from 'react'
import type { Context } from '../core/context.ts'
import { myGames } from '../core/sim.ts'
import { pct, pts } from './format.tsx'

// While a week is being played, that game; otherwise the next one
export function useCurrentGame(ctx: Context) {
  return useMemo(() => {
    const games = myGames(ctx)
    const game = games.find((g) => g.week === ctx.week) ?? games[0] ?? null
    const opponent = game ? ctx.rosters.find((r) => r.rosterId === game.opponent) ?? null : null
    const live = !!game && game.week === ctx.week && ctx.started.size > 0
    return { game, opponent, live }
  }, [ctx])
}

// The broadcast score strip, on every screen so this week's game is always in view
export function Scorebug({ ctx }: { ctx: Context }) {
  const { game, opponent, live } = useCurrentGame(ctx)
  if (!game || !opponent) return null
  return (
    <div className="scorebug" role="status" aria-label={`Week ${game.week}: you ${pts(game.myScored ?? game.myMean)}, ${opponent.teamName} ${pts(game.theirScored ?? game.theirMean)}`}>
      <span className={`wk${live ? ' pill live' : ''}`}>{live ? `Wk ${game.week} live` : `Wk ${game.week}`}</span>
      <span className="team you">
        <span className="name">{ctx.me.teamName}</span>
        <span className="score">{pts(game.myScored ?? game.myMean)}</span>
      </span>
      <span className="team them">
        <span className="score">{pts(game.theirScored ?? game.theirMean)}</span>
        <span className="name">{opponent.teamName}</span>
      </span>
      <span className={`odds ${game.winPct >= 0.5 ? 'gain' : 'loss'}`}>{pct(game.winPct)}</span>
    </div>
  )
}
