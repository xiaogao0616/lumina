import type { Metadata } from 'next'
import { NfaLesson } from '../../../components/lesson-nfa'

export const metadata: Metadata = { title: 'Machines that can guess — Automata Lab' }

export default function Page() {
  return <NfaLesson />
}
