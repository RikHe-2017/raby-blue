import { afterEach, expect, test, vi } from 'vitest'
import { createTestEvent } from '../test-utils/fixtures'
import { createProxyLogObserver } from './proxy'
import { createFlowLogger } from './flow-logger'
import { setLogSink } from '../utils/logger'
import type { LogEntry } from './model'
import type { ProxyRule } from '../types/proxy'

afterEach(() => {
  vi.unstubAllGlobals()
  setLogSink(async () => {})
})

test('redirect logging confirms real redirection and completion independently of notification settings', () => {
  const entries: LogEntry[] = []
  setLogSink(async entry => {
    entries.push(entry)
  })
  const webRequest = {
    onBeforeRequest: createTestEvent(),
    onBeforeRedirect: createTestEvent(),
    onCompleted: createTestEvent(),
    onErrorOccurred: createTestEvent()
  }
  vi.stubGlobal('chrome', { webRequest })
  const rule: ProxyRule = {
    id: 'r',
    type: 'rule',
    groupId: 'g',
    name: 'local',
    enabled: true,
    sourceUrl: 'http://example.test/',
    targetUrl: 'http://localhost/',
    showSuccessNotification: false
  }
  const observer = createProxyLogObserver()
  observer.update([rule], ['script'])
  webRequest.onBeforeRequest.emit({
    requestId: '1',
    tabId: 1,
    type: 'script',
    url: 'http://example.test/a.js'
  })
  expect(entries).toHaveLength(0)
  webRequest.onBeforeRedirect.emit({
    requestId: '1',
    url: 'http://example.test/a.js',
    redirectUrl: 'http://localhost/a.js'
  })
  webRequest.onCompleted.emit({ requestId: '1', url: 'http://localhost/a.js' })
  expect(entries).toHaveLength(1)
  expect(entries[0].details).toEqual([
    expect.objectContaining({
      sourceUrl: 'http://example.test/a.js',
      targetUrl: 'http://localhost/a.js',
      ruleName: 'local'
    })
  ])
  webRequest.onBeforeRequest.emit({
    requestId: '2',
    tabId: 1,
    type: 'script',
    url: 'http://example.test/b.js'
  })
  webRequest.onCompleted.emit({ requestId: '2', url: 'http://localhost/b.js' })
  expect(entries).toHaveLength(1)
  observer.update([], [])
  expect(webRequest.onBeforeRequest.size).toBe(1)
})

test('proxy request log stores changed headers, not original headers or full proxy configuration', () => {
  const entries: LogEntry[] = []
  setLogSink(async entry => {
    entries.push(entry)
  })
  const logs = createFlowLogger()
  logs.beginProxy('headers', {
    kind: 'proxy',
    tabId: 1,
    ruleId: 'r',
    sourceUrl: 'http://a/?token=original',
    targetUrl: 'http://a/?token=original',
    ruleName: 'headers'
  })
  logs.applied('headers', { Authorization: 'Bearer original' })
  logs.loaded('headers')
  expect(entries[0].details).toEqual([
    expect.objectContaining({
      sourceUrl: 'http://a/?token=original',
      targetUrl: 'http://a/?token=original',
      ruleName: 'headers',
      requestHeaders: { Authorization: 'Bearer original' }
    })
  ])
})
