import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loadTs } from './load-ts.mjs'

const { readLessonProgress, resumeLesson } = loadTs('lessons.ts')
const free = [false, false, false, true]

test('saved lesson progress is read defensively', () => {
  assert.deepEqual(readLessonProgress(null), {})
  assert.deepEqual(readLessonProgress('not json'), {})
  assert.deepEqual(readLessonProgress('{"dfa":{"step":2,"solved":[true,true,"x"]},"nope":{"step":1,"solved":[]},"nfa":{"step":-1,"solved":[]}}'),
    { dfa: { step: 2, solved: [true, true, false] } })
})

test('an unfinished lesson opens on the first step still to do', () => {
  assert.deepEqual(resumeLesson(undefined, free, false), { step: 0, solved: [false, false, false, true] })
  assert.deepEqual(resumeLesson({ step: 0, solved: [true, true, false, false] }, free, false), { step: 2, solved: [true, true, false, true] })
  assert.equal(resumeLesson({ step: 3, solved: [true, false, true, false] }, free, false).step, 1)
  assert.equal(resumeLesson({ step: 1, solved: [true, true, true, true] }, free, false).step, 3)
})

test('a finished lesson opens at step 1 with every step unlocked', () => {
  assert.deepEqual(resumeLesson({ step: 3, solved: [true, false, false, true] }, free, true), { step: 0, solved: [true, true, true, true] })
})
