import { useMemo, useState } from 'react'
import { activePlayers, type Context } from '../core/context.ts'
import { rosPoints } from '../core/lineup.ts'
import { tradeChanges } from '../core/scenario.ts'
import { reviewOffer, type Verdict } from '../core/review.ts'
import { tradePartners, type Partner } from '../core/partners.ts'
import { tradesOpen, type TradeIdea } from '../core/trades.ts'
import type { Player, Position } from '../core/types.ts'
import type { UsageTrend } from '../core/usage.ts'
import { BeforeAfter } from './BeforeAfter.tsx'
import { FlipCard } from './Flip.tsx'
import { Delta, PlayerCell, Pos, signed } from './format.tsx'

const names = (ps: Player[]) => ps.map((p) => p.name).join(' + ')

function FitRow({ label, positions }: { label: string; positions: Position[] }) {
  return (
    <div>
      <span className="label">{label}</span>
      {positions.length ? positions.map((p) => <Pos key={p} position={p} />) : <span className="detail">Nothing obvious</span>}
    </div>
  )
}

function PartnerCard({ partner, onShow }: { partner: Partner; onShow: (deal: TradeIdea) => void }) {
  const best = partner.deals[0]
  const twoWay = partner.helpsYou.length > 0 && partner.helpsThem.length > 0
  const front = (
    <>
      <div className="card-top">
        <span className={`pill ${twoWay ? 'good' : ''}`}>{twoWay ? 'Two-way fit' : partner.helpsYou.length || partner.helpsThem.length ? 'One-way fit' : 'No clear fit'}</span>
        <span className="detail">
          {partner.roster.wins}-{partner.roster.losses}
        </span>
      </div>
      <div className="card-name">{partner.roster.teamName}</div>
      <div className="fit" style={{ marginTop: 12 }}>
        <FitRow label="They can help at" positions={partner.helpsYou} />
        <FitRow label="You can help at" positions={partner.helpsThem} />
      </div>
      <div className="card-big">
        {best ? (
          <>
            <b className="gain">{signed(best.myGain)}</b>
            <span>for you, {signed(best.theirGain)} for them in the best deal</span>
          </>
        ) : (
          <span>No deal helps both sides</span>
        )}
      </div>
    </>
  )
  const back = (
    <>
      <div className="back-title">Deals with {partner.roster.teamName}</div>
      {partner.deals.length === 0 && <p className="detail">Nothing here makes both lineups better right now.</p>}
      {partner.deals.map((d, i) => (
        <div className="deal" key={i}>
          <span>
            Send <b>{names(d.give)}</b>
          </span>
          <span>
            Get <b>{names(d.get)}</b>
          </span>
          <span className="gains">
            <span>
              You <Delta value={d.myGain} />
            </span>
            <span>
              Them <Delta value={d.theirGain} />
            </span>
          </span>
          <button className="btn-ghost" onClick={() => onShow(d)}>
            Show before and after
          </button>
        </div>
      ))}
      <p className="card-note">
        {partner.needs.length ? `Weakest at ${partner.needs.join(', ')}. ` : ''}
        {partner.strengths.length ? `Strongest at ${partner.strengths.join(', ')}.` : ''}
      </p>
    </>
  )
  return <FlipCard label={partner.roster.teamName} accent={twoWay ? 'var(--volt)' : 'var(--them)'} front={front} back={back} />
}

function Partners({ ctx }: { ctx: Context }) {
  const partners = useMemo(() => tradePartners(ctx), [ctx])
  const [shown, setShown] = useState<TradeIdea | null>(null)
  const changes = useMemo(
    () => (shown ? tradeChanges(ctx, shown.partner.rosterId, shown.give.map((p) => p.id), shown.get.map((p) => p.id)) : null),
    [ctx, shown],
  )
  return (
    <section className="section">
      <div className="section-head">
        <h2>Trade partners</h2>
        <span className="detail">Deadline: week {ctx.league.tradeDeadline}</span>
      </div>
      <p className="note">
        Each team sized up against yours: where they're strong and you're thin, and the reverse. A two-way fit is the trade most likely to get accepted. Flip
        a team for deals where both starting lineups get better.
      </p>
      <div className="card-grid partner-grid">
        {partners.map((p) => (
          <PartnerCard key={p.roster.rosterId} partner={p} onShow={setShown} />
        ))}
      </div>
      {shown && changes && <BeforeAfter ctx={ctx} changes={changes} title={`${names(shown.give)} for ${names(shown.get)}`} />}
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
      <Partners ctx={ctx} />
      <ReviewOffer ctx={ctx} usage={usage} />
    </>
  )
}
