'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Camera, ImageUp, LoaderCircle, Sparkles, TriangleAlert, X } from 'lucide-react'
import type { AutomatonGraph, TabMode } from '../lib/automaton-graph'
import {
  AI_SETTINGS_KEY,
  callModel,
  repairPrompt,
  defaultBaseUrls,
  defaultModels,
  extractJson,
  readAiSettings,
  specToResult,
  systemPrompt,
  userPrompt,
  type AiImage,
  type AiProvider,
  type AiSettings,
  type AiTarget,
} from '../lib/ai-automaton'
import './ai-builder.css'

export type OpenAiResult = (mode: TabMode, result: { graph?: AutomatonGraph; grammar?: string; title: string }) => void

/** Shrink a photo before sending it: phone pictures are far larger than a model needs to read a diagram. */
async function readImage(file: File): Promise<{ image: AiImage; preview: string }> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, 1280 / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  const preview = canvas.toDataURL('image/jpeg', 0.85)
  return { image: { mediaType: 'image/jpeg', base64: preview.slice(preview.indexOf(',') + 1) }, preview }
}

/** What one generate/recognize run was asked for, kept so a failed run can be reopened and retried. */
type AiRequest = { source: 'text' | 'photo'; target: AiTarget; description: string; photo: { image: AiImage; preview: string } | null }
type AiJob = { id: string; label: string; request: AiRequest; started: number; status: 'running' | 'failed'; error?: string; controller: AbortController }

function describeFailure(caught: unknown): string {
  const message = caught instanceof Error ? caught.message : String(caught)
  return message === 'Failed to fetch'
    ? 'Could not reach the AI service. Check the base URL, and that this provider allows calls from a browser.'
    : message
}

function jobLabel(request: AiRequest): string {
  const text = request.description.trim().replace(/\s+/g, ' ')
  if (request.source === 'photo') return text ? `Photo: ${text}` : 'Photo'
  return text.length > 18 ? `${text.slice(0, 18)}…` : text
}

function AiBuilderDialog({ initial, onStart, onClose }: {
  initial: { request?: AiRequest; error?: string }; onStart: (request: AiRequest, settings: AiSettings) => void; onClose: () => void
}) {
  const [source, setSource] = useState<'text' | 'photo'>(initial.request?.source ?? 'text')
  const [target, setTarget] = useState<AiTarget>(initial.request?.target ?? 'auto')
  const [description, setDescription] = useState(initial.request?.description ?? '')
  const [photo, setPhoto] = useState<{ image: AiImage; preview: string } | null>(initial.request?.photo ?? null)
  const [settings, setSettings] = useState<AiSettings>(() => {
    try { return readAiSettings(localStorage.getItem(AI_SETTINGS_KEY)) } catch { return readAiSettings(null) }
  })
  const [settingsOpen, setSettingsOpen] = useState(!settings.apiKey)
  const [error, setError] = useState(initial.error ?? '')
  const cameraRef = useRef<HTMLInputElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const updateSettings = (patch: Partial<AiSettings>) => setSettings(current => {
    const next = { ...current, ...patch }
    try { localStorage.setItem(AI_SETTINGS_KEY, JSON.stringify(next)) } catch { /* key just won't be remembered */ }
    return next
  })
  const switchProvider = (provider: AiProvider) => updateSettings({ provider, model: defaultModels[provider], baseUrl: defaultBaseUrls[provider] })

  const pickPhoto = async (file: File | undefined) => {
    if (!file) return
    setError('')
    try { setPhoto(await readImage(file)) } catch { setError('That file could not be read as an image.') }
  }

  const canRun = !!settings.apiKey && (source === 'text' ? !!description.trim() : !!photo)
  const run = () => {
    if (!canRun) return
    onStart({ source, target, description, photo: source === 'photo' ? photo : null }, settings)
    onClose()
  }

  return <div className="modal-overlay" role="presentation" onClick={onClose}>
    <div className="modal-box ai-builder" role="dialog" aria-modal="true" aria-labelledby="ai-builder-title" onClick={event => event.stopPropagation()}
      onKeyDown={event => { event.stopPropagation(); if (event.key === 'Escape') onClose() }}>
      <h3 id="ai-builder-title"><Sparkles className="modal-icon" size={17} aria-hidden="true" /> Build with AI
        <button type="button" className="ai-close" aria-label="Close" onClick={onClose}><X size={14} /></button></h3>
      <div className="ai-segment" role="tablist" aria-label="Source">
        <button type="button" role="tab" aria-selected={source === 'text'} onClick={() => setSource('text')}>Describe a language</button>
        <button type="button" role="tab" aria-selected={source === 'photo'} onClick={() => setSource('photo')}>Recognize a photo</button>
      </div>
      <label className="ai-field">Build a
        <select value={target} onChange={event => setTarget(event.target.value as AiTarget)}>
          <option value="auto">Best fit</option>
          <option value="dfa">DFA</option>
          <option value="nfa">NFA</option>
          <option value="pda">PDA</option>
          <option value="tm">Turing machine</option>
          <option value="cfg">CFG</option>
        </select>
      </label>
      {source === 'photo' && <div className="ai-photo">
        {photo ? <img src={photo.preview} alt="Photo to recognize" /> : <p>Take or choose a photo of a state diagram or grammar.</p>}
        <div className="ai-photo-actions">
          <button type="button" className="modal-button" onClick={() => cameraRef.current?.click()}><Camera size={14} aria-hidden="true" /> Take photo</button>
          <button type="button" className="modal-button" onClick={() => fileRef.current?.click()}><ImageUp size={14} aria-hidden="true" /> Choose image</button>
        </div>
        <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={event => { void pickPhoto(event.target.files?.[0]); event.target.value = '' }} />
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={event => { void pickPhoto(event.target.files?.[0]); event.target.value = '' }} />
      </div>}
      <textarea className="modal-input ai-textarea" value={description} rows={source === 'text' ? 4 : 2} onChange={event => setDescription(event.target.value)}
        placeholder={source === 'text' ? (target === 'tm' ? 'e.g. a Turing machine for strings of a’s, b’s and c’s with equal counts in order, aⁿbⁿcⁿ' : 'e.g. strings over {a, b} with an even number of a’s and ending in b') : 'Optional notes, e.g. “q2 is accepting, the label on the loop is b”'}
        onKeyDown={event => { if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) run() }} />
      <details className="ai-settings" open={settingsOpen} onToggle={event => setSettingsOpen((event.target as HTMLDetailsElement).open)}>
        <summary>AI service{settings.apiKey ? '' : ' (add your API key)'}</summary>
        <label className="ai-field">Provider
          <select value={settings.provider} onChange={event => switchProvider(event.target.value as AiProvider)}>
            <option value="gemini">Google Gemini (free tier)</option>
            <option value="anthropic">Anthropic (Claude)</option>
            <option value="openai">OpenAI-compatible</option>
          </select>
        </label>
        <label className="ai-field">API key
          <input type="password" value={settings.apiKey} autoComplete="off" spellCheck={false} placeholder={settings.provider === 'anthropic' ? 'sk-ant-…' : settings.provider === 'gemini' ? 'AIza…' : 'sk-…'}
            onChange={event => updateSettings({ apiKey: event.target.value.trim() })} />
        </label>
        <label className="ai-field">Model
          <input value={settings.model} spellCheck={false} onChange={event => updateSettings({ model: event.target.value })} />
        </label>
        <label className="ai-field">Base URL
          <input value={settings.baseUrl} spellCheck={false} onChange={event => updateSettings({ baseUrl: event.target.value })} />
        </label>
        {settings.provider === 'gemini' && <p className="ai-note">Get a free key at <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">aistudio.google.com/apikey</a>.</p>}
        <p className="ai-note">Your key stays in this browser and is sent only to the address above. The model must accept images to read photos.</p>
      </details>
      {error && <p className="ai-error" role="alert">{error}</p>}
      <div className="modal-actions">
        <button type="button" className="modal-button" onClick={onClose}>Cancel</button>
        <button type="button" className="modal-button is-primary" disabled={!canRun} onClick={run}
          title="Runs in the background: keep working while the new tab loads">
          {source === 'text' ? 'Generate' : 'Recognize'}
        </button>
      </div>
    </div>
  </div>
}

function JobChip({ job, onOpen, onCancel }: { job: AiJob; onOpen: () => void; onCancel: () => void }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (job.status !== 'running') return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [job.status])
  const running = job.status === 'running'
  const seconds = Math.max(0, Math.floor((now - job.started) / 1000))
  return <div className={`tab-chip ai-job is-${job.status}`}>
    <button type="button" role="tab" aria-selected={false} onClick={onOpen} disabled={running}
      title={running ? `Generating “${job.label}” in the background` : `${job.error} — click to edit and retry`}>
      {running ? <LoaderCircle className="ai-spin" size={12} aria-hidden="true" /> : <TriangleAlert size={12} aria-hidden="true" />}
      <span className="ai-job-label">{job.label}</span>
      <span className="ai-job-state">{running ? `${seconds}s` : 'Failed'}</span>
    </button>
    <button type="button" className="tab-close" aria-label={running ? `Cancel ${job.label}` : `Dismiss ${job.label}`} onClick={onCancel}><X size={12} /></button>
  </div>
}

/**
 * The AI builder's pieces: `open` for the “✦ AI” button in each tab's toolbar, a placeholder tab per run while
 * the model works in the background (so the workspace stays usable), and the dialog. A finished
 * run becomes a real tab through onResult; a failed one stays as a red placeholder that reopens
 * the dialog with the same input and the error.
 */
export function useAiBuilder(onResult: OpenAiResult) {
  const [jobs, setJobs] = useState<AiJob[]>([])
  const [dialog, setDialog] = useState<{ request?: AiRequest; error?: string; jobId?: string } | null>(null)
  const jobsRef = useRef(jobs)
  jobsRef.current = jobs
  useEffect(() => () => { for (const job of jobsRef.current) job.controller.abort() }, [])

  const start = useCallback((request: AiRequest, settings: AiSettings) => {
    const job: AiJob = { id: crypto.randomUUID(), label: jobLabel(request), request, started: Date.now(), status: 'running', controller: new AbortController() }
    setJobs(current => [...current, job])
    const fail = (error: string) => setJobs(current => current.map(item => item.id === job.id ? { ...item, status: 'failed', error } : item))
    void (async () => {
      try {
        const prompt = userPrompt(request.target, request.description, request.source === 'photo')
        const image = request.photo?.image ?? null
        const attempt = (reply: string) => {
          try { return specToResult(extractJson(reply), request.target) } catch (caught) { return { ok: false as const, message: caught instanceof SyntaxError ? `The model’s answer was not valid JSON, even after asking it to fix it (${caught.message}). Try Generate again.` : describeFailure(caught) } }
        }
        const reply = await callModel(settings, systemPrompt(), prompt, image, job.controller.signal)
        let result = attempt(reply)
        // One more round when the answer is broken JSON or fails the checks: show the model its mistake.
        if (!result.ok) result = attempt(await callModel(settings, systemPrompt(), repairPrompt(prompt, reply, result.message), image, job.controller.signal))
        if (!result.ok) return fail(result.message)
        setJobs(current => current.filter(item => item.id !== job.id))
        onResult(result.mode, result.mode === 'cfg' ? { grammar: result.grammar, title: result.title } : { graph: result.graph, title: result.title })
      } catch (caught) {
        if (!job.controller.signal.aborted) fail(describeFailure(caught))
      }
    })()
  }, [onResult])
  const remove = (job: AiJob) => {
    job.controller.abort()
    setJobs(current => current.filter(item => item.id !== job.id))
  }

  return {
    chips: jobs.map(job => <JobChip key={job.id} job={job} onCancel={() => remove(job)}
      onOpen={() => setDialog({ request: job.request, error: job.error, jobId: job.id })} />),
    open: () => setDialog({}),
    dialog: dialog && <AiBuilderDialog initial={dialog} onClose={() => setDialog(null)} onStart={(request, settings) => {
      const retried = dialog.jobId && jobsRef.current.find(job => job.id === dialog.jobId)
      if (retried) remove(retried)
      start(request, settings)
    }} />,
  }
}
