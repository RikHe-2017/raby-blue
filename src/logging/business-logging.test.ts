import { expect, test, vi } from 'vitest'
import { createFlowLogger } from './flow-logger'
import { createProxyLogObserver } from './proxy'
import { createDebuggerLogObserver } from './debugger-observer'
import { executeScriptRequest } from '../script-execution'
import { createTestEvent } from '../test-utils/fixtures'
import type { ProxyRule } from '../types/proxy'

const rule: ProxyRule = {
  id: 'r',
  name: 'original',
  enabled: true,
  type: 'rule',
  groupId: 'g',
  sourceUrl: 'http://a/',
  targetUrl: 'http://b/'
}

test('all adapters share one capacity; late events, configuration refresh and CDP disposal do not revive or erase other flows', async () => {
  const written: unknown[] = []
  const logs = createFlowLogger({ capacity: 2, write: (...args) => written.push(args) })
  const webRequest = {
    onBeforeRequest: createTestEvent(),
    onBeforeRedirect: createTestEvent(),
    onCompleted: createTestEvent(),
    onErrorOccurred: createTestEvent()
  }
  vi.stubGlobal('chrome', { webRequest })
  try {
    const web = createProxyLogObserver(logs)
    const cdp = createDebuggerLogObserver(logs)
    web.update([rule], ['script'], { tabId: 1 })
    cdp.update([rule], ['document'], { tabId: 1 })
    webRequest.onBeforeRequest.emit({
      requestId: 'w',
      tabId: 1,
      type: 'script',
      url: 'http://a/a.js'
    })
    const event = {
      requestId: 'f',
      networkId: 'n',
      resourceType: 'Document',
      request: { url: 'http://a/page', headers: {} }
    }
    cdp.onEvent({ tabId: 1 }, 'Fetch.requestPaused', event)
    let release!: () => void
    const script = executeScriptRequest(
      { code: 'body', scriptId: 's', scriptName: 'script' },
      {
        logs,
        readActiveTab: async () => 1,
        createExecutionId: () => 'execution',
        inject: () =>
          new Promise(resolve => {
            release = () => resolve([])
          })
      }
    )
    await Promise.resolve()
    webRequest.onBeforeRedirect.emit({
      requestId: 'w',
      url: 'http://a/a.js',
      redirectUrl: 'http://b/a.js'
    })
    webRequest.onCompleted.emit({ requestId: 'w', url: 'http://b/a.js' })
    expect(written).toHaveLength(0)
    cdp.onCommandSucceeded({
      session: { tabId: 1 },
      event,
      owner: { url: event.request.url, target: 'http://b/page', rule },
      method: 'Fetch.continueRequest',
      params: { url: 'http://b/page' }
    })
    cdp.onEvent({ tabId: 1 }, 'Network.loadingFailed', { requestId: 'n', errorText: 'refused' })
    release()
    await script
    expect(written).toHaveLength(2)
    expect(JSON.stringify(written)).toContain('http://a/page')
    expect(JSON.stringify(written)).toContain('script')

    webRequest.onBeforeRequest.emit({
      requestId: 'w2',
      tabId: 1,
      type: 'script',
      url: 'http://a/a.js'
    })
    web.update([], [])
    cdp.cancelScope({ tabId: 1 })
    webRequest.onBeforeRedirect.emit({
      requestId: 'w2',
      url: 'http://a/a.js',
      redirectUrl: 'http://b/a.js'
    })
    webRequest.onCompleted.emit({ requestId: 'w2', url: 'http://b/a.js' })
    expect(written).toHaveLength(3)
  } finally {
    vi.unstubAllGlobals()
  }
})

test('redirect ownership, raw snapshots, inactive scopes, header ownership and cancellations', () => {
  const written: unknown[] = []
  const logs = createFlowLogger({ write: (...args) => written.push(args) })
  const webRequest = {
    onBeforeRequest: createTestEvent(),
    onBeforeRedirect: createTestEvent(),
    onCompleted: createTestEvent(),
    onErrorOccurred: createTestEvent()
  }
  const removed = createTestEvent()
  vi.stubGlobal('chrome', { webRequest, tabs: { onRemoved: removed } })
  try {
    const web = createProxyLogObserver(logs)
    const start = (id: string, tabId = 1) =>
      webRequest.onBeforeRequest.emit({
        requestId: id,
        tabId,
        type: 'script',
        url: 'http://a/raw?token=raw'
      })
    const redirect = (id: string) =>
      webRequest.onBeforeRedirect.emit({
        requestId: id,
        url: 'http://a/raw?token=raw',
        redirectUrl: 'http://b/raw?token=raw'
      })
    const finish = (id: string) =>
      webRequest.onCompleted.emit({ requestId: id, url: 'http://b/raw?token=raw' })
    web.update([rule], ['script'], { tabId: 1 })
    start('inactive', 2)
    redirect('inactive')
    finish('inactive')
    start('extension', -1)
    redirect('extension')
    finish('extension')
    start('snapshot')
    web.update([{ ...rule, name: 'renamed' }], ['script'], { tabId: 1 })
    redirect('snapshot')
    finish('snapshot')
    expect(written).toHaveLength(1)
    expect(JSON.stringify(written)).toContain('original')
    expect(JSON.stringify(written)).not.toContain('renamed')
    start('abort')
    redirect('abort')
    webRequest.onErrorOccurred.emit({ requestId: 'abort', error: 'net::ERR_ABORTED' })
    start('close')
    redirect('close')
    removed.emit(1)
    finish('close')
    web.update(
      [{ ...rule, requestHeaders: [{ id: 'h', name: 'X-Test', value: 'raw', enabled: true }] }],
      ['script']
    )
    start('headers')
    redirect('headers')
    finish('headers')
    web.update([rule], ['script'], {})
    start('no-tab')
    redirect('no-tab')
    finish('no-tab')
    expect(written).toHaveLength(1)
  } finally {
    vi.unstubAllGlobals()
  }
})
