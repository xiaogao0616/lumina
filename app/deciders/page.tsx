import type { Metadata } from 'next'
import { DecidersPage } from '../../components/deciders'

export const metadata: Metadata = { title: 'Deciders — Automata Lab' }

export default function Deciders() {
  return <DecidersPage />
}
