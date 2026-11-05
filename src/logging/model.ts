export const LOG_LEVELS = ['info', 'warning', 'error'] as const
export type LogLevel = (typeof LOG_LEVELS)[number]
export const RETENTION_DAYS = [1, 7, 30, 90, 365] as const

export interface LoggingPreferences {
  levels: LogLevel[]
  retentionDays: number
}

export interface LogEntry {
  id?: number
  timestamp: number
  level: LogLevel
  source: string
  message: string
  details: unknown[]
}

export interface LogFilter {
  start?: number
  end?: number
  levels?: LogLevel[]
}

export interface LogPageFilter {
  start?: number
  end?: number
  level: LogLevel
  page: number
  pageSize: number
}

export interface LogPage {
  entries: LogEntry[]
  total: number
}

export function todayRange(timestamp: number): [string, string] {
  const date = new Date(timestamp)
  const day = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  return [day, day]
}

const object = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : {}

export function normalizeLoggingPreferences(value: unknown): LoggingPreferences {
  const saved = object(value)
  const levels = saved.levels
  return {
    levels: Array.isArray(levels) ? LOG_LEVELS.filter(level => levels.includes(level)) : ['error'],
    retentionDays: RETENTION_DAYS.includes(saved.retentionDays as (typeof RETENTION_DAYS)[number])
      ? (saved.retentionDays as number)
      : 30
  }
}

export const retentionCutoff = (now: number, days: number) => now - days * 86400000

const excluded =
  /^(?:body|postData|postDataEntries|requestBody|responseBody|code|script|scriptConfig|proxyConfig|results)$/i

function serialize(value: unknown, ancestors: readonly object[] = [], depth = 0): unknown {
  if (typeof value === 'string') return value
  if (value === null || typeof value === 'boolean' || typeof value === 'number') return value
  if (typeof value !== 'object') return String(value).slice(0, 4096)
  if (ancestors.includes(value)) return '[Circular]'
  if (depth >= 5) return '[Truncated]'
  const next = [...ancestors, value]
  if (value instanceof Error)
    return {
      name: value.name,
      message: value.message,
      stack: value.stack ?? ''
    }
  if (Array.isArray(value)) return value.slice(0, 100).map(item => serialize(item, next, depth + 1))
  return Object.fromEntries(
    Object.entries(value)
      .slice(0, 30)
      .map(([key, item]) => [
        key,
        excluded.test(key) ? '[Not collected]' : serialize(item, next, depth + 1)
      ])
  )
}

export function createLogEntry(
  level: LogLevel,
  source: string,
  values: readonly unknown[],
  timestamp: number
): LogEntry {
  return {
    timestamp,
    level,
    source,
    message: typeof values[0] === 'string' ? values[0] : '运行诊断',
    details: values.slice(typeof values[0] === 'string' ? 1 : 0, 10).map(value => serialize(value))
  }
}

export function changedHeaders(
  before: Record<string, string>,
  after: readonly { name: string; value: string }[]
): Record<string, string> {
  const original = new Map(
    Object.entries(before).map(([name, value]) => [name.toLowerCase(), value])
  )
  return Object.fromEntries(
    after
      .filter(row => original.get(row.name.toLowerCase()) !== row.value)
      .map(row => [row.name, row.value])
  )
}

export function localDateFilter(
  dates: readonly [string, string] | undefined
): Pick<LogFilter, 'start' | 'end'> {
  if (!dates) return {}
  const [start, end] = dates.map(date => new Date(`${date}T00:00:00`))
  end.setDate(end.getDate() + 1)
  return { start: start.getTime(), end: end.getTime() - 1 }
}
