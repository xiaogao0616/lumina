'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, MousePointerClick, Play, SquareDashedMousePointer, X } from 'lucide-react'

export const TOUR_SEEN_KEY = 'automata-lab.tour-seen.v1'

const STEPS = [
  {
    icon: SquareDashedMousePointer, title: 'Add states',
    body: <>Drag <b>Start state</b>, <b>State</b> or <b>Accept state</b> from the panel on the left onto the canvas, or tap one to drop it in the middle. Hover a state to rename it, delete it, or switch it between start, plain and accepting.</>,
  },
  {
    icon: MousePointerClick, title: 'Draw transitions',
    body: <>Click a state, then click where the arrow should go: another state, or the same one for a loop. Click the arrow’s label to choose which letters take it.</>,
  },
  {
    icon: Play, title: 'Test it',
    body: <>Type a string under <b>Test &amp; generate</b> and press <b>Run animated</b> to watch the machine read it letter by letter. <b>AI</b> can build a machine from a description, and <b>Practice</b> gives you exercises to check.</>,
  },
]

/** A three-step introduction shown the first time someone opens the workspace. */
export function WorkspaceTour({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState(0)
  const nextRef = useRef<HTMLButtonElement>(null)
  useEffect(() => { nextRef.current?.focus() }, [step])
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  const current = STEPS[step]
  const Icon = current.icon
  const last = step === STEPS.length - 1
  return <div className="modal-overlay" onClick={event => { if (event.target === event.currentTarget) onClose() }}>
    <section className="modal-box tour-box" role="dialog" aria-modal="true" aria-labelledby="tour-title">
      <button type="button" className="icon-button tour-close" aria-label="Close the tour" onClick={onClose}><X size={16} /></button>
      <p className="tour-count">Quick tour · {step + 1} of {STEPS.length}</p>
      <div className="tour-icon" aria-hidden="true"><Icon size={30} /></div>
      <h3 id="tour-title">{current.title}</h3>
      <p>{current.body}</p>
      <div className="tour-dots" aria-hidden="true">{STEPS.map((_, at) => <span key={at} className={at === step ? 'is-on' : ''} />)}</div>
      <div className="modal-actions tour-actions">
        {step > 0
          ? <button type="button" className="modal-button" onClick={() => setStep(step - 1)}><ArrowLeft size={14} aria-hidden="true" /> Back</button>
          : <button type="button" className="modal-button" onClick={onClose}>Skip</button>}
        <button ref={nextRef} type="button" className="modal-button is-primary" onClick={() => last ? onClose() : setStep(step + 1)}>
          {last ? 'Start building' : <>Next <ArrowRight size={14} aria-hidden="true" /></>}
        </button>
      </div>
      {last && <p className="tour-learn">New to automata? <Link href="/learn" onClick={onClose}>Start with the interactive lessons</Link>.</p>}
    </section>
  </div>
}
