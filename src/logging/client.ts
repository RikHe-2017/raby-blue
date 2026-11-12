import type { LogEntry, LogFilter, LogPageFilter } from './model'
import { i18n } from '../locales'

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
  if (!result?.success)
    throw new Error(result?.error ?? i18n.global.t('runtime.logServiceUnavailable'))
  return result.data as T
}
