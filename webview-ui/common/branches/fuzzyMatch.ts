export interface FuzzyMatch {
  score: number;
  indices: number[];
}

// A small "fzf-lite" subsequence matcher: every query character must appear in
// order in the target, with bonuses for consecutive runs and matches right
// after a path/word separator — enough to make "ftwo" prefer "feature/two"
// over an unrelated branch that merely contains the same letters scattered
// further apart.
export function fuzzyMatch(query: string, target: string): FuzzyMatch | null {
  if (!query) return { score: 0, indices: [] };
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  let qi = 0;
  let consecutive = 0;
  let score = 0;
  const indices: number[] = [];

  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      let charScore = 1;
      if (consecutive > 0) charScore += consecutive * 2;
      const prev = t[ti - 1];
      if (ti === 0 || prev === '/' || prev === '-' || prev === '_') charScore += 3;
      score += charScore;
      indices.push(ti);
      consecutive++;
      qi++;
    } else {
      consecutive = 0;
    }
  }

  return qi === q.length ? { score, indices } : null;
}
