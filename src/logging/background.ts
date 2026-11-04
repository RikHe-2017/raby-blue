import { createLogDatabase } from './database'
import { createLogManager } from './manager'
import { LOG_LEVELS, normalizeLoggingPreferences } from './model'
import type { LogEntry, LogFilter } from './model'
import { setLogSink } from '../utils/logger'

const ALARM_NAME = 'raby-blue-log-retention'

export function startLogging() {
  const manager = createLogManager(createLogDatabase(), async () => {
    const saved = await chrome.storage.local.get('userPreferences')
    return normalizeLoggingPreferences(saved.userPreferences?.logging)
  })
  const failed = () => {
    console.log('[logging]:', '日志存储暂不可用')
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
        case 'record': {
          const entry = request.payload as LogEntry | undefined
          if (
            !entry ||
            !LOG_LEVELS.includes(entry.level) ||
            typeof entry.message !== 'string' ||
            typeof entry.source !== 'string' ||
            !Array.isArray(entry.details)
          )
            throw new Error('无效的日志')
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
            throw new Error('无效的日志筛选条件')
          return manager.export(filter)
        }
        case 'clear':
          return manager.clear()
        case 'cleanup':
          await manager.cleanup()
          return
        default:
          throw new Error('不支持的日志操作')
      }
    }
    void run()
      .then(data => respond({ success: true, data }))
      .catch(() => {
        failed()
        respond({ success: false, error: '日志操作失败，请检查扩展后台或存储空间后重试' })
      })
    return true
  })
  void ensureAlarm().catch(failed)
  void manager.cleanup().catch(failed)
}
