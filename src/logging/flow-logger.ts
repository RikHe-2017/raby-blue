import { createContextRegistry } from './context-registry'
import type { LogLevel } from './model'
import { logError, logInfo, logWarn } from '../utils/logger'

export type ProxyContext = Readonly<{
  kind: 'proxy'
  tabId: number
  sessionId?: string
  sourceUrl: string
  targetUrl: string
  ruleId: string
  ruleName: string
  requestHeaders?: Readonly<Record<string, string>>
}>
export type ScriptContext = Readonly<{
  kind: 'script'
  executionId: string
  scriptId: string
  scriptName: string
  tabId?: number
}>
export type FlowContext = ProxyContext | ScriptContext
type Entry = { context: FlowContext; applied: boolean; loaded: boolean; failure?: string }

export function createFlowLogger(
  options: {
    capacity?: number
    write?: (level: LogLevel, message: string, details: unknown) => void
  } = {}
) {
  const registry = createContextRegistry<Entry>(options.capacity)
  const write =
    options.write ??
    ((level, message, details) => {
      const logger = level === 'error' ? logError : level === 'warning' ? logWarn : logInfo
      logger(message, details)
    })
  const finish = (key: string, failure?: string) => {
    const entry = registry.take(key)
    if (!entry) return false
    const proxy = entry.context.kind === 'proxy'
    try {
      write(
        failure === undefined ? 'info' : 'error',
        proxy
          ? failure === undefined
            ? '代理请求已处理'
            : '代理请求失败'
          : failure === undefined
            ? '脚本执行完成'
            : '脚本执行失败',
        { ...entry.context, ...(failure === undefined ? {} : { reason: failure }) }
      )
    } catch {
      /* Diagnostics must never affect the operation. */
    }
    return true
  }
  const settle = (key: string, entry: Entry) => {
    if (!registry.replace(key, entry)) return false
    if (entry.applied && (entry.loaded || entry.failure !== undefined))
      return finish(key, entry.failure)
    return true
  }
  const cancel = (key: string) => registry.take(key) !== undefined
  return {
    beginProxy(key: string, context: ProxyContext) {
      const snapshot: ProxyContext = {
        kind: 'proxy',
        tabId: context.tabId,
        ...(context.sessionId === undefined ? {} : { sessionId: context.sessionId }),
        sourceUrl: context.sourceUrl,
        targetUrl: context.targetUrl,
        ruleId: context.ruleId,
        ruleName: context.ruleName,
        ...(context.requestHeaders ? { requestHeaders: { ...context.requestHeaders } } : {})
      }
      return registry.register(key, { context: snapshot, applied: false, loaded: false })
    },
    beginScript(key: string, context: ScriptContext) {
      return registry.register(key, {
        context: {
          kind: 'script',
          executionId: context.executionId,
          scriptId: context.scriptId,
          scriptName: context.scriptName,
          ...(context.tabId === undefined ? {} : { tabId: context.tabId })
        },
        applied: true,
        loaded: false
      })
    },
    applied(key: string, requestHeaders?: Readonly<Record<string, string>>, targetUrl?: string) {
      const entry = registry.get(key)
      if (entry?.context.kind !== 'proxy') return false
      return settle(key, {
        ...entry,
        applied: true,
        context: {
          ...entry.context,
          ...(targetUrl ? { targetUrl } : {}),
          ...(requestHeaders && Object.keys(requestHeaders).length
            ? { requestHeaders: { ...requestHeaders } }
            : {})
        }
      })
    },
    redirected(key: string, sourceUrl: string, targetUrl: string) {
      const entry = registry.get(key)
      if (entry?.context.kind !== 'proxy') return false
      if (
        entry.applied ||
        entry.context.sourceUrl !== sourceUrl ||
        entry.context.targetUrl !== targetUrl
      ) {
        cancel(key)
        return false
      }
      return settle(key, { ...entry, applied: true })
    },
    loaded(key: string, actualUrl?: string) {
      const entry = registry.get(key)
      if (entry?.context.kind !== 'proxy') return false
      if (actualUrl && actualUrl !== entry.context.targetUrl) {
        cancel(key)
        return false
      }
      return settle(key, { ...entry, loaded: true })
    },
    scriptSucceeded(key: string) {
      return registry.get(key)?.context.kind === 'script' && finish(key)
    },
    failed(key: string, error: unknown) {
      const entry = registry.get(key)
      if (!entry) return false
      if (entry.applied) return finish(key, String(error))
      return registry.replace(key, { ...entry, failure: String(error) })
    },
    cancel,
    cancelProxyScope(scope: { tabId?: number; sessionId?: string }, keyPrefix = '') {
      registry.discardWhere(
        ({ context }, key) =>
          key.startsWith(keyPrefix) &&
          context.kind === 'proxy' &&
          (scope.tabId === undefined || context.tabId === scope.tabId) &&
          (scope.sessionId === undefined || (context.sessionId ?? '') === scope.sessionId)
      )
    },
    cancelAllProxies() {
      registry.discardWhere(({ context }) => context.kind === 'proxy')
    }
  }
}
export type FlowLogger = ReturnType<typeof createFlowLogger>
