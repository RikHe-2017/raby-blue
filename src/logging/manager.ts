import type { createLogDatabase } from './database'
import { createLogEntry, normalizeLoggingPreferences, retentionCutoff } from './model'
import type { LogEntry, LogFilter, LoggingPreferences } from './model'

export function createLogManager(
  database: ReturnType<typeof createLogDatabase>,
  readPreferences: () => Promise<LoggingPreferences>,
  clock = Date.now
) {
  let queue: Promise<unknown> = Promise.resolve()
  const enqueue = <T>(run: () => Promise<T>): Promise<T> => {
    const operation = queue.catch(() => {}).then(run)
    queue = operation
    return operation
  }
  const cleanup = async () => {
    const preferences = normalizeLoggingPreferences(await readPreferences())
    await database.prune(retentionCutoff(clock(), preferences.retentionDays))
  }

  return {
    record: (entry: LogEntry) =>
      enqueue(async () => {
        const preferences = normalizeLoggingPreferences(await readPreferences())
        if (!preferences.levels.includes(entry.level)) return
        const timestamp = Number.isFinite(entry.timestamp)
          ? Math.min(entry.timestamp, clock())
          : clock()
        if (timestamp < retentionCutoff(clock(), preferences.retentionDays)) return
        await database.add(
          createLogEntry(entry.level, entry.source, [entry.message, ...entry.details], timestamp)
        )
      }),
    cleanup: () => enqueue(cleanup),
    clear: () => enqueue(() => database.clear()),
    export: (filter: LogFilter) => {
      const upperBound = Math.min(filter.end ?? Infinity, clock())
      return enqueue(async () => {
        await cleanup()
        return database.query({ ...filter, end: upperBound })
      })
    }
  }
}
