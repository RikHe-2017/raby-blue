import { requireValue } from './test-utils/fixtures'
import { expect, test, vi } from 'vitest'
import { ProxyManager } from './proxy/ProxyManager.ts'
import { RedirectProxy } from './proxy/RedirectProxy.ts'
import type { ProxyConfig, ProxyRule } from './types/proxy'
import type { ProxyMode, ProxyStrategy, RequestType } from './proxy/ProxyStrategy'
import {
  DEFAULT_REQUEST_POLICY,
  getRequestType,
  getResponsePatterns,
  getRedirectResourceTypes,
  splitStrategyConfig,
  buildRedirectRules
} from './proxy/request-policy.ts'
const rule: ProxyRule = {
  id: 'r',
  name: 'frontend',
  type: 'rule' as const,
  enabled: true,
  groupId: 'g',
  sourceUrl: 'http://example.test/app/',
  targetUrl: 'http://localhost:8098/'
}
test('default policy sends documents to response and other resources to redirect without overlaps', () => {
  const before = structuredClone(DEFAULT_REQUEST_POLICY)
  const plan = splitStrategyConfig([rule], DEFAULT_REQUEST_POLICY)
  expect(plan.response.resourceTypes).toStrictEqual(['document'])
  expect(plan.redirect.resourceTypes.includes('script')).toBeTruthy()
  expect(plan.redirect.resourceTypes.includes('xmlhttprequest')).toBeTruthy()
  expect(plan.response.resourceTypes.some(type => plan.redirect.resourceTypes.includes(type))).toBe(
    false
  )
  expect(getResponsePatterns(plan.response.resourceTypes)).toStrictEqual([
    { urlPattern: 'http://*', resourceType: 'Document', requestStage: 'Request' },
    { urlPattern: 'https://*', resourceType: 'Document', requestStage: 'Request' }
  ])
  const types = getRedirectResourceTypes(plan.redirect.resourceTypes)
  expect(!types.some(type => type === 'main_frame' || type === 'sub_frame')).toBeTruthy()
  expect(DEFAULT_REQUEST_POLICY).toStrictEqual(before)
})
test('API policy changes route Fetch and XHR together because DNR uses one type', () => {
  const plan = splitStrategyConfig([rule], {
    ...DEFAULT_REQUEST_POLICY,
    xmlhttprequest: 'response'
  })
  expect(getRequestType('Fetch')).toBe('xmlhttprequest')
  expect(getRequestType('XHR')).toBe('xmlhttprequest')
  expect(getRequestType('Document')).toBe('document')
  expect(getRequestType('UnknownFutureResource')).toBe('other')
  expect(
    !getRedirectResourceTypes(plan.redirect.resourceTypes).some(type => type === 'xmlhttprequest')
  ).toBeTruthy()
  expect(
    getResponsePatterns(plan.response.resourceTypes).some(
      pattern => pattern.resourceType === 'Fetch'
    )
  ).toBeTruthy()
  expect(
    getResponsePatterns(plan.response.resourceTypes).some(pattern => pattern.resourceType === 'XHR')
  ).toBeTruthy()
})
test('redirect rules reuse source matching and never include response-owned types', () => {
  const config = splitStrategyConfig([rule], DEFAULT_REQUEST_POLICY).redirect
  const [redirect] = buildRedirectRules(config)
  expect(requireValue(redirect.action.redirect).regexSubstitution).toBe('http://localhost:8098/\\1')
  expect(redirect.condition.regexFilter).toBe('http://example\\.test/app/(.*)')
  expect(
    !requireValue(redirect.condition.resourceTypes).some(type => type === 'main_frame')
  ).toBeTruthy()
  expect(buildRedirectRules({ rules: [], resourceTypes: ['script'] })).toStrictEqual([])
  expect(buildRedirectRules({ rules: [rule], resourceTypes: [] })).toStrictEqual([])
})
test('redirect rules are scoped to the configured tab when a tab id is provided', () => {
  const config = splitStrategyConfig([rule], DEFAULT_REQUEST_POLICY).redirect
  const [scoped] = buildRedirectRules({ ...config, tabId: 42 })
  const [unscoped] = buildRedirectRules(config)
  const noActiveTab = buildRedirectRules({ ...config, tabId: undefined })

  expect(scoped.condition.tabIds).toStrictEqual([42])
  expect(unscoped.condition.tabIds).toBe(undefined)
  expect(noActiveTab).toStrictEqual([])
})
test('unsupported response types are rejected rather than silently misrouted', () => {
  expect(() =>
    splitStrategyConfig([rule], { ...DEFAULT_REQUEST_POLICY, websocket: 'response' })
  ).toThrow(/不支持/)
  expect(() =>
    splitStrategyConfig([rule], { ...DEFAULT_REQUEST_POLICY, other: 'response' })
  ).toThrow(/不支持/)
})
test('same-address rules keep requests on their URL and preserve precedence over later redirects', () => {
  const same = { ...rule, targetUrl: rule.sourceUrl }
  const generated = buildRedirectRules({ rules: [same, rule], resourceTypes: ['xmlhttprequest'] })
  expect(generated[0].action.type).toBe('allow')
  expect(generated[0].action.redirect).toBe(undefined)
  expect(requireValue(generated[0].priority) > requireValue(generated[1].priority)).toBeTruthy()
  expect(generated[1].action.type).toBe('redirect')
})
test('an empty target does not create a redirect or fall through to a lower priority mapping', () => {
  for (const targetUrl of ['', '  ']) {
    const generated = buildRedirectRules({
      rules: [{ ...rule, targetUrl }, rule],
      resourceTypes: ['xmlhttprequest']
    })
    expect(generated[0].action.type).toBe('allow')
    expect(generated[0].action.redirect).toBe(undefined)
    expect(requireValue(generated[0].priority) > requireValue(generated[1].priority)).toBeTruthy()
    expect(generated[1].action.type).toBe('redirect')
  }
})
const proxyConfig: ProxyConfig = {
  enabled: true,
  groups: [{ id: 'g', name: 'test', enabled: true, type: 'group' as const, children: [rule] }]
}
type StrategyCall = [ProxyMode, 'dispose'] | [ProxyMode, 'update', RequestType[], ProxyRule[]]
const strategyFixture = () => {
  const calls: StrategyCall[] = []
  const strategy = (mode: ProxyMode): ProxyStrategy => ({
    async update(config) {
      calls.push([mode, 'update', config.resourceTypes, config.rules])
    },
    async dispose() {
      calls.push([mode, 'dispose'])
    }
  })
  const strategies = { redirect: strategy('redirect'), response: strategy('response') }
  return { calls, strategies, manager: new ProxyManager(strategies) }
}
test('manager initializes and switches policy without overlapping old redirects', async () => {
  const { manager, calls } = strategyFixture()
  const before = structuredClone(proxyConfig)
  await manager.refresh(async () => proxyConfig)
  expect(calls.map(call => call.slice(0, 2))).toStrictEqual([
    ['response', 'dispose'],
    ['redirect', 'update'],
    ['response', 'update']
  ])
  calls.length = 0
  await manager.refresh(async () => proxyConfig)
  expect(calls).toStrictEqual([])
  calls.length = 0
  await manager.refresh(async () => proxyConfig, { ...DEFAULT_REQUEST_POLICY, script: 'response' })
  expect(calls.map(call => call.slice(0, 2))).toStrictEqual([
    ['response', 'dispose'],
    ['redirect', 'update'],
    ['response', 'update']
  ])
  expect(calls[1][1] === 'update' && !calls[1][2].includes('script')).toBeTruthy()
  expect(calls[2][1] === 'update' && calls[2][2].includes('script')).toBeTruthy()
  calls.length = 0
  await manager.refresh(async () => ({ ...proxyConfig, enabled: false }))
  expect(calls.every(call => call[1] !== 'update' || call[3].length === 0)).toBeTruthy()
  await manager.dispose()
  expect(calls.slice(-2)).toStrictEqual([
    ['redirect', 'dispose'],
    ['response', 'dispose']
  ])
  expect(proxyConfig).toStrictEqual(before)
})
test('manager passes the focused active tab to both proxy strategies and refreshes when it changes', async () => {
  const received: { mode: ProxyMode; tabId: number | undefined }[] = []
  let activeTabId: number | undefined = 1
  const strategy = (mode: ProxyMode): ProxyStrategy => ({
    async update(config) {
      received.push({ mode, tabId: config.tabId })
    },
    async dispose() {}
  })
  const manager = new ProxyManager(
    { redirect: strategy('redirect'), response: strategy('response') },
    undefined,
    { readActiveTabId: async () => activeTabId }
  )

  await manager.refresh(async () => proxyConfig)
  expect(received).toStrictEqual([
    { mode: 'redirect', tabId: 1 },
    { mode: 'response', tabId: 1 }
  ])

  received.length = 0
  activeTabId = 2
  await manager.refresh(async () => proxyConfig)
  expect(received).toStrictEqual([
    { mode: 'redirect', tabId: 2 },
    { mode: 'response', tabId: 2 }
  ])
})
test('notification configuration failure cannot dispose an otherwise working proxy', async () => {
  vi.spyOn(console, 'log').mockImplementation(() => {})
  const { calls, strategies } = strategyFixture()
  const manager = new ProxyManager(strategies, () => {
    throw new Error('observer unavailable')
  })
  await manager.refresh(async () => proxyConfig)
  expect(calls.map(call => call.slice(0, 2))).toStrictEqual([
    ['response', 'dispose'],
    ['redirect', 'update'],
    ['response', 'update']
  ])
  await manager.dispose()
})
test('manager serializes source loads and cleans up after failures, then recovers', async () => {
  const { manager, calls, strategies } = strategyFixture()
  let release!: () => void
  const gate = new Promise<void>(resolve => {
    release = resolve
  })
  const loaded: string[] = []
  const first = manager.refresh(async () => {
    loaded.push('first')
    await gate
    return proxyConfig
  })
  const second = manager.refresh(async () => {
    loaded.push('second')
    return proxyConfig
  })
  await new Promise(resolve => setImmediate(resolve))
  expect(loaded).toStrictEqual(['first'])
  release()
  await Promise.all([first, second])
  expect(loaded).toStrictEqual(['first', 'second'])
  const update = strategies.redirect.update
  strategies.redirect.update = async () => {
    throw new Error('test update failure')
  }
  await expect(
    manager.refresh(async () => ({
      ...proxyConfig,
      groups: [{ ...proxyConfig.groups[0], name: 'changed' }]
    }))
  ).rejects.toThrow(/test update failure/)
  expect(calls.slice(-2)).toStrictEqual([
    ['redirect', 'dispose'],
    ['response', 'dispose']
  ])
  strategies.redirect.update = update
  await manager.refresh(async () => proxyConfig)
  expect(calls.slice(-3).map(call => call.slice(0, 2))).toStrictEqual([
    ['response', 'dispose'],
    ['redirect', 'update'],
    ['response', 'update']
  ])
})
test('redirect implementation replaces browser rules atomically and clears on disposal', async () => {
  const previous = globalThis.chrome
  const updates: chrome.declarativeNetRequest.UpdateRuleOptions[] = []
  const sessionUpdates: chrome.declarativeNetRequest.UpdateRuleOptions[] = []
  vi.stubGlobal('chrome', {
    declarativeNetRequest: {
      async getDynamicRules() {
        return [{ id: 99 }]
      },
      async getSessionRules() {
        return []
      },
      async updateDynamicRules(update: chrome.declarativeNetRequest.UpdateRuleOptions) {
        updates.push(update)
      },
      async updateSessionRules(update: chrome.declarativeNetRequest.UpdateRuleOptions) {
        sessionUpdates.push(update)
      }
    }
  })
  try {
    const strategy = new RedirectProxy()
    await strategy.update(splitStrategyConfig([rule], DEFAULT_REQUEST_POLICY).redirect)
    expect(updates[0].removeRuleIds).toStrictEqual([99])
    expect(updates[0].addRules).toStrictEqual([])
    expect(requireValue(sessionUpdates[0].addRules).length).toBe(1)
    expect(
      !requireValue(requireValue(sessionUpdates[0].addRules)[0].condition.resourceTypes).some(
        type => type === 'main_frame'
      )
    ).toBeTruthy()
    await strategy.dispose()
    expect(updates[1]).toStrictEqual({ removeRuleIds: [99], addRules: [] })
    expect(sessionUpdates[1]).toStrictEqual({ removeRuleIds: [], addRules: [] })
  } finally {
    vi.stubGlobal('chrome', previous)
  }
})
test('redirect implementation uses scoped session rules and removes legacy dynamic rules', async () => {
  const previous = globalThis.chrome
  const dynamicUpdates: chrome.declarativeNetRequest.UpdateRuleOptions[] = []
  const sessionUpdates: chrome.declarativeNetRequest.UpdateRuleOptions[] = []
  vi.stubGlobal('chrome', {
    declarativeNetRequest: {
      async getDynamicRules() {
        return [{ id: 99 }]
      },
      async getSessionRules() {
        return [{ id: 1 }]
      },
      async updateDynamicRules(update: chrome.declarativeNetRequest.UpdateRuleOptions) {
        dynamicUpdates.push(update)
      },
      async updateSessionRules(update: chrome.declarativeNetRequest.UpdateRuleOptions) {
        sessionUpdates.push(update)
      }
    }
  })
  try {
    const strategy = new RedirectProxy()
    await strategy.update({
      ...splitStrategyConfig([rule], DEFAULT_REQUEST_POLICY).redirect,
      tabId: 42
    })

    expect(dynamicUpdates).toStrictEqual([{ removeRuleIds: [99], addRules: [] }])
    expect(sessionUpdates[0].removeRuleIds).toStrictEqual([1])
    expect(requireValue(sessionUpdates[0].addRules)[0].condition.tabIds).toStrictEqual([42])

    await strategy.dispose()

    expect(dynamicUpdates[1]).toStrictEqual({ removeRuleIds: [99], addRules: [] })
    expect(sessionUpdates[1]).toStrictEqual({ removeRuleIds: [1], addRules: [] })
  } finally {
    vi.stubGlobal('chrome', previous)
  }
})
