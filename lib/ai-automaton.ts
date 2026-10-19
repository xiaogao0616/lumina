import { SOURCE_COLORS, type AutomatonGraph, type AutomatonMode, type AutomatonState, type TabMode } from './automaton-graph'
import { parseGrammar } from './cfg'
import { graphToSavedEditor, readSavedEditor } from './editor-storage'
import { layoutPoint } from './nfa-to-dfa'
import { formatPdaRule, parsePdaRule } from './pda'

/**
 * Building a DFA/NFA/PDA/CFG from a sentence ("strings over {a,b} ending in ab") or a photo of a
 * hand-drawn diagram. The site has no server, so the browser calls a vision LLM directly with the
 * user's own key; this file holds the provider-independent parts: the prompt, and turning the
 * model's JSON reply into something the editor can load. Nothing the model says is trusted — every
 * result goes through the same validators as an imported save.
 */

export type AiTarget = TabMode | 'auto'

/** What the model is asked to reply with. */
export type AiSpec = {
  type: TabMode
  title?: string
  alphabet?: string[]
  states?: { name: string; start?: boolean; accept?: boolean }[]
  transitions?: { from: string; to: string; symbols: string[] }[]
  grammar?: string
  explanation?: string
  error?: string
}

export type AiResult =
  | { ok: true; mode: AutomatonMode; graph: AutomatonGraph; title: string; explanation: string }
  | { ok: true; mode: 'cfg'; grammar: string; title: string; explanation: string }
  | { ok: false; message: string }

const EPSILON = 'ε'

export function systemPrompt(): string {
  return `You build formal-language machines for an automata editor. Reply with ONE JSON object and nothing else (no prose, no code fences).

Shape:
{
  "type": "dfa" | "nfa" | "pda" | "cfg",
  "title": short name, at most 24 characters,
  "alphabet": ["a", "b"],            // input characters, each exactly one character
  "states": [{ "name": "q0", "start": true, "accept": false }, ...],
  "transitions": [{ "from": "q0", "to": "q1", "symbols": ["a"] }, ...],
  "grammar": "S → aSb | ε",           // only for type "cfg", one rule per line
  "explanation": one or two sentences on how it works, in the language the user wrote in,
  "error": only if you cannot do it: say why, in the user's language
}

Rules:
- Exactly one state has "start": true. Any number may have "accept": true (the start state may too).
- Every symbol is one character. Use "ε" for the empty string (NFA and PDA only, never in a DFA).
- DFA: deterministic; at most one move per state and character. Missing moves are allowed (they reject).
- PDA: each entry in "symbols" is a rule "a,X→YZ": read a (or ε), pop X (or ε), push YZ (or ε); the first pushed character ends on top. The stack starts empty, so push a bottom marker like $ yourself if needed. Acceptance is by final state after reading all input.
- CFG: nonterminals are single uppercase letters A–Z, the first rule's left side is the start symbol, terminals are any other single characters, ε is the empty string. Leave states and transitions out.
- Keep machines small and correct: prefer the minimal DFA, and name states q0, q1, ... unless names are given.
- When reading a photo: copy the drawing faithfully (its state names, start arrow, double circles for accepting states, every edge label) instead of fixing or redesigning it. An unlabelled arrow into a state marks the start state.`
}

export function userPrompt(target: AiTarget, description: string, fromImage: boolean): string {
  const kind = target === 'auto' ? 'whichever of DFA, NFA, PDA or CFG fits best' : `a ${target.toUpperCase()}`
  const task = fromImage
    ? `Recognize the automaton or grammar in this photo and return it as ${kind}.`
    : `Build ${kind} for this language.`
  const note = description.trim()
  return note ? `${task}\n\n${fromImage ? 'Notes from the user' : 'Language'}: ${note}` : task
}

/** Pull the first JSON object out of a reply, tolerating code fences or a sentence around it. */
export function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  const body = fenced ? fenced[1] : text
  const start = body.indexOf('{')
  const end = body.lastIndexOf('}')
  if (start < 0 || end <= start) throw new Error('The model did not return JSON.')
  return JSON.parse(body.slice(start, end + 1))
}

const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
const isTabMode = (value: unknown): value is TabMode => value === 'dfa' || value === 'nfa' || value === 'pda' || value === 'cfg'

function normalizeSymbol(raw: string): string {
  const value = raw.trim()
  return /^(ε|e|eps|epsilon|λ|lambda)$/i.test(value) || value === '' ? EPSILON : value.normalize('NFC')
}

function normalizePdaRule(raw: string): string | null {
  const compact = raw.replace(/\s+/g, '').replace(/->|⟶|→/, '→')
  const match = compact.match(/^([^,]*),([^→]*)→(.*)$/)
  if (!match) return null
  const part = (value: string) => normalizeSymbol(value)
  const rule = parsePdaRule(`${part(match[1])},${part(match[2])}→${part(match[3])}`)
  return rule ? formatPdaRule(rule) : null
}

/** Lay states out left to right by distance from the start state, like the regex and subset constructions. */
function layout(states: AutomatonState[], edges: { source: string; target: string }[]): void {
  const start = states.find(state => state.kind === 'start')
  const layer = new Map<string, number>()
  if (start) {
    layer.set(start.id, 0)
    const queue = [start.id]
    while (queue.length) {
      const id = queue.shift()!
      for (const edge of edges) {
        if (edge.source === id && !layer.has(edge.target)) { layer.set(edge.target, layer.get(id)! + 1); queue.push(edge.target) }
      }
    }
  }
  const deepest = Math.max(0, ...layer.values())
  for (const state of states) if (!layer.has(state.id)) layer.set(state.id, deepest + 1)
  const buckets = new Map<number, string[]>()
  for (const state of states) buckets.set(layer.get(state.id)!, [...(buckets.get(layer.get(state.id)!) ?? []), state.id])
  for (const state of states) {
    const bucket = buckets.get(layer.get(state.id)!)!
    state.position = layoutPoint(layer.get(state.id)!, bucket.indexOf(state.id), bucket.length)
  }
}

/** Turn the model's reply into a loadable graph or grammar, or a message saying what was wrong. */
export function specToResult(raw: unknown, target: AiTarget): AiResult {
  if (!record(raw)) return { ok: false, message: 'The model reply was not a JSON object.' }
  if (typeof raw.error === 'string' && raw.error.trim()) return { ok: false, message: raw.error.trim() }
  const type = isTabMode(raw.type) ? raw.type : target !== 'auto' ? target : null
  if (!type) return { ok: false, message: 'The model did not say whether this is a DFA, NFA, PDA or CFG.' }
  const title = (typeof raw.title === 'string' && raw.title.trim() ? raw.title.trim() : `AI ${type.toUpperCase()}`).slice(0, 32)
  const explanation = typeof raw.explanation === 'string' ? raw.explanation.trim() : ''

  if (type === 'cfg') {
    const grammar = typeof raw.grammar === 'string' ? raw.grammar.trim() : ''
    const parsed = parseGrammar(grammar)
    if (!parsed.ok) return { ok: false, message: `The grammar did not parse: ${parsed.message}` }
    return { ok: true, mode: 'cfg', grammar, title, explanation }
  }

  const rawStates = Array.isArray(raw.states) ? raw.states : []
  if (!rawStates.length) return { ok: false, message: 'The model returned no states.' }
  const states: AutomatonState[] = []
  const idByName = new Map<string, string>()
  for (const [index, item] of rawStates.entries()) {
    if (!record(item) || typeof item.name !== 'string' || !item.name.trim()) return { ok: false, message: 'Every state needs a name.' }
    const name = item.name.trim()
    if (idByName.has(name)) return { ok: false, message: `State "${name}" appears twice.` }
    const start = item.start === true
    const accept = item.accept === true
    const id = `s${index}`
    idByName.set(name, id)
    states.push({
      id, label: name, kind: start ? 'start' : accept ? 'accept' : 'state',
      ...(start && accept ? { accepting: true } : {}),
      position: { x: 0, y: 0 }, color: SOURCE_COLORS[index % SOURCE_COLORS.length],
    })
  }
  const starts = states.filter(state => state.kind === 'start').length
  if (starts !== 1) return { ok: false, message: starts ? 'The model marked more than one start state.' : 'The model did not mark a start state.' }

  const alphabet = new Set<string>()
  for (const symbol of Array.isArray(raw.alphabet) ? raw.alphabet : []) {
    if (typeof symbol === 'string' && normalizeSymbol(symbol) !== EPSILON) alphabet.add(normalizeSymbol(symbol))
  }
  // Edges between the same pair of states are one edge with several symbols in the editor.
  const merged = new Map<string, { source: string; target: string; symbols: string[] }>()
  for (const item of Array.isArray(raw.transitions) ? raw.transitions : []) {
    if (!record(item) || typeof item.from !== 'string' || typeof item.to !== 'string') return { ok: false, message: 'A transition is missing its from/to state.' }
    const source = idByName.get(item.from.trim())
    const target = idByName.get(item.to.trim())
    if (!source || !target) return { ok: false, message: `A transition uses an unknown state (${item.from} → ${item.to}).` }
    const symbols = Array.isArray(item.symbols) ? item.symbols : typeof item.symbols === 'string' ? String(item.symbols).split(',') : []
    const key = `${source}→${target}`
    const edge = merged.get(key) ?? { source, target, symbols: [] }
    for (const rawSymbol of symbols) {
      if (typeof rawSymbol !== 'string') continue
      let symbol: string
      if (type === 'pda') {
        const rule = normalizePdaRule(rawSymbol)
        if (!rule) return { ok: false, message: `"${rawSymbol}" is not a PDA rule like a,X→YZ.` }
        symbol = rule
        const input = parsePdaRule(rule)!.input
        if (input) alphabet.add(input)
      } else {
        symbol = normalizeSymbol(rawSymbol)
        if (symbol === EPSILON) {
          if (type === 'dfa') return { ok: false, message: 'A DFA cannot have ε moves; try NFA instead.' }
        } else if (Array.from(symbol).length !== 1) {
          return { ok: false, message: `Transition symbol "${symbol}" must be a single character.` }
        } else alphabet.add(symbol)
      }
      if (!edge.symbols.includes(symbol)) edge.symbols.push(symbol)
    }
    merged.set(key, edge)
  }
  for (const symbol of alphabet) if (Array.from(symbol).length !== 1) return { ok: false, message: `Alphabet symbol "${symbol}" must be a single character.` }

  const transitions = [...merged.values()].map((edge, index) => ({ id: `e${index}`, ...edge }))
  if (type === 'dfa') {
    const seen = new Set<string>()
    for (const edge of transitions) for (const symbol of edge.symbols) {
      const key = `${edge.source}\u0001${symbol}`
      if (seen.has(key)) return { ok: false, message: `Not deterministic: state "${states.find(state => state.id === edge.source)!.label}" has two moves on "${symbol}". Try NFA instead.` }
      seen.add(key)
    }
  }
  layout(states, transitions)
  const graph: AutomatonGraph = { states, transitions, symbols: [...alphabet].sort((a, b) => a.localeCompare(b)) }
  try {
    readSavedEditor(JSON.stringify(graphToSavedEditor(type, graph)), type)
  } catch {
    return { ok: false, message: 'The model returned a machine the editor cannot load.' }
  }
  return { ok: true, mode: type, graph, title, explanation }
}

// --- Providers, all called straight from the browser with the user's own key. Gemini (free tier
// from Google AI Studio) goes through Google's OpenAI-compatible endpoint. ---

export type AiProvider = 'gemini' | 'anthropic' | 'openai'
export type AiSettings = { provider: AiProvider; apiKey: string; model: string; baseUrl: string }
export type AiImage = { mediaType: string; base64: string }

export const AI_SETTINGS_KEY = 'automata-lab.ai-settings.v1'
export const defaultModels: Record<AiProvider, string> = { gemini: 'gemini-flash-latest', anthropic: 'claude-sonnet-5-5', openai: 'gpt-4o' }
export const defaultBaseUrls: Record<AiProvider, string> = {
  gemini: 'https://generativelanguage.googleapis.com/v1beta/openai',
  anthropic: 'https://api.anthropic.com',
  openai: 'https://api.openai.com/v1',
}

export function readAiSettings(raw: string | null): AiSettings {
  const fallback: AiSettings = { provider: 'gemini', apiKey: '', model: defaultModels.gemini, baseUrl: defaultBaseUrls.gemini }
  try {
    const value: unknown = raw ? JSON.parse(raw) : null
    if (!record(value)) return fallback
    const provider: AiProvider = value.provider === 'openai' || value.provider === 'anthropic' ? value.provider : 'gemini'
    const text = (field: unknown, otherwise: string) => typeof field === 'string' && field.trim() ? field.trim() : otherwise
    return { provider, apiKey: text(value.apiKey, ''), model: text(value.model, defaultModels[provider]), baseUrl: text(value.baseUrl, defaultBaseUrls[provider]) }
  } catch {
    return fallback
  }
}

async function failure(response: Response): Promise<Error> {
  let detail = ''
  try {
    const body: unknown = await response.json()
    const error = record(body) ? body.error : undefined
    detail = record(error) && typeof error.message === 'string' ? error.message : typeof error === 'string' ? error : ''
  } catch { /* not JSON */ }
  return new Error(`The AI service answered ${response.status}${detail ? `: ${detail}` : ''}`)
}

export async function callModel(settings: AiSettings, system: string, prompt: string, image: AiImage | null, signal?: AbortSignal): Promise<string> {
  const base = settings.baseUrl.replace(/\/+$/, '')
  if (settings.provider === 'anthropic') {
    const content: unknown[] = []
    if (image) content.push({ type: 'image', source: { type: 'base64', media_type: image.mediaType, data: image.base64 } })
    content.push({ type: 'text', text: prompt })
    const response = await fetch(`${base}/v1/messages`, {
      method: 'POST', signal,
      headers: {
        'content-type': 'application/json',
        'x-api-key': settings.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({ model: settings.model, max_tokens: 4096, system, messages: [{ role: 'user', content }] }),
    })
    if (!response.ok) throw await failure(response)
    const body = await response.json() as { content?: { type: string; text?: string }[] }
    return (body.content ?? []).filter(block => block.type === 'text').map(block => block.text ?? '').join('')
  }
  const content: unknown[] = [{ type: 'text', text: prompt }]
  if (image) content.push({ type: 'image_url', image_url: { url: `data:${image.mediaType};base64,${image.base64}` } })
  const response = await fetch(`${base}/chat/completions`, {
    method: 'POST', signal,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${settings.apiKey}` },
    body: JSON.stringify({ model: settings.model, messages: [{ role: 'system', content: system }, { role: 'user', content }] }),
  })
  if (!response.ok) throw await failure(response)
  const body = await response.json() as { choices?: { message?: { content?: string } }[] }
  return body.choices?.[0]?.message?.content ?? ''
}
