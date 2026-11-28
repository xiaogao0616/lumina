import type { Metadata } from 'next'
import { TimeLesson } from '../../../components/lesson-time'

export const metadata: Metadata = { title: 'How long it takes — Automata Lab' }

export default function Page() {
  return <TimeLesson />
}
