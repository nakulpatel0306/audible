import { useMemo, useState } from 'react'
import { leagueProfiles, POSITIONS, type TeamProfile } from '../core/compare.ts'
import type { Context } from '../core/context.ts'
import { myGames, simulateSeason } from '../core/sim.ts'
import { MirrorBars, WeeklyLines } from './charts.tsx'
import { pct, pts, signed } from './format.tsx'

const YOU = 'var(--you)'
const THEM = 'var(--them)'

// Rank 1 is the strongest unit in the league; shade fades as the rank drops
function Rank({ rank, of }: { rank: number; of: number }) {
  const strength = 1 - (rank - 1) / Math.max(of - 1, 1)
  return (
    <span className="rank" style={{ background: `rgba(46, 242, 255, ${0.06 + strength * 0.6})`, color: strength > 0.6 ? 'var(--bg)' : 'var(--fg)' }}>
      {rank}
    </span>
  )
}

function Rankings({ ctx, profiles }: { ctx: Context; profiles: TeamProfile[] }) {
  const odds = useMemo(() => new Map(simulateSeason(ctx).map((o) => [o.rosterId, o])), [ctx])
  const n = profiles.length
  return (
    <section className="section">
      <div className="section-head">
        <h2>Power rankings</h2>
        <span className="detail">By rest-of-season starting lineup, not record</span>
      </div>
      <div className="scroll">
        <table>
          <thead>
            <tr>
              <th />
              <th>Team</th>
              <th className="num">Record</th>
              <th className="num" title="Record if they'd played every team every week">
                All-play
              </th>
              <th className="num" title="Actual wins minus all-play expected wins">
                Luck
              </th>
              {POSITIONS.map((p) => (
                <th key={p} className="num">
                  {p}
                </th>
              ))}
              <th className="num">Playoffs</th>
            </tr>
          </thead>
          <tbody>
            {profiles.map((t, i) => {
              const o = odds.get(t.roster.rosterId)
              return (
                <tr key={t.roster.rosterId} className={t.roster.rosterId === ctx.me.rosterId ? 'you' : ''}>
                  <td className="slot strong">{i + 1}</td>
                  <td>{t.roster.teamName}</td>
                  <td className="num">
                    {t.roster.wins}-{t.roster.losses}
                  </td>
                  <td className="num detail">
                    {t.allPlay.wins}-{t.allPlay.losses}
                  </td>
                  <td className={`num ${t.luck > 0.5 ? 'gain' : t.luck < -0.5 ? 'loss' : 'detail'}`}>{signed(t.luck)}</td>
                  {POSITIONS.map((p) => (
                    <td key={p} className="num">
                      <Rank rank={t.ranks[p]} of={n} />
                    </td>
                  ))}
                  <td className="num">{o ? pct(o.playoffPct) : '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="note">
        Position columns rank each team's starters at that spot for the rest of the season, 1 being the best. Luck is wins above what the all-play record
        predicts: a positive number means the schedule has handed them wins.
      </p>
    </section>
  )
}

function Compare({ ctx, profiles }: { ctx: Context; profiles: TeamProfile[] }) {
  const mine = profiles.find((p) => p.roster.rosterId === ctx.me.rosterId)!
  const others = profiles.filter((p) => p !== mine)
  const nextOpponent = useMemo(() => myGames(ctx).find((g) => g.week >= ctx.planWeek)?.opponent, [ctx])
  const [otherId, setOtherId] = useState(nextOpponent ?? others[0]?.roster.rosterId)
  const other = others.find((p) => p.roster.rosterId === otherId) ?? others[0]
  const meetings = useMemo(() => myGames(ctx).filter((g) => g.opponent === other.roster.rosterId), [ctx, other])

  return (
    <section className="section">
      <div className="section-head">
        <h2>Head to head</h2>
        <select value={other.roster.rosterId} onChange={(e) => setOtherId(Number(e.target.value))} aria-label="Team to compare">
          {others.map((p) => (
            <option key={p.roster.rosterId} value={p.roster.rosterId}>
              {p.roster.teamName}
            </option>
          ))}
        </select>
      </div>
      <div className="swing" style={{ marginBottom: 20 }}>
        <div className="stat">
          <div className="label">Lineup strength</div>
          <div className="value">
            <span style={{ color: 'var(--you)' }}>{Math.round(mine.strength)}</span>
            <span className="arrow">vs</span>
            <span style={{ color: 'var(--them)' }}>{Math.round(other.strength)}</span>
          </div>
        </div>
        {meetings.map((g) => (
          <div className="stat" key={g.week}>
            <div className="label">Week {g.week} matchup</div>
            <div className={`value ${g.winPct >= 0.5 ? 'gain' : 'loss'}`}>{pct(g.winPct)} to win</div>
          </div>
        ))}
        {meetings.length === 0 && (
          <div className="stat">
            <div className="label">Regular season</div>
            <div className="value detail" style={{ fontSize: 16 }}>
              No games left between you
            </div>
          </div>
        )}
      </div>
      <div className="cols">
        <div>
          <h3 style={{ fontSize: 15, marginBottom: 10 }}>Rest-of-season points by position</h3>
          <MirrorBars
            rows={POSITIONS.map((p) => ({ label: p, a: mine.byPosition[p], b: other.byPosition[p] }))}
            left={{ name: 'You', color: YOU, values: [] }}
            right={{ name: other.roster.teamName, color: THEM, values: [] }}
          />
        </div>
        <div>
          <h3 style={{ fontSize: 15, marginBottom: 10 }}>Projected lineup by week</h3>
          <WeeklyLines
            weeks={mine.weekly.map((w) => w.week)}
            series={[
              { name: 'You', color: YOU, values: mine.weekly.map((w) => w.points) },
              { name: 'Them', color: THEM, values: other.weekly.map((w) => w.points) },
            ]}
          />
          <p className="note">
            Averages {pts(mine.weekly.reduce((t, w) => t + w.points, 0) / mine.weekly.length)} a week to their{' '}
            {pts(other.weekly.reduce((t, w) => t + w.points, 0) / other.weekly.length)}, using current rosters.
          </p>
        </div>
      </div>
    </section>
  )
}

export function League({ ctx }: { ctx: Context }) {
  const profiles = useMemo(() => leagueProfiles(ctx), [ctx])
  return (
    <>
      <Rankings ctx={ctx} profiles={profiles} />
      <Compare ctx={ctx} profiles={profiles} />
    </>
  )
}
