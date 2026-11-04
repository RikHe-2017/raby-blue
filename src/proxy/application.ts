import type { ProxyConfig } from '../types/proxy'
import type { ProxyRuntimeStatus } from './runtime-status'
import { isProxyRuntimeStatus } from './runtime-status'
import type { createProxyConfigPersistence } from './config-persistence'
import { ProxyApplicationError, withProxyDeadline } from './ProxyManager'
import type { ProxyManager } from './ProxyManager'
import { logError } from '../utils/logger'

interface Dependencies {
  manager: Pick<ProxyManager, 'refresh' | 'dispose'>
  persistence: ReturnType<typeof createProxyConfigPersistence>
  readConfig(): Promise<ProxyConfig | undefined>
  readStatus?(): Promise<unknown>
  publish(status: ProxyRuntimeStatus): Promise<void>
}

export function createProxyApplication(dependencies: Dependencies) {
  let status: ProxyRuntimeStatus = { phase: 'disabled' }
  let queue: Promise<unknown> = Promise.resolve()
  let failureRevision = 0
  let restored = false

  const publish = async (next: ProxyRuntimeStatus) => {
    status = next
    await dependencies.publish({ ...next })
  }

  const enqueue = (run: () => Promise<ProxyRuntimeStatus>) => {
    const operation = queue.catch(() => {}).then(run)
    queue = operation
    return operation
  }

  const fail = async (error: unknown): Promise<ProxyRuntimeStatus> => {
    failureRevision++
    const message = error instanceof Error ? error.message : String(error)
    const problems = error instanceof ProxyApplicationError ? [...error.cleanupErrors] : []
    if (!(error instanceof ProxyApplicationError)) {
      try {
        await dependencies.manager.dispose()
      } catch (cleanupError) {
        problems.push(String(cleanupError))
      }
    }
    try {
      await withProxyDeadline(() => dependencies.persistence.disable(), 5000, '关闭代理总控超时')
    } catch (disableError) {
      problems.push(`总控关闭未确认：${String(disableError)}`)
    }
    const next: ProxyRuntimeStatus = {
      phase: 'error',
      message: `${message}${problems.length ? `；清理或停用未确认：${problems.join('；')}` : '；已停止代理，可重新开启总控重试'}`,
      cleanupFailed: problems.length > 0
    }
    try {
      await publish(next)
    } catch (publishError) {
      logError('代理失败状态同步失败:', publishError)
    }
    logError('代理配置应用失败:', next.message)
    return next
  }

  const refresh = (clearFailure = false) =>
    enqueue(async () => {
      try {
        if (!restored) {
          const saved = await withProxyDeadline(
            () => dependencies.readStatus?.() ?? Promise.resolve(undefined),
            5000,
            '读取代理运行状态超时'
          )
          if (isProxyRuntimeStatus(saved)) status = { ...saved }
          restored = true
        }
        const previous = status
        await publish({ phase: 'applying' })
        let config: ProxyConfig | undefined
        await dependencies.manager.refresh(async () => {
          config = (await dependencies.readConfig()) ?? { enabled: false, groups: [] }
          return config
        })
        await publish(
          config?.enabled
            ? { phase: 'active' }
            : previous.phase === 'error' && !clearFailure
              ? previous
              : { phase: 'disabled' }
        )
        return status
      } catch (error) {
        return fail(error)
      }
    })

  return {
    refresh,
    getStatus: (): ProxyRuntimeStatus => ({ ...status }),

    async save(config: ProxyConfig, updateEnabled = false): Promise<ProxyRuntimeStatus> {
      const previousFailure = failureRevision
      try {
        await withProxyDeadline(
          () => dependencies.persistence.save(config, updateEnabled),
          15000,
          '代理配置保存超时'
        )
      } catch (error) {
        const failed = await enqueue(() => fail(error))
        throw new Error(failed.message)
      }
      const result = await refresh(updateEnabled && !config.enabled)
      if (result.phase === 'error' && failureRevision !== previousFailure)
        throw new Error(result.message)
      if (updateEnabled && config.enabled && result.phase !== 'active') {
        throw new Error(result.message ?? '代理未能启用，请重试')
      }
      return result
    }
  }
}
