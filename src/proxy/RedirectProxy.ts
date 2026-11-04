import type { ProxyStrategy, StrategyConfig } from './ProxyStrategy'
import { buildRedirectRules } from './request-policy.ts'

export class RedirectProxy implements ProxyStrategy {
  private queue: Promise<void> = Promise.resolve()

  private async replace(config: StrategyConfig, signal?: AbortSignal): Promise<void> {
    signal?.throwIfAborted()
    const [existingDynamic, existingSession] = await Promise.all([
      chrome.declarativeNetRequest.getDynamicRules(),
      chrome.declarativeNetRequest.getSessionRules()
    ])
    signal?.throwIfAborted()
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: existingDynamic.map(rule => rule.id),
      addRules: []
    })
    signal?.throwIfAborted()
    await chrome.declarativeNetRequest.updateSessionRules({
      removeRuleIds: existingSession.map(rule => rule.id),
      addRules: buildRedirectRules(config)
    })
    if (signal?.aborted) {
      await this.replace({ rules: [], resourceTypes: [] })
      signal.throwIfAborted()
    }
  }

  update(config: StrategyConfig, signal?: AbortSignal): Promise<void> {
    const snapshot = structuredClone(config)
    const operation = this.queue.catch(() => {}).then(() => this.replace(snapshot, signal))
    this.queue = operation
    return operation
  }

  async dispose(): Promise<void> {
    await this.update({ rules: [], resourceTypes: [] })
  }
}
