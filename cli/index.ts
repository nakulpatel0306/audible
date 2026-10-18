#!/usr/bin/env bun
import { parseArgs } from 'node:util'
import { leagues, report, trade } from './commands'

const HELP = `audible: read your league, change the play

Usage
  audible leagues                       List your leagues and their ids
  audible report                        Lineup check, rankings, odds, waivers, streaming, trades
  audible trade --give <names> --get <names>
                                        Grade a specific trade (comma-separated names)

Options
  --user <name>    Sleeper username (or SLEEPER_USERNAME)
  --league <id>    Which league, from \`audible leagues\` (or SLEEPER_LEAGUE_ID);
                   defaults to your first league in season
`

async function main() {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      user: { type: 'string', default: process.env.SLEEPER_USERNAME },
      league: { type: 'string', default: process.env.SLEEPER_LEAGUE_ID || undefined },
      give: { type: 'string' },
      get: { type: 'string' },
      help: { type: 'boolean', short: 'h', default: false },
    },
  })
  const [command] = positionals
  if (values.help || !command) return console.log(HELP)
  if (!values.user) throw new Error('Pass --user or set SLEEPER_USERNAME')
  const who = { user: values.user, league: values.league }

  switch (command) {
    case 'leagues':
      return leagues(who)
    case 'report':
      return report(who)
    case 'trade':
      if (!values.give || !values.get) throw new Error('trade needs --give and --get')
      return trade(who, values.give, values.get)
    default:
      throw new Error(`Unknown command "${command}". Run \`audible --help\`.`)
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
