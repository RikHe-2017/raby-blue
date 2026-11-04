import type { ProxyStrategy, StrategyConfig } from './ProxyStrategy'
import { createResponseReplacement } from '../document-response.ts'
import type { ProxySuccessObserver } from './success-notifications'

export class ResponseProxy implements ProxyStrategy {
  private readonly driver: ReturnType<typeof createResponseReplacement>

  constructor(notifications?: ProxySuccessObserver, onUserCancelled?: () => void | Promise<void>) {
    this.driver = createResponseReplacement(notifications, onUserCancelled)
  }

  async update(config: StrategyConfig, signal?: AbortSignal): Promise<void> {
    const scope = Object.prototype.hasOwnProperty.call(config, 'tabId')
      ? { tabId: config.tabId }
      : undefined
    await this.driver.update(config.rules, config.resourceTypes, signal, scope)
  }

  async dispose(): Promise<void> {
    await this.driver.update([], [])
  }
}
