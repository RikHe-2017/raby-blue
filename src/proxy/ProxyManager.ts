import type { ProxyConfig, ProxyRule } from '../types/proxy'
import type { ProxyMode, ProxyStrategy, RequestPolicy, RequestType } from './ProxyStrategy'
import { getEnabledProxyRules } from '../document-response-rules.ts'
import { DEFAULT_REQUEST_POLICY, splitStrategyConfig } from './request-policy.ts'
import { logError, logWarn } from '../utils/logger.ts'

export class ProxyManager {
  private readonly strategies: Record<ProxyMode, ProxyStrategy>
  private queue: Promise<void> = Promise.resolve()
  private appliedPolicy = ''
  private readonly onApplied: (rules: ProxyRule[], types: RequestType[]) => void

  constructor(
    strategies: Record<ProxyMode, ProxyStrategy>,
    onApplied = (_rules: ProxyRule[], _types: RequestType[]) => {}
  ) {
    this.strategies = strategies
    this.onApplied = onApplied
  }

  private notifyApplied(rules: ProxyRule[], types: RequestType[]) {
    try {
      this.onApplied(rules, types)
    } catch (error) {
      logWarn('Proxy notification setup failed:', error)
    }
  }

  refresh(
    loadConfig: () => Promise<ProxyConfig>,
    policy: RequestPolicy = DEFAULT_REQUEST_POLICY
  ): Promise<void> {
    const snapshot = { ...policy }
    const operation = this.queue
      .catch(() => {})
      .then(async () => {
        try {
          const config = await loadConfig()
          const plan = splitStrategyConfig(getEnabledProxyRules(config), snapshot)
          const signature = JSON.stringify(plan.response.resourceTypes)
          if (signature !== this.appliedPolicy) await this.strategies.redirect.dispose()
          await this.strategies.response.update(plan.response)
          await this.strategies.redirect.update(plan.redirect)
          this.appliedPolicy = signature
          this.notifyApplied(plan.redirect.rules, plan.redirect.resourceTypes)
        } catch (error) {
          this.notifyApplied([], [])
          this.appliedPolicy = ''
          const cleanup = await Promise.allSettled(
            Object.values(this.strategies).map(strategy => strategy.dispose())
          )
          for (const result of cleanup)
            if (result.status === 'rejected') logError('Proxy cleanup failed:', result.reason)
          throw error
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
        this.notifyApplied([], [])
        try {
          await this.strategies.redirect.dispose()
        } finally {
          await this.strategies.response.dispose()
        }
      })
    this.queue = operation
    return operation
  }
}
