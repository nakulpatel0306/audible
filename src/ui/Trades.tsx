import { useMemo, useState } from 'react'
import { activePlayers, type Context } from '../core/context.ts'
import { rosPoints } from '../core/lineup.ts'
import { tradeChanges } from '../core/scenario.ts'
import { reviewOffer, type Verdict } from '../core/review.ts'
import { findTrades, tradesOpen } from '../core/trades.ts'
import type { Player } from '../core/types.ts'
import type { UsageTrend } from '../core/usage.ts'
import { BeforeAfter } from './BeforeAfter.tsx'
import { Delta, PlayerCell } from './format.tsx'

const names = (ps: Player[]) => ps.map((p) => p.name).join(' + ')

function Ideas({ ctx }: { ctx: Context }) {
  const ideas = useMemo(() => findTrades(ctx, { limit: 12 }), [ctx])
  const [selected, setSelected] = useState<number | null>(null)
  const idea = selected === null ? null : ideas[selected]
  const changes = useMemo(
    () => (idea ? tradeChanges(ctx, idea.partner.rosterId, idea.give.map((p) => p.id), idea.get.map((p) => p.id)) : null),
    [ctx, idea],
  )
  return (
    <section className="section">
      <div className="section-head">
        <h2>Trades both sides should take</h2>
        <span className="detail">Deadline: week {ctx.league.tradeDeadline}</span>
      </div>
      <p className="note">
        Deals where both starting lineups get better, so the other manager has a reason to say yes. Pick one to see what it does to each team.
      </p>
      {ideas.length === 0 ? (
        <p className="note">No deal found that helps both sides right now.</p>
      ) : (
        <div className="scroll">
          <table>
            <thead>
              <tr>
                <th>You give</th>
                <th>You get</th>
                <th>From</th>
                <th className="num">You</th>
                <th className="num">Them</th>
              </tr>
            </thead>
            <tbody>
              {ideas.map((t, i) => (
                <tr
                  key={i}
                  className={`selectable${selected === i ? ' selected' : ''}`}
                  onClick={() => setSelected(selected === i ? null : i)}
                  tabIndex={0}
                  onKeyDown={(e) => e.key === 'Enter' && setSelected(selected === i ? null : i)}
                >
                  <td>{names(t.give)}</td>
                  <td>{names(t.get)}</td>
                  <td className="detail">{t.partner.teamName}</td>
                  <td className="num">
                    <Delta value={t.myGain} />
                  </td>
                  <td className="num">
                    <Delta value={t.theirGain} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {idea && changes && <BeforeAfter ctx={ctx} changes={changes} title={`${names(idea.give)} for ${names(idea.get)}`} />}
    </section>
  )
}

function PlayerPicker({ ctx, ids, picked, onToggle }: { ctx: Context; ids: string[]; picked: string[]; onToggle: (id: string) => void }) {
  const sorted = useMemo(() => [...ids].sort((a, b) => rosPoints(ctx, b) - rosPoints(ctx, a)), [ctx, ids])
  return (
    <div>
      {sorted.map((id) => {
        const p = ctx.players.get(id)
        if (!p) return null
        return (
          <label key={id}>
            <input type="checkbox" checked={picked.includes(id)} onChange={() => onToggle(id)} />
            <PlayerCell player={p} />
          </label>
        )
      })}
    </div>
  )
}

const VERDICT: Record<Verdict, { label: string; line: string }> = {
  accept: { label: 'Accept', line: 'This makes your team better.' },
  close: { label: 'Close call', line: "A small edge at best. Take it if it fills a need you care about." },
  counter: { label: 'Counter', line: 'Slightly worse for you as offered. A small change could flip it.' },
  decline: { label: 'Decline', line: 'This makes your team worse.' },
}

function ReviewOffer({ ctx, usage }: { ctx: Context; usage: Map<string, UsageTrend> | null }) {
  const others = ctx.rosters.filter((r) => r.rosterId !== ctx.me.rosterId)
  const [partnerId, setPartnerId] = useState(others[0]?.rosterId)
  const [give, setGive] = useState<string[]>([])
  const [get, setGet] = useState<string[]>([])
  const partner = others.find((r) => r.rosterId === partnerId)
  const toggle = (list: string[], set: (v: string[]) => void) => (id: string) => set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id])
  const ready = !!partner && give.length > 0 && get.length > 0
  const review = useMemo(() => (ready ? reviewOffer(ctx, partner.rosterId, give, get, usage) : null), [ctx, ready, partner, give, get, usage])
  const changes = useMemo(() => (ready ? tradeChanges(ctx, partner.rosterId, give, get) : null), [ctx, ready, partner, give, get])

  return (
    <section className="section">
      <div className="section-head">
        <h2>Review an offer</h2>
        <select
          value={partnerId}
          aria-label="Team that sent the offer"
          onChange={(e) => {
            setPartnerId(Number(e.target.value))
            setGet([])
          }}
        >
          {others.map((r) => (
            <option key={r.rosterId} value={r.rosterId}>
              From {r.teamName}
            </option>
          ))}
        </select>
      </div>
      <p className="note">Got an offer in Sleeper, or thinking of sending one? Pick the other team and check the players on each side.</p>
      <div className="picker">
        <div>
          <h3 style={{ color: 'var(--you)' }}>You send</h3>
          <PlayerPicker ctx={ctx} ids={activePlayers(ctx.me)} picked={give} onToggle={toggle(give, setGive)} />
        </div>
        <div>
          <h3 style={{ color: 'var(--them)' }}>You get</h3>
          {partner && <PlayerPicker ctx={ctx} ids={activePlayers(partner)} picked={get} onToggle={toggle(get, setGet)} />}
        </div>
      </div>
      {!ready && <p className="note">Pick at least one player on each side.</p>}
      {review && (
        <div className={`verdict verdict-${review.verdict}`} aria-live="polite">
          <div className="verdict-head">
            <span className="verdict-label">{VERDICT[review.verdict].label}</span>
            <span className="detail">
              You <Delta value={review.offer.myGain} /> · them <Delta value={review.offer.theirGain} /> rest-of-season points
            </span>
          </div>
          <p>{VERDICT[review.verdict].line}</p>
          <ul>
            {review.reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
          {review.verdict !== 'accept' && (
            <div className="counters">
              <h3>Counter with</h3>
              {review.counters.length === 0 ? (
                <p className="detail">No small change makes this work for you while still helping them. The gap is too big.</p>
              ) : (
                review.counters.map((c, i) => (
                  <button
                    key={i}
                    className="counter"
                    onClick={() => {
                      setGive(c.give.map((p) => p.id))
                      setGet(c.get.map((p) => p.id))
                    }}
                  >
                    <span>
                      Send <b>{names(c.give)}</b> for <b>{names(c.get)}</b>
                    </span>
                    <span className="detail">
                      you <Delta value={c.myGain} /> · them <Delta value={c.theirGain} />
                    </span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      )}
      {review && changes && <BeforeAfter ctx={ctx} changes={changes} title="Before and after" />}
    </section>
  )
}

export function Trades({ ctx, usage }: { ctx: Context; usage: Map<string, UsageTrend> | null }) {
  if (!tradesOpen(ctx)) return <p className="note">The trade deadline (week {ctx.league.tradeDeadline}) has passed.</p>
  return (
    <>
      <ReviewOffer ctx={ctx} usage={usage} />
      <Ideas ctx={ctx} />
    </>
  )
}
