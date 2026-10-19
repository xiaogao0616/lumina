'use client'

import { useEffect, useRef, useState } from 'react'
import { Camera, ImageUp, Sparkles, X } from 'lucide-react'
import type { AutomatonGraph, TabMode } from '../lib/automaton-graph'
import {
  AI_SETTINGS_KEY,
  callModel,
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

export type OpenAiResult = (mode: TabMode, result: { graph?: AutomatonGraph; grammar?: string; title: string }) => void

/** Shrink a photo before sending it: phone pictures are far larger than a model needs to read a diagram. */
async function readImage(file: File): Promise<{ image: AiImage; preview: string }> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, 1568 / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  const preview = canvas.toDataURL('image/jpeg', 0.85)
  return { image: { mediaType: 'image/jpeg', base64: preview.slice(preview.indexOf(',') + 1) }, preview }
}

function AiBuilderDialog({ defaultTarget, onResult, onClose }: { defaultTarget: AiTarget; onResult: OpenAiResult; onClose: () => void }) {
  const [source, setSource] = useState<'text' | 'photo'>('text')
  const [target, setTarget] = useState<AiTarget>(defaultTarget)
  const [description, setDescription] = useState('')
  const [photo, setPhoto] = useState<{ image: AiImage; preview: string } | null>(null)
  const [settings, setSettings] = useState<AiSettings>(() => {
    try { return readAiSettings(localStorage.getItem(AI_SETTINGS_KEY)) } catch { return readAiSettings(null) }
  })
  const [settingsOpen, setSettingsOpen] = useState(!settings.apiKey)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const abortRef = useRef<AbortController | null>(null)
  const cameraRef = useRef<HTMLInputElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  useEffect(() => () => abortRef.current?.abort(), [])

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

  const canRun = !busy && !!settings.apiKey && (source === 'text' ? !!description.trim() : !!photo)
  const run = async () => {
    if (!canRun) return
    setBusy(true)
    setError('')
    const controller = new AbortController()
    abortRef.current = controller
    try {
      const reply = await callModel(settings, systemPrompt(), userPrompt(target, description, source === 'photo'), source === 'photo' ? photo!.image : null, controller.signal)
      const result = specToResult(extractJson(reply), target)
      if (!result.ok) { setError(result.message); return }
      onResult(result.mode, result.mode === 'cfg' ? { grammar: result.grammar, title: result.title } : { graph: result.graph, title: result.title })
      onClose()
    } catch (caught) {
      if (controller.signal.aborted) return
      const message = caught instanceof Error ? caught.message : String(caught)
      setError(message === 'Failed to fetch'
        ? 'Could not reach the AI service. Check the base URL, and that this provider allows calls from a browser.'
        : message)
    } finally {
      setBusy(false)
    }
  }

  return <div className="modal-overlay" role="presentation" onClick={busy ? undefined : onClose}>
    <div className="modal-box ai-builder" role="dialog" aria-modal="true" aria-labelledby="ai-builder-title" onClick={event => event.stopPropagation()}
      onKeyDown={event => { event.stopPropagation(); if (event.key === 'Escape' && !busy) onClose() }}>
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
        placeholder={source === 'text' ? 'e.g. strings over {a, b} with an even number of a’s and ending in b' : 'Optional notes, e.g. “q2 is accepting, the label on the loop is b”'}
        onKeyDown={event => { if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) void run() }} />
      <details className="ai-settings" open={settingsOpen} onToggle={event => setSettingsOpen((event.target as HTMLDetailsElement).open)}>
        <summary>AI service{settings.apiKey ? '' : ' (add your API key)'}</summary>
        <label className="ai-field">Provider
          <select value={settings.provider} onChange={event => switchProvider(event.target.value as AiProvider)}>
            <option value="anthropic">Anthropic (Claude)</option>
            <option value="openai">OpenAI-compatible</option>
          </select>
        </label>
        <label className="ai-field">API key
          <input type="password" value={settings.apiKey} autoComplete="off" spellCheck={false} placeholder={settings.provider === 'anthropic' ? 'sk-ant-…' : 'sk-…'}
            onChange={event => updateSettings({ apiKey: event.target.value.trim() })} />
        </label>
        <label className="ai-field">Model
          <input value={settings.model} spellCheck={false} onChange={event => updateSettings({ model: event.target.value })} />
        </label>
        <label className="ai-field">Base URL
          <input value={settings.baseUrl} spellCheck={false} onChange={event => updateSettings({ baseUrl: event.target.value })} />
        </label>
        <p className="ai-note">Your key stays in this browser and is sent only to the address above. The model must accept images to read photos.</p>
      </details>
      {error && <p className="ai-error" role="alert">{error}</p>}
      <div className="modal-actions">
        <button type="button" className="modal-button" onClick={() => busy ? abortRef.current?.abort() : onClose()}>Cancel</button>
        <button type="button" className="modal-button is-primary" disabled={!canRun} onClick={() => void run()}>
          {busy ? 'Working…' : source === 'text' ? 'Generate' : 'Recognize'}
        </button>
      </div>
    </div>
  </div>
}

/** The “✦ AI” button at the end of the tab strip; a successful result opens in a new tab. */
export function AiBuilderButton({ defaultTarget, onResult }: { defaultTarget: AiTarget; onResult: OpenAiResult }) {
  const [open, setOpen] = useState(false)
  return <>
    <button type="button" className="tab-add is-ai" aria-label="Build with AI" title="Generate from a description, or recognize a photo" onClick={() => setOpen(true)}>
      <Sparkles size={12} aria-hidden="true" /> AI
    </button>
    {open && <AiBuilderDialog defaultTarget={defaultTarget} onResult={onResult} onClose={() => setOpen(false)} />}
  </>
}
