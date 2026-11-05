import { expect, test } from 'vitest'
import { createDebuggerLogObserver } from './debugger-observer'
import { createFlowLogger } from './flow-logger'
import type { ProxyRule } from '../types/proxy'

const rule: ProxyRule = {
  id: 'r',
  name: 'local',
  enabled: true,
  type: 'rule',
  groupId: 'g',
  sourceUrl: 'http://a/',
  targetUrl: 'http://b/'
}
const paused = {
  requestId: 'f',
  networkId: 'n',
  resourceType: 'Document',
  request: { url: 'http://a/x', headers: {} }
}

test('CDP outcomes keep original snapshot, merge duplicate failures and separate sessions', () => {
  const written: unknown[] = []
  const observer = createDebuggerLogObserver(
    createFlowLogger({ write: (...args) => written.push(args) })
  )
  observer.update([rule], ['document'])
  for (const session of [{ tabId: 1 }, { tabId: 1, sessionId: 'child' }]) {
    observer.onEvent(session, 'Network.requestWillBeSent', {
      requestId: 'n',
      type: 'Document',
      request: paused.request
    })
    observer.onCommandSucceeded({
      session,
      event: paused,
      owner: { url: paused.request.url, target: 'http://b/x', rule },
      method: 'Fetch.continueRequest',
      params: { url: 'http://b/x' }
    })
  }
  observer.update([{ ...rule, name: 'renamed' }], ['document'])
  observer.onEvent({ tabId: 1 }, 'Fetch.requestPaused', {
    ...paused,
    responseErrorReason: 'ConnectionRefused'
  })
  observer.onEvent({ tabId: 1 }, 'Network.loadingFailed', { requestId: 'n', errorText: 'refused' })
  observer.onEvent({ tabId: 1, sessionId: 'child' }, 'Network.loadingFinished', { requestId: 'n' })
  expect(written).toHaveLength(2)
  expect(JSON.stringify(written)).toContain('ConnectionRefused')
  expect(JSON.stringify(written)).not.toContain('renamed')
})

test('early termination waits for applied and evicted late commands do not recreate context', () => {
  const written: unknown[] = []
  const observer = createDebuggerLogObserver(
    createFlowLogger({ capacity: 1, write: (...args) => written.push(args) })
  )
  observer.update([rule], ['document'])
  observer.onEvent({ tabId: 1 }, 'Fetch.requestPaused', paused)
  observer.onEvent({ tabId: 1 }, 'Network.loadingFinished', { requestId: 'n' })
  expect(written).toHaveLength(0)
  observer.onCommandSucceeded({
    session: { tabId: 1 },
    event: paused,
    owner: { url: paused.request.url, target: 'http://b/x', rule },
    method: 'Fetch.continueRequest',
    params: { url: 'http://b/x' }
  })
  expect(written).toHaveLength(1)
  observer.onEvent({ tabId: 1 }, 'Fetch.requestPaused', {
    ...paused,
    requestId: 'f2',
    networkId: 'n2'
  })
  observer.onCommandSucceeded({
    session: { tabId: 1 },
    event: paused,
    method: 'Fetch.continueRequest',
    params: { url: 'http://b/x' }
  })
  expect(written).toHaveLength(1)
})

test('header redirect rejection is recorded before synthetic failure and session cancellation is isolated', () => {
  const written: unknown[] = []
  const logs = createFlowLogger({ write: (...args) => written.push(args) })
  const observer = createDebuggerLogObserver(logs)
  const headersRule = {
    ...rule,
    requestHeaders: [{ id: 'h', enabled: true, name: 'X-Test', value: 'raw' }]
  }
  observer.update([headersRule], ['document'])
  const session = { tabId: 1 }
  const child = { tabId: 1, sessionId: 'child' }
  observer.onEvent(session, 'Fetch.requestPaused', paused)
  observer.onEvent(child, 'Fetch.requestPaused', paused)
  const command = {
    session,
    event: paused,
    owner: { url: paused.request.url, target: 'http://b/x', rule: headersRule },
    method: 'Fetch.continueRequest',
    params: { url: 'http://b/x', headers: [{ name: 'X-Test', value: 'raw' }] }
  }
  observer.onCommandSucceeded(command)
  observer.onCommandStarting({
    ...command,
    event: {
      ...paused,
      responseStatusCode: 302,
      responseHeaders: [{ name: 'Location', value: 'http://c/' }]
    },
    method: 'Fetch.failRequest'
  })
  observer.onEvent(session, 'Network.loadingFailed', {
    requestId: 'n',
    errorText: 'net::ERR_FAILED'
  })
  observer.cancelScope({ tabId: 1, sessionId: '' })
  observer.onCommandSucceeded({ ...command, session: child })
  observer.onEvent(child, 'Network.loadingFinished', { requestId: 'n' })
  expect(written).toHaveLength(2)
  expect(JSON.stringify(written)).toContain('最终目标地址')
  expect(JSON.stringify(written)).not.toContain('net::ERR_FAILED')
})
