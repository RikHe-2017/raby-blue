import { requireValue } from './test-utils/fixtures'
import { expect, test, vi } from 'vitest'
import { createResponseReplacement } from './document-response.ts'
import { ResponseProxy } from './proxy/ResponseProxy.ts'
import type { ProxyRule } from './types/proxy'
import { createTestEvent as event } from './test-utils/fixtures'
import type { DebugCommand, DebugSession } from './test-utils/fixtures'
import { setLogSink } from './utils/logger'
import type { LogEntry } from './logging/model'
import { createFlowLogger } from './logging/flow-logger'
const settle = async () => {
  for (let count = 0; count < 8; count++) await new Promise(resolve => setImmediate(resolve))
}
const rules: ProxyRule[] = [
  {
    id: 'r',
    name: 'test',
    type: 'rule' as const,
    groupId: 'g',
    enabled: true,
    sourceUrl: 'http://example.test/',
    targetUrl: 'http://localhost:8098/'
  }
]

test('failed responses keep one contextual log without title display or navigation replay', async () => {
  const fixture = browserFixture()
  const setTitle = vi.spyOn(fixture.chrome.action, 'setTitle')
  vi.stubGlobal('chrome', fixture.chrome)
  const entries: LogEntry[] = []
  setLogSink(async entry => {
    entries.push(entry)
  })
  const driver = createResponseReplacement()
  const sourceUrl = 'http://example.test/page?token=original'
  const targetUrl = 'http://localhost:8098/page?token=original'
  try {
    await driver.update(rules)
    const paused = {
      requestId: 'failed-doc',
      networkId: 'failed-net',
      resourceType: 'Document',
      request: { url: sourceUrl, method: 'GET', headers: {} }
    }
    fixture.chrome.debugger.onEvent.emit({ tabId: 1 }, 'Fetch.requestPaused', paused)
    await settle()
    fixture.chrome.debugger.onEvent.emit({ tabId: 1 }, 'Fetch.requestPaused', {
      ...paused,
      request: { ...paused.request, url: targetUrl },
      responseErrorReason: 'ConnectionRefused'
    })
    await settle()
    const context = { sourceUrl, targetUrl, ruleName: 'test' }
    expect(entries).toHaveLength(1)
    expect(entries[0].message).toBe('代理请求失败')
    expect(entries[0].details).toEqual([
      expect.objectContaining({ ...context, reason: 'ConnectionRefused' })
    ])
    expect(setTitle).not.toHaveBeenCalled()
    expect(fixture.state.badges).toEqual([])
    expect(fixture.chrome.webNavigation.onErrorOccurred.size).toBe(0)
    fixture.chrome.webNavigation.onErrorOccurred.emit({ tabId: 1, frameId: 0 })
    await settle()
    expect(entries).toHaveLength(1)
    expect(entries[0].details).toEqual([
      expect.objectContaining({ ...context, reason: 'ConnectionRefused' })
    ])
  } finally {
    await driver.update([], [])
    setLogSink(async () => {})
  }
})

test('replacement fetch failures also identify the original request and matched configuration', async () => {
  const fixture = browserFixture()
  const originalFetch = globalThis.fetch
  vi.stubGlobal('chrome', fixture.chrome)
  vi.stubGlobal('fetch', async () => {
    throw new Error('offline')
  })
  const entries: LogEntry[] = []
  setLogSink(async entry => {
    entries.push(entry)
  })
  const driver = createResponseReplacement()
  try {
    await driver.update(rules, ['script'])
    fixture.chrome.debugger.onEvent.emit({ tabId: 1 }, 'Fetch.requestPaused', {
      requestId: 'script',
      resourceType: 'Script',
      request: { url: 'http://example.test/main.js', method: 'GET', headers: {} }
    })
    await settle()
    expect(entries.at(-1)?.details).toEqual([
      expect.objectContaining({
        sourceUrl: 'http://example.test/main.js',
        targetUrl: 'http://localhost:8098/main.js',
        ruleName: 'test',
        reason: 'Error: offline'
      })
    ])
  } finally {
    await driver.update([], [])
    vi.stubGlobal('fetch', originalFetch)
    setLogSink(async () => {})
  }
})

test.each([false, true])(
  'header-only logging waits for completion, independent of notification: failed=%s',
  async failed => {
    const fixture = browserFixture()
    vi.stubGlobal('chrome', fixture.chrome)
    const entries: LogEntry[] = []
    setLogSink(async entry => {
      entries.push(entry)
    })
    const driver = createResponseReplacement()
    try {
      await driver.update([
        {
          ...rules[0],
          targetUrl: '',
          showSuccessNotification: false,
          requestHeaders: [
            { id: 'h', enabled: true, name: 'Authorization', value: 'Bearer original' }
          ]
        }
      ])
      const request = {
        requestId: 'h',
        networkId: 'net',
        resourceType: 'XHR',
        request: {
          url: 'http://example.test/api?token=original',
          method: 'GET',
          headers: { Accept: 'json' }
        }
      }
      fixture.chrome.debugger.onEvent.emit({ tabId: 1 }, 'Fetch.requestPaused', request)
      await settle()
      expect(entries.filter(entry => entry.level === 'info')).toHaveLength(0)
      fixture.chrome.debugger.onEvent.emit({ tabId: 1 }, 'Fetch.requestPaused', {
        ...request,
        responseStatusCode: 200,
        responseHeaders: []
      })
      await settle()
      fixture.chrome.debugger.onEvent.emit(
        { tabId: 1 },
        failed ? 'Network.loadingFailed' : 'Network.loadingFinished',
        { requestId: 'net', ...(failed ? { errorText: 'net::ERR_FAILED' } : {}) }
      )
      const logs = entries.filter(entry => entry.level === 'info')
      expect(logs).toHaveLength(failed ? 0 : 1)
      if (!failed)
        expect(logs[0].details).toEqual([
          expect.objectContaining({
            sourceUrl: request.request.url,
            targetUrl: request.request.url,
            ruleName: 'test',
            requestHeaders: { Authorization: 'Bearer original' }
          })
        ])
    } finally {
      await driver.update([], [])
      setLogSink(async () => {})
    }
  }
)
test.each([false, true])(
  'network terminal before command resolution is recorded once: failed=%s',
  async failed => {
    const fixture = browserFixture()
    vi.stubGlobal('chrome', fixture.chrome)
    const entries: LogEntry[] = []
    setLogSink(async entry => {
      entries.push(entry)
    })
    let release!: () => void
    fixture.state.onCommand = async (_session, method) => {
      if (method === 'Fetch.continueRequest')
        await new Promise<void>(resolve => {
          release = resolve
        })
    }
    const driver = createResponseReplacement()
    try {
      await driver.update(rules)
      fixture.chrome.debugger.onEvent.emit({ tabId: 1 }, 'Fetch.requestPaused', {
        requestId: 'early',
        networkId: 'early-net',
        resourceType: 'Document',
        request: { url: 'http://example.test/early', method: 'GET', headers: {} }
      })
      await settle()
      fixture.chrome.debugger.onEvent.emit(
        { tabId: 1 },
        failed ? 'Network.loadingFailed' : 'Network.loadingFinished',
        {
          requestId: 'early-net',
          ...(failed ? { errorText: 'net::ERR_CONNECTION_REFUSED' } : {})
        }
      )
      expect(entries).toHaveLength(0)
      release()
      await settle()
      expect(entries).toHaveLength(1)
      expect(entries[0].message).toBe(failed ? '代理请求失败' : '代理请求已处理')
      expect(entries[0].details).toEqual([
        expect.objectContaining({
          sourceUrl: 'http://example.test/early',
          targetUrl: 'http://localhost:8098/early'
        })
      ])
    } finally {
      await driver.update([], [])
      setLogSink(async () => {})
    }
  }
)

test('failed proxy command cancels business trace before synthetic network failure', async () => {
  const fixture = browserFixture()
  vi.stubGlobal('chrome', fixture.chrome)
  const entries: LogEntry[] = []
  setLogSink(async entry => {
    entries.push(entry)
  })
  fixture.state.onCommand = async (_session, method) => {
    if (method === 'Fetch.continueRequest') throw Error('bad command')
    if (method === 'Fetch.failRequest')
      fixture.chrome.debugger.onEvent.emit({ tabId: 1 }, 'Network.loadingFailed', {
        requestId: 'net',
        errorText: 'net::ERR_FAILED'
      })
  }
  const driver = createResponseReplacement()
  try {
    await driver.update(rules)
    fixture.chrome.debugger.onEvent.emit({ tabId: 1 }, 'Fetch.requestPaused', {
      requestId: 'command',
      networkId: 'net',
      resourceType: 'Document',
      request: { url: 'http://example.test/command', method: 'GET', headers: {} }
    })
    await settle()
    expect(entries).toHaveLength(1)
    expect(entries[0].message).toBe('Error: bad command')
    expect(entries[0].details).toEqual([])
  } finally {
    await driver.update([], [])
    setLogSink(async () => {})
  }
})

test('fallback fulfillment command errors remain ordinary errors, not target network failures', async () => {
  const fixture = browserFixture()
  vi.stubGlobal('chrome', fixture.chrome)
  vi.stubGlobal('fetch', async () => new Response('local'))
  const entries: LogEntry[] = []
  setLogSink(async entry => {
    entries.push(entry)
  })
  fixture.state.onCommand = (_session, method) => {
    if (method === 'Fetch.fulfillRequest') throw Error('fulfillment command failed')
  }
  const driver = createResponseReplacement()
  try {
    await driver.update(rules, ['script'])
    fixture.chrome.debugger.onEvent.emit({ tabId: 1 }, 'Fetch.requestPaused', {
      requestId: 'fallback-command',
      resourceType: 'Script',
      request: { url: 'http://example.test/a.js', method: 'GET', headers: {} }
    })
    await settle()
    expect(entries).toHaveLength(1)
    expect(entries[0].message).toBe('Error: fulfillment command failed')
    expect(entries[0].details).toEqual([])
  } finally {
    await driver.update([], [])
    setLogSink(async () => {})
    vi.unstubAllGlobals()
  }
})

test('unavailable log storage does not suppress page success notifications', async () => {
  const fixture = browserFixture()
  vi.stubGlobal('chrome', fixture.chrome)
  const complete = vi.fn()
  const driver = createResponseReplacement(
    { begin: () => complete },
    undefined,
    createFlowLogger({
      write: () => {
        throw Error('unavailable storage')
      }
    })
  )
  try {
    await driver.update(rules)
    fixture.chrome.debugger.onEvent.emit({ tabId: 1 }, 'Fetch.requestPaused', {
      requestId: 'notice',
      networkId: 'notice-net',
      resourceType: 'Document',
      request: { url: 'http://example.test/page', method: 'GET', headers: {} }
    })
    await settle()
    fixture.chrome.debugger.onEvent.emit({ tabId: 1 }, 'Fetch.requestPaused', {
      requestId: 'notice',
      networkId: 'notice-net',
      resourceType: 'Document',
      responseStatusCode: 200,
      request: { url: 'http://localhost:8098/page', method: 'GET', headers: {} }
    })
    await settle()
    fixture.chrome.debugger.onEvent.emit({ tabId: 1 }, 'Network.loadingFinished', {
      requestId: 'notice-net'
    })
    expect(complete).toHaveBeenCalledOnce()
  } finally {
    await driver.update([], [])
  }
})

interface BrowserState {
  connected: boolean
  attachCount: number
  detachCount: number
  commands: DebugCommand[]
  badges: {
    tabId: number
    text: string
  }[]
  url: string
  onAttach?: () => void | Promise<void>
  onCommand?: (session: DebugSession, method: string, params: DebugCommand['params']) => unknown
}
function browserFixture() {
  const state: BrowserState = {
    connected: false,
    attachCount: 0,
    detachCount: 0,
    commands: [],
    badges: [],
    url: 'http://example.test/'
  }
  const chrome = {
    storage: {
      session: {
        async get() {
          return {}
        },
        async set() {}
      }
    },
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
        state.detachCount++
      },
      async sendCommand(session: DebugSession, method: string, params: DebugCommand['params']) {
        if (!state.connected) throw new Error('Debugger is not attached')
        state.commands.push({ session, method, params })
        return state.onCommand?.(session, method, params)
      }
    },
    action: {
      async setBadgeText(value: { tabId: number; text: string }) {
        state.badges.push(value)
      },
      async setBadgeBackgroundColor() {},
      async setTitle() {}
    },
    webNavigation: { onBeforeNavigate: event(), onErrorOccurred: event() },
    tabs: {
      onUpdated: event(),
      onRemoved: event(),
      async get(id: number) {
        return { id, url: state.url }
      },
      async query() {
        return [{ id: 1, url: 'http://example.test/' }]
      }
    }
  }
  return { chrome, state }
}
test('scoped response interception follows the selected tab and ignores inactive navigation', async () => {
  const fixture = browserFixture()
  const previous = globalThis.chrome
  vi.stubGlobal('chrome', fixture.chrome)
  fixture.chrome.tabs.query = async () => [
    { id: 1, url: 'http://example.test/' },
    { id: 2, url: 'http://other.test/' }
  ]
  fixture.chrome.tabs.get = async (id: number) => ({
    id,
    url: id === 1 ? 'http://example.test/' : 'http://other.test/'
  })
  try {
    const driver = createResponseReplacement()
    await driver.update(rules, ['document'], undefined, { tabId: 1 })
    expect(fixture.state.attachCount).toBe(1)

    await driver.update(rules, ['document'], undefined, { tabId: 2 })
    expect(fixture.state.attachCount).toBe(2)
    expect(fixture.state.detachCount).toBe(1)

    fixture.chrome.tabs.onUpdated.emit(
      1,
      { url: 'http://example.test/next' },
      {
        url: 'http://example.test/next'
      }
    )
    fixture.chrome.webNavigation.onBeforeNavigate.emit({
      tabId: 1,
      frameId: 0,
      url: 'http://example.test/next'
    })
    await settle()
    expect(fixture.state.attachCount).toBe(2)

    await driver.update(rules, ['document'], undefined, { tabId: undefined })
    expect(fixture.state.detachCount).toBe(2)

    await driver.update([], [], undefined, { tabId: undefined })
  } finally {
    vi.stubGlobal('chrome', previous)
  }
})

test('scoped response interception skips a non-http target tab', async () => {
  const fixture = browserFixture()
  const previous = globalThis.chrome
  vi.stubGlobal('chrome', fixture.chrome)
  fixture.state.url = 'chrome://extensions/'
  try {
    const driver = createResponseReplacement()
    await driver.update(rules, ['document'], undefined, { tabId: 1 })
    expect(fixture.state.attachCount).toBe(0)
    await driver.update([], [], undefined, { tabId: undefined })
  } finally {
    vi.stubGlobal('chrome', previous)
  }
})
test('real debugger initialization failure rejects configuration application', async () => {
  const f = browserFixture()
  vi.stubGlobal('chrome', f.chrome)
  vi.spyOn(console, 'log').mockImplementation(() => {})
  f.state.onCommand = (_session, method) => {
    if (method === 'Fetch.enable') throw new Error('interception unavailable')
  }
  const driver = createResponseReplacement()
  await expect(driver.update(rules)).rejects.toThrow('interception unavailable')
  await driver.update([], [])
  expect(f.state.connected).toBe(false)
})

test('initialization waits for an event-started connection and receives its failure', async () => {
  const f = browserFixture()
  vi.stubGlobal('chrome', f.chrome)
  vi.spyOn(console, 'log').mockImplementation(() => {})
  let rejectConnection!: (error: Error) => void
  f.state.onCommand = (_session, method) => {
    if (method === 'Fetch.enable')
      return new Promise<void>((_resolve, reject) => {
        rejectConnection = reject
      })
  }
  f.chrome.tabs.query = async () => {
    f.chrome.tabs.onUpdated.emit(1, { status: 'complete' }, { url: f.state.url })
    await vi.waitFor(() => expect(rejectConnection).toBeTypeOf('function'))
    return [{ id: 1, url: f.state.url }]
  }
  const driver = createResponseReplacement()
  let outcome = 'pending'
  const applying = driver.update(rules).then(
    () => {
      outcome = 'ready'
    },
    () => {
      outcome = 'failed'
    }
  )
  await vi.waitFor(() => expect(rejectConnection).toBeTypeOf('function'))
  await settle()
  const before = outcome
  rejectConnection(new Error('event-started interception failed'))
  await applying
  await driver.update([], [])
  expect(before).toBe('pending')
  expect(outcome).toBe('failed')
  expect(f.state.connected).toBe(false)
})

test('debugger cleanup failure is reported and may be retried', async () => {
  const f = browserFixture()
  vi.stubGlobal('chrome', f.chrome)
  const driver = createResponseReplacement()
  await driver.update(rules)
  const detach = f.chrome.debugger.detach
  f.chrome.debugger.detach = async () => {
    throw new Error('detach denied')
  }
  await expect(driver.update([], [])).rejects.toThrow('detach denied')
  f.chrome.debugger.detach = detach
  await driver.update([], [])
  expect(f.state.connected).toBe(false)
})

test('aborting initialization waits for late attachment cleanup and cannot enable Fetch', async () => {
  const f = browserFixture()
  vi.stubGlobal('chrome', f.chrome)
  let finish!: () => void
  f.state.onAttach = () =>
    new Promise<void>(resolve => {
      finish = resolve
    })
  const driver = createResponseReplacement()
  const controller = new AbortController()
  const applying = driver.update(rules, ['document'], controller.signal)
  const rejected = expect(applying).rejects.toThrow()
  await vi.waitFor(() => expect(finish).toBeTypeOf('function'))
  controller.abort()
  let cleaned = false
  const cleanup = driver.update([], []).then(() => {
    cleaned = true
  })
  await Promise.resolve()
  expect(cleaned).toBe(false)
  finish()
  await rejected
  await cleanup
  expect(f.state.connected).toBe(false)
  expect(f.state.commands.some(command => command.method === 'Fetch.enable')).toBe(false)
})
test('success notifications wait for applied response and completed loading, never network failure', async () => {
  const fixture = browserFixture()
  const previous = globalThis.chrome
  vi.stubGlobal('chrome', fixture.chrome)
  try {
    const started: [number, string][] = []
    const completed: string[] = []
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
    expect(started.length).toBe(1)
    expect(completed).toStrictEqual([])
    fixture.chrome.debugger.onEvent.emit({ tabId: 1 }, 'Fetch.requestPaused', {
      ...paused,
      responseStatusCode: 200,
      responseHeaders: []
    })
    await settle()
    expect(completed, 'receiving response headers is not completed loading').toStrictEqual([])
    fixture.chrome.debugger.onEvent.emit({ tabId: 1 }, 'Network.loadingFinished', {
      requestId: paused.networkId
    })
    expect(completed).toStrictEqual(['r'])
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
    expect(completed).toStrictEqual(['r'])
    await driver.update([], [])
  } finally {
    vi.stubGlobal('chrome', previous)
  }
})
test('source headers do not depend on Network event order or an optional network ID', async () => {
  const fixture = browserFixture()
  const previous = globalThis.chrome
  vi.stubGlobal('chrome', fixture.chrome)
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
          expect(
            requireValue(sent).params.headers?.find(row => row.name === 'X-Label')?.value
          ).toBe(headerFields === 'response' ? undefined : 'configured')
          expect(requireValue(sent).params.url).toBe(undefined)
          expect(requireValue(sent).params.postData).toBe(undefined)
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
          expect(
            received,
            'continue native response, never refetch or reconstruct its body'
          ).toBeTruthy()
          expect(
            requireValue(received).params.responseHeaders?.find(row => row.name === 'X-Reply')
              ?.value
          ).toBe(headerFields === 'request' ? undefined : 'configured')
          if (networkId)
            fixture.chrome.debugger.onEvent.emit({ tabId: 1 }, 'Network.loadingFinished', {
              requestId: networkId
            })
        }
      }
    }
    await driver.update([], [])
  } finally {
    vi.stubGlobal('chrome', previous)
  }
})
test('expired interception IDs do not set an error badge or receive a second terminal command', async () => {
  vi.spyOn(console, 'log').mockImplementation(() => {})
  const fixture = browserFixture()
  const previous = globalThis.chrome
  vi.stubGlobal('chrome', fixture.chrome)
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
    expect(fixture.state.commands.some(item => item.method === 'Fetch.failRequest')).toBe(false)
    expect(fixture.state.badges.some(item => item.text === '!')).toBe(false)
    expect(vi.mocked(console.log).mock.calls.length).toBe(0)
    await driver.update([], [])
  } finally {
    vi.stubGlobal('chrome', previous)
  }
})
test('detached and foreign sessions cannot process late interception events', async () => {
  vi.spyOn(console, 'log').mockImplementation(() => {})
  const fixture = browserFixture()
  const previous = globalThis.chrome
  vi.stubGlobal('chrome', fixture.chrome)
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
    expect(fixture.state.commands).toStrictEqual([])
    expect(fixture.state.badges).toStrictEqual([])
    await driver.update([], [])
  } finally {
    vi.stubGlobal('chrome', previous)
  }
})
test('duplicate in-flight pause events have one command and stale rejections cannot fail a new session', async () => {
  vi.spyOn(console, 'log').mockImplementation(() => {})
  const fixture = browserFixture()
  const previous = globalThis.chrome
  vi.stubGlobal('chrome', fixture.chrome)
  try {
    const driver = createResponseReplacement()
    await driver.update(rules)
    let rejectCommand!: (error: Error) => void
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
    expect(
      fixture.state.commands.filter(item => item.method === 'Fetch.continueRequest').length
    ).toBe(1)
    fixture.chrome.debugger.onDetach.emit({ tabId: 1 }, 'target_closed')
    fixture.state.onCommand = undefined
    await driver.update(rules)
    fixture.state.badges.length = 0
    rejectCommand(new Error('old session failed'))
    await settle()
    expect(fixture.state.commands.some(item => item.method === 'Fetch.failRequest')).toBe(false)
    expect(fixture.state.badges.some(item => item.text === '!')).toBe(false)
    await driver.update([], [])
  } finally {
    vi.stubGlobal('chrome', previous)
  }
})
test('unsupported child Fetch capability is resumed and not retried during configuration changes', async () => {
  vi.spyOn(console, 'log').mockImplementation(() => {})
  const fixture = browserFixture()
  const previous = globalThis.chrome
  vi.stubGlobal('chrome', fixture.chrome)
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
    expect(
      fixture.state.commands.filter(
        item => item.session.sessionId === 'worker' && item.method === 'Fetch.enable'
      ).length
    ).toBe(1)
    expect(
      fixture.state.commands.some(
        item =>
          item.session.sessionId === 'worker' && item.method === 'Runtime.runIfWaitingForDebugger'
      )
    ).toBeTruthy()
    expect(vi.mocked(console.log).mock.calls.length).toBe(0)
    await driver.update([], [])
  } finally {
    vi.stubGlobal('chrome', previous)
  }
})
test('child detachment during initialization cannot register a stale session', async () => {
  vi.spyOn(console, 'log').mockImplementation(() => {})
  const fixture = browserFixture()
  const previous = globalThis.chrome
  vi.stubGlobal('chrome', fixture.chrome)
  try {
    const driver = createResponseReplacement()
    await driver.update(rules)
    let finishEnable!: () => void
    fixture.state.onCommand = (session, method) =>
      session.sessionId === 'frame' && method === 'Fetch.enable'
        ? new Promise<void>(resolve => {
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
    expect(fixture.state.commands.some(item => item.session.sessionId === 'frame')).toBe(false)
    await driver.update([], [])
  } finally {
    vi.stubGlobal('chrome', previous)
  }
})
test('restricted current tab is skipped even when a navigation or tab snapshot says HTTP', async () => {
  vi.spyOn(console, 'log').mockImplementation(() => {})
  const fixture = browserFixture()
  fixture.state.url = 'chrome://extensions/'
  const previous = globalThis.chrome
  vi.stubGlobal('chrome', fixture.chrome)
  try {
    const driver = createResponseReplacement()
    await driver.update(rules)
    fixture.chrome.webNavigation.onBeforeNavigate.emit({
      tabId: 1,
      frameId: 0,
      url: 'http://example.test/'
    })
    await settle()
    expect(fixture.state.attachCount).toBe(0)
    expect(fixture.state.badges.some(item => item.text === '!')).toBe(false)
    fixture.state.url = 'http://example.test/'
    fixture.chrome.tabs.onUpdated.emit(1, { url: fixture.state.url }, { url: fixture.state.url })
    await settle()
    expect(fixture.state.attachCount).toBe(1)
    await driver.update([], [])
  } finally {
    vi.stubGlobal('chrome', previous)
  }
})
test('restricted navigation race does not dismiss future valid connections', async () => {
  vi.spyOn(console, 'log').mockImplementation(() => {})
  const fixture = browserFixture()
  const previous = globalThis.chrome
  vi.stubGlobal('chrome', fixture.chrome)
  try {
    const driver = createResponseReplacement()
    fixture.state.onAttach = () => {
      throw new Error('Cannot access a chrome:// URL')
    }
    await driver.update(rules)
    expect(fixture.state.badges.some(item => item.text === '!')).toBe(false)
    fixture.state.onAttach = undefined
    fixture.chrome.tabs.onUpdated.emit(1, { status: 'complete' }, { url: fixture.state.url })
    await settle()
    expect(fixture.state.attachCount).toBe(1)
    await driver.update([], [])
  } finally {
    vi.stubGlobal('chrome', previous)
  }
})
test('real header command failures are logged without red badges and fail the paused request once', async () => {
  vi.spyOn(console, 'log').mockImplementation(() => {})
  const fixture = browserFixture()
  const previous = globalThis.chrome
  vi.stubGlobal('chrome', fixture.chrome)
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
    expect(fixture.state.badges.some(item => item.text === '!')).toBe(false)
    expect(console.log).toHaveBeenCalledWith(
      '[error]:',
      expect.stringContaining('Invalid header name')
    )
    expect(fixture.state.commands.filter(item => item.method === 'Fetch.failRequest').length).toBe(
      1
    )
    await driver.update([], [])
  } finally {
    vi.stubGlobal('chrome', previous)
  }
})
test('cancelled native loading does not produce a false document failure', async () => {
  vi.spyOn(console, 'log').mockImplementation(() => {})
  const fixture = browserFixture()
  const previous = globalThis.chrome
  vi.stubGlobal('chrome', fixture.chrome)
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
    expect(fixture.state.badges.some(item => item.text === '!')).toBe(false)
    expect(vi.mocked(console.log).mock.calls.length).toBe(0)
    await driver.update([], [])
  } finally {
    vi.stubGlobal('chrome', previous)
  }
})
test('an unexpected child initialization error remains visible but does not leave the child paused', async () => {
  vi.spyOn(console, 'log').mockImplementation(() => {})
  const fixture = browserFixture()
  const previous = globalThis.chrome
  vi.stubGlobal('chrome', fixture.chrome)
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
    expect(vi.mocked(console.log).mock.calls.length).toBe(1)
    expect(vi.mocked(console.log).mock.calls[0][0]).toBe('[error]:')
    expect(
      fixture.state.commands.filter(
        item =>
          item.session.sessionId === 'frame' && item.method === 'Runtime.runIfWaitingForDebugger'
      ).length
    ).toBe(1)
    await driver.update([], [])
  } finally {
    vi.stubGlobal('chrome', previous)
  }
})
test('response headers use the request-bound source rule even after a configuration update', async () => {
  const fixture = browserFixture()
  const previous = globalThis.chrome
  vi.stubGlobal('chrome', fixture.chrome)
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
    expect(
      requireValue(
        requireValue(fixture.state.commands.find(item => item.method === 'Fetch.continueResponse'))
          .params.responseHeaders
      )[0].value
    ).toBe('old')
    await driver.update([], [])
  } finally {
    vi.stubGlobal('chrome', previous)
  }
})
test('native redirect binds the source rule before target metadata and does not rematch the destination', async () => {
  const fixture = browserFixture()
  const previous = globalThis.chrome
  vi.stubGlobal('chrome', fixture.chrome)
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
    expect(
      requireValue(
        requireValue(fixture.state.commands.find(item => item.method === 'Fetch.continueRequest'))
          .params.headers
      )[0].value
    ).toBe('source')
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
    expect(
      requireValue(
        requireValue(fixture.state.commands.find(item => item.method === 'Fetch.continueResponse'))
          .params.responseHeaders
      )[0].value
    ).toBe('source')
    fixture.chrome.debugger.onEvent.emit({ tabId: 1 }, 'Fetch.requestPaused', {
      ...paused,
      requestId: 'direct',
      networkId: undefined
    })
    await settle()
    expect(
      requireValue(
        requireValue(
          fixture.state.commands.filter(item => item.method === 'Fetch.continueRequest').at(-1)
        ).params.headers
      )[0].value
    ).toBe('destination')
    await driver.update([], [])
  } finally {
    vi.stubGlobal('chrome', previous)
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
      vi.stubGlobal('chrome', fixture.chrome)
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
      if (cleanup === 'Target.detachedFromTarget') expect(sent, cleanup).toBe(undefined)
      else expect(requireValue(sent).params.headers, cleanup).toBe(undefined)
      await driver.update([], [])
    }
  } finally {
    vi.stubGlobal('chrome', previous)
  }
})
test.each([
  { targetUrl: '', failed: false },
  { targetUrl: 'http://example.test/', failed: false },
  { targetUrl: '', failed: true },
  { targetUrl: 'http://example.test/', failed: true }
])(
  'request-header-only success notification: target=$targetUrl, failed=$failed',
  async ({ targetUrl, failed }) => {
    const fixture = browserFixture()
    vi.stubGlobal('chrome', fixture.chrome)
    const complete = vi.fn()
    const begin = vi.fn(() => complete)
    const driver = createResponseReplacement({ begin })
    try {
      await driver.update([
        {
          ...rules[0],
          targetUrl,
          showSuccessNotification: true,
          requestHeaders: [{ id: 'label', enabled: true, name: 'X-Label', value: 'test' }]
        }
      ])
      const paused = {
        requestId: 'headers-only',
        networkId: 'headers-network',
        resourceType: 'XHR',
        request: { url: 'http://example.test/api/list', method: 'GET', headers: {} }
      }
      fixture.chrome.debugger.onEvent.emit({ tabId: 1 }, 'Fetch.requestPaused', paused)
      await settle()
      const sent = fixture.state.commands.find(
        item =>
          item.method === 'Fetch.continueRequest' && item.params.requestId === paused.requestId
      )
      expect(requireValue(sent).params.headers).toStrictEqual([{ name: 'X-Label', value: 'test' }])
      expect(requireValue(sent).params.url).toBeUndefined()
      expect(begin).toHaveBeenCalledTimes(1)
      expect(complete).not.toHaveBeenCalled()
      fixture.chrome.debugger.onEvent.emit({ tabId: 1 }, 'Fetch.requestPaused', {
        ...paused,
        responseStatusCode: 200,
        responseHeaders: []
      })
      await settle()
      expect(complete, 'applying headers alone is not a completed request').not.toHaveBeenCalled()
      fixture.chrome.debugger.onEvent.emit(
        { tabId: 1 },
        failed ? 'Network.loadingFailed' : 'Network.loadingFinished',
        { requestId: paused.networkId, ...(failed ? { errorText: 'net::ERR_FAILED' } : {}) }
      )
      expect(complete).toHaveBeenCalledTimes(failed ? 0 : 1)
    } finally {
      await driver.update([], [])
    }
  }
)

test('same-address XHR edits both headers without URL rewrite, response replacement or body reconstruction', async () => {
  const fixture = browserFixture()
  const previous = globalThis.chrome
  const originalFetch = globalThis.fetch
  vi.stubGlobal('chrome', fixture.chrome)
  let fetches = 0
  vi.stubGlobal('fetch', async () => {
    fetches++
    return new Response('unexpected')
  })
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
    expect(requireValue(sent).params.headers).toStrictEqual([
      { name: 'X-Original', value: 'keep' },
      { name: 'Cookie', value: 'session=keep' },
      { name: 'X-Label', value: 'xianghe11' }
    ])
    expect(requireValue(sent).params.url).toBe(undefined)
    expect(requireValue(sent).params.postData).toBe(undefined)
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
    expect(requireValue(received).params.responseHeaders).toStrictEqual([
      { name: 'Content-Encoding', value: 'gzip' },
      { name: 'X-Reply', value: 'configured' }
    ])
    expect(fetches).toBe(0)
    expect(fixture.state.commands.some(item => item.method === 'Fetch.fulfillRequest')).toBe(false)
    await driver.update([], [])
  } finally {
    vi.stubGlobal('chrome', previous)
    vi.stubGlobal('fetch', originalFetch)
  }
})

test('rewritten XHR merge mode preserves the original request header value', async () => {
  const fixture = browserFixture()
  const previousChrome = globalThis.chrome
  const previousFetch = globalThis.fetch
  vi.stubGlobal('chrome', fixture.chrome)
  let receivedHeaders: HeadersInit | undefined
  vi.stubGlobal('fetch', async (_input: RequestInfo | URL, init?: RequestInit) => {
    receivedHeaders = init?.headers
    return new Response('replacement')
  })
  const driver = createResponseReplacement()
  try {
    await driver.update(
      [
        {
          ...rules[0],
          requestHeaders: [
            { id: 'request', enabled: true, name: 'X-Test', value: 'configured', mode: 'merge' }
          ]
        }
      ],
      ['xmlhttprequest']
    )
    fixture.chrome.debugger.onEvent.emit({ tabId: 1 }, 'Fetch.requestPaused', {
      requestId: 'rewritten-xhr',
      resourceType: 'XHR',
      request: {
        url: 'http://example.test/api/list',
        method: 'GET',
        headers: { 'X-Test': 'original' }
      }
    })
    await settle()

    expect(receivedHeaders).toStrictEqual([
      ['X-Test', 'original'],
      ['X-Test', 'configured']
    ])
  } finally {
    await driver.update([], []).catch(() => {})
    vi.stubGlobal('chrome', previousChrome)
    vi.stubGlobal('fetch', previousFetch)
  }
})

test('user cancellation stays paused through main-frame navigation until explicitly re-enabled', async () => {
  const fixture = browserFixture()
  const previous = globalThis.chrome
  vi.stubGlobal('chrome', fixture.chrome)
  try {
    const replacement = new ResponseProxy()
    await replacement.update({ rules, resourceTypes: ['document'], tabId: 1 })
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
    expect(fixture.state.attachCount, 'do not fight cancellation or retry from child frames').toBe(
      1
    )
    fixture.chrome.webNavigation.onBeforeNavigate.emit({
      tabId: 1,
      frameId: 0,
      url: 'http://example.test/'
    })
    await settle()
    expect(fixture.state.attachCount, 'refreshing must not undo user cancellation').toBe(1)
    await replacement.dispose()
    await replacement.update({ rules, resourceTypes: ['document'], tabId: 1 })
    expect(fixture.state.attachCount, 'explicit off/on restores debugging').toBe(2)
    expect(fixture.state.connected).toBe(true)
    await replacement.dispose()
    expect(fixture.state.connected).toBe(false)
  } finally {
    vi.stubGlobal('chrome', previous)
  }
})
test('response strategy scopes interception and changes patterns on existing connections', async () => {
  const fixture = browserFixture()
  const previous = globalThis.chrome
  vi.stubGlobal('chrome', fixture.chrome)
  try {
    const strategy = new ResponseProxy()
    await strategy.update({ rules, resourceTypes: ['document'], tabId: 1 })
    expect(
      requireValue(
        requireValue(fixture.state.commands.find(command => command.method === 'Fetch.enable'))
          .params.patterns
      ).every(pattern => pattern.resourceType === 'Document')
    ).toBeTruthy()
    fixture.chrome.debugger.onEvent.emit({ tabId: 1 }, 'Fetch.requestPaused', {
      requestId: 'script',
      resourceType: 'Script',
      request: { url: 'http://example.test/a.js' }
    })
    await settle()
    expect(
      fixture.state.commands.some(
        command =>
          command.method === 'Fetch.continueRequest' && command.params.requestId === 'script'
      )
    ).toBeTruthy()
    await strategy.update({ rules, resourceTypes: ['script'], tabId: 1 })
    const patterns = requireValue(
      fixture.state.commands.filter(command => command.method === 'Fetch.enable').at(-1)
    ).params.patterns
    expect(requireValue(patterns).every(pattern => pattern.resourceType === 'Script')).toBeTruthy()
    expect(fixture.state.attachCount).toBe(1)
    await strategy.dispose()
    expect(fixture.state.connected).toBe(false)
  } finally {
    vi.stubGlobal('chrome', previous)
  }
})
test('navigation detects stale cached attachment and reconnects once', async () => {
  const fixture = browserFixture()
  const previous = globalThis.chrome
  vi.stubGlobal('chrome', fixture.chrome)
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
    expect(fixture.state.attachCount).toBe(2)
    expect(fixture.state.connected).toBe(true)
    fixture.chrome.webNavigation.onBeforeNavigate.emit({
      tabId: 1,
      frameId: 0,
      url: 'http://example.test/'
    })
    await settle()
    expect(fixture.state.attachCount, 'healthy connections must not attach again').toBe(2)
  } finally {
    vi.stubGlobal('chrome', previous)
  }
})
test('document URL rewrite preserves browser-owned POST body and applies configured headers', async () => {
  const fixture = browserFixture()
  const previous = globalThis.chrome
  const previousFetch = globalThis.fetch
  vi.stubGlobal('chrome', fixture.chrome)
  let backgroundFetches = 0
  vi.stubGlobal('fetch', async () => {
    backgroundFetches++
    return new Response('old replacement')
  })
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
    expect(backgroundFetches, 'browser must load the target, not extension fetch').toBe(0)
    const command = fixture.state.commands.find(
      item => item.method === 'Fetch.continueRequest' && item.params.requestId === 'document'
    )
    expect(requireValue(command).params.url).toBe('http://localhost:8098/post')
    expect(requireValue(command).params.interceptResponse).toBe(true)
    expect(requireValue(command).params.postData, 'do not reconstruct or override POST body').toBe(
      undefined
    )
    expect(requireValue(command).params.headers).toStrictEqual([
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
    expect(requireValue(response).params.responseHeaders).toStrictEqual([
      { name: 'Content-Encoding', value: 'gzip' },
      { name: 'X-Reply', value: 'configured' }
    ])
    expect(fixture.state.commands.some(item => item.method === 'Fetch.fulfillRequest')).toBe(false)
    await driver.update([], [])
  } finally {
    vi.stubGlobal('chrome', previous)
    vi.stubGlobal('fetch', previousFetch)
  }
})
test('rewritten document rejects downstream redirects when request header overrides are enabled', async () => {
  const fixture = browserFixture()
  const previous = globalThis.chrome
  const previousFetch = globalThis.fetch
  vi.stubGlobal('chrome', fixture.chrome)
  vi.stubGlobal('fetch', async () => new Response('old replacement'))
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
    expect(
      fixture.state.commands.some(
        item =>
          item.method === 'Fetch.failRequest' && item.params.requestId === 'redirecting-document'
      )
    ).toBeTruthy()
    await driver.update([], [])
  } finally {
    vi.stubGlobal('chrome', previous)
    vi.stubGlobal('fetch', previousFetch)
  }
})
