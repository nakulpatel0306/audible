// Line icons for the tab bar, drawn on a 20px grid
const paths: Record<string, React.ReactNode> = {
  Gameday: (
    <>
      <ellipse cx="10" cy="10" rx="7.5" ry="4.5" transform="rotate(-35 10 10)" />
      <path d="M7.5 12.5l5-5M8.6 9.4l1.9 1.9M10 8l1.9 1.9" />
    </>
  ),
  Plan: (
    <>
      <rect x="3" y="4" width="14" height="13" rx="2.5" />
      <path d="M3 8h14M7 2.5v3M13 2.5v3M7 11.5h2M11 11.5h2M7 14h2" />
    </>
  ),
  Moves: <path d="M4 6h10l-3-3M16 14H6l3 3" />,
  Trades: (
    <>
      <circle cx="6" cy="7" r="2.5" />
      <circle cx="14" cy="13" r="2.5" />
      <path d="M8.5 7H14v3M11.5 13H6v-3" />
    </>
  ),
  League: <path d="M4 17V10M8 17V5M12 17V8M16 17V3" />,
  Refresh: (
    <>
      <path d="M3.5 10a6.5 6.5 0 0 1 11.3-4.4M16.5 10a6.5 6.5 0 0 1-11.3 4.4" />
      <path d="M15.2 2.5v3.4h-3.4M4.8 17.5v-3.4h3.4" />
    </>
  ),
  Help: (
    <>
      <circle cx="10" cy="10" r="7.5" />
      <path d="M7.8 7.8a2.3 2.3 0 1 1 3.2 2.1c-.6.3-1 .8-1 1.5v.4M10 14.4v.1" />
    </>
  ),
}

export function Icon({ name, size = 20 }: { name: keyof typeof paths; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name]}
    </svg>
  )
}
