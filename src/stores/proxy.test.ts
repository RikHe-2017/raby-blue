import { expect, test, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useProxyStore } from './proxy'
import type { ProxyConfig } from '../types/proxy'
import { createTestEvent, requireRule } from '../test-utils/fixtures'
import { createProxyConfigPersistence } from '../proxy/config-persistence'

const storage = vi.hoisted(() => ({
  get: vi.fn<(key: string) => Promise<ProxyConfig | undefined>>(),
  set: vi.fn<(key: string, value: unknown) => Promise<void>>()
}))
vi.mock('./storage', () => ({ createStorageAdapter: () => storage }))
vi.mock('./user-preferences', () => ({
  useUserPreferencesStore: () => ({ preferences: { proxyUIState: {} } })
}))

async function fixture() {
  let saved: ProxyConfig = {
    enabled: true,
    groups: [
      {
        id: 'g',
        name: 'group',
        type: 'group',
        enabled: true,
        children: [
          {
            id: 'r',
            name: 'rule',
            type: 'rule',
            groupId: 'g',
            enabled: true,
            sourceUrl: 'http://source.test/',
            targetUrl: 'http://target.test/'
          }
        ]
      }
    ]
  }
  const changed = createTestEvent<[Record<string, chrome.storage.StorageChange>, string]>()
  const persistence = createProxyConfigPersistence({
    read: async () => saved,
    write: async config => {
      const oldValue = saved
      saved = structuredClone(config)
      changed.emit({ proxyConfig: { oldValue, newValue: saved } }, 'local')
    }
  })
  storage.get.mockImplementation(async () => structuredClone(saved))
  const sendMessage = vi.fn(
    async (request: { action: string; config: ProxyConfig; updateEnabled: boolean }) => {
      await persistence.save(request.config, request.updateEnabled)
      return { success: true }
    }
  )
  vi.stubGlobal('chrome', { runtime: { id: 'test', sendMessage }, storage: { onChanged: changed } })
  setActivePinia(createPinia())
  const store = useProxyStore()
  await store.loadConfig()
  return { store, changed, persistence, sendMessage, read: () => saved }
}

test('source disable synchronizes an open popup without replacing unsaved rule data', async () => {
  const f = await fixture()
  try {
    const group = f.store.groups[0]
    const rule = requireRule(group.children[0])
    rule.name = 'unsaved editor name'
    await f.persistence.disable()
    expect(f.store.enabled).toBe(false)
    expect(f.store.groups[0]).toBe(group)
    expect(requireRule(f.store.groups[0].children[0]).name).toBe('unsaved editor name')
    expect(rule.enabled).toBe(true)
  } finally {
    f.store.$dispose()
  }
})

test('an automatic popup save cannot re-enable after background cancellation', async () => {
  const f = await fixture()
  try {
    const saving = f.store.updateRule('r', { name: 'edited' })
    await f.persistence.disable()
    await saving
    expect(f.read().enabled).toBe(false)
    expect(f.store.enabled).toBe(false)
    expect(requireRule(f.read().groups[0].children[0]).name).toBe('edited')
    expect(f.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'saveProxyConfig', updateEnabled: false })
    )
  } finally {
    f.store.$dispose()
  }
})

test('one explicit toggle after cancellation enables the source and preserves selections', async () => {
  const f = await fixture()
  try {
    await f.persistence.disable()
    await f.store.toggleGlobalProxy()
    expect(f.read().enabled).toBe(true)
    expect(f.store.enabled).toBe(true)
    expect(f.read().groups[0].children[0].enabled).toBe(true)
    expect(f.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'saveProxyConfig', updateEnabled: true })
    )
  } finally {
    f.store.$dispose()
  }
})

test('a rejected explicit enable restores the persisted switch without discarding editor changes', async () => {
  const f = await fixture()
  try {
    await f.persistence.disable()
    f.store.groups[0].name = 'unsaved editor name'
    f.sendMessage.mockImplementationOnce(async () => ({ success: false, error: 'storage failed' }))
    await expect(f.store.toggleGlobalProxy()).rejects.toThrow('storage failed')
    expect(f.store.enabled).toBe(false)
    expect(f.store.groups[0].name).toBe('unsaved editor name')
  } finally {
    f.store.$dispose()
  }
})

test('unrelated storage changes are ignored and disposing the store removes its listener', async () => {
  const f = await fixture()
  const original = f.store.config
  f.changed.emit({ proxyConfig: { newValue: { enabled: false } } }, 'session')
  f.changed.emit({ userPreferences: { newValue: { enabled: false } } }, 'local')
  expect(f.store.config).toBe(original)
  expect(f.changed.size).toBe(1)
  f.store.$dispose()
  expect(f.changed.size).toBe(0)
  f.changed.emit({ proxyConfig: { newValue: { enabled: false } } }, 'local')
  expect(f.store.enabled).toBe(true)
})
