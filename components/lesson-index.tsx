'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { ArrowLeft, ArrowRight, CircleCheck, Clock, Zap } from 'lucide-react'
import { ThemeToggle } from './theme-toggle'
import { LESSONS, LESSONS_DONE_KEY, LESSON_PROGRESS_KEY, readLessonProgress, readLessonsDone, type LessonProgress } from '../lib/lessons'
import './lesson.css'

/** /learn: every lesson in order, with a check on the ones this browser has finished. */
export function LessonIndex() {
  const [done, setDone] = useState<string[]>([])
  const [progress, setProgress] = useState<Record<string, LessonProgress>>({})
  useEffect(() => {
    try {
      setDone(readLessonsDone(localStorage.getItem(LESSONS_DONE_KEY)))
      setProgress(readLessonProgress(localStorage.getItem(LESSON_PROGRESS_KEY)))
    } catch { /* No storage: nothing is marked. */ }
  }, [])
  // An unfinished lesson someone has moved past step 1 in, as "step 3 of 7".
  const partway = (id: string) => {
    const saved = progress[id]
    const next = saved ? saved.solved.findIndex(value => !value) : -1
    return !done.includes(id) && next > 0 ? `step ${next + 1} of ${saved.solved.length}` : null
  }
  const next = LESSONS.find(lesson => !done.includes(lesson.id)) ?? LESSONS[0]
  return <div className="lesson-page">
    <nav className="lab-home-nav" aria-label="Site">
      <Link className="brand-home" href="/"><span className="brand-mark" aria-hidden="true"><Zap size={14} /></span>Automata Lab</Link>
      <ThemeToggle />
    </nav>
    <main className="lesson-main">
      <header className="lesson-head">
        <Link className="lesson-back" href="/"><ArrowLeft size={14} aria-hidden="true" /> Home</Link>
        <p className="eyebrow">Interactive lessons · No background needed</p>
        <h1 className="learn-title">From your first DFA to context-free grammars</h1>
        <p className="learn-lead">Five short lessons that follow the first two chapters of Sipser. Every step asks you to try something, so you learn by doing, not by reading. Each one builds on the last.</p>
        <Link className="primary-button learn-continue" href={`/learn/${next.id}`}>
          {done.length === LESSONS.length ? 'Review lesson 1' : partway(next.id) ? `Continue lesson ${next.number}, ${partway(next.id)}` : done.length === 0 ? 'Start lesson 1' : `Continue with lesson ${next.number}`} <ArrowRight size={14} aria-hidden="true" />
        </Link>
      </header>
      <ol className="learn-list">
        {LESSONS.map(lesson => {
          const finished = done.includes(lesson.id)
          return <li key={lesson.id}>
            <Link className={`learn-card ${finished ? 'is-done' : ''}`} href={`/learn/${lesson.id}`}>
              <span className="learn-number" aria-hidden="true">{lesson.number}</span>
              <span className="learn-copy">
                <b>{lesson.title}</b>
                <span>{lesson.blurb}</span>
                <small><Clock size={12} aria-hidden="true" /> about {lesson.minutes} min{finished ? <> · <CircleCheck size={12} aria-hidden="true" /> done, open to review any step</> : partway(lesson.id) && <> · {partway(lesson.id)}</>}</small>
              </span>
              <ArrowRight size={18} aria-hidden="true" />
            </Link>
          </li>
        })}
      </ol>
      <p className="learn-later">Turing machines and decidability come later. Until then you can explore them in the <Link href="/tm">Turing machine workspace</Link> and on the <Link href="/deciders">deciders page</Link>.</p>
    </main>
  </div>
}
