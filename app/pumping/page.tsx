import type { Metadata } from 'next'
import { PumpingGame } from '../../components/pumping-game'

export const metadata: Metadata = { title: 'Pumping lemma game — Automata Lab' }

export default function PumpingPage() {
  return <PumpingGame />
}
