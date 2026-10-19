'use client'

import { Sparkles } from 'lucide-react'
import { EXAMPLE_POOL_SIZE, describeExampleRange, examplePage } from '../lib/accepted-strings'

/** One Generate click's worth of state: the pool computed up front, and which batch of 5 is showing. */
export type ExampleBatch = { pool: string[]; page: number; maxLength: number }

/** Asks for a fresh pool on the first click (or after the graph changes), then pages through it. */
export function nextExampleBatch(current: ExampleBatch | null, compute: () => ExampleBatch | null): ExampleBatch | null {
  return current && current.pool.length > 5 ? { ...current, page: current.page + 1 } : compute()
}

/**
 * The "Generate 5" button and its results. Each further click shows the next 5 strings, shortest
 * first, and once the pool is used up it starts over from the shortest, so the batches cycle.
 */
export function ExampleStrings({ batch, noun, emptyText, disabled, onGenerate, onUse }: {
  batch: ExampleBatch | null; noun: string; emptyText: string; disabled?: boolean
  onGenerate: () => void; onUse: (example: string) => void
}) {
  const page = batch ? examplePage(batch.pool, batch.page) : null
  const paging = !!batch && batch.pool.length > 5
  const wrapped = paging && batch.page > 0 && page!.indices.includes(0)
  const caption = !batch || !batch.pool.length ? '' : !paging
    ? `${batch.pool.length === 1 ? 'The only one' : `All ${batch.pool.length}`} up to length ${batch.maxLength}`
    : `${describeExampleRange(page!.indices)} of ${batch.pool.length >= EXAMPLE_POOL_SIZE ? `the first ${batch.pool.length}` : `${batch.pool.length} up to length ${batch.maxLength}`}${wrapped ? ' · starting over' : ''}`
  return <div className="accepted-examples">
    <button className="secondary-button" type="button" onClick={onGenerate} disabled={disabled}
      title={paging ? 'Show the next 5, shortest first; starts over after the last one' : undefined}>
      <Sparkles size={14} aria-hidden="true" /> {paging ? `Next 5 ${noun}` : `Generate 5 ${noun}`}
    </button>
    {batch && (batch.pool.length
      ? <><ul className="accepted-examples-list" aria-label={`${noun[0].toUpperCase()}${noun.slice(1)}: click one to use it`}>{page!.strings.map((example, index) => <li key={`${page!.indices[index]}`}>
          <button type="button" title="Use as input" onClick={() => onUse(example)}>{example.length ? example : 'ε'}</button>
        </li>)}</ul><span className="accepted-examples-range">{caption}</span></>
      : <span className="accepted-examples-empty">{emptyText}</span>)}
  </div>
}
