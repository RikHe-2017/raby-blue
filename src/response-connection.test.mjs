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
  const state = {
    connected: false,
    attachCount: 0,
    commands: [],
    badges: [],
    url: 'http://example.test/'
  }
  const chrome = {
    debugger: {
      onEvent: event(),
      onDetach: event(),
      async attach() {
        await state.onAttach?.()
        state.connected = true
        state.attachCount++
      },
      async detach() {
        state.connected = false
      },
      async sendCommand(session, method, params) {
        if (!state.connected) throw new Error('Debugger is not attached')
        state.commands.push({ session, method, params })
        return state.onCommand?.(session, method, params)
      }
    },
    action: {
      async setBadgeText(value) {
        state.badges.push(value)
      },
      async setBadgeBackgroundColor() {},
      async setTitle() {}
    },
    webNavigation: { onBeforeNavigate: event(), onErrorOccurred: event() },
    tabs: {
      onUpdated: event(),
      onRemoved: event(),
      async get(id) {
        return { id, url: state.url }
      },
      async query() {
        return [{ id: 1, url: 'http://example.test/' }]
      }
    }
  }
  return { chrome, state }
}

test('success notifications wait for applied response and completed loading, never network failure', async () => {
  const fixture = browserFixture()
  const previous = globalThis.chrome
  globalThis.chrome = fixture.chrome
  try {
    const started = []
    const completed = []
    const driver = createResponseReplacement({
      begin(tabId, rule) {
        started.push([tabId, rule.id])
        return () => completed.push(rule.id)
      }
    })
    await driver.update([{ ...rules[0], showSuccessNotification: true }])
    const paused = {
      requestId: 'success',
      networkId: 'net-success',
      resourceType: 'Document',
      request: { url: 'http://example.test/page', method: 'GET', headers: {} }
    }
    fixture.chrome.debugger.onEvent.emit({ tabId: 1 }, 'Fetch.requestPaused', paused)
    await settle()
    assert.equal(started.length, 1)
    assert.deepEqual(completed, [])
    fixture.chrome.debugger.onEvent.emit({ tabId: 1 }, 'Fetch.requestPaused', {
      ...paused,
      responseStatusCode: 200,
      responseHeaders: []
    })
    await settle()
    assert.deepEqual(completed, [], 'receiving response headers is not completed loading')
    fixture.chrome.debugger.onEvent.emit({ tabId: 1 }, 'Network.loadingFinished', {
      requestId: paused.networkId
    })
    assert.deepEqual(completed, ['r'])
    fixture.chrome.debugger.onEvent.emit({ tabId: 1 }, 'Fetch.requestPaused', {
      ...paused,
      requestId: 'failed',
      networkId: 'net-failed'
    })
    await settle()
    fixture.chrome.debugger.onEvent.emit({ tabId: 1 }, 'Fetch.requestPaused', {
      ...paused,
      requestId: 'failed',
      networkId: 'net-failed',
      responseStatusCode: 200
    })
    await settle()
    fixture.chrome.debugger.onEvent.emit({ tabId: 1 }, 'Network.loadingFailed', {
      requestId: 'net-failed',
      errorText: 'aborted'
    })
    assert.deepEqual(completed, ['r'])
    await driver.update([], [])
  } finally {
    globalThis.chrome = previous
  }
})

test('source headers do not depend on Network event order or an optional network ID', async () => {
  const fixture = browserFixture()
  const previous = globalThis.chrome
  globalThis.chrome = fixture.chrome
  try {
    const driver = createResponseReplacement()
    for (const targetUrl of ['', rules[0].sourceUrl]) {
      for (const networkId of [undefined, 'late-network']) {
        for (const headerFields of ['request', 'response', 'both']) {
          await driver.update([
            {
              ...rules[0],
              targetUrl,
              ...(headerFields !== 'response'
                ? {
                    requestHeaders: [
                      { id: 'req', enabled: true, name: 'X-Label', value: 'configured' }
                    ]
                  }
                : {}),
              ...(headerFields !== 'request'
                ? {
                    responseHeaders: [
                      { id: 'res', enabled: true, name: 'X-Reply', value: 'configured' }
                    ]
                  }
                : {})
            }
          ])
          fixture.state.commands.length = 0
          const request = {
            url: 'http://example.test/api/save',
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            hasPostData: true
          }
          const paused = { requestId: 'early', networkId, resourceType: 'XHR', request }
          fixture.chrome.debugger.onEvent.emit({ tabId: 1 }, 'Fetch.requestPaused', paused)
          await settle()
          const sent = fixture.state.commands.find(item => item.method === 'Fetch.continueRequest')
          assert.equal(
            sent.params.headers?.find(row => row.name === 'X-Label')?.value,
            headerFields === 'response' ? undefined : 'configured'
          )
          assert.equal(sent.params.url, undefined)
          assert.equal(sent.params.postData, undefined)
          if (networkId)
            fixture.chrome.debugger.onEvent.emit({ tabId: 1 }, 'Network.requestWillBeSent', {
              requestId: networkId,
              request
            })
          fixture.chrome.debugger.onEvent.emit({ tabId: 1 }, 'Fetch.requestPaused', {
            ...paused,
            responseStatusCode: 200,
            responseHeaders: [{ name: 'X-Reply', value: 'original' }]
          })
          await settle()
          const received = fixture.state.commands.find(
            item => item.method === 'Fetch.continueResponse'
          )
          assert.ok(received, 'continue native response, never refetch or reconstruct its body')
          assert.equal(
            received.params.responseHeaders?.find(row => row.name === 'X-Reply')?.value,
            headerFields === 'request' ? undefined : 'configured'
          )
          if (networkId)
            fixture.chrome.debugger.onEvent.emit({ tabId: 1 }, 'Network.loadingFinished', {
              requestId: networkId
            })
        }
      }
    }
    await driver.update([], [])
  } finally {
    globalThis.chrome = previous
  }
})

test('expired interception IDs do not set an error badge or receive a second terminal command', async t => {
  t.mock.method(console, 'error', () => {})
  const fixture = browserFixture()
  const previous = globalThis.chrome
  globalThis.chrome = fixture.chrome
  try {
    const driver = createResponseReplacement()
    await driver.update(rules)
    fixture.state.commands.length = 0
    fixture.state.badges.length = 0
    fixture.state.onCommand = async (_session, method) => {
      if (method === 'Fetch.continueRequest')
        throw new Error('{"code":-32602,"message":"Invalid InterceptionId."}')
    }
    fixture.chrome.debugger.onEvent.emit({ tabId: 1 }, 'Fetch.requestPaused', {
      requestId: 'expired',
      resourceType: 'Script',
      request: { url: 'http://example.test/a.js', method: 'GET', headers: {} }
    })
    await settle()
    assert.equal(
      fixture.state.commands.some(item => item.method === 'Fetch.failRequest'),
      false
    )
    assert.equal(
      fixture.state.badges.some(item => item.text === '!'),
      false
    )
    assert.equal(console.error.mock.callCount(), 0)
    await driver.update([], [])
  } finally {
    globalThis.chrome = previous
  }
})

test('detached and foreign sessions cannot process late interception events', async t => {
  t.mock.method(console, 'error', () => {})
  const fixture = browserFixture()
  const previous = globalThis.chrome
  globalThis.chrome = fixture.chrome
  try {
    const driver = createResponseReplacement()
    await driver.update(rules)
    fixture.chrome.debugger.onDetach.emit({ tabId: 1 }, 'target_closed')
    await settle()
    fixture.state.commands.length = 0
    fixture.state.badges.length = 0
    for (const session of [{ tabId: 1 }, { tabId: 9 }, { tabId: 1, sessionId: 'removed' }]) {
      fixture.chrome.debugger.onEvent.emit(session, 'Fetch.requestPaused', {
        requestId: 'late',
        resourceType: 'Script',
        request: { url: 'http://example.test/a.js', method: 'GET', headers: {} }
      })
    }
    await settle()
    assert.deepEqual(fixture.state.commands, [])
    assert.deepEqual(fixture.state.badges, [])
    await driver.update([], [])
  } finally {
    globalThis.chrome = previous
  }
})

test('duplicate in-flight pause events have one command and stale rejections cannot fail a new session', async t => {
  t.mock.method(console, 'error', () => {})
  const fixture = browserFixture()
  const previous = globalThis.chrome
  globalThis.chrome = fixture.chrome
  try {
    const driver = createResponseReplacement()
    await driver.update(rules)
    let rejectCommand
    fixture.state.onCommand = (_session, method) =>
      method === 'Fetch.continueRequest'
        ? new Promise((_resolve, reject) => {
            rejectCommand = reject
          })
        : undefined
    const pause = {
      requestId: 'pending',
      resourceType: 'Script',
      request: { url: 'http://example.test/a.js', headers: {} }
    }
    fixture.chrome.debugger.onEvent.emit({ tabId: 1 }, 'Fetch.requestPaused', pause)
    fixture.chrome.debugger.onEvent.emit({ tabId: 1 }, 'Fetch.requestPaused', pause)
    await settle()
    assert.equal(
      fixture.state.commands.filter(item => item.method === 'Fetch.continueRequest').length,
      1
    )
    fixture.chrome.debugger.onDetach.emit({ tabId: 1 }, 'target_closed')
    fixture.state.onCommand = undefined
    await driver.update(rules)
    fixture.state.badges.length = 0
    rejectCommand(new Error('old session failed'))
    await settle()
    assert.equal(
      fixture.state.commands.some(item => item.method === 'Fetch.failRequest'),
      false
    )
    assert.equal(
      fixture.state.badges.some(item => item.text === '!'),
      false
    )
    await driver.update([], [])
  } finally {
    globalThis.chrome = previous
  }
})

test('unsupported child Fetch capability is resumed and not retried during configuration changes', async t => {
  t.mock.method(console, 'error', () => {})
  const fixture = browserFixture()
  const previous = globalThis.chrome
  globalThis.chrome = fixture.chrome
  try {
    const driver = createResponseReplacement()
    await driver.update(rules)
    fixture.state.onCommand = (session, method) => {
      if (session.sessionId === 'worker' && method === 'Fetch.enable')
        throw new Error('{"code":-32601,"message":"\'Fetch.enable\' wasn\'t found"}')
    }
    fixture.chrome.debugger.onEvent.emit({ tabId: 1 }, 'Target.attachedToTarget', {
      sessionId: 'worker',
      targetInfo: { type: 'worker' },
      waitingForDebugger: true
    })
    await settle()
    await driver.update([
      { ...rules[0], requestHeaders: [{ id: 'h', enabled: true, name: 'X-Test', value: 'yes' }] }
    ])
    assert.equal(
      fixture.state.commands.filter(
        item => item.session.sessionId === 'worker' && item.method === 'Fetch.enable'
      ).length,
      1
    )
    assert.ok(
      fixture.state.commands.some(
        item =>
          item.session.sessionId === 'worker' && item.method === 'Runtime.runIfWaitingForDebugger'
      )
    )
    assert.equal(console.error.mock.callCount(), 0)
    await driver.update([], [])
  } finally {
    globalThis.chrome = previous
  }
})

test('child detachment during initialization cannot register a stale session', async t => {
  t.mock.method(console, 'error', () => {})
  const fixture = browserFixture()
  const previous = globalThis.chrome
  globalThis.chrome = fixture.chrome
  try {
    const driver = createResponseReplacement()
    await driver.update(rules)
    let finishEnable
    fixture.state.onCommand = (session, method) =>
      session.sessionId === 'frame' && method === 'Fetch.enable'
        ? new Promise(resolve => {
            finishEnable = resolve
          })
        : undefined
    fixture.chrome.debugger.onEvent.emit({ tabId: 1 }, 'Target.attachedToTarget', {
      sessionId: 'frame',
      targetInfo: { type: 'iframe' },
      waitingForDebugger: true
    })
    await settle()
    fixture.chrome.debugger.onEvent.emit({ tabId: 1 }, 'Target.detachedFromTarget', {
      sessionId: 'frame'
    })
    finishEnable()
    await settle()
    fixture.state.commands.length = 0
    fixture.state.onCommand = undefined
    await driver.update([
      { ...rules[0], requestHeaders: [{ id: 'h', enabled: true, name: 'X-Test', value: 'yes' }] }
    ])
    assert.equal(
      fixture.state.commands.some(item => item.session.sessionId === 'frame'),
      false
    )
    await driver.update([], [])
  } finally {
    globalThis.chrome = previous
  }
})

test('restricted current tab is skipped even when a navigation or tab snapshot says HTTP', async t => {
  t.mock.method(console, 'error', () => {})
  const fixture = browserFixture()
  fixture.state.url = 'chrome://extensions/'
  const previous = globalThis.chrome
  globalThis.chrome = fixture.chrome
  try {
    const driver = createResponseReplacement()
    await driver.update(rules)
    fixture.chrome.webNavigation.onBeforeNavigate.emit({
      tabId: 1,
      frameId: 0,
      url: 'http://example.test/'
    })
    await settle()
    assert.equal(fixture.state.attachCount, 0)
    assert.equal(
      fixture.state.badges.some(item => item.text === '!'),
      false
    )
    fixture.state.url = 'http://example.test/'
    fixture.chrome.tabs.onUpdated.emit(1, { url: fixture.state.url }, { url: fixture.state.url })
    await settle()
    assert.equal(fixture.state.attachCount, 1)
    await driver.update([], [])
  } finally {
    globalThis.chrome = previous
  }
})

test('restricted navigation race does not dismiss future valid connections', async t => {
  t.mock.method(console, 'error', () => {})
  const fixture = browserFixture()
  const previous = globalThis.chrome
  globalThis.chrome = fixture.chrome
  try {
    const driver = createResponseReplacement()
    fixture.state.onAttach = () => {
      throw new Error('Cannot access a chrome:// URL')
    }
    await driver.update(rules)
    assert.equal(
      fixture.state.badges.some(item => item.text === '!'),
      false
    )
    fixture.state.onAttach = undefined
    fixture.chrome.tabs.onUpdated.emit(1, { status: 'complete' }, { url: fixture.state.url })
    await settle()
    assert.equal(fixture.state.attachCount, 1)
    await driver.update([], [])
  } finally {
    globalThis.chrome = previous
  }
})

test('real header command failures remain visible and fail the paused request once', async t => {
  t.mock.method(console, 'error', () => {})
  const fixture = browserFixture()
  const previous = globalThis.chrome
  globalThis.chrome = fixture.chrome
  try {
    const driver = createResponseReplacement()
    await driver.update(rules)
    fixture.state.onCommand = (_session, method) => {
      if (method === 'Fetch.continueRequest') throw new Error('Invalid header name')
    }
    fixture.chrome.debugger.onEvent.emit({ tabId: 1 }, 'Fetch.requestPaused', {
      requestId: 'bad-header',
      resourceType: 'Script',
      request: { url: 'http://example.test/a.js', headers: {} }
    })
    await settle()
    assert.equal(
      fixture.state.badges.some(item => item.text === '!'),
      true
    )
    assert.equal(
      fixture.state.commands.filter(item => item.method === 'Fetch.failRequest').length,
      1
    )
    await driver.update([], [])
  } finally {
    globalThis.chrome = previous
  }
})

test('cancelled native loading does not produce a false document failure', async t => {
  t.mock.method(console, 'error', () => {})
  const fixture = browserFixture()
  const previous = globalThis.chrome
  globalThis.chrome = fixture.chrome
  try {
    const driver = createResponseReplacement()
    await driver.update(rules)
    fixture.state.badges.length = 0
    const request = { url: 'http://example.test/', method: 'GET', headers: {} }
    fixture.chrome.debugger.onEvent.emit({ tabId: 1 }, 'Fetch.requestPaused', {
      requestId: 'cancelled-doc',
      networkId: 'net',
      resourceType: 'Document',
      request
    })
    await settle()
    fixture.chrome.debugger.onEvent.emit({ tabId: 1 }, 'Network.loadingFailed', {
      requestId: 'net',
      canceled: true,
      errorText: 'net::ERR_ABORTED'
    })
    await settle()
    assert.equal(
      fixture.state.badges.some(item => item.text === '!'),
      false
    )
    assert.equal(console.error.mock.callCount(), 0)
    await driver.update([], [])
  } finally {
    globalThis.chrome = previous
  }
})

test('an unexpected child initialization error remains visible but does not leave the child paused', async t => {
  t.mock.method(console, 'error', () => {})
  const fixture = browserFixture()
  const previous = globalThis.chrome
  globalThis.chrome = fixture.chrome
  try {
    const driver = createResponseReplacement()
    await driver.update(rules)
    fixture.state.onCommand = (session, method) => {
      if (session.sessionId === 'frame' && method === 'Fetch.enable')
        throw new Error('Invalid parameters')
    }
    fixture.chrome.debugger.onEvent.emit({ tabId: 1 }, 'Target.attachedToTarget', {
      sessionId: 'frame',
      targetInfo: { type: 'iframe' },
      waitingForDebugger: true
    })
    await settle()
    assert.equal(console.error.mock.callCount(), 1)
    assert.equal(
      fixture.state.commands.filter(
        item =>
          item.session.sessionId === 'frame' && item.method === 'Runtime.runIfWaitingForDebugger'
      ).length,
      1
    )
    await driver.update([], [])
  } finally {
    globalThis.chrome = previous
  }
})

test('response headers use the request-bound source rule even after a configuration update', async () => {
  const fixture = browserFixture()
  const previous = globalThis.chrome
  globalThis.chrome = fixture.chrome
  try {
    const driver = createResponseReplacement()
    const rule = {
      ...rules[0],
      targetUrl: '',
      responseHeaders: [{ id: 'res', enabled: true, name: 'X-Reply', value: 'old' }]
    }
    await driver.update([rule])
    const request = { url: 'http://example.test/api', method: 'GET', headers: {} }
    fixture.chrome.debugger.onEvent.emit({ tabId: 1 }, 'Fetch.requestPaused', {
      requestId: 'snapshot',
      networkId: 'net',
      resourceType: 'Fetch',
      request
    })
    await settle()
    await driver.update([
      { ...rule, responseHeaders: [{ ...rule.responseHeaders[0], value: 'new' }] }
    ])
    fixture.chrome.debugger.onEvent.emit({ tabId: 1 }, 'Network.requestWillBeSent', {
      requestId: 'net',
      request
    })
    fixture.chrome.debugger.onEvent.emit({ tabId: 1 }, 'Fetch.requestPaused', {
      requestId: 'snapshot',
      networkId: 'net',
      resourceType: 'Fetch',
      request,
      responseStatusCode: 200,
      responseHeaders: []
    })
    await settle()
    assert.equal(
      fixture.state.commands.find(item => item.method === 'Fetch.continueResponse').params
        .responseHeaders[0].value,
      'old'
    )
    await driver.update([], [])
  } finally {
    globalThis.chrome = previous
  }
})

test('native redirect binds the source rule before target metadata and does not rematch the destination', async () => {
  const fixture = browserFixture()
  const previous = globalThis.chrome
  globalThis.chrome = fixture.chrome
  try {
    const driver = createResponseReplacement()
    const sourceRule = {
      ...rules[0],
      requestHeaders: [{ id: 'a', enabled: true, name: 'X-Rule', value: 'source' }],
      responseHeaders: [{ id: 'reply', enabled: true, name: 'X-Reply', value: 'source' }]
    }
    const targetRule = {
      ...sourceRule,
      id: 'destination',
      sourceUrl: 'http://localhost:8098/',
      targetUrl: '',
      requestHeaders: [{ id: 'b', enabled: true, name: 'X-Rule', value: 'destination' }]
    }
    await driver.update([sourceRule, targetRule])
    fixture.chrome.debugger.onEvent.emit({ tabId: 1 }, 'Network.requestWillBeSent', {
      requestId: 'net',
      request: { url: 'http://example.test/api' }
    })
    const request = {
      url: 'http://localhost:8098/api',
      method: 'POST',
      headers: {},
      hasPostData: true
    }
    const paused = { requestId: 'redirected', networkId: 'net', resourceType: 'XHR', request }
    fixture.chrome.debugger.onEvent.emit({ tabId: 1 }, 'Fetch.requestPaused', paused)
    await settle()
    assert.equal(
      fixture.state.commands.find(item => item.method === 'Fetch.continueRequest').params.headers[0]
        .value,
      'source'
    )
    fixture.chrome.debugger.onEvent.emit({ tabId: 1 }, 'Network.requestWillBeSent', {
      requestId: 'net',
      request,
      redirectResponse: { url: 'http://example.test/api' }
    })
    fixture.chrome.debugger.onEvent.emit({ tabId: 1 }, 'Fetch.requestPaused', {
      ...paused,
      responseStatusCode: 200,
      responseHeaders: []
    })
    await settle()
    assert.equal(
      fixture.state.commands.find(item => item.method === 'Fetch.continueResponse').params
        .responseHeaders[0].value,
      'source'
    )
    fixture.chrome.debugger.onEvent.emit({ tabId: 1 }, 'Fetch.requestPaused', {
      ...paused,
      requestId: 'direct',
      networkId: undefined
    })
    await settle()
    assert.equal(
      fixture.state.commands.filter(item => item.method === 'Fetch.continueRequest').at(-1).params
        .headers[0].value,
      'destination'
    )
    await driver.update([], [])
  } finally {
    globalThis.chrome = previous
  }
})

test('completed, failed and detached sessions cannot leak source ownership into later requests', async () => {
  const previous = globalThis.chrome
  try {
    for (const cleanup of [
      'Network.loadingFinished',
      'Network.loadingFailed',
      'Target.detachedFromTarget',
      'disable'
    ]) {
      const fixture = browserFixture()
      globalThis.chrome = fixture.chrome
      const driver = createResponseReplacement()
      const rule = {
        ...rules[0],
        requestHeaders: [{ id: 'req', enabled: true, name: 'X-Rule', value: 'private' }]
      }
      await driver.update([rule])
      const session = { tabId: 1, sessionId: 'child' }
      const attachChild = async () => {
        fixture.chrome.debugger.onEvent.emit({ tabId: 1 }, 'Target.attachedToTarget', {
          sessionId: 'child',
          targetInfo: { type: 'iframe' },
          waitingForDebugger: true
        })
        await settle()
      }
      await attachChild()
      fixture.chrome.debugger.onEvent.emit(session, 'Network.requestWillBeSent', {
        requestId: 'net',
        request: { url: 'http://example.test/api' }
      })
      if (cleanup === 'disable') {
        await driver.update([], [])
        await driver.update([rule])
        await attachChild()
      } else if (cleanup === 'Target.detachedFromTarget') {
        fixture.chrome.debugger.onEvent.emit({ tabId: 1 }, cleanup, { sessionId: 'child' })
      } else {
        fixture.chrome.debugger.onEvent.emit(session, cleanup, {
          requestId: 'net',
          errorText: 'fixture failure'
        })
      }
      fixture.state.commands.length = 0
      fixture.chrome.debugger.onEvent.emit(session, 'Fetch.requestPaused', {
        requestId: 'later',
        networkId: 'net',
        resourceType: 'XHR',
        request: { url: 'http://localhost:8098/api', method: 'GET', headers: {} }
      })
      await settle()
      const sent = fixture.state.commands.find(item => item.method === 'Fetch.continueRequest')
      if (cleanup === 'Target.detachedFromTarget') assert.equal(sent, undefined, cleanup)
      else assert.equal(sent.params.headers, undefined, cleanup)
      await driver.update([], [])
    }
  } finally {
    globalThis.chrome = previous
  }
})

test('same-address XHR edits both headers without URL rewrite, response replacement or body reconstruction', async () => {
  const fixture = browserFixture()
  const previous = globalThis.chrome
  const originalFetch = globalThis.fetch
  globalThis.chrome = fixture.chrome
  let fetches = 0
  globalThis.fetch = async () => {
    fetches++
    return new Response('unexpected')
  }
  try {
    const driver = createResponseReplacement()
    await driver.update([
      {
        ...rules[0],
        targetUrl: rules[0].sourceUrl,
        requestHeaders: [{ id: 'req', enabled: true, name: 'X-Label', value: 'xianghe11' }],
        responseHeaders: [{ id: 'res', enabled: true, name: 'X-Reply', value: 'configured' }]
      }
    ])
    const request = {
      url: 'http://example.test/api/list',
      method: 'POST',
      headers: { 'X-Original': 'keep', Cookie: 'session=keep' },
      hasPostData: true
    }
    fixture.chrome.debugger.onEvent.emit({ tabId: 1 }, 'Network.requestWillBeSent', {
      requestId: 'net',
      request
    })
    fixture.chrome.debugger.onEvent.emit({ tabId: 1 }, 'Fetch.requestPaused', {
      requestId: 'xhr',
      networkId: 'net',
      resourceType: 'XHR',
      request
    })
    await settle()
    const sent = fixture.state.commands.find(
      item => item.method === 'Fetch.continueRequest' && item.params.requestId === 'xhr'
    )
    assert.deepEqual(sent.params.headers, [
      { name: 'X-Original', value: 'keep' },
      { name: 'Cookie', value: 'session=keep' },
      { name: 'X-Label', value: 'xianghe11' }
    ])
    assert.equal(sent.params.url, undefined)
    assert.equal(sent.params.postData, undefined)
    fixture.chrome.debugger.onEvent.emit({ tabId: 1 }, 'Fetch.requestPaused', {
      requestId: 'xhr',
      networkId: 'net',
      resourceType: 'XHR',
      request,
      responseStatusCode: 200,
      responseHeaders: [
        { name: 'Content-Encoding', value: 'gzip' },
        { name: 'X-Reply', value: 'original' }
      ]
    })
    await settle()
    const received = fixture.state.commands.find(
      item => item.method === 'Fetch.continueResponse' && item.params.requestId === 'xhr'
    )
    assert.deepEqual(received.params.responseHeaders, [
      { name: 'Content-Encoding', value: 'gzip' },
      { name: 'X-Reply', value: 'configured' }
    ])
    assert.equal(fetches, 0)
    assert.equal(
      fixture.state.commands.some(item => item.method === 'Fetch.fulfillRequest'),
      false
    )
    await driver.update([], [])
  } finally {
    globalThis.chrome = previous
    globalThis.fetch = originalFetch
  }
})

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

test('document URL rewrite preserves browser-owned POST body and applies configured headers', async () => {
  const fixture = browserFixture()
  const previous = globalThis.chrome
  const previousFetch = globalThis.fetch
  globalThis.chrome = fixture.chrome
  let backgroundFetches = 0
  globalThis.fetch = async () => {
    backgroundFetches++
    return new Response('old replacement')
  }
  try {
    const driver = createResponseReplacement()
    await driver.update([
      {
        ...rules[0],
        requestHeaders: [{ id: 'request', enabled: true, name: 'X-Test', value: 'configured' }],
        responseHeaders: [{ id: 'response', enabled: true, name: 'X-Reply', value: 'configured' }]
      }
    ])
    const request = {
      url: 'http://example.test/post',
      method: 'POST',
      headers: { 'X-Original': 'keep' },
      hasPostData: true,
      postData: 'message=hello'
    }
    fixture.chrome.debugger.onEvent.emit({ tabId: 1 }, 'Fetch.requestPaused', {
      requestId: 'document',
      networkId: 'network',
      resourceType: 'Document',
      request
    })
    await settle()
    assert.equal(backgroundFetches, 0, 'browser must load the target, not extension fetch')
    const command = fixture.state.commands.find(
      item => item.method === 'Fetch.continueRequest' && item.params.requestId === 'document'
    )
    assert.equal(command.params.url, 'http://localhost:8098/post')
    assert.equal(command.params.interceptResponse, true)
    assert.equal(command.params.postData, undefined, 'do not reconstruct or override POST body')
    assert.deepEqual(command.params.headers, [
      { name: 'X-Original', value: 'keep' },
      { name: 'X-Test', value: 'configured' }
    ])
    fixture.chrome.debugger.onEvent.emit({ tabId: 1 }, 'Fetch.requestPaused', {
      requestId: 'document',
      networkId: 'network',
      resourceType: 'Document',
      request,
      responseStatusCode: 200,
      responseStatusText: 'OK',
      responseHeaders: [
        { name: 'Content-Encoding', value: 'gzip' },
        { name: 'X-Reply', value: 'original' }
      ]
    })
    await settle()
    const response = fixture.state.commands.find(item => item.method === 'Fetch.continueResponse')
    assert.deepEqual(response.params.responseHeaders, [
      { name: 'Content-Encoding', value: 'gzip' },
      { name: 'X-Reply', value: 'configured' }
    ])
    assert.equal(
      fixture.state.commands.some(item => item.method === 'Fetch.fulfillRequest'),
      false
    )
    await driver.update([], [])
  } finally {
    globalThis.chrome = previous
    globalThis.fetch = previousFetch
  }
})

test('rewritten document rejects downstream redirects when request header overrides are enabled', async () => {
  const fixture = browserFixture()
  const previous = globalThis.chrome
  const previousFetch = globalThis.fetch
  globalThis.chrome = fixture.chrome
  globalThis.fetch = async () => new Response('old replacement')
  try {
    const driver = createResponseReplacement()
    await driver.update([
      {
        ...rules[0],
        requestHeaders: [
          { id: 'auth', enabled: true, name: 'Authorization', value: 'Bearer private' }
        ]
      }
    ])
    const request = { url: 'http://example.test/page', method: 'GET', headers: {} }
    fixture.chrome.debugger.onEvent.emit({ tabId: 1 }, 'Fetch.requestPaused', {
      requestId: 'redirecting-document',
      resourceType: 'Document',
      request
    })
    await settle()
    fixture.chrome.debugger.onEvent.emit({ tabId: 1 }, 'Fetch.requestPaused', {
      requestId: 'redirecting-document',
      resourceType: 'Document',
      request,
      responseStatusCode: 302,
      responseHeaders: [{ name: 'Location', value: 'http://third-party.test/' }]
    })
    await settle()
    assert.ok(
      fixture.state.commands.some(
        item =>
          item.method === 'Fetch.failRequest' && item.params.requestId === 'redirecting-document'
      )
    )
    await driver.update([], [])
  } finally {
    globalThis.chrome = previous
    globalThis.fetch = previousFetch
  }
})
