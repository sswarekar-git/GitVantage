import { describe, expect, it } from 'vitest';
import { formatRelativeTime } from './relativeTime';

const NOW = Date.parse('2026-08-01T12:00:00Z') / 1000;

function ago(seconds: number): number {
  return NOW - seconds;
}

describe('formatRelativeTime', () => {
  it('reports "just now" for sub-second/second-old timestamps', () => {
    const label = formatRelativeTimeAt(ago(1));
    expect(label).toBe('just now');
  });

  it('pluralizes correctly at unit boundaries', () => {
    expect(formatRelativeTimeAt(ago(2))).toBe('2 seconds ago');
    expect(formatRelativeTimeAt(ago(60))).toBe('1 minute ago');
    expect(formatRelativeTimeAt(ago(120))).toBe('2 minutes ago');
    expect(formatRelativeTimeAt(ago(3600))).toBe('1 hour ago');
    expect(formatRelativeTimeAt(ago(86400))).toBe('1 day ago');
  });

  it('never reports negative time for clock-skewed future timestamps', () => {
    const label = formatRelativeTimeAt(NOW + 1000);
    expect(label).not.toMatch(/^-/);
  });
});

// formatRelativeTime uses Date.now() internally, so pin it to NOW for
// deterministic assertions rather than depending on wall-clock time.
function formatRelativeTimeAt(unixSeconds: number): string {
  const originalNow = Date.now;
  Date.now = () => NOW * 1000;
  try {
    return formatRelativeTime(unixSeconds);
  } finally {
    Date.now = originalNow;
  }
}
