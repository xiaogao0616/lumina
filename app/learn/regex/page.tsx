import type { Metadata } from 'next'
import { RegexLesson } from '../../../components/lesson-regex'

export const metadata: Metadata = { title: 'Regular expressions — Automata Lab' }

export default function Page() {
  return <RegexLesson />
}
