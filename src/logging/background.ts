import { createLogDatabase } from './database'
import { createLogManager } from './manager'
import { LOG_LEVELS, normalizeLoggingPreferences } from './model'
import type { LogEntry, LogFilter, LogPageFilter } from './model'
import { setLogSink } from '../utils/logger'
import { i18n } from '../locales'

const ALARM_NAME = 'raby-blue-log-retention'

export function startLogging() {
  const manager = createLogManager(createLogDatabase(), async () => {
    const saved = await chrome.storage.local.get('userPreferences')
    return normalizeLoggingPreferences(saved.userPreferences?.logging)
  })
  const failed = () => {
    console.log('[logging]:', i18n.global.t('runtime.loggingUnavailable'))
  }
  setLogSink(entry =>
    manager.record(entry).catch(error => {
      failed()
      throw error
    })
  )
  const ensureAlarm = async () => {
    if (!(await chrome.alarms.get(ALARM_NAME)))
      await chrome.alarms.create(ALARM_NAME, { periodInMinutes: 60 })
  }
  chrome.alarms.onAlarm.addListener(alarm => {
    if (alarm.name === ALARM_NAME) void manager.cleanup().catch(failed)
  })
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.userPreferences) void manager.cleanup().catch(failed)
  })
  chrome.runtime.onMessage.addListener((request, sender, respond) => {
    if (request?.action !== 'logging' || sender.id !== chrome.runtime.id) return
    // Settings commands are only accepted from extension pages, not website content scripts.
    if (!sender.url?.startsWith(chrome.runtime.getURL(''))) return
    const run = async () => {
      switch (request.operation) {
        case 'page': {
          const filter = request.payload as LogPageFilter | undefined
          if (
            !filter ||
            !LOG_LEVELS.includes(filter.level) ||
            !Number.isSafeInteger(filter.page) ||
            filter.page < 1 ||
            !Number.isSafeInteger(filter.pageSize) ||
            filter.pageSize < 1 ||
            filter.pageSize > 100 ||
            !Number.isSafeInteger((filter.page - 1) * filter.pageSize) ||
            (filter.start !== undefined && !Number.isFinite(filter.start)) ||
            (filter.end !== undefined && !Number.isFinite(filter.end))
          )
            throw new Error(i18n.global.t('runtime.invalidLogPage'))
          return manager.page(filter)
        }
        case 'record': {
          const entry = request.payload as LogEntry | undefined
          if (
            !entry ||
            !LOG_LEVELS.includes(entry.level) ||
            typeof entry.message !== 'string' ||
            typeof entry.source !== 'string' ||
            !Array.isArray(entry.details)
          )
            throw new Error(i18n.global.t('runtime.invalidLog'))
          await manager.record(entry)
          return
        }
        case 'export': {
          const filter = (request.payload ?? {}) as LogFilter
          if (
            (filter.start !== undefined && !Number.isFinite(filter.start)) ||
            (filter.end !== undefined && !Number.isFinite(filter.end)) ||
            (filter.levels !== undefined &&
              (!Array.isArray(filter.levels) ||
                !filter.levels.every(level => LOG_LEVELS.includes(level))))
          )
            throw new Error(i18n.global.t('runtime.invalidLogFilter'))
          return manager.export(filter)
        }
        case 'clear':
          return manager.clear()
        case 'cleanup':
          await manager.cleanup()
          return
        default:
          throw new Error(i18n.global.t('runtime.unsupportedLogOperation'))
      }
    }
    void run()
      .then(data => respond({ success: true, data }))
      .catch(() => {
        failed()
        respond({ success: false, error: i18n.global.t('runtime.logOperationFailed') })
      })
    return true
  })
  void ensureAlarm().catch(failed)
  void manager.cleanup().catch(failed)
}
