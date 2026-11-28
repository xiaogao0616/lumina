import type { Metadata } from 'next'
import { ReductionsLesson } from '../../../components/lesson-reductions'

export const metadata: Metadata = { title: 'Passing the hardness along — Automata Lab' }

export default function Page() {
  return <ReductionsLesson />
}
