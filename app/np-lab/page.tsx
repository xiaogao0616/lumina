import type { Metadata } from 'next'
import { NpLabPage } from '../../components/np-lab'

export const metadata: Metadata = { title: 'NP reduction lab — Automata Lab' }

export default function NpLab() {
  return <NpLabPage />
}
