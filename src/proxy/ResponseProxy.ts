import type { ProxyStrategy, StrategyConfig } from './ProxyStrategy'
import { createResponseReplacement } from '../document-response.ts'

export class ResponseProxy implements ProxyStrategy {
  private readonly driver = createResponseReplacement()

  async update(config: StrategyConfig): Promise<void> {
    await this.driver.update(config.rules, config.resourceTypes)
  }

  async dispose(): Promise<void> {
    await this.driver.update([], [])
  }
}
