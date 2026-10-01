# Automata Lab

A visual editor for building finite automata and testing strings against them, built with
[Next.js](https://nextjs.org) and [React Flow](https://reactflow.dev).

`/dfa` and `/nfa` both open the same workspace: a browser-tab-style strip that can hold any mix of DFA
and NFA tabs, each with its own independent, separately-saved graph. The NFA lab can convert to an
equivalent DFA by subset construction; the DFA lab can copy itself into the NFA lab — either way,
converting always opens the result as a new tab in the same workspace rather than overwriting anything.

Live: https://xiaogao0616.github.io/lumina/

## Getting started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` | Static export into `out/` |
| `npm run typecheck` | Generate Next.js route types, then `tsc --noEmit` |
| `npm test` | Simulator, DFA rules, conversion, and storage tests (`node --test`) |

## Deployment

Every push to `main` is built and published to GitHub Pages by
[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml).

The site is served from the `/lumina` subpath, so the workflow passes the path reported by
`actions/configure-pages` to the build as `NEXT_PUBLIC_BASE_PATH`, which `next.config.mjs`
uses as `basePath`. The variable is empty during local development, so the app still runs at
the root of `localhost:3000`.

To build a subpath-hosted export locally:

```bash
NEXT_PUBLIC_BASE_PATH=/lumina npm run build
```
