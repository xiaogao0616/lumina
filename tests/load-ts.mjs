import { readFileSync } from 'node:fs'
import { dirname, extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const ts = require('typescript')
const libRoot = fileURLToPath(new URL('../lib/', import.meta.url))

export function loadTs(entryFromLib) {
  const cache = new Map()
  const load = (absolute) => {
    if (cache.has(absolute)) return cache.get(absolute).exports
    const source = readFileSync(absolute, 'utf8')
    const compiled = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
      fileName: absolute,
    }).outputText
    const module = { exports: {} }
    cache.set(absolute, module)
    const localRequire = (id) => {
      if (id.startsWith('.')) {
        const resolved = join(dirname(absolute), id) + (extname(id) ? '' : '.ts')
        return load(resolved)
      }
      return require(id)
    }
    new Function('exports', 'module', 'require', compiled)(module.exports, module, localRequire)
    return module.exports
  }
  return load(join(libRoot, entryFromLib))
}
