import { useMemo } from 'react'
import type { Context } from '../core/context.ts'
import { rosterPlan, type PlannedMove, type PlanWeek } from '../core/plan.ts'
import { FlipCard } from './Flip.tsx'
import { pct, Pos, pts, signed } from './format.tsx'

const WHY: Record<PlannedMove['reason'], (m: PlannedMove) => string> = {
  hole: (m) => `Fills an empty ${m.add.position} spot`,
  stream: (m) => `Better ${m.add.position} matchup`,
  upgrade: () => 'Upgrades a starter',
}

function status(w: PlanWeek): { text: string; tone: string } {
  if (w.unfilled.length > 0) return { text: `Still short at ${w.unfilled.join(', ')}`, tone: 'bad' }
  if (w.moves.length > 0) return { text: `${w.moves.length} move${w.moves.length > 1 ? 's' : ''} to make`, tone: 'good' }
  return { text: 'Set', tone: '' }
}

function WeekCard({ ctx, w }: { ctx: Context; w: PlanWeek }) {
  const opponent = w.opponent === null ? null : ctx.rosters.find((r) => r.rosterId === w.opponent)
  const s = status(w)
  const accent = w.unfilled.length ? 'var(--loss)' : w.moves.length ? 'var(--volt)' : w.winPct !== null && w.winPct < 0.5 ? 'var(--them)' : 'var(--you)'
  const gain = w.after.mean - w.before.mean

  const front = (
    <>
      <div className="week-num">
        <small>Week</small>
        {w.week}
      </div>
      <div className="week-opp">{opponent ? `vs ${opponent.teamName}` : w.week >= ctx.league.playoffWeekStart ? 'Playoffs' : 'No game'}</div>
      <div className="week-odds">
        {w.winPct !== null ? <b className={w.winPct >= 0.5 ? 'gain' : 'loss'}>{pct(w.winPct)}</b> : <b>{pts(w.after.mean)}</b>}
        <span>{w.winPct !== null ? `${pts(w.after.mean)} proj` : 'proj'}</span>
      </div>
      <div className="week-status">
        <span className={`pill ${s.tone}`}>{s.text}</span>
        {w.out.length > 0 && <span className="pill">{w.out.length} on bye</span>}
      </div>
    </>
  )

  const back = (
    <>
      <div className="back-title">Week {w.week}</div>
      {w.moves.length === 0 && <p className="detail" style={{ margin: '0 0 10px' }}>No moves needed. Start your best lineup.</p>}
      {w.moves.map((m) => (
        <div className="move-line" key={m.add.id}>
          <span className="add">
            Add {m.add.name} <span className="detail">{m.add.position}</span>
          </span>
          <span className="drop">{m.drop ? `Drop ${m.drop.name}` : 'Into an open spot'}</span>
          <span className="detail">
            {WHY[m.reason](m)}, {signed(m.gain)}
          </span>
        </div>
      ))}
      <dl className="facts">
        <div>
          <dt>Lineup</dt>
          <dd>{gain > 0.05 ? `${pts(w.before.mean)} → ${pts(w.after.mean)}` : pts(w.after.mean)}</dd>
        </div>
      </dl>
      {w.out.length > 0 && <p className="card-note">On bye: {w.out.map((p) => p.name).join(', ')}</p>}
    </>
  )

  return <FlipCard label={`week ${w.week}`} accent={accent} front={front} back={back} />
}

export function Plan({ ctx }: { ctx: Context }) {
  const plan = useMemo(() => rosterPlan(ctx), [ctx])
  const moves = plan.flatMap((w) => w.moves)
  const short = plan.filter((w) => w.holes.length > 0)
  const stillShort = plan.filter((w) => w.unfilled.length > 0)
  const added = plan.reduce((t, w) => t + w.after.mean - w.before.mean, 0)

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Season plan</h1>
          <p>
            Every week from {plan[0]?.week ?? '—'} to {plan.at(-1)?.week ?? '—'}, with the pickups each one needs. Byes and streaming matchups are planned ahead, and
            each move carries forward into the weeks after it.
          </p>
        </div>
        <div className="week-status" style={{ padding: 0 }}>
          <span className={`pill ${moves.length ? 'good' : ''}`}>
            {moves.length} move{moves.length === 1 ? '' : 's'} planned
          </span>
          <span className={`pill ${short.length ? 'warn' : ''}`}>
            {short.length} short week{short.length === 1 ? '' : 's'}
          </span>
          {added > 0 && <span className="pill good">{signed(added)} lineup points</span>}
        </div>
      </div>

      <section className="section">
        <div className="section-head">
          <h2>Week by week</h2>
          <span className="detail">Flip a week for its moves and who's on bye</span>
        </div>
        <div className="weeks">
          {plan.map((w) => (
            <WeekCard key={w.week} ctx={ctx} w={w} />
          ))}
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <h2>Your move list</h2>
          {stillShort.length > 0 && <span className="pill bad">No free agent fixes week {stillShort.map((w) => w.week).join(', ')}</span>}
        </div>
        {moves.length === 0 ? (
          <p className="note" style={{ margin: 0 }}>
            Your roster covers every week as it stands. Check back after waivers run.
          </p>
        ) : (
          <ol className="timeline">
            {moves.map((m) => (
              <li key={`${m.week}:${m.add.id}`}>
                <span className="when">
                  <small>Week</small>
                  {m.week}
                </span>
                <span className="what">
                  <Pos position={m.add.position} /> Add <b>{m.add.name}</b>
                  {m.drop ? (
                    <>
                      , drop <b>{m.drop.name}</b>
                    </>
                  ) : (
                    ' into an open spot'
                  )}
                  <div className="detail">{WHY[m.reason](m)}</div>
                </span>
                <span className="gain-big">{signed(m.gain)}</span>
              </li>
            ))}
          </ol>
        )}
        <p className="note">
          Plans assume today's free agents are still there when you need them. Make the claim the week before, since waivers run midweek, and recheck after
          each waiver run.
        </p>
      </section>
    </>
  )
}
