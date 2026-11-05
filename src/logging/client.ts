import type { LogEntry, LogFilter, LogPageFilter } from './model'

export async function requestLogs<T>(
  operation: 'record' | 'export' | 'clear' | 'cleanup' | 'page',
  payload?: LogEntry | LogFilter | LogPageFilter
): Promise<T> {
  const result = (await chrome.runtime.sendMessage({ action: 'logging', operation, payload })) as
    | {
        success: boolean
        data?: T
        error?: string
      }
    | undefined
  if (!result?.success) throw new Error(result?.error ?? '日志服务不可用')
  return result.data as T
}
