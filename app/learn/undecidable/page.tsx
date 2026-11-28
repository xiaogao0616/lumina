import type { Metadata } from 'next'
import { UndecidableLesson } from '../../../components/lesson-undecidable'

export const metadata: Metadata = { title: 'Questions no machine can answer — Automata Lab' }

export default function Page() {
  return <UndecidableLesson />
}
