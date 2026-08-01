const UNITS: [number, string][] = [
  [60, 'second'],
  [60, 'minute'],
  [24, 'hour'],
  [7, 'day'],
  [4.348, 'week'],
  [12, 'month'],
  [Number.POSITIVE_INFINITY, 'year'],
];

export function formatRelativeTime(unixSeconds: number): string {
  let diff = Math.max(0, Date.now() / 1000 - unixSeconds);
  for (const [size, name] of UNITS) {
    if (diff < size) {
      const value = Math.floor(diff);
      if (value <= 1 && name === 'second') return 'just now';
      return `${value} ${name}${value === 1 ? '' : 's'} ago`;
    }
    diff /= size;
  }
  return 'a long time ago';
}
