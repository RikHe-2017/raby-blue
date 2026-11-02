import { expect, test, vi } from 'vitest'
import { createResponseReplacement } from './document-response.ts'
import type { ProxyRule } from './types/proxy'
import { createTestEvent as event } from './test-utils/fixtures'
import type { DebugCommand, DebugSession } from './test-utils/fixtures'
const settle = async () => {
  for (let count = 0; count < 8; count++) await new Promise(resolve => setImmediate(resolve))
}
const rules: ProxyRule[] = [1, 2, 3].map(id => ({
  id: String(id),
  name: `rule-${id}`,
  type: 'rule' as const,
  groupId: 'g',
  enabled: true,
  sourceUrl: `http://source.test/${id}/`,
  targetUrl: 'http://localhost/'
}))
interface BrowserState {
  calls: number[]
  detached: number[]
  connected: Set<number>
  commands: DebugCommand[]
  beforeAttach?: (tabId: number) => void | Promise<void>
  beforeGet?: (tabId: number) => void | Promise<void>
  onCommand?: (session: DebugSession, method: string) => void | Promise<void>
}

function fixture(savedSession: Record<string, unknown> = {}) {
  const state: BrowserState = { calls: [], detached: [], connected: new Set(), commands: [] }
  const chrome = {
    storage: {
      session: {
        async get() {
          return { ...savedSession }
        },
        async set(values: Record<string, unknown>) {
          Object.assign(savedSession, values)
        }
      }
    },
    debugger: {
      onEvent: event(),
      onDetach: event(),
      async attach({ tabId }: DebugSession) {
        state.calls.push(tabId)
        await state.beforeAttach?.(tabId)
        state.connected.add(tabId)
      },
      async detach({ tabId }: DebugSession) {
        state.detached.push(tabId)
        state.connected.delete(tabId)
      },
      async sendCommand(session: DebugSession, method: string, params: DebugCommand['params']) {
        if (!state.connected.has(session.tabId)) throw new Error('Debugger is not attached')
        state.commands.push({ session, method, params })
        await state.onCommand?.(session, method)
      }
    },
    action: { async setBadgeText() {}, async setBadgeBackgroundColor() {}, async setTitle() {} },
    tabs: {
      onUpdated: event(),
      onRemoved: event(),
      async get(id: number) {
        await state.beforeGet?.(id)
        return { id, url: 'http://source.test/' }
      },
      async query() {
        return [1, 2, 3].map(id => ({ id, url: 'http://source.test/' }))
      }
    },
    webNavigation: { onBeforeNavigate: event(), onErrorOccurred: event() }
  }
  const cancel = () => {
    for (const tabId of [...state.connected]) {
      state.connected.delete(tabId)
      chrome.debugger.onDetach.emit({ tabId }, 'canceled_by_user')
    }
  }
  return { chrome, state, cancel }
}
test('one user cancellation stops the whole tab batch, regardless of selected rule count', async () => {
  vi.spyOn(console, 'log').mockImplementation(() => {})
  const previous = globalThis.chrome
  try {
    for (const count of [1, 3]) {
      const f = fixture()
      vi.stubGlobal('chrome', f.chrome)
      f.state.onCommand = (_session, method) => {
        if (method === 'Target.setAutoAttach') f.cancel()
      }
      const driver = createResponseReplacement()
      await driver.update(rules.slice(0, count))
      expect(
        f.state.calls,
        `${count} rules must not cause additional banners after cancellation`
      ).toStrictEqual([1])
      expect(f.state.connected.size).toBe(0)
      await driver.update([], [])
    }
  } finally {
    vi.stubGlobal('chrome', previous)
  }
})
test('navigation, tab completion and editing rules cannot resume cancelled debugging', async () => {
  vi.spyOn(console, 'log').mockImplementation(() => {})
  const previous = globalThis.chrome
  const f = fixture()
  vi.stubGlobal('chrome', f.chrome)
  try {
    const driver = createResponseReplacement()
    await driver.update(rules)
    f.cancel()
    f.chrome.webNavigation.onBeforeNavigate.emit({
      tabId: 1,
      frameId: 0,
      url: 'http://source.test/'
    })
    f.chrome.webNavigation.onBeforeNavigate.emit({
      tabId: 4,
      frameId: 2,
      url: 'http://source.test/frame'
    })
    f.chrome.tabs.onUpdated.emit(4, { status: 'complete' }, { url: 'http://source.test/' })
    await settle()
    await driver.update(rules.map(rule => ({ ...rule, name: `${rule.name}-edited` })))
    expect(f.state.calls).toStrictEqual([1, 2, 3])
    await driver.update([], [])
    await driver.update(rules)
    expect(f.state.calls, 'explicit off/on restores all eligible tabs').toStrictEqual([
      1, 2, 3, 1, 2, 3
    ])
    await driver.update([], [])
  } finally {
    vi.stubGlobal('chrome', previous)
  }
})
test('cancellation invalidates a pending tab lookup before debugger.attach can be called', async () => {
  vi.spyOn(console, 'log').mockImplementation(() => {})
  const previous = globalThis.chrome
  const f = fixture()
  vi.stubGlobal('chrome', f.chrome)
  try {
    let release!: () => void
    f.state.beforeGet = id =>
      id === 2
        ? new Promise<void>(resolve => {
            release = resolve
          })
        : undefined
    const driver = createResponseReplacement()
    const operation = driver.update(rules)
    await settle()
    expect(typeof release).toBe('function')
    f.cancel()
    release()
    await operation
    expect(f.state.calls).toStrictEqual([1])
    await driver.update([], [])
  } finally {
    vi.stubGlobal('chrome', previous)
  }
})
test('an attach already in flight is detached after cancellation without enabling interception', async () => {
  vi.spyOn(console, 'log').mockImplementation(() => {})
  const previous = globalThis.chrome
  const f = fixture()
  vi.stubGlobal('chrome', f.chrome)
  try {
    let release!: () => void
    f.state.beforeAttach = id =>
      id === 2
        ? new Promise<void>(resolve => {
            release = resolve
          })
        : undefined
    const driver = createResponseReplacement()
    const operation = driver.update(rules)
    await settle()
    expect(f.state.calls).toStrictEqual([1, 2])
    f.cancel()
    release()
    await operation
    expect(f.state.calls).toStrictEqual([1, 2])
    expect(f.state.connected.size).toBe(0)
    expect(f.state.detached.includes(2)).toBeTruthy()
    expect(
      f.state.commands.some(item => item.session.tabId === 2 && item.method === 'Fetch.enable')
    ).toBe(false)
    await driver.update([], [])
  } finally {
    vi.stubGlobal('chrome', previous)
  }
})
test('closing a tab does not globally pause debugging for the other tabs', async () => {
  const previous = globalThis.chrome
  const f = fixture()
  vi.stubGlobal('chrome', f.chrome)
  try {
    const driver = createResponseReplacement()
    await driver.update(rules)
    f.state.connected.delete(1)
    f.chrome.debugger.onDetach.emit({ tabId: 1 }, 'target_closed')
    f.chrome.webNavigation.onBeforeNavigate.emit({
      tabId: 4,
      frameId: 0,
      url: 'http://source.test/'
    })
    await settle()
    expect(f.state.calls).toStrictEqual([1, 2, 3, 4])
    expect([...f.state.connected]).toStrictEqual([2, 3, 4])
    await driver.update([], [])
  } finally {
    vi.stubGlobal('chrome', previous)
  }
})
test('the browser-session cancellation survives a background worker restart', async () => {
  vi.spyOn(console, 'log').mockImplementation(() => {})
  const previous = globalThis.chrome
  const savedSession = {}
  try {
    const before = fixture(savedSession)
    vi.stubGlobal('chrome', before.chrome)
    await createResponseReplacement().update(rules)
    before.cancel()
    await settle()
    const after = fixture(savedSession)
    vi.stubGlobal('chrome', after.chrome)
    const restarted = createResponseReplacement()
    await restarted.update(rules)
    expect(
      after.state.calls,
      'a worker wake-up must not fight the user cancellation'
    ).toStrictEqual([])
    await restarted.update([], [])
    await restarted.update(rules)
    expect(after.state.calls).toStrictEqual([1, 2, 3])
    await restarted.update([], [])
  } finally {
    vi.stubGlobal('chrome', previous)
  }
})
test('cancellation received before attach resolves still stops the first pending connection', async () => {
  vi.spyOn(console, 'log').mockImplementation(() => {})
  const previous = globalThis.chrome
  const f = fixture()
  vi.stubGlobal('chrome', f.chrome)
  try {
    let release!: () => void
    f.state.beforeAttach = () =>
      new Promise<void>(resolve => {
        release = resolve
      })
    const driver = createResponseReplacement()
    const operation = driver.update(rules)
    await settle()
    f.chrome.debugger.onDetach.emit({ tabId: 1 }, 'canceled_by_user')
    release()
    await operation
    expect(f.state.calls).toStrictEqual([1])
    expect(f.state.connected.size).toBe(0)
    expect(f.state.commands.some(item => item.method === 'Fetch.enable')).toBe(false)
    await driver.update([], [])
  } finally {
    vi.stubGlobal('chrome', previous)
  }
})
test('a rapid explicit off/on replaces old pending connections without reviving the cancelled batch', async () => {
  vi.spyOn(console, 'log').mockImplementation(() => {})
  const previous = globalThis.chrome
  const f = fixture()
  vi.stubGlobal('chrome', f.chrome)
  try {
    let release!: () => void
    f.state.beforeAttach = id =>
      id === 2
        ? new Promise<void>(resolve => {
            release = resolve
          })
        : undefined
    const driver = createResponseReplacement()
    const cancelledBatch = driver.update(rules)
    await settle()
    f.cancel()
    await driver.update([], [])
    const resumedBatch = driver.update(rules)
    await settle()
    f.state.beforeAttach = undefined
    release()
    await cancelledBatch
    await resumedBatch
    expect(f.state.calls).toStrictEqual([1, 2, 1, 2, 3])
    expect([...f.state.connected]).toStrictEqual([1, 2, 3])
    expect(
      f.state.commands.filter(item => item.session.tabId === 2 && item.method === 'Fetch.enable')
        .length
    ).toBe(1)
    await driver.update([], [])
  } finally {
    vi.stubGlobal('chrome', previous)
  }
})
