import { useState } from 'react'
import { pts } from './format.tsx'

export type Series = { name: string; color: string; values: number[] }

const W = 560
const H = 200
const PAD = { top: 12, right: 64, bottom: 26, left: 34 }

// Weekly projected points, one line per series, with a per-week hover readout.
// Endpoints are labeled directly so the lines read without the legend.
export function WeeklyLines({ weeks, series }: { weeks: number[]; series: Series[] }) {
  const [hover, setHover] = useState<number | null>(null)
  const all = series.flatMap((s) => s.values)
  const lo = Math.floor(Math.min(...all) / 10) * 10
  const hi = Math.ceil(Math.max(...all) / 10) * 10 || 10
  const x = (i: number) => PAD.left + (weeks.length === 1 ? 0 : (i / (weeks.length - 1)) * (W - PAD.left - PAD.right))
  const y = (v: number) => PAD.top + (1 - (v - lo) / (hi - lo || 1)) * (H - PAD.top - PAD.bottom)
  const ticks = [lo, (lo + hi) / 2, hi]
  const step = (W - PAD.left - PAD.right) / Math.max(weeks.length - 1, 1)
  const labelY = endLabels(series.map((s) => y(s.values.at(-1)!)))

  return (
    <div style={{ position: 'relative' }}>
      <div className="legend">
        {series.map((s) => (
          <span key={s.name}>
            <i style={{ background: s.color }} />
            {s.name}
          </span>
        ))}
      </div>
      <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Projected points by week: ${series.map((s) => s.name).join(' vs ')}`}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} stroke="var(--line)" />
            <text x={PAD.left - 6} y={y(t) + 4} textAnchor="end">
              {Math.round(t)}
            </text>
          </g>
        ))}
        {weeks.map((w, i) => (
          <text key={w} x={x(i)} y={H - 6} textAnchor="middle">
            {w}
          </text>
        ))}
        {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={H - PAD.bottom} stroke="var(--line-strong)" />}
        {series.map((s) => (
          <g key={s.name}>
            <polyline
              points={s.values.map((v, i) => `${x(i)},${y(v)}`).join(' ')}
              fill="none"
              stroke={s.color}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            <circle cx={x(s.values.length - 1)} cy={y(s.values.at(-1)!)} r={4} fill={s.color} stroke="var(--surface)" strokeWidth={2} />
            <text x={x(s.values.length - 1) + 8} y={labelY[series.indexOf(s)] + 4} style={{ fill: s.color }}>
              {s.name}
            </text>
            {hover !== null && <circle cx={x(hover)} cy={y(s.values[hover])} r={4} fill={s.color} stroke="var(--surface)" strokeWidth={2} />}
          </g>
        ))}
        {weeks.map((_, i) => (
          <rect
            key={i}
            x={x(i) - step / 2}
            y={0}
            width={step}
            height={H}
            fill="transparent"
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
          />
        ))}
      </svg>
      {hover !== null && (
        <div className="tooltip" style={{ left: `${(x(hover) / W) * 100}%`, top: `${((y(Math.max(...series.map((s) => s.values[hover]))) + 24) / H) * 100}%` }}>
          <b>Week {weeks[hover]}</b>
          {series.map((s) => (
            <div key={s.name}>
              <span style={{ color: s.color }}>●</span> {s.name} {pts(s.values[hover])}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// Nudges line-end labels apart so series that finish at the same value stay readable
function endLabels(ys: number[], gap = 14): number[] {
  const order = ys.map((y, i) => ({ y, i })).sort((a, b) => a.y - b.y)
  for (let k = 1; k < order.length; k++) order[k].y = Math.max(order[k].y, order[k - 1].y + gap)
  const out: number[] = []
  for (const { y, i } of order) out[i] = y
  return out
}

// Two teams' rest-of-season points by position, bars growing outward from a shared center
export function MirrorBars({ rows, left, right }: { rows: { label: string; a: number; b: number }[]; left: Series; right: Series }) {
  const max = Math.max(...rows.flatMap((r) => [r.a, r.b]), 1)
  return (
    <div>
      <div className="legend">
        <span>
          <i style={{ background: left.color }} />
          {left.name}
        </span>
        <span>
          <i style={{ background: right.color }} />
          {right.name}
        </span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 44px minmax(0,1fr)', rowGap: 8, alignItems: 'center' }}>
        {rows.map((r) => (
          <MirrorRow key={r.label} row={r} max={max} left={left.color} right={right.color} />
        ))}
      </div>
    </div>
  )
}

function MirrorRow({ row, max, left, right }: { row: { label: string; a: number; b: number }; max: number; left: string; right: string }) {
  const bar = (v: number, color: string, side: 'left' | 'right') => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexDirection: side === 'left' ? 'row-reverse' : 'row' }}>
      <div
        title={pts(v)}
        style={{
          height: 12,
          width: `${(v / max) * 80}%`,
          minWidth: v > 0 ? 3 : 0,
          background: color,
          borderRadius: side === 'left' ? '4px 0 0 4px' : '0 4px 4px 0',
        }}
      />
      <span className="detail">{Math.round(v)}</span>
    </div>
  )
  return (
    <>
      {bar(row.a, left, 'left')}
      <span style={{ textAlign: 'center' }}>
        <span className={`pos pos-${row.label}`}>{row.label}</span>
      </span>
      {bar(row.b, right, 'right')}
    </>
  )
}
