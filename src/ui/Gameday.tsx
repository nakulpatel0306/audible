import { useMemo } from 'react'
import { leagueProfiles } from '../core/compare.ts'
import { activePlayers, projectionFor, type Context } from '../core/context.ts'
import { disagreement } from '../core/consensus.ts'
import type { NewsItem } from '../core/espn.ts'
import { weekLineup } from '../core/lineup.ts'
import { injuryReport, lineupCheck, rosterNews } from '../core/monitor.ts'
import { myGames, simulateSeason } from '../core/sim.ts'
import { usageSignal, type UsageTrend } from '../core/usage.ts'
import { pct, PlayerCell, Pos, pts, UsageBadge } from './format.tsx'

// Sources more than 20% apart historically missed by 30% more; worth a flag
const SPLIT_FLAG = 0.2

function Matchup({ ctx }: { ctx: Context }) {
  const games = useMemo(() => myGames(ctx), [ctx])
  const odds = useMemo(() => simulateSeason(ctx).find((t) => t.rosterId === ctx.me.rosterId), [ctx])
  const powerRank = useMemo(() => leagueProfiles(ctx).findIndex((t) => t.roster.rosterId === ctx.me.rosterId) + 1, [ctx])
  // While a week is being played, show that game; otherwise the next one
  const game = games.find((g) => g.week === ctx.week) ?? games[0]
  const opp = game && ctx.rosters.find((r) => r.rosterId === game.opponent)
  const live = game?.week === ctx.week && ctx.started.size > 0

  return (
    <section className="matchup">
      <div className="matchup-top">
        <span className={`pill${live ? ' live' : ''}`}>{live ? `Week ${game.week} · live` : game ? `Week ${game.week} matchup` : 'Regular season over'}</span>
        <span className="detail">{live ? 'Scored so far · projected final below' : 'Projected'}</span>
      </div>
      {game && opp && (
        <>
          <div className="matchup-teams">
            <div className="matchup-team">
              <div className="name" style={{ color: 'var(--you)' }}>
                {ctx.me.teamName}
              </div>
              <div className="record">
                {ctx.me.wins}-{ctx.me.losses}
              </div>
              <div className="score">{pts(game.myScored ?? game.myMean)}</div>
              {game.myScored !== null && <div className="proj">proj {pts(game.myMean)}</div>}
            </div>
            <div className="vs">VS</div>
            <div className="matchup-team right">
              <div className="name" style={{ color: 'var(--them)' }}>
                {opp.teamName}
              </div>
              <div className="record">
                {opp.wins}-{opp.losses}
              </div>
              <div className="score">{pts(game.theirScored ?? game.theirMean)}</div>
              {game.theirScored !== null && <div className="proj">proj {pts(game.theirMean)}</div>}
            </div>
          </div>
          <div className="winbar" role="img" aria-label={`${pct(game.winPct)} chance to win`}>
            <div style={{ width: `${game.winPct * 100}%`, background: 'var(--you)' }} />
            <div style={{ width: `${(1 - game.winPct) * 100}%`, background: 'var(--them)' }} />
          </div>
          <div className="winbar-labels">
            <span style={{ color: 'var(--you)' }}>{pct(game.winPct)} win</span>
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

function Lineup({ ctx, usage }: { ctx: Context; usage: Map<string, UsageTrend> | null }) {
  const week = ctx.planWeek
  const lineup = useMemo(() => weekLineup(ctx, activePlayers(ctx.me), week), [ctx, week])
  const vegas = ctx.vegas.get(week)
  return (
    <section className="section">
      <div className="section-head">
        <h2>Best lineup · week {week}</h2>
        <span className="pill">
          {pts(lineup.mean)} proj · {pts(Math.max(0, lineup.mean - lineup.sd))}–{pts(lineup.mean + lineup.sd)}
        </span>
      </div>
      <div className="scroll">
        <table>
          <thead>
            <tr>
              <th>Slot</th>
              <th>Player</th>
              <th>Matchup</th>
              <th className="num">Sleeper</th>
              <th className="num">ESPN</th>
            </tr>
          </thead>
          <tbody>
            {lineup.slots.map(({ slot, player: c }, i) => {
              const player = c && ctx.players.get(c.id)
              if (!player || !c) {
                return (
                  <tr key={i}>
                    <td className="slot">
                      <Pos position={slot} />
                    </td>
                    <td colSpan={4} className="detail">
                      Nobody eligible
                    </td>
                  </tr>
                )
              }
              const proj = projectionFor(ctx, c.id, week)
              const line = player.team ? vegas?.get(player.team) : undefined
              const split = disagreement(proj.sources.sleeper, proj.sources.espn) >= SPLIT_FLAG
              return (
                <tr key={i}>
                  <td className="slot">
                    <Pos position={slot === 'FLEX' ? player.position : slot} />
                    {slot === 'FLEX' && <div className="detail" style={{ fontSize: 11, marginTop: 2 }}>flex</div>}
                  </td>
                  <td>
                    <PlayerCell player={player} showPosition={false}>
                      <UsageBadge signal={usageSignal(usage?.get(c.id))} />
                      {split && (
                        <span className="badge" title="Sleeper and ESPN disagree by 20%+; these players have historically been less predictable">
                          Sources split
                        </span>
                      )}
                    </PlayerCell>
                  </td>
                  <td className="detail">
                    {proj.opponent ? `vs ${proj.opponent}` : 'Bye'}
                    {line && <div style={{ fontSize: 12 }}>Team total {line.implied.toFixed(1)}</div>}
                  </td>
                  <td className="num" style={{ fontWeight: 700 }}>
                    {pts(proj.sources.sleeper)}
                  </td>
                  <td className="num detail">{proj.sources.espn === null ? '—' : pts(proj.sources.espn)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="note">
        Sleeper projections, scored with your league's rules. ESPN's sits beside it: averaging the two didn't predict better in testing, but when they
        disagree the range widens. Team totals come from DraftKings once lines post.
      </p>
    </section>
  )
}

function Schedule({ ctx }: { ctx: Context }) {
  const games = useMemo(() => myGames(ctx), [ctx])
  const teamName = (id: number) => ctx.rosters.find((r) => r.rosterId === id)?.teamName ?? ''
  return (
    <section className="section">
      <div className="section-head">
        <h2>Win chances</h2>
        {ctx.started.size > 0 && <span className="pill live">Week {ctx.week} live</span>}
      </div>
      <div className="strip">
        {games.map((g) => {
          const color = g.winPct >= 0.5 ? 'var(--gain)' : 'var(--loss)'
          return (
            <div className="chip" key={g.week} title={`${pts(g.myMean)} vs ${pts(g.theirMean)}`}>
              <div className="wk">Week {g.week}</div>
              <div className="pct" style={{ color }}>
                {pct(g.winPct)}
              </div>
              <div className="opp">{teamName(g.opponent)}</div>
              <div className="meter">
                <div style={{ width: `${g.winPct * 100}%`, background: color }} />
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

function Injuries({ ctx }: { ctx: Context }) {
  const injuries = useMemo(() => injuryReport(ctx), [ctx])
  return (
    <section className="section">
      <div className="section-head">
        <h2>Injury report</h2>
        <span className="pill">{injuries.length || 'None'}</span>
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
        <div className="stack">
          <Lineup ctx={ctx} usage={usage} />
          <Schedule ctx={ctx} />
        </div>
        <div className="stack">
          <Injuries ctx={ctx} />
          <News ctx={ctx} news={news} />
        </div>
      </div>
    </>
  )
}
