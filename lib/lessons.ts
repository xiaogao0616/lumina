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
