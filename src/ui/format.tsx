import type { UsageSignal } from '../core/usage.ts'
import type { Player } from '../core/types.ts'

export const pts = (n: number) => n.toFixed(1)
export const pct = (n: number) => `${Math.round(n * 100)}%`
export const signed = (n: number) => `${n >= 0 ? '+' : '−'}${Math.abs(n).toFixed(1)}`

function InjuryBadge({ status }: { status: string | null }) {
  if (!status) return null
  return <span className={`badge ${status === 'Questionable' ? 'questionable' : 'injury'}`}>{status}</span>
}

export function UsageBadge({ signal }: { signal: UsageSignal | null }) {
  if (!signal) return null
  return (
    <span className={`badge ${signal.direction}`} title={signal.text}>
      {signal.direction === 'up' ? 'Usage up' : 'Usage down'}
    </span>
  )
}

export function Pos({ position }: { position: string }) {
  return <span className={`pos pos-${position}`}>{position}</span>
}

export function PlayerCell({ player, children, showPosition = true }: { player: Player; children?: React.ReactNode; showPosition?: boolean }) {
  return (
    <span className="player">
      {showPosition && <Pos position={player.position} />}
      <span className="name">{player.name}</span>
      {player.team && <span className="team">{player.team}</span>}
      <InjuryBadge status={player.injuryStatus} />
      {children}
    </span>
  )
}

// A play-call chevron: the audible mark
export function Brand() {
  return (
    <div className="brand">
      <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true">
        <rect width="28" height="28" rx="8" fill="var(--you)" />
        <path d="M9 8l6 6-6 6M15 8l6 6-6 6" fill="none" stroke="#04131a" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      audible
    </div>
  )
}

export function Delta({ value }: { value: number }) {
  const tone = Math.abs(value) < 0.05 ? '' : value > 0 ? 'gain' : 'loss'
  return <span className={tone}>{signed(value)}</span>
}
