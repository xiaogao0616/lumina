import type { Metadata } from 'next'
import { NonregularLesson } from '../../../components/lesson-nonregular'

export const metadata: Metadata = { title: 'What finite memory can’t do — Automata Lab' }

export default function Page() {
  return <NonregularLesson />
}
