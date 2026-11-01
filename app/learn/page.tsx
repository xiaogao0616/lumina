import type { Metadata } from 'next'
import { LessonIndex } from '../../components/lesson-index'

export const metadata: Metadata = { title: 'Lessons — Automata Lab' }

export default function LearnPage() {
  return <LessonIndex />
}
