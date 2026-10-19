import { useEffect, useRef } from 'react'
import type { League } from '../core/types.ts'

const GUIDE_URL = 'https://github.com/nakulpatel0306/audible/blob/main/docs/GUIDE.md'

export const SHORTCUTS: [string, string][] = [
  ['1 – 4', 'Gameday, Moves, Trades, League'],
  ['R', 'Refresh from Sleeper'],
  ['?', 'Open this panel'],
  ['Esc', 'Close it'],
]

const WAIVERS: Record<League['waiverType'], string> = {
  rolling: 'Rolling: a successful claim sends you to the back of the line',
  reverse: 'Reverse standings: worst record claims first',
  faab: 'FAAB: blind bids from a season budget',
}

const GLOSSARY: [string, string][] = [
  ['Scored / proj', 'During a live week the big number is points banked so far. "proj" adds projections for starters who haven\'t played yet.'],
  ['Win %', 'Chance your final score beats theirs, from both projected totals and how much each lineup typically swings.'],
  ['Rest of season', 'Extra starting-lineup points a move adds from now to week 17. Bench points count for nothing.'],
  ['Sources split', 'Sleeper and ESPN disagree by 20%+. Those players have been less predictable, so their range is wider.'],
  ['Usage up / down', 'Target share or carries moved noticeably over the last three games.'],
  ['Team total', "Points Vegas expects a player's NFL team to score, once lines post."],
  ['All-play / luck', 'Record if you played every team every week, and how many wins the schedule gave or took.'],
  ['Trade verdicts', 'Accept at +3 or more, Close call 0 to +3, Counter 0 to −3, Decline below −3.'],
  ['Bye weeks', 'A short week means no one left on your roster can fill a lineup slot. Fix it before then.'],
]

const perYards = (points: number | undefined) => (points ? `1 per ${Math.round(1 / points)} yds` : 'none')

function receptions(points = 0): string {
  if (points === 1) return 'Full PPR (1 per catch)'
  if (points === 0.5) return 'Half PPR (0.5 per catch)'
  return points ? `${points} per catch` : 'Standard (no points per catch)'
}

function Rules({ league }: { league: League }) {
  const s = league.scoring
  const lastRegular = league.playoffWeekStart - 1
  const rounds = Math.ceil(Math.log2(Math.max(league.playoffTeams, 2)))
  const byes = league.playoffTeams === 6 ? ', top 2 seeds get a first-round bye' : ''
  const rows: [string, string][] = [
    ['Teams', String(league.numTeams)],
    ['Starters', league.slots.join(' · ')],
    ['Bench', `${league.benchSize} spots`],
    ['Receptions', receptions(s.rec)],
    ['Passing', `${s.pass_td ?? 0} per TD, ${perYards(s.pass_yd)}, ${s.pass_int ?? 0} per INT`],
    ['Rushing / receiving', `${s.rush_td ?? 0} per TD, ${perYards(s.rush_yd)}`],
    ...(s.bonus_rec_te ? [['TE premium', `+${s.bonus_rec_te} per catch`] as [string, string]] : []),
    ['Fumble lost', String(s.fum_lost ?? 0)],
    ['Regular season', `Weeks 1–${lastRegular}`],
    ['Playoffs', `${league.playoffTeams} teams, weeks ${league.playoffWeekStart}–${league.playoffWeekStart + rounds - 1}${byes}. Seeded by wins, then points.`],
    ['Trade deadline', `Week ${league.tradeDeadline}`],
    ['Waivers', WAIVERS[league.waiverType]],
  ]
  return (
    <dl className="help-list">
      {rows.map(([k, v]) => (
        <div key={k}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  )
}

export function Help({ league, open, onClose }: { league: League; open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = ref.current
    if (open && !dialog?.open) dialog?.showModal()
    if (!open && dialog?.open) dialog.close()
  }, [open])

  // Esc closes the dialog natively; listen on the element so our state follows every time
  useEffect(() => {
    const dialog = ref.current
    dialog?.addEventListener('close', onClose)
    return () => dialog?.removeEventListener('close', onClose)
  }, [onClose])

  return (
    // Clicking the backdrop lands on the dialog itself, outside its content
    <dialog ref={ref} className="help" onClick={(e) => e.target === e.currentTarget && onClose()} aria-labelledby="help-title">
      <div className="help-body">
        <div className="section-head">
          <h2 id="help-title">How Audible works</h2>
          <button className="link-button" onClick={onClose}>
            Close
          </button>
        </div>
        <p className="note">
          Audible reads your league from Sleeper and never changes it. Every number is in your league's scoring. Recommendations are about the next week you
          can still change; once a week kicks off, players whose games have started are locked.
        </p>

        <h3>League rules</h3>
        <Rules league={league} />

        <h3>Keyboard shortcuts</h3>
        <dl className="help-list">
          {SHORTCUTS.map(([keys, action]) => (
            <div key={keys}>
              <dt>
                <kbd>{keys}</kbd>
              </dt>
              <dd>{action}</dd>
            </div>
          ))}
        </dl>

        <h3>Reading the numbers</h3>
        <dl className="help-list">
          {GLOSSARY.map(([term, meaning]) => (
            <div key={term}>
              <dt>{term}</dt>
              <dd>{meaning}</dd>
            </div>
          ))}
        </dl>
        <p className="note">
          The <a href={GUIDE_URL} target="_blank" rel="noreferrer">full guide</a> explains every screen and calculation.
        </p>
      </div>
    </dialog>
  )
}
