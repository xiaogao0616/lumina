import { readSavedEditor, readSavedGrammar, type SavedEditor, type SavedGrammar } from './editor-storage'

/**
 * Share links carry a whole tab in the URL fragment (after #share=), so nothing is uploaded: the
 * fragment never reaches a server. The save is deflated when the browser can, then written as
 * URL-safe base64. A leading "z" marks deflated data and "j" plain JSON.
 */

export type ShareContent = SavedEditor | SavedGrammar

export const SHARE_PREFIX = 'share='

function toBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000))
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(text: string): Uint8Array {
  const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(binary, char => char.charCodeAt(0))
}

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const output = new Blob([bytes as BlobPart]).stream().pipeThrough(stream)
  return new Uint8Array(await new Response(output).arrayBuffer())
}

/** The text after "#share=" for this tab's save. */
export async function encodeShare(content: ShareContent): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(content))
  if (typeof CompressionStream === 'function') {
    try { return `z${toBase64Url(await pipe(bytes, new CompressionStream('deflate-raw')))}` } catch { /* fall back to plain JSON */ }
  }
  return `j${toBase64Url(bytes)}`
}

/** Reads a share code back, with the same checks as a file import. Throws if it is damaged or not a save. */
export async function decodeShare(code: string): Promise<ShareContent> {
  const body = fromBase64Url(code.slice(1))
  let json: string
  if (code[0] === 'z') {
    if (typeof DecompressionStream !== 'function') throw new Error('This browser cannot open compressed links.')
    json = new TextDecoder().decode(await pipe(body, new DecompressionStream('deflate-raw')))
  } else if (code[0] === 'j') json = new TextDecoder().decode(body)
  else throw new Error('Unknown share link format')
  const value = JSON.parse(json) as { mode?: unknown }
  return value.mode === 'cfg' ? readSavedGrammar(json) : readSavedEditor(json)
}

/** The share code in a location hash like "#share=z…", or null when there is none. */
export function shareCodeFromHash(hash: string): string | null {
  const fragment = hash.startsWith('#') ? hash.slice(1) : hash
  return fragment.startsWith(SHARE_PREFIX) && fragment.length > SHARE_PREFIX.length + 1 ? fragment.slice(SHARE_PREFIX.length) : null
}
