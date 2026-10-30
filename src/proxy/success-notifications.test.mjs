import assert from 'node:assert/strict'
import test from 'node:test'
import { createProxySuccessNotifications } from './success-notifications.ts'
const event = () => {
  const listeners = new Set()
  return {
    addListener: listener => listeners.add(listener),
    removeListener: listener => listeners.delete(listener),
    emit: (...args) => [...listeners].forEach(listener => listener(...args)),
    get size() {
      return listeners.size
    }
  }
}
const settle = async () => {
  await new Promise(resolve => setTimeout(resolve, 240))
}
const rule = {
  id: 'r',
  name: 'API',
  type: 'rule',
  groupId: 'g',
  enabled: true,
  sourceUrl: 'http://source.test/api/',
  targetUrl: 'http://target.test/',
  showSuccessNotification: true
}

async function fixture() {
  assert.equal(typeof createProxySuccessNotifications, 'function', 'notification controller exists')
  const messages = []
  const injections = []
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
      async sendMessage(tabId, message, options) {
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
      async executeScript(options) {
        injections.push(options)
        return [{ result: true }]
      }
    }
  }
  const previous = globalThis.chrome
  globalThis.chrome = chrome
  const notifications = createProxySuccessNotifications('data:image/png;base64,fixture-icon')
  await notifications.ready
  notifications.update([rule], ['xmlhttprequest'])
  return {
    chrome,
    notifications,
    messages,
    injections,
    restore() {
      globalThis.chrome = previous
    }
  }
}

test('only successful new active requests notify; one rule per document; no default-off injection', async () => {
  const f = await fixture()
  try {
    assert.equal(f.notifications.begin(10, { ...rule, showSuccessNotification: false }), undefined)
    assert.equal(f.notifications.begin(11, rule), undefined)
    assert.equal(f.injections.length, 0)
    const done = f.notifications.begin(10, rule)
    await settle()
    assert.equal(f.messages.length, 0, 'begin/injection alone is not success')
    done()
    await settle()
    assert.equal(f.messages.length, 1)
    assert.equal(f.messages[0].options.documentId, 'doc1')
    assert.deepEqual(f.messages[0].message.items, [{ id: 'r', name: 'API', mapped: true }])
    f.notifications.begin(10, rule)?.()
    await settle()
    assert.equal(f.messages.length, 1, 'same rule does not spam the same document')
  } finally {
    f.restore()
  }
})

test('switch-away/back invalidates in-flight results and queued hints; background results never replay', async () => {
  const f = await fixture()
  try {
    const old = f.notifications.begin(10, rule)
    f.chrome.tabs.onActivated.emit({ tabId: 11, windowId: 1 })
    assert.equal(f.notifications.begin(10, rule), undefined)
    f.chrome.tabs.onActivated.emit({ tabId: 10, windowId: 1 })
    old()
    await settle()
    assert.equal(f.messages.length, 0)
    f.notifications.begin(10, rule)?.()
    f.chrome.tabs.onActivated.emit({ tabId: 11, windowId: 1 })
    f.chrome.tabs.onActivated.emit({ tabId: 10, windowId: 1 })
    await settle()
    assert.equal(f.messages.length, 0)
    f.notifications.begin(10, rule)?.()
    await settle()
    assert.equal(f.messages.length, 1)
  } finally {
    f.restore()
  }
})

test('navigation waits for the new document, rejects old completions, and config disable cancels hints', async () => {
  const f = await fixture()
  try {
    const old = f.notifications.begin(10, rule)
    f.chrome.webNavigation.onBeforeNavigate.emit({ tabId: 10, frameId: 0 })
    old()
    const fresh = f.notifications.begin(10, rule)
    fresh()
    await settle()
    assert.equal(
      f.messages.length,
      0,
      'must not deliver a new document result to the previous page'
    )
    f.chrome.webNavigation.onCommitted.emit({ tabId: 10, frameId: 0, documentId: 'doc2' })
    await settle()
    assert.equal(f.messages.length, 1)
    assert.equal(f.messages[0].options.documentId, 'doc2')
    f.chrome.webNavigation.onBeforeNavigate.emit({ tabId: 10, frameId: 0 })
    const disabled = f.notifications.begin(10, rule)
    f.notifications.update([], [])
    disabled()
    f.chrome.webNavigation.onCommitted.emit({ tabId: 10, frameId: 0, documentId: 'doc3' })
    await settle()
    assert.equal(f.messages.length, 1)
    assert.equal(f.chrome.webRequest.onBeforeRequest.size, 0)
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
    assert.equal(f.messages.length, 0, 'a target alone does not prove our redirect was applied')
    f.chrome.webRequest.onBeforeRequest.emit({ ...start, requestId: '2' })
    f.chrome.webRequest.onBeforeRedirect.emit({
      ...start,
      requestId: '2',
      redirectUrl: 'http://target.test/save'
    })
    f.chrome.webRequest.onErrorOccurred.emit({ ...start, requestId: '2' })
    await settle()
    assert.equal(f.messages.length, 0)
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
    assert.equal(f.messages.length, 1)
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
    f.chrome.tabs.sendMessage = async (_tab, message) => {
      f.messages.push(message)
      return { shown: true }
    }
    f.notifications.begin(10, rule)?.()
    f.notifications.begin(10, second)?.()
    await settle()
    assert.equal(f.messages.length, 1)
    assert.equal(f.messages[0].items.length, 2)
    assert.equal(f.messages[0].items[1].mapped, false)
    assert.equal(JSON.stringify(f.messages).includes('SECRET'), false)
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
    let release
    f.chrome.tabs.sendMessage = async (_tab, message) => {
      f.messages.push(message)
      await new Promise(resolve => {
        release = resolve
      })
      return { shown: true }
    }
    f.notifications.begin(10, rule)?.()
    await settle()
    f.notifications.begin(10, rule)?.()
    await settle()
    assert.equal(
      attempts,
      2,
      'receiver refused a hidden-page install, so retry on the next active request'
    )
    assert.equal(f.messages.length, 1, 'one pending delivery per rule')
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
    assert.equal(f.messages.length, 0)
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
    old()
    await settle()
    assert.equal(f.messages.length, 0)
    f.notifications.begin(10, rule)?.()
    await settle()
    assert.equal(f.messages.length, 1)
  } finally {
    f.restore()
  }
})
