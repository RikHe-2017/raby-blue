import type { ProxyConfig, ProxyRule } from '../types/proxy'
import type { ProxyMode, ProxyStrategy, RequestPolicy, RequestType } from './ProxyStrategy'
import { getEnabledProxyRules } from '../document-response-rules.ts'
import { DEFAULT_REQUEST_POLICY, splitStrategyConfig } from './request-policy.ts'
import { logWarn } from '../utils/logger.ts'

interface TransactionOptions {
  initializationTimeoutMs?: number
  cleanupTimeoutMs?: number
  readActiveTabId?: () => Promise<number | undefined>
}

export class ProxyApplicationError extends Error {
  readonly cleanupErrors: string[]

  constructor(message: string, cleanupErrors: string[] = []) {
    super(cleanupErrors.length ? `${message}；清理未完成：${cleanupErrors.join('；')}` : message)
    this.name = 'ProxyApplicationError'
    this.cleanupErrors = cleanupErrors
  }
}

export function withProxyDeadline<T>(
  run: () => Promise<T>,
  timeoutMs: number,
  message: string,
  onTimeout = () => {}
): Promise<T> {
  let timer: ReturnType<typeof setTimeout>
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      onTimeout()
      reject(new Error(message))
    }, timeoutMs)
  })
  return Promise.race([Promise.resolve().then(run), deadline]).finally(() => clearTimeout(timer))
}

export class ProxyManager {
  private readonly strategies: Record<ProxyMode, ProxyStrategy>
  private queue: Promise<unknown> = Promise.resolve()
  private appliedPolicy = ''
  private appliedConfiguration = ''
  private cleanupRequired = false
  private readonly initializationTimeoutMs: number
  private readonly cleanupTimeoutMs: number
  private readonly onApplied: (
    rules: ProxyRule[],
    types: RequestType[],
    scope?: { tabId?: number }
  ) => void
  private readonly readActiveTabId?: () => Promise<number | undefined>

  constructor(
    strategies: Record<ProxyMode, ProxyStrategy>,
    onApplied = (_rules: ProxyRule[], _types: RequestType[], _scope?: { tabId?: number }) => {},
    options: TransactionOptions = {}
  ) {
    this.strategies = strategies
    this.onApplied = onApplied
    this.initializationTimeoutMs = options.initializationTimeoutMs ?? 15000
    this.cleanupTimeoutMs = options.cleanupTimeoutMs ?? 5000
    this.readActiveTabId = options.readActiveTabId
  }

  private notifyApplied(rules: ProxyRule[], types: RequestType[], scope?: { tabId?: number }) {
    try {
      if (scope) this.onApplied(rules, types, scope)
      else this.onApplied(rules, types)
    } catch (error) {
      logWarn('Proxy notification setup failed:', error)
    }
  }

  private async cleanup(): Promise<string[]> {
    const modes = Object.keys(this.strategies) as ProxyMode[]
    const results = await Promise.allSettled(
      modes.map(mode =>
        withProxyDeadline(
          () => this.strategies[mode].dispose(),
          this.cleanupTimeoutMs,
          `${mode} 代理清理超时`
        )
      )
    )
    const errors = results.flatMap((result, index) =>
      result.status === 'rejected'
        ? [
            `${modes[index]}: ${result.reason instanceof Error ? result.reason.message : String(result.reason)}`
          ]
        : []
    )
    this.cleanupRequired = errors.length > 0
    return errors
  }

  refresh(
    loadConfig: () => Promise<ProxyConfig>,
    policy: RequestPolicy = DEFAULT_REQUEST_POLICY
  ): Promise<void> {
    const snapshot = { ...policy }
    const operation = this.queue
      .catch(() => {})
      .then(async () => {
        const controller = new AbortController()
        try {
          await withProxyDeadline(
            async () => {
              const config = await loadConfig()
              controller.signal.throwIfAborted()
              const activeTabId = this.readActiveTabId ? await this.readActiveTabId() : undefined
              controller.signal.throwIfAborted()
              const configuration = JSON.stringify([
                config,
                snapshot,
                this.readActiveTabId ? activeTabId : undefined
              ])
              if (configuration === this.appliedConfiguration && !this.cleanupRequired) return
              this.notifyApplied([], [])
              const plan = splitStrategyConfig(getEnabledProxyRules(config), snapshot)
              const scopedPlan = this.readActiveTabId
                ? {
                    redirect: { ...plan.redirect, tabId: activeTabId },
                    response: { ...plan.response, tabId: activeTabId }
                  }
                : plan
              const signature = JSON.stringify([
                plan.response.resourceTypes,
                this.readActiveTabId ? activeTabId : undefined
              ])
              if (this.cleanupRequired) {
                const errors = await this.cleanup()
                if (errors.length) throw new ProxyApplicationError('上次代理清理尚未完成', errors)
              }
              // Redirects must be ready before documents can load their local resources.
              if (signature !== this.appliedPolicy) await this.strategies.response.dispose()
              controller.signal.throwIfAborted()
              await this.strategies.redirect.update(scopedPlan.redirect, controller.signal)
              controller.signal.throwIfAborted()
              await this.strategies.response.update(scopedPlan.response, controller.signal)
              controller.signal.throwIfAborted()
              this.appliedPolicy = signature
              this.appliedConfiguration = configuration
              this.notifyApplied(
                plan.redirect.rules,
                plan.redirect.resourceTypes,
                this.readActiveTabId ? { tabId: activeTabId } : undefined
              )
            },
            this.initializationTimeoutMs,
            '代理配置初始化超时',
            () => controller.abort()
          )
        } catch (error) {
          controller.abort()
          this.notifyApplied([], [], this.readActiveTabId ? {} : undefined)
          this.appliedPolicy = ''
          this.appliedConfiguration = ''
          const errors = await this.cleanup()
          throw new ProxyApplicationError(
            error instanceof Error ? error.message : String(error),
            errors
          )
        }
      })
    this.queue = operation
    return operation
  }

  dispose(): Promise<void> {
    const operation = this.queue
      .catch(() => {})
      .then(async () => {
        this.appliedPolicy = ''
        this.appliedConfiguration = ''
        this.notifyApplied([], [], this.readActiveTabId ? {} : undefined)
        const errors = await this.cleanup()
        if (errors.length) throw new ProxyApplicationError('代理停用失败', errors)
      })
    this.queue = operation
    return operation
  }
}
