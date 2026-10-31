import type { Metadata } from 'next'
import { DfaLesson } from '../../components/lesson-dfa'

export const metadata: Metadata = { title: 'What is a DFA? — Automata Lab' }

export default function LearnPage() {
  return <DfaLesson />
}
