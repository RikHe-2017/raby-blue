import { createLogEntry } from '../logging/model'
import type { LogEntry, LogLevel } from '../logging/model'
import { requestLogs } from '../logging/client'

let sink: ((entry: LogEntry) => Promise<void>) | undefined

export function setLogSink(next: (entry: LogEntry) => Promise<void>): void {
  sink = next
}

function persist(level: LogLevel, details: unknown[]): void {
  try {
    if (!sink && (typeof chrome === 'undefined' || !chrome.runtime?.id)) return
    const entry = createLogEntry(level, sink ? 'background' : 'popup', details, Date.now())
    const writing = sink ? sink(entry) : requestLogs<void>('record', entry)
    void writing.catch(() => {
      /* Logging failures must not affect business operations. */
    })
  } catch {
    /* Invalid diagnostic values must not affect business operations. */
  }
}

export function logError(...details: unknown[]): void {
  console.log('[error]:', ...details)
  persist('error', details)
}

export function logWarn(...details: unknown[]): void {
  console.log('[warn]:', ...details)
  persist('warning', details)
}

export function logInfo(...details: unknown[]): void {
  console.log('[info]:', ...details)
  persist('info', details)
}
