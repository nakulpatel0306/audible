import { useMemo, useState } from 'react'
import type { Context } from '../core/context.ts'
import { waiverChanges } from '../core/scenario.ts'
import { streamPlan, type StreamPlan } from '../core/streaming.ts'
import { usageSignal, type UsageTrend } from '../core/usage.ts'
import { waiverTargets } from '../core/waivers.ts'
import { BeforeAfter } from './BeforeAfter.tsx'
import { Delta, PlayerCell, pts, UsageBadge } from './format.tsx'

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
      <p className="note">Ranked by how many more points your starting lineup scores the rest of the season. Pick one to see the before and after.</p>
      {picks.length === 0 ? (
        <p className="note">Nobody on waivers would crack your lineup. Hold your priority.</p>
      ) : (
        <div className="scroll">
          <table>
            <thead>
              <tr>
                <th>Add</th>
                <th>Drop</th>
                <th className="num">Week {ctx.planWeek}</th>
                <th className="num">Rest of season</th>
              </tr>
            </thead>
            <tbody>
              {picks.map((p) => (
                <tr
                  key={p.add.id}
                  className={`selectable${selected === p.add.id ? ' selected' : ''}`}
                  onClick={() => setSelected(selected === p.add.id ? null : p.add.id)}
                  tabIndex={0}
                  onKeyDown={(e) => e.key === 'Enter' && setSelected(selected === p.add.id ? null : p.add.id)}
                >
                  <td>
                    <PlayerCell player={p.add}>
                      <UsageBadge signal={usageSignal(usage?.get(p.add.id))} />
                      {p.trendingAdds > 0 && <span className="badge">{p.trendingAdds.toLocaleString()} adds</span>}
                    </PlayerCell>
                  </td>
                  <td>{p.drop ? <PlayerCell player={p.drop} /> : <span className="detail">open spot</span>}</td>
                  <td className="num">{pts(p.nextWeek)}</td>
                  <td className="num">
                    <Delta value={p.gain} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
  const changes = useMemo(() => (plan.swap ? waiverChanges(ctx, plan.swap.add.id, plan.swap.drop.id) : null), [ctx, plan])
  const label = plan.position === 'DEF' ? 'Defense' : 'Kicker'

  return (
    <section className="section">
      <div className="section-head">
        <h2>{label} streaming</h2>
        <span className="detail">{plan.swap ? `Swap: +${pts(plan.swap.gain)} in week ${ctx.planWeek}` : 'Keep yours this week'}</span>
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
                    {o.owned && <span className="detail"> · yours</span>}
                  </td>
                  {o.weeks.map((w) => (
                    <td key={w.week} className="num">
                      {w.opponent ? (
                        <>
                          <span className="detail">{w.opponent}</span> {pts(w.mean)}
                        </>
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
      {plan.swap && changes && <BeforeAfter ctx={ctx} changes={changes} title={`Add ${plan.swap.add.name}, drop ${plan.swap.drop.name}`} />}
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
