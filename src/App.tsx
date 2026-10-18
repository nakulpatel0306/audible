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

const STORAGE_KEY = 'audible:username'

// Storage can be blocked (private windows); the app works without remembering you
function remembered(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? ''
  } catch {
    return ''
  }
}

function remember(username: string) {
  try {
    if (username) localStorage.setItem(STORAGE_KEY, username)
    else localStorage.removeItem(STORAGE_KEY)
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
}

async function load(username: string): Promise<Data> {
  const state = await sleeper.nflState()
  const [ctx, trending, news, usageRows] = await Promise.all([
    loadContext(username, undefined, state),
    sleeper.trending('add', 48, 100).then((rows) => new Map(rows.map((r) => [r.player_id, r.count]))),
    nflNews(100).catch(() => null),
    fetchUsageRows(state.season, `${import.meta.env.BASE_URL}nflverse`).catch(() => null),
  ])
  return { ctx, trending, news, usage: usageRows && usageTrends(usageRows, ctx.players) }
}

export default function App() {
  const [username, setUsername] = useState(remembered)
  const [draft, setDraft] = useState(username)
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('Gameday')
  // Bumped on submit or refresh so the same username refetches
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!username) return
    let cancelled = false
    setError(null)
    load(username)
      .then((d) => {
        if (cancelled) return
        setData(d)
        remember(username)
      })
      .catch((err) => !cancelled && setError(err instanceof Error ? err.message : String(err)))
    return () => {
      cancelled = true
    }
  }, [username, attempt])

  if (!username || error) {
    return (
      <main className="setup">
        <Brand />
        <p>Your Sleeper league, read like a coordinator: lineup calls, pickups, trades, and where you stand. Read-only, so it can't touch your team.</p>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            setData(null)
            setUsername(draft.trim())
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
            <span>{ctx.league.name}</span>
            <a href={sleeperLeagueUrl(ctx.league)} target="_blank" rel="noreferrer">
              Open Sleeper
            </a>
            <button className="link-button" onClick={() => setAttempt((n) => n + 1)}>
              Refresh
            </button>
            <button
              className="link-button"
              onClick={() => {
                remember('')
                setData(null)
                setUsername('')
              }}
            >
              Switch user
            </button>
          </div>
        </div>
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
