// Copies this season's nflverse usage file into the build, so the static site can read it
// without the dev server's proxy. The Pages workflow reruns this daily to keep it current.
import { mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'
import { nflState } from '../src/core/sleeper.ts'
import { NFLVERSE_RELEASES, usagePath } from '../src/core/usage.ts'

const outDir = process.argv[2] ?? 'dist/nflverse'
const { season } = await nflState()
const res = await fetch(`${NFLVERSE_RELEASES}/${usagePath(season)}`)
if (!res.ok) throw new Error(`nflverse ${res.status} for the ${season} season`)
const target = `${outDir}/${usagePath(season)}`
await mkdir(dirname(target), { recursive: true })
await Bun.write(target, await res.text())
console.log(`Saved ${target}`)
