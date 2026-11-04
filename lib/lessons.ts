/** The interactive lessons, in order. Each one lives at /learn/<id>. */
export type LessonInfo = { id: string; number: number; title: string; blurb: string; minutes: number }

export const LESSONS: LessonInfo[] = [
  { id: 'dfa', number: 1, title: 'What is a DFA?', minutes: 5,
    blurb: 'Open a two-button lock, look inside it, and finish your first machine.' },
  { id: 'nfa', number: 2, title: 'Machines that can guess', minutes: 6,
    blurb: 'NFAs follow every arrow at once. See the copies split, die and accept, then meet the DFA twin.' },
  { id: 'regex', number: 3, title: 'Regular expressions', minutes: 6,
    blurb: 'Union, concatenation and star: three ways to describe a pattern. Then write your own.' },
  { id: 'nonregular', number: 4, title: 'What finite memory can’t do', minutes: 6,
    blurb: 'Break a machine that tries to count, find the loop every DFA must have, and see why aⁿbⁿ isn’t regular.' },
  { id: 'cfg', number: 5, title: 'Grammars that grow strings', minutes: 7,
    blurb: 'Rewrite rules that can nest and count. Derive strings by hand, then write a grammar of your own.' },
]

export const lessonById = (id: string) => LESSONS.find(lesson => lesson.id === id)

export const LESSONS_DONE_KEY = 'automata-lab.lessons-done.v1'

export function readLessonsDone(raw: string | null): string[] {
  if (!raw) return []
  try {
    const value: unknown = JSON.parse(raw)
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && !!lessonById(item)) : []
  } catch {
    return []
  }
}

/** How far someone got inside each lesson: the step they were on and which steps they solved. */
export const LESSON_PROGRESS_KEY = 'automata-lab.lesson-progress.v1'
export type LessonProgress = { step: number; solved: boolean[] }

export function readLessonProgress(raw: string | null): Record<string, LessonProgress> {
  if (!raw) return {}
  try {
    const value: unknown = JSON.parse(raw)
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
    const result: Record<string, LessonProgress> = {}
    for (const [id, entry] of Object.entries(value as Record<string, unknown>)) {
      if (!lessonById(id) || !entry || typeof entry !== 'object') continue
      const { step, solved } = entry as { step?: unknown; solved?: unknown }
      if (typeof step !== 'number' || !Number.isInteger(step) || step < 0 || !Array.isArray(solved)) continue
      result[id] = { step, solved: solved.map(item => item === true) }
    }
    return result
  } catch {
    return {}
  }
}

/**
 * Where a lesson should open: a finished lesson opens at step 1 with every step unlocked, so it can be
 * reviewed in any order; an unfinished one opens on the first step still to do, even if the learner
 * had gone back to look at an earlier one.
 */
export function resumeLesson(saved: LessonProgress | undefined, free: boolean[], finished: boolean): LessonProgress {
  if (finished) return { step: 0, solved: free.map(() => true) }
  const solved = free.map((isFree, at) => isFree || saved?.solved[at] === true)
  const firstOpen = solved.findIndex(value => !value)
  return { step: firstOpen === -1 ? free.length - 1 : firstOpen, solved }
}
