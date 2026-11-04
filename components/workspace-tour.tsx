'use client'

import Link from 'next/link'
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { ArrowLeft, ArrowRight, X } from 'lucide-react'

/** Seen flags: one shared by the four machine workspaces (DFA, NFA, PDA, TM), one for the grammar workspace. */
export const TOUR_SEEN_KEY = 'automata-lab.tour-seen.v1'
export const CFG_TOUR_SEEN_KEY = 'automata-lab.tour-seen.cfg.v1'
export type TourKind = 'machine' | 'cfg'

type Side = 'right' | 'left' | 'below' | 'above'
type Step = {
  /** Selectors tried in order; the first one that is on screen and has a size is pointed at. */
  targets: string[]
  /** Where the card may sit relative to the target, best first. */
  sides: Side[]
  title: string
  body: ReactNode
}

const MACHINE_STEPS: Step[] = [
  {
    targets: ['.palette-list', '.sidebar-toggle', '.sidebar'], sides: ['right', 'below'], title: 'Add states',
    body: <>From the <b>Components</b> panel, drag <b>Start state</b>, <b>State</b> or <b>Accept state</b> onto the canvas, or tap one to drop it in. Hover a state on the canvas to rename it, delete it, or change its kind.</>,
  },
  {
    targets: ['.react-flow .edge-label', '.automata-node', '.flow-wrap'], sides: ['below', 'above', 'right', 'left'], title: 'Draw transitions',
    body: <>Click a state, then click where the arrow should go: another state, or the same one for a loop. Click a label like this one to pick its letters.</>,
  },
  {
    targets: ['.string-test-row', '.string-test-panel'], sides: ['above', 'right', 'left', 'below'], title: 'Test it',
    body: <>Type a string here and press <b>Run animated</b> to watch the machine read it letter by letter. <b>AI</b> can build a machine from a description, and <b>Practice</b> has exercises to check.</>,
  },
]

const CFG_STEPS: Step[] = [
  {
    targets: ['#grammar-text', '.grammar-sidebar'], sides: ['right', 'below'], title: 'Write the grammar here',
    body: <>One rule per line, like <b>S → aSb | ε</b>. The buttons on top insert →, ε and |. Everything else on the page, from string tests to the parse tree, follows these rules as you type.</>,
  },
]

const GAP = 16
const EDGE = 12
const PAD = 6

type Placement = { card: CSSProperties; arrow?: { side: Side; offset: number }; hole?: DOMRect }

function findTarget(selectors: string[]): HTMLElement | null {
  for (const selector of selectors) {
    for (const element of Array.from(document.querySelectorAll<HTMLElement>(selector))) {
      const box = element.getBoundingClientRect()
      if (box.width > 0 && box.height > 0) return element
    }
  }
  return null
}

function place(box: DOMRect | null, sides: Side[], width: number, height: number): Placement {
  const vw = window.innerWidth, vh = window.innerHeight
  if (!box) return { card: { left: Math.max(EDGE, (vw - width) / 2), top: Math.max(EDGE, (vh - height) / 2) } }
  const clamp = (value: number, low: number, high: number) => Math.min(Math.max(value, low), Math.max(low, high))
  const midX = box.left + box.width / 2, midY = box.top + box.height / 2
  const fits: Record<Side, boolean> = {
    right: box.right + GAP + width <= vw - EDGE,
    left: box.left - GAP - width >= EDGE,
    below: box.bottom + GAP + height <= vh - EDGE,
    above: box.top - GAP - height >= EDGE,
  }
  const side = sides.find(option => fits[option]) ?? (['below', 'above', 'right', 'left'] as Side[]).find(option => fits[option]) ?? 'below'
  if (side === 'right' || side === 'left') {
    const top = clamp(midY - height / 2, EDGE, vh - height - EDGE)
    const left = side === 'right' ? box.right + GAP : box.left - GAP - width
    return { card: { left, top }, arrow: { side, offset: clamp(midY - top, 20, height - 20) }, hole: box }
  }
  const left = clamp(midX - width / 2, EDGE, vw - width - EDGE)
  const top = side === 'below' ? Math.min(box.bottom + GAP, vh - height - EDGE) : Math.max(EDGE, box.top - GAP - height)
  return { card: { left, top }, arrow: { side, offset: clamp(midX - left, 20, width - 20) }, hole: box }
}

/**
 * A short coach-mark tour: each step dims the page, cuts a hole around the part it talks about,
 * and puts a card next to it with an arrow pointing at that part. Shown once per workspace kind.
 */
export function WorkspaceTour({ kind, onClose }: { kind: TourKind; onClose: () => void }) {
  const steps = kind === 'cfg' ? CFG_STEPS : MACHINE_STEPS
  const [step, setStep] = useState(0)
  const [placement, setPlacement] = useState<Placement | null>(null)
  const cardRef = useRef<HTMLElement>(null)
  const nextRef = useRef<HTMLButtonElement>(null)
  const current = steps[step]
  const last = step === steps.length - 1

  const measure = useCallback(() => {
    const card = cardRef.current
    if (!card) return
    const target = findTarget(current.targets)
    const box = target?.getBoundingClientRect() ?? null
    const hole = box && new DOMRect(box.left - PAD, box.top - PAD, box.width + PAD * 2, box.height + PAD * 2)
    setPlacement(place(hole, current.sides, card.offsetWidth, card.offsetHeight))
  }, [current])

  // Bring the target into view once per step (on phones the test panel sits below the canvas),
  // then keep re-measuring: the canvas fits its view and panels settle after the tour opens.
  useLayoutEffect(() => {
    findTarget(current.targets)?.scrollIntoView({ block: 'nearest' })
    measure()
    const timer = window.setInterval(measure, 250)
    window.addEventListener('resize', measure)
    return () => { window.clearInterval(timer); window.removeEventListener('resize', measure) }
  }, [current, measure])
  useEffect(() => { nextRef.current?.focus({ preventScroll: true }) }, [step])
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const hole = placement?.hole
  return <div className={`coach-layer ${hole ? '' : 'is-dim'}`}>
    {hole && <div className="coach-hole" aria-hidden="true" style={{ left: hole.left, top: hole.top, width: hole.width, height: hole.height }} />}
    <section ref={cardRef} className="coach-card" role="dialog" aria-modal="true" aria-labelledby="tour-title"
      style={{ ...(placement?.card ?? { left: 0, top: 0 }), visibility: placement ? 'visible' : 'hidden' }}>
      {placement?.arrow && <span className={`coach-arrow is-${placement.arrow.side}`} aria-hidden="true"
        style={placement.arrow.side === 'left' || placement.arrow.side === 'right' ? { top: placement.arrow.offset } : { left: placement.arrow.offset }} />}
      <button type="button" className="icon-button coach-close" aria-label="Close the tour" onClick={onClose}><X size={15} /></button>
      <p className="coach-count">{steps.length > 1 ? `Quick tour · ${step + 1} of ${steps.length}` : 'Quick tip'}</p>
      <h3 id="tour-title">{current.title}</h3>
      <p>{current.body}</p>
      <div className="coach-actions">
        {steps.length > 1 && <span className="tour-dots" aria-hidden="true">{steps.map((_, at) => <span key={at} className={at === step ? 'is-on' : ''} />)}</span>}
        <span className="coach-buttons">
          {step > 0
            ? <button type="button" className="modal-button" onClick={() => setStep(step - 1)}><ArrowLeft size={14} aria-hidden="true" /> Back</button>
            : steps.length > 1 && <button type="button" className="modal-button" onClick={onClose}>Skip</button>}
          <button ref={nextRef} type="button" className="modal-button is-primary" onClick={() => last ? onClose() : setStep(step + 1)}>
            {last ? (kind === 'cfg' ? 'Got it' : 'Start building') : <>Next <ArrowRight size={14} aria-hidden="true" /></>}
          </button>
        </span>
      </div>
      {last && kind === 'machine' && <p className="coach-learn">New to automata? <Link href="/learn" onClick={onClose}>Start with the interactive lessons</Link>.</p>}
    </section>
  </div>
}
