import { useMemo } from 'react'
import type { Context } from '../core/context.ts'
import { beforeAfter, type Change, type Side } from '../core/scenario.ts'
import { WeeklyLines } from './charts.tsx'
import { Delta, pct, Pos, pts } from './format.tsx'

const BEFORE = 'var(--muted)'
const AFTER = 'var(--volt)'

// Most moves only matter in a few weeks (a bye, a tough matchup); say which
function changedWeeks(side: Side): string {
  const weeks = side.weekly.filter((w) => Math.abs(w.after - w.before) >= 0.5)
  if (weeks.length === 0) return "Doesn't change the starting lineup in any remaining week."
  if (weeks.length === side.weekly.length) return 'Changes the starting lineup every remaining week.'
  const list = weeks.map((w) => `${w.week} (${w.after > w.before ? '+' : '−'}${Math.abs(w.after - w.before).toFixed(1)})`)
  return `Changes the starting lineup in week${weeks.length > 1 ? 's' : ''} ${list.join(', ')}.`
}

function SideView({ ctx, side, isMe }: { ctx: Context; side: Side; isMe: boolean }) {
  const name = (id: string | undefined) => (id ? ctx.players.get(id)?.name ?? id : '—')
  const nextWeek = side.lineupAfter.mean - side.lineupBefore.mean
  const beforeIds = new Set(side.lineupBefore.slots.map((s) => s.player?.id))
  const afterIds = new Set(side.lineupAfter.slots.map((s) => s.player?.id))
  return (
    <div>
      <h3 className="side-title" style={{ color: isMe ? 'var(--you)' : 'var(--them)' }}>
        {isMe ? 'Your team' : side.roster.teamName}
      </h3>
      <div className="swing">
        <div className="stat">
          <div className="label">Playoff odds</div>
          <div className="value">
            <span className="from">{pct(side.oddsBefore.playoffPct)}</span>
            <span className="arrow">→</span>
            {pct(side.oddsAfter.playoffPct)}
          </div>
        </div>
        <div className="stat">
          <div className="label">Week {ctx.planWeek} lineup</div>
          <div className="value">
            <Delta value={nextWeek} />
          </div>
        </div>
        <div className="stat">
          <div className="label">Rest of season</div>
          <div className="value">
            <Delta value={side.rosAfter - side.rosBefore} />
          </div>
        </div>
      </div>
      <p className="note">{changedWeeks(side)}</p>
      <div className="side-body">
        <WeeklyLines
          weeks={side.weekly.map((w) => w.week)}
          series={[
            { name: 'Before', color: BEFORE, values: side.weekly.map((w) => w.before) },
            { name: 'After', color: AFTER, values: side.weekly.map((w) => w.after) },
          ]}
        />
        <table className="lineup-diff">
          <thead>
            <tr>
              <th>Slot</th>
              <th>Before</th>
              <th>After, week {ctx.planWeek}</th>
            </tr>
          </thead>
          <tbody>
            {side.lineupBefore.slots.map((before, i) => {
              const after = side.lineupAfter.slots[i]
              // A starter shuffled between WR1 and WR2 isn't a change; only entries and exits are
              const leaving = before.player && !afterIds.has(before.player.id)
              const arriving = after.player && !beforeIds.has(after.player.id)
              return (
                <tr key={i}>
                  <td className="slot">
                    <Pos position={before.slot} />
                  </td>
                  <td className={leaving ? 'dropped' : ''}>
                    {name(before.player?.id)} <span className="detail">{pts(before.player?.mean ?? 0)}</span>
                  </td>
                  <td className={arriving ? 'changed' : ''}>
                    {name(after.player?.id)} <span className="detail">{pts(after.player?.mean ?? 0)}</span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export function BeforeAfter({ ctx, changes, title }: { ctx: Context; changes: Change[]; title: string }) {
  const sides = useMemo(() => beforeAfter(ctx, changes), [ctx, changes])
  return (
    <section className="audible" aria-live="polite">
      <h3>{title}</h3>
      <div className="sides">
        {sides.map((side) => (
          <SideView key={side.roster.rosterId} ctx={ctx} side={side} isMe={side.roster.rosterId === ctx.me.rosterId} />
        ))}
      </div>
    </section>
  )
}
