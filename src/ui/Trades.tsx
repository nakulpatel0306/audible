import { useMemo, useState } from 'react'
import { activePlayers, type Context } from '../core/context.ts'
import { rosPoints } from '../core/lineup.ts'
import { tradeChanges } from '../core/scenario.ts'
import { evaluateTrade, findTrades, tradesOpen } from '../core/trades.ts'
import type { Player } from '../core/types.ts'
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

function Builder({ ctx }: { ctx: Context }) {
  const others = ctx.rosters.filter((r) => r.rosterId !== ctx.me.rosterId)
  const [partnerId, setPartnerId] = useState(others[0]?.rosterId)
  const [give, setGive] = useState<string[]>([])
  const [get, setGet] = useState<string[]>([])
  const partner = others.find((r) => r.rosterId === partnerId)
  const toggle = (list: string[], set: (v: string[]) => void) => (id: string) => set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id])
  const ready = !!partner && give.length > 0 && get.length > 0
  const result = useMemo(() => (ready ? evaluateTrade(ctx, partner.rosterId, give, get) : null), [ctx, ready, partner, give, get])
  const changes = useMemo(() => (ready ? tradeChanges(ctx, partner.rosterId, give, get) : null), [ctx, ready, partner, give, get])
  const verdict = !result
    ? null
    : result.myGain > 2 && result.theirGain >= 0
      ? 'Good for both teams. Worth sending.'
      : result.myGain > 2
        ? 'Helps you, costs them. Expect a counter.'
        : result.myGain > -2
          ? 'Close to even for you.'
          : 'This makes your team worse.'

  return (
    <section className="section">
      <div className="section-head">
        <h2>Build a trade</h2>
        <select
          value={partnerId}
          aria-label="Trade partner"
          onChange={(e) => {
            setPartnerId(Number(e.target.value))
            setGet([])
          }}
        >
          {others.map((r) => (
            <option key={r.rosterId} value={r.rosterId}>
              {r.teamName}
            </option>
          ))}
        </select>
      </div>
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
      {result && changes && <BeforeAfter ctx={ctx} changes={changes} title={verdict!} />}
    </section>
  )
}

export function Trades({ ctx }: { ctx: Context }) {
  if (!tradesOpen(ctx)) return <p className="note">The trade deadline (week {ctx.league.tradeDeadline}) has passed.</p>
  return (
    <>
      <Ideas ctx={ctx} />
      <Builder ctx={ctx} />
    </>
  )
}
