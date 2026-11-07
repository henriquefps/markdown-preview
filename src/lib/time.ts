const DAY = 24 * 60 * 60 * 1000;

/** "just now", "5 min ago", "3 h ago", "yesterday", "3 days ago", "Oct 24". */
export function relativeTime(ms: number, now = Date.now()): string {
  const diff = Math.max(0, now - ms);
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const startOfToday = new Date(now).setHours(0, 0, 0, 0);
  if (ms >= startOfToday) return `${Math.floor(min / 60)} h ago`;
  if (ms >= startOfToday - DAY) return 'yesterday';
  const days = Math.ceil((startOfToday - ms) / DAY);
  if (days < 7) return `${days} days ago`;
  const date = new Date(ms);
  const sameYear = date.getFullYear() === new Date(now).getFullYear();
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) });
}
