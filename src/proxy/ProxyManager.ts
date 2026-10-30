import type { ProxyConfig } from '../types/proxy'
import type { ProxyMode, ProxyStrategy, RequestPolicy } from './ProxyStrategy'
import { getEnabledProxyRules } from '../document-response-rules.ts'
import { DEFAULT_REQUEST_POLICY, splitStrategyConfig } from './request-policy.ts'

export class ProxyManager {
  private readonly strategies: Record<ProxyMode, ProxyStrategy>
  private queue: Promise<void> = Promise.resolve()
  private appliedPolicy = ''

  constructor(strategies: Record<ProxyMode, ProxyStrategy>) {
    this.strategies = strategies
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
        } catch (error) {
          this.appliedPolicy = ''
          const cleanup = await Promise.allSettled(
            Object.values(this.strategies).map(strategy => strategy.dispose())
          )
          for (const result of cleanup)
            if (result.status === 'rejected') console.error('Proxy cleanup failed:', result.reason)
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
