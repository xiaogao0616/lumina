'use client'

import { useEffect, useRef, useState } from 'react'
import { PawPrint, X } from 'lucide-react'

const HIDDEN_KEY = 'automata-lab-cat'
const SLEEP_AFTER_MS = 30_000
const PET_LINES = ['Meow!', 'Purrr…', 'Mrrp?', '♪ nya ♪']

type Outcome = 'accepted' | 'rejected' | 'error' | 'loops' | 'undecided'
type Mood = 'idle' | 'happy' | 'sad' | 'petted' | 'sleep'

/**
 * A small cat that sits on the canvas edge. Its eyes follow the pointer, it purrs when clicked,
 * cheers or sulks when a test string is accepted or rejected, watches while a run animates,
 * and dozes off when nothing happens for a while. Purely decorative: it never blocks the canvas
 * beyond its own box and can be tucked away into a paw button.
 */
export function WorkspaceCat({ result, watching = false, placement = 'right' }: {
  /** Pass the latest result object; a new object means a new run to react to. */
  result: { status: Outcome } | null
  watching?: boolean
  placement?: 'left' | 'right'
}) {
  const [hidden, setHidden] = useState(false)
  const [mood, setMood] = useState<Mood>('idle')
  const [bubble, setBubble] = useState<string | null>(null)
  const [blink, setBlink] = useState(false)
  const [hearts, setHearts] = useState<number[]>([])
  const [look, setLook] = useState({ x: 0, y: 0 })
  const rootRef = useRef<HTMLDivElement>(null)
  const moodTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const lastActivity = useRef(Date.now())
  const moodRef = useRef<Mood>('idle')
  useEffect(() => { moodRef.current = mood }, [mood])

  useEffect(() => { try { setHidden(localStorage.getItem(HIDDEN_KEY) === 'hidden') } catch { /* storage blocked: show the cat */ } }, [])
  const setHiddenSaved = (value: boolean) => {
    setHidden(value)
    try { if (value) localStorage.setItem(HIDDEN_KEY, 'hidden'); else localStorage.removeItem(HIDDEN_KEY) } catch { /* this page only */ }
  }

  // A mood with a message that fades back to idle.
  const react = (next: Mood, text: string | null, ms = 1800) => {
    clearTimeout(moodTimer.current)
    setMood(next)
    setBubble(text)
    moodTimer.current = setTimeout(() => { setMood('idle'); setBubble(null) }, ms)
  }
  useEffect(() => () => clearTimeout(moodTimer.current), [])

  // Eyes follow the pointer; any movement also wakes the cat up.
  useEffect(() => {
    if (hidden) return
    let frame = 0
    const onMove = (event: PointerEvent) => {
      lastActivity.current = Date.now()
      if (frame) return
      frame = requestAnimationFrame(() => {
        frame = 0
        const box = rootRef.current?.getBoundingClientRect()
        if (!box) return
        const dx = event.clientX - (box.left + box.width / 2)
        const dy = event.clientY - (box.top + box.height * 0.45)
        const distance = Math.hypot(dx, dy) || 1
        const reach = Math.min(1, distance / 160)
        setLook({ x: (dx / distance) * 2.6 * reach, y: (dy / distance) * 2.2 * reach })
      })
      if (moodRef.current === 'sleep') react('idle', '!', 900)
    }
    window.addEventListener('pointermove', onMove)
    return () => { window.removeEventListener('pointermove', onMove); cancelAnimationFrame(frame) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hidden])

  // Blinks now and then, and dozes off after a quiet spell.
  useEffect(() => {
    if (hidden) return
    let blinkTimer: ReturnType<typeof setTimeout>
    const scheduleBlink = () => {
      blinkTimer = setTimeout(() => { setBlink(true); setTimeout(() => setBlink(false), 140); scheduleBlink() }, 2200 + Math.random() * 3800)
    }
    scheduleBlink()
    const sleepCheck = setInterval(() => {
      if (Date.now() - lastActivity.current > SLEEP_AFTER_MS) setMood(current => current === 'idle' ? 'sleep' : current)
    }, 2000)
    return () => { clearTimeout(blinkTimer); clearInterval(sleepCheck) }
  }, [hidden])

  // Cheers or sulks at each new test result.
  useEffect(() => {
    if (!result) return
    lastActivity.current = Date.now()
    if (result.status === 'accepted') react('happy', 'Accepted! ✨', 2400)
    else if (result.status === 'rejected') react('sad', 'Rejected… 😿', 2400)
    else if (result.status === 'loops' || result.status === 'undecided') react('sad', 'Round and round… 🌀', 2400)
    else react('sad', 'Hmm? 🤔', 2000)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result])

  const pet = () => {
    lastActivity.current = Date.now()
    react('petted', PET_LINES[Math.floor(Math.random() * PET_LINES.length)], 1600)
    const id = Date.now()
    setHearts(current => [...current.slice(-4), id])
    setTimeout(() => setHearts(current => current.filter(heart => heart !== id)), 1200)
  }

  if (hidden) return <button type="button" className={`cat-paw is-${placement}`} onClick={() => setHiddenSaved(false)} title="Bring the cat back" aria-label="Bring the cat back"><PawPrint size={16} aria-hidden="true" /></button>

  const shown: Mood | 'watching' = watching && mood === 'idle' ? 'watching' : mood
  const eyesClosed = shown === 'sleep' || shown === 'petted' || shown === 'happy'
  const pupil = shown === 'watching' ? 3.4 : 2.8
  return <div ref={rootRef} className={`workspace-cat is-${placement} is-${shown}`}>
    {bubble && <span key={bubble + mood} className="cat-bubble" role="status">{bubble}</span>}
    {shown === 'sleep' && <span className="cat-zzz" aria-hidden="true"><i>z</i><i>z</i><i>Z</i></span>}
    {hearts.map(id => <span key={id} className="cat-heart" aria-hidden="true">♥</span>)}
    <button type="button" className="cat-hide" onClick={() => setHiddenSaved(true)} title="Tuck the cat away" aria-label="Tuck the cat away"><X size={11} /></button>
    <button type="button" className="cat-body" onClick={pet} aria-label="Pet the cat">
      <svg viewBox="0 0 120 100" aria-hidden="true">
        <g className="cat-tail"><path d="M86 88 C112 86 114 60 102 50" /><path d="M86 88 C112 86 114 60 102 50" /></g>
        <ellipse className="cat-fill" cx="60" cy="86" rx="32" ry="17" />
        <g className="cat-ears">
          <path className="cat-fill cat-ear-l" d="M32 40 L35 13 L54 29 Z" />
          <path className="cat-fill cat-ear-r" d="M88 40 L85 13 L66 29 Z" />
          <path className="cat-ear-inner" d="M36 34 L38 20 L48 29 Z" />
          <path className="cat-ear-inner" d="M84 34 L82 20 L72 29 Z" />
        </g>
        <ellipse className="cat-fill" cx="60" cy="52" rx="31" ry="25" />
        <path className="cat-stripe" d="M60 28 V36 M52 29 L53 35 M68 29 L67 35" />
        {eyesClosed
          ? <g className="cat-eyes-closed">{shown === 'sleep'
            ? <><path d="M42 52 Q47 55 52 52" /><path d="M68 52 Q73 55 78 52" /></>
            : <><path d="M42 54 Q47 47 52 54" /><path d="M68 54 Q73 47 78 54" /></>}</g>
          : <g className={`cat-eyes ${blink ? 'is-blink' : ''}`}>
            <ellipse className="cat-eye" cx="47" cy="51" rx="6" ry="7" />
            <ellipse className="cat-eye" cx="73" cy="51" rx="6" ry="7" />
            <circle className="cat-pupil" cx={47 + look.x} cy={51 + look.y} r={pupil} />
            <circle className="cat-pupil" cx={73 + look.x} cy={51 + look.y} r={pupil} />
          </g>}
        {(shown === 'petted' || shown === 'happy') && <><ellipse className="cat-blush" cx="38" cy="61" rx="5" ry="3" /><ellipse className="cat-blush" cx="82" cy="61" rx="5" ry="3" /></>}
        <path className="cat-nose" d="M57 59 H63 L60 62.5 Z" />
        {shown === 'sad'
          ? <path className="cat-mouth" d="M54 68 Q60 63 66 68" />
          : <path className="cat-mouth" d={shown === 'happy' || shown === 'petted' ? 'M53 64 Q56.5 70 60 64 Q63.5 70 67 64' : 'M54 64 Q57 67 60 64 Q63 67 66 64'} />}
        <path className="cat-whisker" d="M30 58 H16 M30 62 L17 66 M90 58 H104 M90 62 L103 66" />
        <ellipse className="cat-fill" cx="48" cy="97" rx="8" ry="5" />
        <ellipse className="cat-fill" cx="72" cy="97" rx="8" ry="5" />
      </svg>
    </button>
  </div>
}
