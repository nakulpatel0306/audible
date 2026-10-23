import { useMemo, useState } from 'react'
import type { Context } from '../core/context.ts'
import { waiverChanges } from '../core/scenario.ts'
import { streamPlan, type StreamPlan } from '../core/streaming.ts'
import { usageSignal, type UsageTrend } from '../core/usage.ts'
import { waiverTargets } from '../core/waivers.ts'
import { BeforeAfter } from './BeforeAfter.tsx'
import { PlayerCell, pts, signed, UsageBadge } from './format.tsx'

function Waivers({ ctx, trending, usage }: { ctx: Context; trending: Map<string, number>; usage: Map<string, UsageTrend> | null }) {
  const picks = useMemo(() => waiverTargets(ctx, trending, { limit: 12, perPosition: 4 }), [ctx, trending])
  const [selected, setSelected] = useState<string | null>(null)
  const pick = picks.find((p) => p.add.id === selected)
  const changes = useMemo(() => (pick ? waiverChanges(ctx, pick.add.id, pick.drop?.id ?? null) : null), [ctx, pick])
  const priority = ctx.me.waiverPosition

  return (
    <section className="section">
      <div className="section-head">
        <h2>Waiver pickups</h2>
        {ctx.league.waiverType === 'rolling' && priority && <span className="detail">You're #{priority} in waiver priority</span>}
      </div>
      <p className="note">The big number is how many more points your starting lineup scores the rest of the season. Pick one to see the before and after.</p>
      {picks.length === 0 ? (
        <p className="note">Nobody on waivers would crack your lineup. Hold your priority.</p>
      ) : (
        <div className="move-cards">
          {picks.map((p) => (
            <button key={p.add.id} className="move-card" aria-pressed={selected === p.add.id} onClick={() => setSelected(selected === p.add.id ? null : p.add.id)}>
              <span className="row">
                <PlayerCell player={p.add}>
                  <UsageBadge signal={usageSignal(usage?.get(p.add.id))} />
                </PlayerCell>
                <span className="gain-big">{signed(p.gain)}</span>
              </span>
              <span className="row">
                <span className="drop">{p.drop ? `Drop ${p.drop.name}` : 'Into an open spot'}</span>
                <span className="detail">
                  {pts(p.nextWeek)} in week {ctx.planWeek}
                </span>
              </span>
              {p.trendingAdds > 0 && <span className="badge hot" style={{ justifySelf: 'start' }}>{p.trendingAdds.toLocaleString()} adds in 48h</span>}
            </button>
          ))}
        </div>
      )}
      {pick && changes && <BeforeAfter ctx={ctx} changes={changes} title={`Add ${pick.add.name}${pick.drop ? `, drop ${pick.drop.name}` : ''}`} />}
    </section>
  )
}

function Stream({ ctx, plan }: { ctx: Context; plan: StreamPlan }) {
  const rows = [...plan.mine, ...plan.options]
  const weeks = rows[0]?.weeks.map((w) => w.week) ?? []
  const vegas = ctx.vegas.get(ctx.planWeek)
  const changes = useMemo(() => (plan.swap ? waiverChanges(ctx, plan.swap.add.id, plan.swap.drop?.id ?? null) : null), [ctx, plan])
  const label = plan.position === 'DEF' ? 'Defense' : 'Kicker'
  const status = plan.swap
    ? `${plan.swap.drop ? 'Swap' : 'Add'}: +${pts(plan.swap.gain)} in week ${ctx.planWeek}`
    : plan.mine.length > 0
      ? 'Keep yours this week'
      : `No ${label.toLowerCase()} worth adding`
  // Shade each week against the rest of the table, so the best matchups glow brightest
  const means = rows.flatMap((o) => o.weeks.filter((w) => w.opponent).map((w) => w.mean))
  const low = Math.min(...means)
  const spread = Math.max(Math.max(...means) - low, 1)

  return (
    <section className="section">
      <div className="section-head">
        <h2>{label} streaming</h2>
        <span className="detail">{status}</span>
      </div>
      {plan.position === 'DEF' && (
        <p className="note">Defenses score off the other offense. The opponent's Vegas team total is the cleanest single read: lower means fewer points allowed.</p>
      )}
      <div className="scroll">
        <table>
          <thead>
            <tr>
              <th />
              {weeks.map((w) => (
                <th key={w} className="num">
                  Week {w}
                </th>
              ))}
              {plan.position === 'DEF' && vegas && vegas.size > 0 && <th className="num">Opp total</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((o) => {
              const opp = o.weeks[0]?.opponent
              const oppTotal = opp ? vegas?.get(opp)?.implied : undefined
              return (
                <tr key={o.player.id} className={o.owned ? 'you' : ''}>
                  <td>
                    {o.player.name}
                    {o.owned && <span className="detail"> (yours)</span>}
                  </td>
                  {o.weeks.map((w) => (
                    <td key={w.week} className="num">
                      {w.opponent ? (
                        <span className="heat" style={{ background: `rgba(46, 242, 255, ${(0.04 + 0.4 * Math.max(0, w.mean - low) / spread).toFixed(2)})` }}>
                          <span className="detail">{w.opponent}</span> {pts(w.mean)}
                        </span>
                      ) : (
                        <span className="detail">bye</span>
                      )}
                    </td>
                  ))}
                  {plan.position === 'DEF' && vegas && vegas.size > 0 && <td className="num detail">{oppTotal?.toFixed(1) ?? '—'}</td>}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {plan.swap && changes && <BeforeAfter ctx={ctx} changes={changes} title={`Add ${plan.swap.add.name}${plan.swap.drop ? `, drop ${plan.swap.drop.name}` : ''}`} />}
    </section>
  )
}

export function Moves({ ctx, trending, usage }: { ctx: Context; trending: Map<string, number>; usage: Map<string, UsageTrend> | null }) {
  const def = useMemo(() => streamPlan(ctx, 'DEF'), [ctx])
  const k = useMemo(() => streamPlan(ctx, 'K'), [ctx])
  return (
    <>
      <Waivers ctx={ctx} trending={trending} usage={usage} />
      <Stream ctx={ctx} plan={def} />
      <Stream ctx={ctx} plan={k} />
    </>
  )
}
