'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { ArrowLeft, CircleCheck, CircleX, Dices, Lightbulb, Swords, Wand2, Zap } from 'lucide-react'
import { ThemeToggle } from './theme-toggle'
import {
  PUMPING_LANGUAGES, PUMP_CHOICES, allSplits, checkChosenString, opponentSplit, pumped, type PumpingLanguage, type Split,
} from '../lib/pumping'
import './pumping-game.css'

const randomP = (current?: number) => {
  let p = current ?? 0
  while (p === current) p = 3 + Math.floor(Math.random() * 4)
  return p
}

/** s drawn as tape cells, coloured by the part of the split each character belongs to. */
function Tape({ split, repeat = 1, label }: { split: { x: string; y: string; z: string }; repeat?: number; label?: string }) {
  const cells = [
    ...Array.from(split.x).map(char => ({ char, part: 'x' })),
    ...Array.from({ length: repeat }, (_, copy) => Array.from(split.y).map(char => ({ char, part: copy % 2 ? 'y is-alt' : 'y' }))).flat(),
    ...Array.from(split.z).map(char => ({ char, part: 'z' })),
  ]
  return <div className="pump-tape" aria-label={label}>
    {cells.length ? cells.map((cell, index) => <span key={index} className={`pump-cell is-${cell.part}`}>{cell.char}</span>) : <span className="pump-cell is-empty">ε</span>}
  </div>
}

function SplitLegend({ split }: { split: { x: string; y: string; z: string } }) {
  const show = (part: string) => part || 'ε'
  return <dl className="pump-legend">
    <div className="is-x"><dt>x</dt><dd>{show(split.x)}</dd></div>
    <div className="is-y"><dt>y</dt><dd>{show(split.y)}</dd></div>
    <div className="is-z"><dt>z</dt><dd>{show(split.z)}</dd></div>
  </dl>
}

export function PumpingGame() {
  const [languageId, setLanguageId] = useState(PUMPING_LANGUAGES[0].id)
  const language = PUMPING_LANGUAGES.find(item => item.id === languageId)!
  const [p, setP] = useState(4)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState('')
  const [round, setRound] = useState<{ s: string; split: Split; p: number } | null>(null)
  const [chosenI, setChosenI] = useState<number | null>(null)
  const [showAll, setShowAll] = useState(false)
  const [showProof, setShowProof] = useState(false)

  const reset = (next?: PumpingLanguage) => {
    setRound(null); setChosenI(null); setShowAll(false); setError('')
    if (next) { setLanguageId(next.id); setDraft(''); setShowProof(false) }
  }
  const play = () => {
    const s = draft.trim()
    const check = checkChosenString(language, s, p)
    if (!check.ok) { setError(check.message); return }
    setError('')
    setRound({ s, split: opponentSplit(language, s, p), p })
    setChosenI(null)
    setShowAll(false)
  }
  const splits = useMemo(() => round ? allSplits(language, round.s, round.p) : [], [language, round])
  const result = round && chosenI !== null ? pumped(round.split, chosenI) : null
  const won = result !== null && !language.contains(result)
  const everySplitLoses = splits.length > 0 && splits.every(split => split.breaking.length > 0)

  return <div className="pump-page">
    <nav className="lab-home-nav" aria-label="Site">
      <Link className="brand-home" href="/"><span className="brand-mark" aria-hidden="true"><Zap size={14} /></span>Automata Lab</Link>
      <ThemeToggle />
    </nav>
    <main className="pump-main">
      <header className="pump-hero">
        <Link className="pump-back" href="/"><ArrowLeft size={14} aria-hidden="true" /> Home</Link>
        <p className="eyebrow">Pumping lemma</p>
        <h1>Prove it’s <em>not regular</em></h1>
        <p className="pump-lead">The pumping lemma as a two-player game. You’re trying to show a language isn’t regular, and the computer defends it.
          Win against <b>every</b> split it could make and you have a proof.</p>
        <ol className="pump-rules">
          <li><b>Opponent</b> picks a pumping length <i>p</i>.</li>
          <li><b>You</b> pick a string <i>s</i> in the language with |<i>s</i>| ≥ <i>p</i>.</li>
          <li><b>Opponent</b> splits <i>s</i> = <i>xyz</i> with |<i>xy</i>| ≤ <i>p</i> and |<i>y</i>| ≥ 1.</li>
          <li><b>You</b> pick <i>i</i> ≥ 0. If <i>xyⁱz</i> is not in the language, you win.</li>
        </ol>
      </header>

      <section className="pump-card" aria-labelledby="pump-language">
        <h2 id="pump-language"><span className="pump-step">1</span> Choose a language</h2>
        <div className="pump-languages" role="radiogroup" aria-label="Language">
          {PUMPING_LANGUAGES.map(item => <button key={item.id} type="button" role="radio" aria-checked={item.id === languageId}
            className={`pump-language ${item.regular ? 'is-regular' : ''}`} onClick={() => reset(item)}>
            <b>{item.name}</b><small>{item.description}</small>
          </button>)}
        </div>
      </section>

      <section className="pump-card" aria-labelledby="pump-string">
        <h2 id="pump-string"><span className="pump-step">2</span> Pick your string</h2>
        <div className="pump-p">
          <span className="pump-p-badge">Opponent: <b>p = {p}</b></span>
          <button type="button" className="secondary-button" onClick={() => { setP(current => randomP(current)); reset() }}><Dices size={14} aria-hidden="true" /> Another p</button>
        </div>
        <div className="pump-input-row">
          <label htmlFor="pump-s">s =</label>
          <input id="pump-s" value={draft} spellCheck={false} autoComplete="off" placeholder={`a string in ${language.name}, length ≥ ${p}`}
            aria-invalid={!!error} onChange={event => { setDraft(event.target.value); setError('') }}
            onKeyDown={event => { if (event.key === 'Enter') play() }} />
          <button type="button" className="secondary-button" onClick={() => { setDraft(language.suggest(p)); setError('') }} title="Fill in the string a textbook proof would use"><Wand2 size={14} aria-hidden="true" /> Suggest</button>
          <button type="button" className="primary-button" onClick={play}><Swords size={14} aria-hidden="true" /> Play</button>
        </div>
        <p className="pump-count">{draft ? `length ${Array.from(draft.trim()).length}` : `alphabet {${language.alphabet.join(', ')}}`}</p>
        {error && <p className="pump-error" role="alert"><CircleX size={14} aria-hidden="true" /> {error}</p>}
      </section>

      {round && <section className="pump-card" aria-labelledby="pump-split">
        <h2 id="pump-split"><span className="pump-step">3</span> The opponent splits it</h2>
        <Tape split={round.split} label="s split into x, y and z" />
        <SplitLegend split={round.split} />
        <p className="pump-note">Out of {splits.length} legal splits, the opponent picked the one that’s hardest for you{round.split.breaking.length === 0 ? ': it stays in the language for every i you can pick.' : '.'}</p>
        <h3>Pick <i>i</i></h3>
        <div className="pump-choices" role="group" aria-label="Choose i">
          {PUMP_CHOICES.map(i => <button key={i} type="button" className={`pump-choice ${chosenI === i ? 'is-chosen' : ''}`} aria-pressed={chosenI === i} onClick={() => setChosenI(i)}>{i}</button>)}
        </div>
        {result !== null && <div className={`pump-result ${won ? 'is-win' : 'is-lose'}`} role="status">
          <Tape split={round.split} repeat={chosenI!} label={`x y^${chosenI} z`} />
          <p>{won ? <CircleCheck size={18} aria-hidden="true" /> : <CircleX size={18} aria-hidden="true" />}
            <span><b>xy<sup>{chosenI}</sup>z</b> = <code>{result || 'ε'}</code> {won ? <>is <b>not</b> in {language.name}. You win this round!</> : <>is still in {language.name}. Try another <i>i</i>.</>}</span></p>
        </div>}
        <button type="button" className="text-button pump-all-toggle" aria-expanded={showAll} onClick={() => setShowAll(open => !open)}>{showAll ? 'Hide' : 'Show'} what happens for every split</button>
        {showAll && <>
          <div className="pump-table-wrap"><table className="pump-table">
            <thead><tr><th>x</th><th>y</th><th>z</th>{PUMP_CHOICES.map(i => <th key={i}>i={i}</th>)}</tr></thead>
            <tbody>{splits.map((split, index) => <tr key={index} className={split.breaking.length ? '' : 'is-survivor'}>
              <td>{split.x || 'ε'}</td><td className="is-y">{split.y}</td><td>{split.z || 'ε'}</td>
              {PUMP_CHOICES.map(i => <td key={i} className={split.breaking.includes(i) ? 'is-out' : 'is-in'} title={split.breaking.includes(i) ? 'out of the language: you win' : 'still in the language'}>{split.breaking.includes(i) ? '✗' : '·'}</td>)}
            </tr>)}</tbody>
          </table></div>
          <p className={`pump-conclusion ${everySplitLoses ? 'is-win' : 'is-lose'}`}>{everySplitLoses
            ? <><CircleCheck size={16} aria-hidden="true" /> Every split has an ✗, so whatever the opponent does you can pump out of the language. For this p, s is a winning choice. A proof just has to show this for every p.</>
            : <><CircleX size={16} aria-hidden="true" /> Some split never leaves the language (shaded). With this s the opponent can always win, so it proves nothing{language.regular ? '. For a regular language that’s true of every s.' : '. Try a different s.'}</>}</p>
        </>}
      </section>}

      <section className="pump-card pump-proof">
        <button type="button" className="text-button" aria-expanded={showProof} onClick={() => setShowProof(open => !open)}><Lightbulb size={14} aria-hidden="true" /> {showProof ? 'Hide' : 'Show'} the idea behind {language.name}</button>
        {showProof && <p>{language.explanation}</p>}
      </section>
    </main>
  </div>
}
