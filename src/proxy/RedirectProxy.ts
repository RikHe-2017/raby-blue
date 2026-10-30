import type { ProxyStrategy, StrategyConfig } from './ProxyStrategy'
import { buildRedirectRules } from './request-policy.ts'

export class RedirectProxy implements ProxyStrategy {
  async update(config: StrategyConfig): Promise<void> {
    const existing = await chrome.declarativeNetRequest.getDynamicRules()
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: existing.map(rule => rule.id),
      addRules: buildRedirectRules(config)
    })
  }

  async dispose(): Promise<void> {
    await this.update({ rules: [], resourceTypes: [] })
  }
}
