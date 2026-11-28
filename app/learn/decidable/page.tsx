import type { Metadata } from 'next'
import { DecidableLesson } from '../../../components/lesson-decidable'

export const metadata: Metadata = { title: 'Questions with guaranteed answers — Automata Lab' }

export default function Page() {
  return <DecidableLesson />
}
