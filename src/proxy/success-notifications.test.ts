import { requireValue } from '../test-utils/fixtures'
import { expect, test, vi } from 'vitest'
import { createProxySuccessNotifications } from './success-notifications.ts'
import { createTestEvent as event } from '../test-utils/fixtures'
type Message = {
  action: string
  items: {
    id: string
    name: string
    mapped: boolean
  }[]
}
interface Delivery {
  tabId: number
  message: Message
  options: {
    documentId: string
  }
}
const settle = async () => {
  await new Promise(resolve => setTimeout(resolve, 240))
}
const rule = {
  id: 'r',
  name: 'API',
  type: 'rule' as const,
  groupId: 'g',
  enabled: true,
  sourceUrl: 'http://source.test/api/',
  targetUrl: 'http://target.test/',
  showSuccessNotification: true
}
async function fixture() {
  expect(typeof createProxySuccessNotifications, 'notification controller exists').toBe('function')
  const messages: Delivery[] = []
  const injections: unknown[] = []
  const chrome = {
    windows: {
      onFocusChanged: event(),
      async getLastFocused() {
        return { id: 1, focused: true }
      }
    },
    tabs: {
      onActivated: event(),
      onRemoved: event(),
      async query() {
        return [{ id: 10, windowId: 1 }]
      },
      async sendMessage(
        tabId: number,
        message: Message,
        options: {
          documentId: string
        }
      ) {
        messages.push({ tabId, message, options })
        return { shown: true }
      }
    },
    webNavigation: {
      onBeforeNavigate: event(),
      onCommitted: event(),
      onErrorOccurred: event(),
      async getFrame() {
        return { documentId: 'doc1' }
      }
    },
    webRequest: {
      onBeforeRequest: event(),
      onBeforeRedirect: event(),
      onCompleted: event(),
      onErrorOccurred: event()
    },
    scripting: {
      async executeScript(options: unknown) {
        injections.push(options)
        return [{ result: true }]
      }
    }
  }
  const previous = globalThis.chrome
  vi.stubGlobal('chrome', chrome)
  const notifications = createProxySuccessNotifications('data:image/png;base64,fixture-icon')
  await notifications.ready
  notifications.update([rule], ['xmlhttprequest'])
  return {
    chrome,
    notifications,
    messages,
    injections,
    restore() {
      vi.stubGlobal('chrome', previous)
    }
  }
}
test('only successful new active requests notify; one rule per document; no default-off injection', async () => {
  const f = await fixture()
  try {
    expect(f.notifications.begin(10, { ...rule, showSuccessNotification: false })).toBe(undefined)
    expect(f.notifications.begin(11, rule)).toBe(undefined)
    expect(f.injections.length).toBe(0)
    const done = f.notifications.begin(10, rule)
    await settle()
    expect(f.messages.length, 'begin/injection alone is not success').toBe(0)
    requireValue(done)()
    await settle()
    expect(f.messages.length).toBe(1)
    expect(f.messages[0].options.documentId).toBe('doc1')
    expect(f.messages[0].message.items).toStrictEqual([{ id: 'r', name: 'API', mapped: true }])
    f.notifications.begin(10, rule)?.()
    await settle()
    expect(f.messages.length, 'same rule does not spam the same document').toBe(1)
  } finally {
    f.restore()
  }
})
test('switch-away/back invalidates in-flight results and queued hints; background results never replay', async () => {
  const f = await fixture()
  try {
    const old = f.notifications.begin(10, rule)
    f.chrome.tabs.onActivated.emit({ tabId: 11, windowId: 1 })
    expect(f.notifications.begin(10, rule)).toBe(undefined)
    f.chrome.tabs.onActivated.emit({ tabId: 10, windowId: 1 })
    requireValue(old)()
    await settle()
    expect(f.messages.length).toBe(0)
    f.notifications.begin(10, rule)?.()
    f.chrome.tabs.onActivated.emit({ tabId: 11, windowId: 1 })
    f.chrome.tabs.onActivated.emit({ tabId: 10, windowId: 1 })
    await settle()
    expect(f.messages.length).toBe(0)
    f.notifications.begin(10, rule)?.()
    await settle()
    expect(f.messages.length).toBe(1)
  } finally {
    f.restore()
  }
})
test('navigation waits for the new document, rejects old completions, and config disable cancels hints', async () => {
  const f = await fixture()
  try {
    const old = f.notifications.begin(10, rule)
    f.chrome.webNavigation.onBeforeNavigate.emit({ tabId: 10, frameId: 0 })
    requireValue(old)()
    const fresh = f.notifications.begin(10, rule)
    requireValue(fresh)()
    await settle()
    expect(f.messages.length, 'must not deliver a new document result to the previous page').toBe(0)
    f.chrome.webNavigation.onCommitted.emit({ tabId: 10, frameId: 0, documentId: 'doc2' })
    await settle()
    expect(f.messages.length).toBe(1)
    expect(f.messages[0].options.documentId).toBe('doc2')
    f.chrome.webNavigation.onBeforeNavigate.emit({ tabId: 10, frameId: 0 })
    const disabled = f.notifications.begin(10, rule)
    f.notifications.update([], [])
    requireValue(disabled)()
    f.chrome.webNavigation.onCommitted.emit({ tabId: 10, frameId: 0, documentId: 'doc3' })
    await settle()
    expect(f.messages.length).toBe(1)
    expect(f.chrome.webRequest.onBeforeRequest.size).toBe(0)
  } finally {
    f.restore()
  }
})
test('native redirect success requires observed source-to-target redirect and completion; failure never notifies', async () => {
  const f = await fixture()
  try {
    const start = {
      tabId: 10,
      requestId: '1',
      url: 'http://source.test/api/save',
      type: 'xmlhttprequest'
    }
    f.chrome.webRequest.onBeforeRequest.emit(start)
    f.chrome.webRequest.onCompleted.emit({ ...start, url: 'http://target.test/save' })
    await settle()
    expect(f.messages.length, 'a target alone does not prove our redirect was applied').toBe(0)
    f.chrome.webRequest.onBeforeRequest.emit({ ...start, requestId: '2' })
    f.chrome.webRequest.onBeforeRedirect.emit({
      ...start,
      requestId: '2',
      redirectUrl: 'http://target.test/save'
    })
    f.chrome.webRequest.onErrorOccurred.emit({ ...start, requestId: '2' })
    await settle()
    expect(f.messages.length).toBe(0)
    f.chrome.webRequest.onBeforeRequest.emit({ ...start, requestId: '3' })
    f.chrome.webRequest.onBeforeRedirect.emit({
      ...start,
      requestId: '3',
      redirectUrl: 'http://target.test/save'
    })
    f.chrome.webRequest.onCompleted.emit({
      ...start,
      requestId: '3',
      url: 'http://target.test/save'
    })
    await settle()
    expect(f.messages.length).toBe(1)
  } finally {
    f.restore()
  }
})
test('merge concurrent rules without leaking headers; a failed receiver does not consume document dedupe', async () => {
  const f = await fixture()
  try {
    const second = {
      ...rule,
      id: 'second',
      name: '<API>',
      targetUrl: '',
      requestHeaders: [{ id: 'h', enabled: true, name: 'Authorization', value: 'SECRET' }]
    }
    f.notifications.update([rule, second], ['xmlhttprequest'])
    f.chrome.tabs.sendMessage = async () => {
      throw new Error('document gone')
    }
    f.notifications.begin(10, rule)?.()
    await settle()
    f.chrome.tabs.sendMessage = async (tabId, message, options) => {
      f.messages.push({ tabId, message, options })
      return { shown: true }
    }
    f.notifications.begin(10, rule)?.()
    f.notifications.begin(10, second)?.()
    await settle()
    expect(f.messages.length).toBe(1)
    expect(f.messages[0].message.items.length).toBe(2)
    expect(f.messages[0].message.items[1].mapped).toBe(false)
    expect(JSON.stringify(f.messages).includes('SECRET')).toBe(false)
  } finally {
    f.restore()
  }
})
test('slow receiver delivery does not duplicate the same rule, and inactive injection can retry later', async () => {
  const f = await fixture()
  try {
    let attempts = 0
    f.chrome.scripting.executeScript = async () => [{ result: ++attempts > 1 }]
    f.notifications.begin(10, rule)
    await settle()
    let release!: () => void
    f.chrome.tabs.sendMessage = async (tabId, message, options) => {
      f.messages.push({ tabId, message, options })
      await new Promise<void>(resolve => {
        release = resolve
      })
      return { shown: true }
    }
    f.notifications.begin(10, rule)?.()
    await settle()
    f.notifications.begin(10, rule)?.()
    await settle()
    expect(
      attempts,
      'receiver refused a hidden-page install, so retry on the next active request'
    ).toBe(2)
    expect(f.messages.length, 'one pending delivery per rule').toBe(1)
    release()
    await settle()
  } finally {
    f.restore()
  }
})
test('a background redirect cannot be rebound to a target rule after activation', async () => {
  const f = await fixture()
  try {
    const destinationRule = {
      ...rule,
      id: 'destination',
      sourceUrl: 'http://target.test/',
      targetUrl: 'http://final.test/'
    }
    f.notifications.update([rule, destinationRule], ['xmlhttprequest'])
    const source = {
      tabId: 10,
      requestId: 'chain',
      url: 'http://source.test/api/data',
      type: 'xmlhttprequest'
    }
    f.chrome.tabs.onActivated.emit({ tabId: 11, windowId: 1 })
    f.chrome.webRequest.onBeforeRequest.emit(source)
    f.chrome.tabs.onActivated.emit({ tabId: 10, windowId: 1 })
    f.chrome.webRequest.onBeforeRedirect.emit({ ...source, redirectUrl: 'http://target.test/data' })
    const target = { ...source, url: 'http://target.test/data' }
    f.chrome.webRequest.onBeforeRequest.emit(target)
    f.chrome.webRequest.onBeforeRedirect.emit({ ...target, redirectUrl: 'http://final.test/data' })
    f.chrome.webRequest.onCompleted.emit({ ...target, url: 'http://final.test/data' })
    await settle()
    expect(f.messages.length).toBe(0)
  } finally {
    f.restore()
  }
})
test('disabling then re-enabling a rule cannot resurrect an older in-flight hint', async () => {
  const f = await fixture()
  try {
    const old = f.notifications.begin(10, rule)
    f.notifications.update([], [])
    f.notifications.update([rule], ['xmlhttprequest'])
    requireValue(old)()
    await settle()
    expect(f.messages.length).toBe(0)
    f.notifications.begin(10, rule)?.()
    await settle()
    expect(f.messages.length).toBe(1)
  } finally {
    f.restore()
  }
})
