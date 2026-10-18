import { useEffect, useState } from 'react'
import { loadContext, sleeperLeagueUrl, type Context } from './core/context.ts'
import { nflNews, type NewsItem } from './core/espn.ts'
import * as sleeper from './core/sleeper.ts'
import { fetchUsageRows, usageTrends, type UsageTrend } from './core/usage.ts'
import { Brand } from './ui/format.tsx'
import { Gameday } from './ui/Gameday.tsx'
import { League } from './ui/League.tsx'
import { Moves } from './ui/Moves.tsx'
import { Trades } from './ui/Trades.tsx'

const TABS = ['Gameday', 'Moves', 'Trades', 'League'] as const
type Tab = (typeof TABS)[number]

const USER_KEY = 'audible:username'
const leagueKey = (username: string) => `audible:league:${username.toLowerCase()}`

// Coming back to a tab older than this reloads it, so a dashboard left open all week
// doesn't show last Sunday's rosters
const STALE_AFTER_MS = 10 * 60 * 1000

// Storage can be blocked (private windows); the app works without remembering anything
function recall(key: string): string {
  try {
    return localStorage.getItem(key) ?? ''
  } catch {
    return ''
  }
}

function store(key: string, value: string) {
  try {
    if (value) localStorage.setItem(key, value)
    else localStorage.removeItem(key)
  } catch {
    // Not remembering is fine
  }
}

type Data = {
  ctx: Context
  trending: Map<string, number>
  // Extras degrade to null rather than blocking the dashboard
  news: NewsItem[] | null
  usage: Map<string, UsageTrend> | null
  loadedAt: Date
}

async function load(username: string, leagueId: string): Promise<Data> {
  const state = await sleeper.nflState()
  const [ctx, trending, news, usageRows] = await Promise.all([
    loadContext(username, leagueId || undefined, state),
    sleeper.trending('add', 48, 100).then((rows) => new Map(rows.map((r) => [r.player_id, r.count]))),
    nflNews(100).catch(() => null),
    fetchUsageRows(state.season, `${import.meta.env.BASE_URL}nflverse`).catch(() => null),
  ])
  return { ctx, trending, news, usage: usageRows && usageTrends(usageRows, ctx.players), loadedAt: new Date() }
}

const LEAGUE_STATUS: Record<string, string> = { pre_draft: 'pre-draft', drafting: 'drafting', complete: 'finished' }

export default function App() {
  const [username, setUsername] = useState(() => recall(USER_KEY))
  const [leagueId, setLeagueId] = useState(() => recall(leagueKey(recall(USER_KEY))))
  const [draft, setDraft] = useState(username)
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('Gameday')
  // Bumped to refetch with the same username and league
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!username) return
    let cancelled = false
    setLoading(true)
    setError(null)
    load(username, leagueId)
      .then((d) => {
        if (cancelled) return
        setData(d)
        store(USER_KEY, username)
        store(leagueKey(username), d.ctx.league.id)
      })
      .catch((err) => !cancelled && setError(err instanceof Error ? err.message : String(err)))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [username, leagueId, attempt])

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible' && data && Date.now() - data.loadedAt.getTime() > STALE_AFTER_MS) setAttempt((n) => n + 1)
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [data])

  // A failed refresh keeps the dashboard up; only a failed first load sends you back here
  if (!username || (error && !data)) {
    return (
      <main className="setup">
        <Brand />
        <p>Your Sleeper league, read like a coordinator: lineup calls, pickups, trades, and where you stand. Read-only, so it can't touch your team.</p>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            const next = draft.trim()
            setData(null)
            setUsername(next)
            setLeagueId(recall(leagueKey(next)))
            setAttempt((n) => n + 1)
          }}
        >
          <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Sleeper username" aria-label="Sleeper username" autoFocus />
          <button className="btn" type="submit" disabled={!draft.trim()}>
            Read my league
          </button>
        </form>
        {error && <p className="error">{error}</p>}
      </main>
    )
  }

  if (!data) {
    return (
      <main className="loading">
        <Brand />
        <p>Reading your league: rosters, Sleeper and ESPN projections, Vegas lines, usage and news…</p>
      </main>
    )
  }

  const { ctx } = data
  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <Brand />
          <nav className="tabs" role="tablist">
            {TABS.map((t) => (
              <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}>
                {t}
              </button>
            ))}
          </nav>
          <div className="account">
            {ctx.leagues.length > 1 ? (
              <select className="league-select" value={ctx.league.id} onChange={(e) => setLeagueId(e.target.value)} aria-label="League" disabled={loading}>
                {ctx.leagues.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                    {LEAGUE_STATUS[l.status] ? ` (${LEAGUE_STATUS[l.status]})` : ''}
                  </option>
                ))}
              </select>
            ) : (
              <span>{ctx.league.name}</span>
            )}
            <a href={sleeperLeagueUrl(ctx.league)} target="_blank" rel="noreferrer">
              Open Sleeper
            </a>
            <button className="link-button" onClick={() => setAttempt((n) => n + 1)} disabled={loading} title={`Updated ${data.loadedAt.toLocaleString()}`}>
              {loading ? 'Updating…' : `Updated ${data.loadedAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`}
            </button>
            <button
              className="link-button"
              onClick={() => {
                store(USER_KEY, '')
                setData(null)
                setUsername('')
              }}
            >
              Switch user
            </button>
          </div>
        </div>
        {error && <div className="refresh-error">Couldn't update: {error}. Showing data from {data.loadedAt.toLocaleTimeString()}.</div>}
      </header>
      <main className="app">
        {tab === 'Gameday' && <Gameday ctx={ctx} news={data.news} usage={data.usage} />}
        {tab === 'Moves' && <Moves ctx={ctx} trending={data.trending} usage={data.usage} />}
        {tab === 'Trades' && <Trades ctx={ctx} />}
        {tab === 'League' && <League ctx={ctx} />}
      </main>
    </>
  )
}
