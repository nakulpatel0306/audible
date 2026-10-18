import { leagueProfiles } from '../src/core/compare.ts'
import { activePlayers, loadContext, projectionFor, sleeperLeagueUrl, type Context } from '../src/core/context.ts'
import { weekLineup } from '../src/core/lineup.ts'
import { lineupCheck } from '../src/core/monitor.ts'
import { myGames, simulateSeason } from '../src/core/sim.ts'
import * as sleeper from '../src/core/sleeper.ts'
import { streamPlan } from '../src/core/streaming.ts'
import { evaluateTrade, findTrades, tradesOpen } from '../src/core/trades.ts'
import type { Player } from '../src/core/types.ts'
import { waiverTargets } from '../src/core/waivers.ts'

type Who = { user: string; league?: string }

const pts = (n: number) => n.toFixed(1).padStart(5)
const pct = (n: number) => `${Math.round(n * 100)}%`.padStart(4)
const names = (ps: Player[]) => ps.map((p) => p.name).join(' + ')
const heading = (text: string) => console.log(`\n\x1b[1m${text}\x1b[0m`)

async function trendingAdds(): Promise<Map<string, number>> {
  const rows = await sleeper.trending('add', 48, 100)
  return new Map(rows.map((r) => [r.player_id, r.count]))
}

export async function report(who: Who) {
  const [ctx, trending] = await Promise.all([loadContext(who.user, who.league), trendingAdds()])
  const { league, me, week } = ctx
  console.log(`${league.name} · ${me.teamName} (${me.wins}-${me.losses}) · week ${week}`)

  const plan = ctx.planWeek
  heading(`Best lineup, week ${plan}`)
  const lineup = weekLineup(ctx, activePlayers(me), plan)
  for (const { slot, player } of lineup.slots) {
    const p = player && ctx.players.get(player.id)
    const flag = p?.injuryStatus ? ` [${p.injuryStatus}]` : ''
    const set = plan === week && player && !me.starters.includes(player.id) ? '  <- not in your Sleeper lineup' : ''
    console.log(`  ${slot.padEnd(5)} ${pts(player?.mean ?? 0)}  ${p?.name ?? '-'} vs ${projectionFor(ctx, player?.id ?? '', plan).opponent ?? 'bye'}${flag}${set}`)
  }
  console.log(`  total ${pts(lineup.mean)} ± ${lineup.sd.toFixed(1)}`)

  const check = lineupCheck(ctx)
  if (check) {
    heading(`Lineup check, week ${check.week}: +${check.gain.toFixed(1)} points available`)
    for (const m of check.start) console.log(`  start ${m.player.name} (${m.points.toFixed(1)})${m.reason ? ` [${m.reason}]` : ''}`)
    for (const m of check.bench) console.log(`  bench ${m.player.name} (${m.points.toFixed(1)})${m.reason ? ` [${m.reason}]` : ''}`)
  }

  heading('Power rankings (rest-of-season lineup strength)')
  for (const [i, t] of leagueProfiles(ctx).entries()) {
    const mark = t.roster.rosterId === me.rosterId ? ' <- you' : ''
    const luck = `${t.luck >= 0 ? '+' : ''}${t.luck.toFixed(1)} luck`
    console.log(`  ${String(i + 1).padStart(2)}. ${t.roster.teamName}  ${t.roster.wins}-${t.roster.losses}  all-play ${t.allPlay.wins}-${t.allPlay.losses}  ${luck}${mark}`)
  }

  heading('Your schedule')
  for (const g of myGames(ctx)) {
    const opp = ctx.rosters.find((r) => r.rosterId === g.opponent)!
    console.log(`  wk ${String(g.week).padStart(2)}  ${pct(g.winPct)}  ${pts(g.myMean)} vs ${pts(g.theirMean)}  ${opp.teamName}`)
  }

  heading('Playoff odds (10,000 simulated seasons)')
  for (const t of simulateSeason(ctx)) {
    const mark = t.rosterId === me.rosterId ? ' <- you' : ''
    console.log(`  ${pct(t.playoffPct)} playoffs  ${pct(t.byePct)} bye  ${t.projectedWins.toFixed(1).padStart(4)} W  ${t.wins}-${t.losses}  ${t.teamName}${mark}`)
  }

  heading('Waiver targets (gain = rest-of-season starting points)')
  const waivers = waiverTargets(ctx, trending)
  if (!waivers.length) console.log('  Nothing on waivers beats what you have.')
  for (const w of waivers) {
    const hot = w.trendingAdds ? `  🔥 ${w.trendingAdds} adds/48h` : ''
    console.log(`  +${pts(w.gain)}  ${w.add.name} (${w.add.position} ${w.add.team}) ${w.add.injuryStatus ? `[${w.add.injuryStatus}] ` : ''}drop ${w.drop?.name ?? 'nobody'}${hot}`)
  }

  for (const position of ['DEF', 'K'] as const) {
    const plan = streamPlan(ctx, position)
    heading(`${position} streaming, next 3 weeks`)
    for (const o of [...plan.mine, ...plan.options.slice(0, 5)]) {
      const weeks = o.weeks.map((w) => `${w.opponent ?? 'bye'} ${w.mean.toFixed(1)}`.padEnd(10)).join(' ')
      console.log(`  ${o.owned ? 'yours' : 'FA   '}  ${o.player.name.padEnd(24)} ${weeks}`)
    }
    if (plan.swap) console.log(`  -> add ${plan.swap.add.name}, drop ${plan.swap.drop.name} (+${plan.swap.gain.toFixed(1)} next week)`)
    else console.log('  -> keep what you have')
  }

  heading(`Trade ideas (deadline: week ${league.tradeDeadline})`)
  if (!tradesOpen(ctx)) console.log('  Trade deadline has passed.')
  else {
    const ideas = findTrades(ctx)
    if (!ideas.length) console.log('  No deals found that help both sides.')
    for (const t of ideas) console.log(`  you +${pts(t.myGain)} them +${pts(t.theirGain)}  give ${names(t.give)} for ${names(t.get)}  (${t.partner.teamName})`)
  }
  console.log(`\nOpen in Sleeper: ${sleeperLeagueUrl(league)}`)
}

function findPlayer(ctx: Context, name: string, rosterIds: string[]): string {
  const want = name.trim().toLowerCase()
  const matches = rosterIds.filter((id) => ctx.players.get(id)?.name.toLowerCase().includes(want))
  if (matches.length !== 1) throw new Error(`"${name}" matched ${matches.length} rostered players; be more specific`)
  return matches[0]
}

export async function trade(who: Who, giveNames: string, getNames: string) {
  const ctx = await loadContext(who.user, who.league)
  const give = giveNames.split(',').map((n) => findPlayer(ctx, n, ctx.me.players))
  const others = ctx.rosters.filter((r) => r.rosterId !== ctx.me.rosterId)
  const get = getNames.split(',').map((n) => findPlayer(ctx, n, others.flatMap((r) => r.players)))
  const partner = others.find((r) => r.players.includes(get[0]))!
  if (!get.every((id) => partner.players.includes(id))) throw new Error('Everything you get has to come from one team')

  const result = evaluateTrade(ctx, partner.rosterId, give, get)
  console.log(`Give ${names(result.give)} for ${names(result.get)} (${partner.teamName})`)
  console.log(`  You:  ${result.myGain >= 0 ? '+' : ''}${result.myGain.toFixed(1)} rest-of-season starting points`)
  console.log(`  Them: ${result.theirGain >= 0 ? '+' : ''}${result.theirGain.toFixed(1)}`)
  const verdict = result.myGain > 2 && result.theirGain >= 0 ? 'Good for both, worth sending' : result.myGain > 2 ? 'Wins it for you; they may say no' : result.myGain > -2 ? 'Roughly a wash for you' : 'Hurts your team'
  console.log(`  ${verdict}`)
}
