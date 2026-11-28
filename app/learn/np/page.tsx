import type { Metadata } from 'next'
import { NpLesson } from '../../../components/lesson-np'

export const metadata: Metadata = { title: 'Easy to check, hard to find — Automata Lab' }

export default function Page() {
  return <NpLesson />
}
