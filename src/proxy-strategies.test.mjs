import assert from 'node:assert/strict'
import test from 'node:test'
import { ProxyManager } from './proxy/ProxyManager.ts'
import { RedirectProxy } from './proxy/RedirectProxy.ts'
import {
  DEFAULT_REQUEST_POLICY,
  getRequestType,
  getResponsePatterns,
  getRedirectResourceTypes,
  splitStrategyConfig,
  buildRedirectRules
} from './proxy/request-policy.ts'

const rule = {
  id: 'r',
  name: 'frontend',
  type: 'rule',
  enabled: true,
  groupId: 'g',
  sourceUrl: 'http://example.test/app/',
  targetUrl: 'http://localhost:8098/'
}

test('default policy sends documents to response and other resources to redirect without overlaps', () => {
  const before = structuredClone(DEFAULT_REQUEST_POLICY)
  const plan = splitStrategyConfig([rule], DEFAULT_REQUEST_POLICY)
  assert.deepEqual(plan.response.resourceTypes, ['document'])
  assert.ok(plan.redirect.resourceTypes.includes('script'))
  assert.ok(plan.redirect.resourceTypes.includes('xmlhttprequest'))
  assert.equal(
    plan.response.resourceTypes.some(type => plan.redirect.resourceTypes.includes(type)),
    false
  )
  assert.deepEqual(getResponsePatterns(plan.response.resourceTypes), [
    { urlPattern: 'http://*', resourceType: 'Document', requestStage: 'Request' },
    { urlPattern: 'https://*', resourceType: 'Document', requestStage: 'Request' }
  ])
  const types = getRedirectResourceTypes(plan.redirect.resourceTypes)
  assert.ok(!types.includes('main_frame') && !types.includes('sub_frame'))
  assert.deepEqual(DEFAULT_REQUEST_POLICY, before)
})

test('API policy changes route Fetch and XHR together because DNR uses one type', () => {
  const plan = splitStrategyConfig([rule], {
    ...DEFAULT_REQUEST_POLICY,
    xmlhttprequest: 'response'
  })
  assert.equal(getRequestType('Fetch'), 'xmlhttprequest')
  assert.equal(getRequestType('XHR'), 'xmlhttprequest')
  assert.equal(getRequestType('Document'), 'document')
  assert.equal(getRequestType('UnknownFutureResource'), 'other')
  assert.ok(!getRedirectResourceTypes(plan.redirect.resourceTypes).includes('xmlhttprequest'))
  assert.ok(
    getResponsePatterns(plan.response.resourceTypes).some(
      pattern => pattern.resourceType === 'Fetch'
    )
  )
  assert.ok(
    getResponsePatterns(plan.response.resourceTypes).some(pattern => pattern.resourceType === 'XHR')
  )
})

test('redirect rules reuse source matching and never include response-owned types', () => {
  const config = splitStrategyConfig([rule], DEFAULT_REQUEST_POLICY).redirect
  const [redirect] = buildRedirectRules(config)
  assert.equal(redirect.action.redirect.regexSubstitution, 'http://localhost:8098/\\1')
  assert.equal(redirect.condition.regexFilter, 'http://example\\.test/app/(.*)')
  assert.ok(!redirect.condition.resourceTypes.includes('main_frame'))
  assert.deepEqual(buildRedirectRules({ rules: [], resourceTypes: ['script'] }), [])
  assert.deepEqual(buildRedirectRules({ rules: [rule], resourceTypes: [] }), [])
})

test('unsupported response types are rejected rather than silently misrouted', () => {
  assert.throws(
    () => splitStrategyConfig([rule], { ...DEFAULT_REQUEST_POLICY, websocket: 'response' }),
    /不支持/
  )
  assert.throws(
    () => splitStrategyConfig([rule], { ...DEFAULT_REQUEST_POLICY, other: 'response' }),
    /不支持/
  )
})

test('same-address rules keep requests on their URL and preserve precedence over later redirects', () => {
  const same = { ...rule, targetUrl: rule.sourceUrl }
  const generated = buildRedirectRules({ rules: [same, rule], resourceTypes: ['xmlhttprequest'] })
  assert.equal(generated[0].action.type, 'allow')
  assert.equal(generated[0].action.redirect, undefined)
  assert.ok(generated[0].priority > generated[1].priority)
  assert.equal(generated[1].action.type, 'redirect')
})

test('an empty target does not create a redirect or fall through to a lower priority mapping', () => {
  for (const targetUrl of ['', '  ']) {
    const generated = buildRedirectRules({
      rules: [{ ...rule, targetUrl }, rule],
      resourceTypes: ['xmlhttprequest']
    })
    assert.equal(generated[0].action.type, 'allow')
    assert.equal(generated[0].action.redirect, undefined)
    assert.ok(generated[0].priority > generated[1].priority)
    assert.equal(generated[1].action.type, 'redirect')
  }
})

const proxyConfig = { enabled: true, groups: [{ type: 'group', children: [rule] }] }
const strategyFixture = () => {
  const calls = []
  const strategies = Object.fromEntries(
    ['redirect', 'response'].map(mode => [
      mode,
      {
        async update(config) {
          calls.push([mode, 'update', config.resourceTypes, config.rules])
        },
        async dispose() {
          calls.push([mode, 'dispose'])
        }
      }
    ])
  )
  return { calls, strategies, manager: new ProxyManager(strategies) }
}

test('manager initializes and switches policy without overlapping old redirects', async () => {
  const { manager, calls } = strategyFixture()
  const before = structuredClone(proxyConfig)
  await manager.refresh(async () => proxyConfig)
  assert.deepEqual(
    calls.map(call => call.slice(0, 2)),
    [
      ['redirect', 'dispose'],
      ['response', 'update'],
      ['redirect', 'update']
    ]
  )
  calls.length = 0
  await manager.refresh(async () => proxyConfig)
  assert.deepEqual(
    calls.map(call => call.slice(0, 2)),
    [
      ['response', 'update'],
      ['redirect', 'update']
    ]
  )
  calls.length = 0
  await manager.refresh(async () => proxyConfig, { ...DEFAULT_REQUEST_POLICY, script: 'response' })
  assert.deepEqual(
    calls.map(call => call.slice(0, 2)),
    [
      ['redirect', 'dispose'],
      ['response', 'update'],
      ['redirect', 'update']
    ]
  )
  assert.ok(calls[1][2].includes('script'))
  assert.ok(!calls[2][2].includes('script'))
  calls.length = 0
  await manager.refresh(async () => ({ ...proxyConfig, enabled: false }))
  assert.ok(calls.filter(call => call[1] === 'update').every(call => call[3].length === 0))
  await manager.dispose()
  assert.deepEqual(calls.slice(-2), [
    ['redirect', 'dispose'],
    ['response', 'dispose']
  ])
  assert.deepEqual(proxyConfig, before)
})

test('manager serializes source loads and cleans up after failures, then recovers', async () => {
  const { manager, calls, strategies } = strategyFixture()
  let release
  const gate = new Promise(resolve => {
    release = resolve
  })
  const loaded = []
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
  assert.deepEqual(loaded, ['first'])
  release()
  await Promise.all([first, second])
  assert.deepEqual(loaded, ['first', 'second'])
  const update = strategies.redirect.update
  strategies.redirect.update = async () => {
    throw new Error('test update failure')
  }
  await assert.rejects(
    manager.refresh(async () => proxyConfig),
    /test update failure/
  )
  assert.deepEqual(calls.slice(-2), [
    ['redirect', 'dispose'],
    ['response', 'dispose']
  ])
  strategies.redirect.update = update
  await manager.refresh(async () => proxyConfig)
  assert.deepEqual(
    calls.slice(-3).map(call => call.slice(0, 2)),
    [
      ['redirect', 'dispose'],
      ['response', 'update'],
      ['redirect', 'update']
    ]
  )
})

test('redirect implementation replaces browser rules atomically and clears on disposal', async () => {
  const previous = globalThis.chrome
  const updates = []
  globalThis.chrome = {
    declarativeNetRequest: {
      async getDynamicRules() {
        return [{ id: 99 }]
      },
      async updateDynamicRules(update) {
        updates.push(update)
      }
    }
  }
  try {
    const strategy = new RedirectProxy()
    await strategy.update(splitStrategyConfig([rule], DEFAULT_REQUEST_POLICY).redirect)
    assert.deepEqual(updates[0].removeRuleIds, [99])
    assert.equal(updates[0].addRules.length, 1)
    assert.ok(!updates[0].addRules[0].condition.resourceTypes.includes('main_frame'))
    await strategy.dispose()
    assert.deepEqual(updates[1], { removeRuleIds: [99], addRules: [] })
  } finally {
    globalThis.chrome = previous
  }
})
