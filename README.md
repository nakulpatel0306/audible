# audible

Read your Sleeper fantasy football league and call the play: fix your lineup, find
the pickups and trades worth making, and see exactly what each move does before you
make it.

**[Open it in your browser](https://nakulpatel0306.github.io/audible/)** · **[Read the guide](docs/GUIDE.md)**

![The Gameday tab: this week's matchup with live and projected scores, win probability, playoff odds and the best lineup](docs/gameday.jpg)

Type in a Sleeper username and Audible reads that league: rosters, scoring rules,
schedule, projections, Vegas lines, injuries and news. It's free, needs no account or
API key, and is **read-only**. Sleeper's API can't change rosters, so Audible tells
you the move and you make it in Sleeper.

## What it does

| Tab     | What you get                                                                                               |
| ------- | ---------------------------------------------------------------------------------------------------------- |
| Gameday | This week's matchup and win odds, a lineup check, your best lineup as flip cards, injury report, news on your players |
| Plan    | Every remaining week with your odds, and the pickups each one needs for byes and streaming, as one move list |
| Moves   | Waiver pickups ranked by what they add to your lineup, defense and kicker streaming by matchup             |
| Trades  | Trade partners sized up by what each side has and lacks, with deals that help both, plus offer review (accept, counter or decline, with reasons and counteroffers) |
| League  | Power rankings, position-by-position ranks, all-play records and luck, playoff odds, head-to-head compare |

**Help** in the top bar (or `?`) shows your league's rules, keyboard shortcuts and what
each number means. `1`–`5` switch tabs and `R` refreshes. Cards flip: click or tap one
for the details behind its number.

![The Plan tab: a flip card for every week left, and the pickups each one needs](docs/plan.jpg)

Got a trade offer? Enter it under **Review an offer**: Audible gives a verdict, says
why (points gained, where you'd rank at each position, the week it hurts most, injury
and usage flags), and if it's not worth it, finds small counters that would work for
both sides.

Every pickup and trade opens a **before and after**: playoff odds, next week's lineup,
rest-of-season points, a week-by-week chart, and which starters change. Trades show
both teams.

![A trade's before and after for both teams](docs/trade.jpg)

![Power rankings with position ranks, all-play records, luck and playoff odds](docs/league.jpg)

## Run it yourself

```sh
bun install
bun dev
```

Open the local URL and enter a Sleeper username. If that user is in more than one
league, switch between them from the menu in the top bar; Audible remembers the last
one you picked.

## Staying current

Everything is fetched fresh each time the page loads: rosters, lineups, transactions,
injuries, projections, live scores, Vegas lines and news. Weeks and seasons roll over
on their own. A tab left open reloads by itself when you come back to it after 10
minutes, and the top bar shows when the data was last updated. The nflverse usage
data on the hosted site refreshes daily (see [Hosting](#hosting)).

## Use the CLI

The same analysis, in the terminal:

```sh
bun cli/index.ts leagues --user <sleeper-username>
bun cli/index.ts report --user <sleeper-username>
bun cli/index.ts trade --user <sleeper-username> --give "Player A,Player B" --get "Player C"  # review an offer
```

`--league <id>` picks a league from `leagues`; without it, Audible uses the first
league in season. `SLEEPER_USERNAME` and `SLEEPER_LEAGUE_ID` work in place of the
flags.

## Where the numbers come from

| Source                         | Used for                                                           |
| ------------------------------ | ------------------------------------------------------------------ |
| Sleeper (Rotowire) projections | Every projected point, scored with the league's exact rules        |
| ESPN projections               | A second opinion; widens the range when it disagrees with Sleeper  |
| DraftKings lines, via ESPN     | Implied team totals, once books post the week's lines              |
| nflverse weekly stats          | Target share and carries trends ("Usage up" / "Usage down")        |
| ESPN news                      | Stories about players on your roster                               |

Nothing changes a projection unless it predicted better in a backtest on real 2026
results:

- **League scoring** reproduces Sleeper's official weekly team totals exactly.
- **Recent-form adjustments** made predictions worse (average miss 5.14 → 5.25
  points), so they're out.
- **Averaging Sleeper and ESPN** didn't help out of sample (5.506 vs 5.505 average
  miss over 1,073 player-weeks, holding out one week at a time). But when the two
  disagree, outcomes really are less predictable: the most-split quarter missed by
  65% of projection, the least-split by 50%. So disagreement widens a player's range,
  which flows into win and playoff odds, and shows as **Sources split**.
- **Usage trends and Vegas totals** are shown as context, not added to projections:
  the projections already price them in.

[docs/GUIDE.md](docs/GUIDE.md) explains every number on screen.

## Hosting

The [Pages workflow](.github/workflows/pages.yml) builds the app and deploys it to
GitHub Pages on every push, and again daily to refresh the nflverse usage data. Fork
the repo, set **Settings → Pages → Source** to **GitHub Actions**, and it runs at
`https://<you>.github.io/audible/`. GitHub pauses scheduled workflows in repos with no
commits for 60 days; if that happens, usage badges stop updating until the next push
(everything else stays live).

nflverse files can't be fetched by a browser directly, so the dev server proxies them
and the Pages build saves a copy next to the site
([`scripts/nflverse.ts`](scripts/nflverse.ts)). Everything else is fetched live from
the browser.

## Development

```sh
bun test         # scoring, lineups, waivers, trades, simulation, data parsing
bun run lint
bun run typecheck
bun run build
```

`src/core` is plain TypeScript shared by the web app and the CLI; `src/ui` is the
React app. See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE). Not affiliated with Sleeper, ESPN, DraftKings or nflverse.
