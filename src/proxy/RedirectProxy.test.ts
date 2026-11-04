import { expect, test, vi } from 'vitest'
import { RedirectProxy } from './RedirectProxy'
import type { StrategyConfig } from './ProxyStrategy'

const config: StrategyConfig = {
  resourceTypes: ['script'],
  rules: [
    {
      id: 'r',
      name: 'rule',
      groupId: 'g',
      type: 'rule',
      enabled: true,
      sourceUrl: 'http://source.test/',
      targetUrl: 'http://localhost/'
    }
  ]
}

test('an aborted attempt cannot install redirects after a delayed browser rule lookup', async () => {
  let finish!: (rules: chrome.declarativeNetRequest.Rule[]) => void
  const update = vi.fn(async () => {})
  vi.stubGlobal('chrome', {
    declarativeNetRequest: {
      getDynamicRules: () =>
        new Promise<chrome.declarativeNetRequest.Rule[]>(resolve => {
          finish = resolve
        }),
      updateDynamicRules: update
    }
  })
  const strategy = new RedirectProxy()
  const controller = new AbortController()
  const applying = strategy.update(config, controller.signal)
  const rejected = expect(applying).rejects.toThrow()
  await vi.waitFor(() => expect(finish).toBeTypeOf('function'))
  controller.abort()
  finish([])
  await rejected
  expect(update).not.toHaveBeenCalled()
})

test('cleanup waits for a late rule installation and removes it before a newer configuration can apply', async () => {
  let dynamicRules: chrome.declarativeNetRequest.Rule[] = []
  let sessionRules: chrome.declarativeNetRequest.Rule[] = []
  let finish!: () => void
  let writes = 0
  vi.stubGlobal('chrome', {
    declarativeNetRequest: {
      getDynamicRules: async () => dynamicRules,
      getSessionRules: async () => sessionRules,
      updateDynamicRules: async (change: chrome.declarativeNetRequest.UpdateRuleOptions) => {
        if (++writes === 1)
          await new Promise<void>(resolve => {
            finish = resolve
          })
        dynamicRules = [
          ...dynamicRules.filter(rule => !change.removeRuleIds?.includes(rule.id)),
          ...(change.addRules ?? [])
        ]
      },
      updateSessionRules: async (change: chrome.declarativeNetRequest.UpdateRuleOptions) => {
        sessionRules = [
          ...sessionRules.filter(rule => !change.removeRuleIds?.includes(rule.id)),
          ...(change.addRules ?? [])
        ]
      }
    }
  })
  const strategy = new RedirectProxy()
  const controller = new AbortController()
  const applying = strategy.update(config, controller.signal)
  const rejected = expect(applying).rejects.toThrow()
  await vi.waitFor(() => expect(finish).toBeTypeOf('function'))
  controller.abort()
  let cleaned = false
  const cleanup = strategy.dispose().then(() => {
    cleaned = true
  })
  await Promise.resolve()
  expect(cleaned).toBe(false)
  finish()
  await rejected
  await cleanup
  expect(dynamicRules).toEqual([])
  expect(sessionRules).toEqual([])
  await strategy.update(config)
  expect(sessionRules).toHaveLength(1)
})
test('uses session rules scoped to one tab and removes legacy dynamic rules', async () => {
  const dynamicUpdates: chrome.declarativeNetRequest.UpdateRuleOptions[] = []
  const sessionUpdates: chrome.declarativeNetRequest.UpdateRuleOptions[] = []
  vi.stubGlobal('chrome', {
    declarativeNetRequest: {
      getDynamicRules: async () => [{ id: 99 }],
      getSessionRules: async () => [{ id: 1 }],
      updateDynamicRules: async (update: chrome.declarativeNetRequest.UpdateRuleOptions) => {
        dynamicUpdates.push(update)
      },
      updateSessionRules: async (update: chrome.declarativeNetRequest.UpdateRuleOptions) => {
        sessionUpdates.push(update)
      }
    }
  })

  const strategy = new RedirectProxy()
  await strategy.update({ ...config, tabId: 42 })

  expect(dynamicUpdates).toStrictEqual([{ removeRuleIds: [99], addRules: [] }])
  expect(sessionUpdates[0].removeRuleIds).toStrictEqual([1])
  expect(sessionUpdates[0].addRules?.[0].condition.tabIds).toStrictEqual([42])

  await strategy.dispose()

  expect(dynamicUpdates[1]).toStrictEqual({ removeRuleIds: [99], addRules: [] })
  expect(sessionUpdates[1]).toStrictEqual({ removeRuleIds: [1], addRules: [] })
})
