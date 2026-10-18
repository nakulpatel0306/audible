import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

// nflverse publishes data as GitHub release assets, which browsers can't fetch cross-origin.
// The dev and preview servers fetch them instead and cache each file for an hour. The Pages
// build ships a snapshot at the same path instead (scripts/nflverse.ts).
function nflverseProxy(): Plugin {
  const cache = new Map<string, { at: number; body: string }>()
  const handler = async (req: any, res: any, next: () => void) => {
    const match = req.url?.match(/\/nflverse\/(.+)$/)
    if (!match) return next()
    const path = match[1]
    const hit = cache.get(path)
    if (!hit || Date.now() - hit.at > 3_600_000) {
      const upstream = await fetch(`https://github.com/nflverse/nflverse-data/releases/download/${path}`)
      if (!upstream.ok) {
        res.statusCode = upstream.status
        return res.end()
      }
      cache.set(path, { at: Date.now(), body: await upstream.text() })
    }
    res.setHeader('Content-Type', 'text/csv')
    res.end(cache.get(path)!.body)
  }
  return {
    name: 'nflverse-proxy',
    configureServer: (server) => void server.middlewares.use(handler),
    configurePreviewServer: (server) => void server.middlewares.use(handler),
  }
}

// GitHub Pages serves the app from /<repo>/, set by the Pages workflow
export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  plugins: [react(), nflverseProxy()],
})
