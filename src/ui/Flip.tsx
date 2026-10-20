import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'

function FlipIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M2.5 8a5.5 5.5 0 0 1 9.6-3.7M13.5 8a5.5 5.5 0 0 1-9.6 3.7" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M12.6 1.8v2.8H9.8M3.4 14.2v-2.8h2.8" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// A card with a headline on the front and the reasoning on the back. Clicking anywhere on
// it flips it; the corner button does the same for keyboards. The hidden face is inert so
// tabbing never lands on something you can't see.
export function FlipCard({ front, back, label, accent }: { front: ReactNode; back: ReactNode; label: string; accent?: string }) {
  const [flipped, setFlipped] = useState(false)
  const frontButton = useRef<HTMLButtonElement>(null)
  const backButton = useRef<HTMLButtonElement>(null)
  const moved = useRef(false)

  // Keep focus on the visible face's button, or it's lost when its face goes inert
  useEffect(() => {
    if (!moved.current) return
    moved.current = false
    ;(flipped ? backButton : frontButton).current?.focus()
  }, [flipped])

  const flip = (fromKeyboard: boolean) => {
    moved.current = fromKeyboard
    setFlipped((f) => !f)
  }

  return (
    <div
      className={`flip${flipped ? ' flipped' : ''}`}
      style={accent ? ({ '--accent': accent } as CSSProperties) : undefined}
      onClick={(e) => {
        // Links and buttons on a face do their own thing
        if (e.target instanceof Element && e.target.closest('a, button, select, input')) return
        flip(false)
      }}
    >
      <div className="flip-inner">
        <div className="flip-face flip-front" inert={flipped}>
          {front}
          <button ref={frontButton} className="flip-toggle" aria-label={`Flip ${label} for details`} onClick={(e) => flip(e.detail === 0)}>
            <FlipIcon />
          </button>
        </div>
        <div className="flip-face flip-back" inert={!flipped}>
          {back}
          <button ref={backButton} className="flip-toggle" aria-label={`Flip ${label} back`} onClick={(e) => flip(e.detail === 0)}>
            <FlipIcon />
          </button>
        </div>
      </div>
    </div>
  )
}
