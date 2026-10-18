# Contributing

Issues and pull requests are welcome. Run `bun test`, `bun run lint` and
`bun run typecheck` before opening a PR; CI runs the same checks.

## Layout

```
src/core/     plain TypeScript, shared by the web app and the CLI
  sleeper.ts    Sleeper API (read-only)
  espn.ts       ESPN news, schedule, Vegas lines and projections
  usage.ts      nflverse target share and carries
  context.ts    loads everything one analysis needs
  types.ts      shared types   math.ts       shared math
  scoring.ts    league scoring rules
  model.ts      injury discounts and weekly spread
  consensus.ts  matching ESPN to Sleeper, and source disagreement
  monitor.ts    lineup check, injury report, roster news
  lineup.ts     best lineups and rest-of-season value
  waivers.ts    pickups        streaming.ts  defense and kicker streaming
  trades.ts     trade search   sim.ts        win and playoff odds
  compare.ts    power rankings scenario.ts   before and after
src/ui/       the React app, one file per tab plus shared pieces
cli/          the terminal report and trade grader
tests/        bun tests against small hand-built leagues
```

## Changing a projection

Audible only adjusts a projection when the adjustment predicts real results better
than Sleeper's number alone. Before proposing one, backtest it on past weeks of the
current season, holding out the week you're predicting, and include the before and
after average miss in the PR. "Recent form" and "average with ESPN" were both tried
and both made things worse; the [README](README.md#where-the-numbers-come-from) has
the numbers.

## Adding a data source

Fetch it in its own module under `src/core`, and make the app work without it: wrap
the call so a failure shows a short note instead of breaking the dashboard (see how
`App.tsx` loads news and usage). If browsers can't fetch it directly (no CORS), follow
the nflverse pattern: a dev-server proxy in `vite.config.ts` and a build-time copy in
`scripts/`.
