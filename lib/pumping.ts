/**
 * The pumping lemma for regular languages, played as a game. You want to show a language is not
 * regular: the opponent picks the pumping length p, you pick a string s in the language with
 * |s| ≥ p, the opponent splits s = xyz with |xy| ≤ p and |y| ≥ 1, and you win by finding an i with
 * xyⁱz outside the language. The opponent always picks the split that is hardest for you.
 */

export type PumpingLanguage = {
  id: string
  name: string
  description: string
  alphabet: string[]
  regular: boolean
  contains: (word: string) => boolean
  /** A string that wins for p, the one a textbook proof would use. */
  suggest: (p: number) => string
  /** Why the suggested string works, or why nothing does for a regular language. */
  explanation: string
}

const count = (word: string, char: string) => Array.from(word).filter(item => item === char).length
const isBlock = (word: string, pattern: RegExp) => pattern.test(word)
const isPrime = (n: number) => { if (n < 2) return false; for (let d = 2; d * d <= n; d++) if (n % d === 0) return false; return true }
const isSquare = (n: number) => Number.isInteger(Math.sqrt(n))
const reverse = (word: string) => Array.from(word).reverse().join('')

export const PUMPING_LANGUAGES: PumpingLanguage[] = [
  { id: 'anbn', name: 'aⁿbⁿ', description: 'Some a’s followed by the same number of b’s.', alphabet: ['a', 'b'], regular: false,
    contains: word => isBlock(word, /^a*b*$/) && count(word, 'a') === count(word, 'b'),
    suggest: p => 'a'.repeat(p) + 'b'.repeat(p),
    explanation: 'With s = aᵖbᵖ, |xy| ≤ p forces y to be all a’s. Pumping changes the number of a’s but not the b’s, so xy²z has more a’s than b’s.' },
  { id: 'equal', name: 'Equal a’s and b’s', description: 'Any order, as long as the counts match.', alphabet: ['a', 'b'], regular: false,
    contains: word => count(word, 'a') === count(word, 'b'),
    suggest: p => 'a'.repeat(p) + 'b'.repeat(p),
    explanation: 'Pick aᵖbᵖ again. y sits inside the first p characters, so it is only a’s, and pumping unbalances the counts.' },
  { id: 'more-a', name: 'aⁱbʲ with i > j', description: 'More a’s than b’s, a’s first.', alphabet: ['a', 'b'], regular: false,
    contains: word => isBlock(word, /^a*b*$/) && count(word, 'a') > count(word, 'b'),
    suggest: p => 'a'.repeat(p + 1) + 'b'.repeat(p),
    explanation: 'Take aᵖ⁺¹bᵖ. Pumping up only adds a’s and stays in the language, so pump down: i = 0 removes at least one a and leaves i ≤ j.' },
  { id: 'palindrome', name: 'Even palindromes wwᴿ', description: 'A string followed by its reverse.', alphabet: ['a', 'b'], regular: false,
    contains: word => word.length % 2 === 0 && word === reverse(word),
    suggest: p => `${'a'.repeat(p)}bb${'a'.repeat(p)}`,
    explanation: 'Take aᵖbbaᵖ. y is made of leading a’s, so pumping changes only the left block and the string stops being a palindrome.' },
  { id: 'ww', name: 'Copies ww', description: 'A string written twice.', alphabet: ['a', 'b'], regular: false,
    contains: word => word.length % 2 === 0 && word.slice(0, word.length / 2) === word.slice(word.length / 2),
    suggest: p => `${'a'.repeat(p)}b${'a'.repeat(p)}b`,
    explanation: 'Take aᵖbaᵖb. Pumping y (a’s from the first half) makes the halves different.' },
  { id: 'squares', name: 'aⁿ with n a square', description: 'a repeated 0, 1, 4, 9, 16, … times.', alphabet: ['a'], regular: false,
    contains: word => isBlock(word, /^a*$/) && isSquare(word.length),
    suggest: p => 'a'.repeat(p * p),
    explanation: 'Take a^(p²). Pumping once adds 1 to p a’s, giving a length strictly between p² and (p+1)², which is not a square.' },
  { id: 'primes', name: 'aⁿ with n prime', description: 'a repeated 2, 3, 5, 7, 11, … times.', alphabet: ['a'], regular: false,
    contains: word => isBlock(word, /^a*$/) && isPrime(word.length),
    suggest: p => { let n = p + 2; while (!isPrime(n)) n++; return 'a'.repeat(n) },
    explanation: 'Take aⁿ for a prime n ≥ p + 2. Pumping gives length n + (i − 1)|y|, and i = n + 1 makes that n(1 + |y|), never prime. In practice a small i usually already lands on a composite length.' },
  { id: 'astar-bstar', name: 'a*b* (regular!)', description: 'Any a’s, then any b’s.', alphabet: ['a', 'b'], regular: true,
    contains: word => isBlock(word, /^a*b*$/),
    suggest: p => 'a'.repeat(p) + 'b',
    explanation: 'This language is regular, so the opponent can always win: it chooses y inside a run of one letter, and repeating that run keeps the string in a*b*.' },
  { id: 'ab-star', name: '(ab)* (regular!)', description: 'ab repeated.', alphabet: ['a', 'b'], regular: true,
    contains: word => isBlock(word, /^(ab)*$/),
    suggest: p => 'ab'.repeat(Math.ceil(p / 2)),
    explanation: 'Regular again: y = ab (one whole block) can be pumped any number of times and the string is still (ab)*.' },
]

/** The values of i the game lets you try. */
export const PUMP_CHOICES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]

export type Split = { x: string; y: string; z: string; breaking: number[] }

export const pumped = (split: { x: string; y: string; z: string }, i: number) => split.x + split.y.repeat(i) + split.z

/** Every legal split of s for pumping length p, with the i's (from PUMP_CHOICES) that pump it out of the language. */
export function allSplits(language: PumpingLanguage, s: string, p: number): Split[] {
  const chars = Array.from(s)
  const splits: Split[] = []
  for (let xLength = 0; xLength < Math.min(p, chars.length); xLength++) {
    for (let yLength = 1; xLength + yLength <= Math.min(p, chars.length); yLength++) {
      const split = { x: chars.slice(0, xLength).join(''), y: chars.slice(xLength, xLength + yLength).join(''), z: chars.slice(xLength + yLength).join('') }
      splits.push({ ...split, breaking: PUMP_CHOICES.filter(i => !language.contains(pumped(split, i))) })
    }
  }
  return splits
}

/** The opponent's move: the split with the fewest losing i's, preferring one that survives them all. */
export function opponentSplit(language: PumpingLanguage, s: string, p: number): Split {
  return allSplits(language, s, p).reduce((best, split) => split.breaking.length < best.breaking.length ? split : best)
}

export type StringCheck = { ok: true } | { ok: false; message: string }

export function checkChosenString(language: PumpingLanguage, s: string, p: number): StringCheck {
  const chars = Array.from(s)
  const stray = chars.find(char => !language.alphabet.includes(char))
  if (stray) return { ok: false, message: `“${stray}” is not in the alphabet {${language.alphabet.join(', ')}}.` }
  if (chars.length < p) return { ok: false, message: `s must have length at least p = ${p}; this one has ${chars.length}.` }
  if (!language.contains(s)) return { ok: false, message: 's has to be in the language. This string isn’t.' }
  return { ok: true }
}
