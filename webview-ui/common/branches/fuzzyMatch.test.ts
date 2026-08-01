import { describe, expect, it } from 'vitest';
import { fuzzyMatch } from './fuzzyMatch';

describe('fuzzyMatch', () => {
  it('matches an empty query against anything with no score', () => {
    expect(fuzzyMatch('', 'main')).toEqual({ score: 0, indices: [] });
  });

  it('matches a subsequence in order', () => {
    const result = fuzzyMatch('ftwo', 'feature/two');
    expect(result).not.toBeNull();
  });

  it('rejects when characters are out of order or missing', () => {
    expect(fuzzyMatch('owt', 'feature/two')).toBeNull(); // reversed
    expect(fuzzyMatch('xyz', 'feature/two')).toBeNull(); // absent
  });

  it('scores a match starting right after a separator higher than a mid-word match', () => {
    // The matcher is greedy-first-match, not globally optimal — it takes the
    // first occurrence of each query character in order. "release/two" (no
    // "t" before the "/") ensures "t" is matched at the separator-adjacent
    // position; "feature/two" would NOT work here since "t" from "feature"
    // itself would greedily match first, understating the real separator bonus.
    const afterSeparator = fuzzyMatch('two', 'release/two');
    const midWord = fuzzyMatch('two', 'atwolegged');
    expect(afterSeparator!.score).toBeGreaterThan(midWord!.score);
  });

  it('scores consecutive-character runs higher than scattered matches', () => {
    const consecutive = fuzzyMatch('main', 'main');
    const scattered = fuzzyMatch('main', 'm-a-i-n-branch');
    expect(consecutive!.score).toBeGreaterThan(scattered!.score);
  });

  it('returns indices that point at the actual matched characters', () => {
    const result = fuzzyMatch('mn', 'main');
    expect(result!.indices).toEqual([0, 3]);
  });
});
