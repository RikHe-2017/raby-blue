import { expect, test, vi } from 'vitest'
import { createResponseReplacement } from './document-response.ts'
import type { ProxyRule } from './types/proxy'
import { createTestEvent as event } from './test-utils/fixtures'
import type { DebugCommand, DebugSession } from './test-utils/fixtures'
import type { ProxyConfig } from './types/proxy'
import { getEnabledProxyRules } from './document-response-rules'
import { createProxyConfigPersistence } from './proxy/config-persistence'
import { ProxyManager } from './proxy/ProxyManager'
import { ResponseProxy } from './proxy/ResponseProxy'
import { RedirectProxy } from './proxy/RedirectProxy'
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
  redirects: chrome.declarativeNetRequest.Rule[]
  beforeAttach?: (tabId: number) => void | Promise<void>
  beforeGet?: (tabId: number) => void | Promise<void>
  onCommand?: (session: DebugSession, method: string) => void | Promise<void>
}

function fixture() {
  const state: BrowserState = {
    calls: [],
    detached: [],
    connected: new Set(),
    commands: [],
    redirects: []
  }
  const chrome = {
    declarativeNetRequest: {
      async getDynamicRules() {
        return state.redirects
      },
      async updateDynamicRules(update: chrome.declarativeNetRequest.UpdateRuleOptions) {
        state.redirects = [
          ...state.redirects.filter(rule => !update.removeRuleIds?.includes(rule.id)),
          ...(update.addRules ?? [])
        ]
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
      const onCancelled = vi.fn()
      f.state.onCommand = (_session, method) => {
        if (method === 'Target.setAutoAttach') f.cancel()
      }
      const driver = createResponseReplacement(undefined, onCancelled)
      await driver.update(rules.slice(0, count))
      expect(
        f.state.calls,
        `${count} rules must not cause additional banners after cancellation`
      ).toStrictEqual([1])
      expect(f.state.connected.size).toBe(0)
      expect(onCancelled).toHaveBeenCalledTimes(1)
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
    const onCancelled = vi.fn()
    const driver = createResponseReplacement(undefined, onCancelled)
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
    expect(onCancelled).not.toHaveBeenCalled()
    await driver.update([], [])
  } finally {
    vi.stubGlobal('chrome', previous)
  }
})
test('worker restart reads the disabled source config and one explicit enable restores debugging', async () => {
  vi.spyOn(console, 'log').mockImplementation(() => {})
  const previous = globalThis.chrome
  let saved: ProxyConfig = {
    enabled: true,
    groups: [{ id: 'g', name: 'group', type: 'group', enabled: true, children: rules }]
  }
  const persistence = createProxyConfigPersistence({
    read: async () => saved,
    write: async config => {
      saved = config
    }
  })
  try {
    const before = fixture()
    vi.stubGlobal('chrome', before.chrome)
    await createResponseReplacement(undefined, () => persistence.disable()).update(
      getEnabledProxyRules(saved)
    )
    before.cancel()
    await settle()
    expect(saved.enabled).toBe(false)
    expect(saved.groups[0].children).toStrictEqual(rules)
    const after = fixture()
    vi.stubGlobal('chrome', after.chrome)
    const restarted = createResponseReplacement()
    await restarted.update(getEnabledProxyRules(saved))
    expect(
      after.state.calls,
      'a worker wake-up must not fight the user cancellation'
    ).toStrictEqual([])
    await persistence.save({ ...saved, enabled: true }, true)
    await restarted.update(getEnabledProxyRules(saved))
    expect(after.state.calls).toStrictEqual([1, 2, 3])
    await restarted.update([], [])
  } finally {
    vi.stubGlobal('chrome', previous)
  }
})

test('banner cancellation disables the source once and clears both debugger and native redirect strategies', async () => {
  vi.spyOn(console, 'log').mockImplementation(() => {})
  const f = fixture()
  vi.stubGlobal('chrome', f.chrome)
  let saved: ProxyConfig = {
    enabled: true,
    groups: [{ id: 'g', name: 'group', type: 'group', enabled: true, children: rules }]
  }
  let writes = 0
  let manager!: ProxyManager
  const persistence = createProxyConfigPersistence({
    read: async () => saved,
    write: async config => {
      saved = config
      writes++
      void manager.refresh(async () => saved)
    }
  })
  const onCancelled = vi.fn(() => persistence.disable())
  manager = new ProxyManager({
    response: new ResponseProxy(undefined, onCancelled),
    redirect: new RedirectProxy()
  })
  try {
    await manager.refresh(async () => saved)
    expect(f.state.redirects.length).toBe(rules.length)
    f.cancel()
    await settle()
    await manager.refresh(async () => saved)
    expect(saved.enabled).toBe(false)
    expect(saved.groups[0].children).toStrictEqual(rules)
    expect(writes).toBe(1)
    expect(onCancelled).toHaveBeenCalledTimes(1)
    expect(f.state.connected.size).toBe(0)
    expect(f.state.redirects).toStrictEqual([])
    await persistence.save({ ...saved, enabled: true }, true)
    await manager.refresh(async () => saved)
    expect(f.state.calls).toStrictEqual([1, 2, 3, 1, 2, 3])
    expect(f.state.redirects).toHaveLength(rules.length)
  } finally {
    await manager.dispose()
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
