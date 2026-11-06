// The app syncs every 15 minutes while it's open, so a complete sync older than
// this means syncs are failing or stopping part way. Only a complete sync
// records its time.
export const SYNC_STALE_AFTER_HOURS = 2

const HOUR_MS = 60 * 60 * 1000

export function isSyncStale(lastSyncedAt: string | null | undefined, now: Date): boolean {
  if (!lastSyncedAt) return true
  return now.getTime() - new Date(lastSyncedAt).getTime() > SYNC_STALE_AFTER_HOURS * HOUR_MS
}
