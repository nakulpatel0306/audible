import { useMemo } from 'react'
import { leagueProfiles } from '../core/compare.ts'
import { activePlayers, projectionFor, type Context } from '../core/context.ts'
import { disagreement } from '../core/consensus.ts'
import type { NewsItem } from '../core/espn.ts'
import { weekLineup } from '../core/lineup.ts'
import { injuryReport, lineupCheck, rosterNews } from '../core/monitor.ts'
import { simulateSeason } from '../core/sim.ts'
import type { Player } from '../core/types.ts'
import { usageSignal, type UsageTrend } from '../core/usage.ts'
import { FlipCard } from './Flip.tsx'
import { pct, PlayerCell, Pos, positionColor, pts, UsageBadge } from './format.tsx'
import { useCurrentGame } from './Scorebug.tsx'

// Sources more than 20% apart historically missed by 30% more; worth a flag
const SPLIT_FLAG = 0.2

// The range bar's scale: a ceiling few starters' typical weeks reach, so cards compare at a glance
const RANGE_MAX = 45

function Matchup({ ctx }: { ctx: Context }) {
  const { game, opponent: opp, live } = useCurrentGame(ctx)
  const odds = useMemo(() => simulateSeason(ctx).find((t) => t.rosterId === ctx.me.rosterId), [ctx])
  const powerRank = useMemo(() => leagueProfiles(ctx).findIndex((t) => t.roster.rosterId === ctx.me.rosterId) + 1, [ctx])

  return (
    <section className="matchup">
      <div className="matchup-top">
        <span className={`pill${live ? ' live' : ''}`}>{game ? `Week ${game.week}${live ? ' · live' : ''}` : 'Regular season over'}</span>
        <span className="detail">{live ? 'Scored so far, projected final underneath' : 'Projected'}</span>
      </div>
      {game && opp && (
        <>
          <div className="matchup-teams">
            <div className="matchup-team you">
              <div className="name">{ctx.me.teamName}</div>
              <div className="record">
                {ctx.me.wins}-{ctx.me.losses}
              </div>
              <div className="score">{pts(game.myScored ?? game.myMean)}</div>
              {game.myScored !== null && <div className="proj">proj {pts(game.myMean)}</div>}
            </div>
            <div className="vs">vs</div>
            <div className="matchup-team them">
              <div className="name">{opp.teamName}</div>
              <div className="record">
                {opp.wins}-{opp.losses}
              </div>
              <div className="score">{pts(game.theirScored ?? game.theirMean)}</div>
              {game.theirScored !== null && <div className="proj">proj {pts(game.theirMean)}</div>}
            </div>
          </div>
          <div className="winbar" role="img" aria-label={`${pct(game.winPct)} chance to win`}>
            <div className="you" style={{ width: `${game.winPct * 100}%` }} />
            <div className="them" style={{ width: `${(1 - game.winPct) * 100}%` }} />
          </div>
          <div className="winbar-labels">
            <span style={{ color: 'var(--you)' }}>{pct(game.winPct)} to win</span>
            <span style={{ color: 'var(--them)' }}>{pct(1 - game.winPct)}</span>
          </div>
        </>
      )}
      <div className="matchup-stats">
        <div className="kpi">
          <div className="label">Playoff odds</div>
          <div className="value">{odds ? pct(odds.playoffPct) : '—'}</div>
        </div>
        <div className="kpi">
          <div className="label">First-round bye</div>
          <div className="value">{odds ? pct(odds.byePct) : '—'}</div>
        </div>
        <div className="kpi">
          <div className="label">Projected wins</div>
          <div className="value">{odds ? odds.projectedWins.toFixed(1) : '—'}</div>
        </div>
        <div className="kpi">
          <div className="label">Power rank</div>
          <div className="value">
            {powerRank} of {ctx.rosters.length}
          </div>
        </div>
      </div>
    </section>
  )
}

function LineupCheckBanner({ ctx }: { ctx: Context }) {
  const check = useMemo(() => lineupCheck(ctx), [ctx])
  if (!check) {
    return (
      <div className="check">
        <div className="icon">✓</div>
        <div>
          <b>Week {ctx.week} lineup is set right.</b>
          <div className="detail">Nobody on your bench projects higher than who you're starting.</div>
        </div>
      </div>
    )
  }
  const list = (moves: typeof check.start) => moves.map((m) => `${m.player.name} (${pts(m.points)}${m.reason ? `, ${m.reason}` : ''})`).join(', ')
  return (
    <div className="check alert">
      <div className="icon">+{pts(check.gain)}</div>
      <div>
        <b>
          Points on your bench in week {check.week}. Start {list(check.start)}.
        </b>
        <div className="detail">Bench {list(check.bench)}. Change it in Sleeper before kickoff.</div>
      </div>
    </div>
  )
}

function PlayerCard({ ctx, player, slot, week, usage }: { ctx: Context; player: Player; slot: string; week: number; usage: UsageTrend | undefined }) {
  const proj = projectionFor(ctx, player.id, week)
  const line = player.team ? ctx.vegas.get(week)?.get(player.team) : undefined
  const split = disagreement(proj.sources.sleeper, proj.sources.espn) >= SPLIT_FLAG
  const bye = ctx.byes.get(player.team ?? '')
  const signal = usageSignal(usage)
  const isFlex = !['QB', 'RB', 'WR', 'TE', 'K', 'DEF'].includes(slot)
  const low = Math.max(0, proj.mean - proj.sd)
  const high = Math.min(proj.mean + proj.sd, RANGE_MAX)

  const front = (
    <>
      <div className="card-top">
        <Pos position={player.position} />
        {isFlex && <span className="detail">Flex</span>}
      </div>
      <div className="card-name">{player.name}</div>
      <div className="card-sub">
        {player.team ?? 'Free agent'} {proj.opponent ? `vs ${proj.opponent}` : '· bye'}
      </div>
      <div className="card-badges">
        {player.injuryStatus && <span className={`badge ${player.injuryStatus === 'Questionable' ? 'questionable' : 'injury'}`}>{player.injuryStatus}</span>}
        <UsageBadge signal={signal} />
        {split && <span className="badge">Sources split</span>}
      </div>
      <div className="card-big">
        <b>{pts(proj.mean)}</b>
        <span>proj</span>
      </div>
      <div className="range" role="img" aria-label={`Typical range ${pts(low)} to ${pts(high)}`}>
        <i style={{ left: `${(low / RANGE_MAX) * 100}%`, width: `${((high - low) / RANGE_MAX) * 100}%` }} />
        <b style={{ left: `calc(${(Math.min(proj.mean, RANGE_MAX) / RANGE_MAX) * 100}% - 1.5px)` }} />
      </div>
      <div className="range-label">
        <span>{pts(low)}</span>
        <span>{pts(high)}</span>
      </div>
    </>
  )

  const back = (
    <>
      <div className="back-title">{player.name}</div>
      <dl className="facts">
        <div>
          <dt>Sleeper / ESPN</dt>
          <dd>
            {pts(proj.sources.sleeper)} / {proj.sources.espn === null ? '—' : pts(proj.sources.espn)}
          </dd>
        </div>
        {line && (
          <div>
            <dt>Team total</dt>
            <dd>{line.implied.toFixed(1)}</dd>
          </div>
        )}
        <div>
          <dt>Bye</dt>
          <dd>{bye === undefined ? '—' : bye < week ? `Done (wk ${bye})` : `Week ${bye}`}</dd>
        </div>
      </dl>
      {(player.injuryNotes || signal) && <p className="card-note">{player.injuryNotes ?? signal?.text}</p>}
      {split && <p className="card-note">Sleeper and ESPN disagree by 20%+, so this one is harder to call.</p>}
    </>
  )

  return <FlipCard label={player.name} accent={positionColor(player.position)} front={front} back={back} />
}

function Starters({ ctx, usage }: { ctx: Context; usage: Map<string, UsageTrend> | null }) {
  const week = ctx.planWeek
  const lineup = useMemo(() => weekLineup(ctx, activePlayers(ctx.me), week), [ctx, week])
  const starting = new Set(lineup.slots.map((s) => s.player?.id))
  const bench = activePlayers(ctx.me)
    .filter((id) => !starting.has(id))
    .map((id) => ctx.players.get(id))
    .filter((p): p is Player => !!p)
    .map((p) => ({ p, ...projectionFor(ctx, p.id, week) }))
    .sort((a, b) => b.mean - a.mean)

  return (
    <section className="section">
      <div className="section-head">
        <h2>Best lineup, week {week}</h2>
        <span className="pill">
          {pts(lineup.mean)} proj · {pts(Math.max(0, lineup.mean - lineup.sd))}–{pts(lineup.mean + lineup.sd)}
        </span>
      </div>
      <p className="note">The bar under each score is a typical week's range. Flip a card for both sources' projections, the Vegas team total and the player's bye.</p>
      <div className="card-grid">
        {lineup.slots.map(({ slot, player: c }, i) => {
          const player = c && ctx.players.get(c.id)
          if (!player) {
            return (
              <div key={i} className="flip-face" style={{ borderStyle: 'dashed' }}>
                <Pos position={slot} />
                <div className="card-name" style={{ marginTop: 10 }}>
                  Empty
                </div>
                <div className="card-sub">Nobody on your roster can play here. See Plan for a pickup.</div>
              </div>
            )
          }
          return <PlayerCard key={player.id} ctx={ctx} player={player} slot={slot} week={week} usage={usage?.get(player.id)} />
        })}
      </div>
      {bench.length > 0 && (
        <>
          <h3 className="sub-head">Bench</h3>
          <div className="bench">
            {bench.map(({ p, mean, opponent }) => (
              <div className="bench-row" key={p.id}>
                <Pos position={p.position} />
                <span className="name">{p.name}</span>
                {opponent ? <b>{pts(mean)}</b> : <span className="detail">Bye</span>}
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  )
}

function Injuries({ ctx }: { ctx: Context }) {
  const injuries = useMemo(() => injuryReport(ctx), [ctx])
  return (
    <section className="section">
      <div className="section-head">
        <h2>Injury report</h2>
        <span className={`pill${injuries.length ? ' bad' : ' good'}`}>{injuries.length || 'All clear'}</span>
      </div>
      {injuries.length === 0 ? (
        <p className="note" style={{ margin: 0 }}>
          Everyone on your roster is healthy.
        </p>
      ) : (
        <table>
          <tbody>
            {injuries.map(({ player, starting }) => (
              <tr key={player.id}>
                <td>
                  <PlayerCell player={player} />
                  {player.injuryNotes && <div className="detail">{player.injuryNotes}</div>}
                </td>
                <td className="num detail">{starting ? 'Starting' : 'Bench'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}

function News({ ctx, news }: { ctx: Context; news: NewsItem[] | null }) {
  const stories = useMemo(() => (news ? rosterNews(ctx, news).slice(0, 8) : null), [ctx, news])
  return (
    <section className="section">
      <div className="section-head">
        <h2>News on your players</h2>
      </div>
      {stories === null ? (
        <p className="note" style={{ margin: 0 }}>
          ESPN news didn't load. Refresh to try again.
        </p>
      ) : stories.length === 0 ? (
        <p className="note" style={{ margin: 0 }}>
          No recent ESPN stories mention your players.
        </p>
      ) : (
        <table>
          <tbody>
            {stories.map((s) => (
              <tr key={s.id}>
                <td>
                  <div className="detail" style={{ fontSize: 12 }}>
                    {s.players.map((p) => p.name).join(', ')}
                  </div>
                  {s.url ? (
                    <a href={s.url} target="_blank" rel="noreferrer">
                      {s.headline}
                    </a>
                  ) : (
                    s.headline
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}

export function Gameday({ ctx, news, usage }: { ctx: Context; news: NewsItem[] | null; usage: Map<string, UsageTrend> | null }) {
  return (
    <>
      <Matchup ctx={ctx} />
      <LineupCheckBanner ctx={ctx} />
      <div className="cols">
        <Starters ctx={ctx} usage={usage} />
        <div className="stack">
          <Injuries ctx={ctx} />
          <News ctx={ctx} news={news} />
        </div>
      </div>
    </>
  )
}
