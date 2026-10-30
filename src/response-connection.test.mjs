import assert from 'node:assert/strict'
import test from 'node:test'
import { createResponseReplacement } from './document-response.ts'
import { ResponseProxy } from './proxy/ResponseProxy.ts'

const event = () => {
  const listeners = []
  return {
    addListener: listener => listeners.push(listener),
    emit: (...args) => listeners.forEach(listener => listener(...args))
  }
}
const settle = async () => {
  for (let count = 0; count < 8; count++) await new Promise(resolve => setImmediate(resolve))
}
const rules = [
  { id: 'r', enabled: true, sourceUrl: 'http://example.test/', targetUrl: 'http://localhost:8098/' }
]

function browserFixture() {
  const state = { connected: false, attachCount: 0, commands: [] }
  const chrome = {
    debugger: {
      onEvent: event(),
      onDetach: event(),
      async attach() {
        state.connected = true
        state.attachCount++
      },
      async detach() {
        state.connected = false
      },
      async sendCommand(session, method, params) {
        if (!state.connected) throw new Error('Debugger is not attached')
        state.commands.push({ session, method, params })
      }
    },
    action: { async setBadgeText() {}, async setBadgeBackgroundColor() {}, async setTitle() {} },
    webNavigation: { onBeforeNavigate: event(), onErrorOccurred: event() },
    tabs: {
      onUpdated: event(),
      onRemoved: event(),
      async query() {
        return [{ id: 1, url: 'http://example.test/' }]
      }
    }
  }
  return { chrome, state }
}

test('manual main-frame navigation reconnects after detach without modifying configuration', async () => {
  const fixture = browserFixture()
  const previous = globalThis.chrome
  globalThis.chrome = fixture.chrome
  try {
    const replacement = new ResponseProxy()
    await replacement.update({ rules, resourceTypes: ['document'] })
    fixture.state.connected = false
    fixture.chrome.debugger.onDetach.emit({ tabId: 1 }, 'canceled_by_user')
    await settle()
    fixture.chrome.tabs.onUpdated.emit(1, { status: 'complete' }, { url: 'http://example.test/' })
    fixture.chrome.webNavigation.onBeforeNavigate.emit({
      tabId: 1,
      frameId: 2,
      url: 'http://example.test/frame'
    })
    await settle()
    assert.equal(
      fixture.state.attachCount,
      1,
      'do not fight cancellation or retry from child frames'
    )
    fixture.chrome.webNavigation.onBeforeNavigate.emit({
      tabId: 1,
      frameId: 0,
      url: 'http://example.test/'
    })
    await settle()
    assert.equal(fixture.state.attachCount, 2, 'explicit navigation must allow reconnect')
    assert.equal(fixture.state.connected, true)
    await replacement.dispose()
    assert.equal(fixture.state.connected, false)
  } finally {
    globalThis.chrome = previous
  }
})

test('response strategy scopes interception and changes patterns on existing connections', async () => {
  const fixture = browserFixture()
  const previous = globalThis.chrome
  globalThis.chrome = fixture.chrome
  try {
    const strategy = new ResponseProxy()
    await strategy.update({ rules, resourceTypes: ['document'] })
    assert.ok(
      fixture.state.commands
        .find(command => command.method === 'Fetch.enable')
        .params.patterns.every(pattern => pattern.resourceType === 'Document')
    )
    fixture.chrome.debugger.onEvent.emit({ tabId: 1 }, 'Fetch.requestPaused', {
      requestId: 'script',
      resourceType: 'Script',
      request: { url: 'http://example.test/a.js' }
    })
    await settle()
    assert.ok(
      fixture.state.commands.some(
        command =>
          command.method === 'Fetch.continueRequest' && command.params.requestId === 'script'
      )
    )
    await strategy.update({ rules, resourceTypes: ['script'] })
    const patterns = fixture.state.commands
      .filter(command => command.method === 'Fetch.enable')
      .at(-1).params.patterns
    assert.ok(patterns.every(pattern => pattern.resourceType === 'Script'))
    assert.equal(fixture.state.attachCount, 1)
    await strategy.dispose()
    assert.equal(fixture.state.connected, false)
  } finally {
    globalThis.chrome = previous
  }
})

test('navigation detects stale cached attachment and reconnects once', async () => {
  const fixture = browserFixture()
  const previous = globalThis.chrome
  globalThis.chrome = fixture.chrome
  try {
    const replacement = createResponseReplacement()
    await replacement.update(rules)
    fixture.state.connected = false
    fixture.chrome.webNavigation.onBeforeNavigate.emit({
      tabId: 1,
      frameId: 0,
      url: 'http://example.test/'
    })
    await settle()
    assert.equal(fixture.state.attachCount, 2)
    assert.equal(fixture.state.connected, true)
    fixture.chrome.webNavigation.onBeforeNavigate.emit({
      tabId: 1,
      frameId: 0,
      url: 'http://example.test/'
    })
    await settle()
    assert.equal(fixture.state.attachCount, 2, 'healthy connections must not attach again')
  } finally {
    globalThis.chrome = previous
  }
})
