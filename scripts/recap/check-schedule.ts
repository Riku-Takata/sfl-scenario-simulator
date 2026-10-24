/** Next daily archive check: 00:10 or 08:00 JST. */
export function nextArchiveCheckAt(now = new Date()): string {
  const jstOffset = 9 * 60 * 60_000;
  const local = new Date(now.getTime() + jstOffset);
  const midnight = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
  for (const minutes of [10, 8 * 60, 24 * 60 + 10]) {
    const candidate = midnight + minutes * 60_000 - jstOffset;
    if (candidate > now.getTime()) return new Date(candidate).toISOString();
  }
  throw new Error("Unable to determine next archive check");
}
