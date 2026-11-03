import { beforeEach, expect, test, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { Script, ScriptConfig, ScriptGroup } from '../types/script'
import { useScriptStore } from './script'
import { findScriptNode } from './script-tree'

const storage = vi.hoisted(() => ({
  get: vi.fn<(key: string) => Promise<unknown>>(),
  set: vi.fn<(key: string, value: unknown) => Promise<void>>()
}))
vi.mock('./storage', () => ({ createStorageAdapter: () => storage }))
vi.mock('./user-preferences', () => ({
  useUserPreferencesStore: () => ({ preferences: { scriptUIState: {} } })
}))

const initial = (): ScriptConfig => ({
  enabled: false,
  groups: [
    {
      id: 'g',
      name: '工具',
      type: 'group',
      children: [
        { id: 's', name: '调试', type: 'script', groupId: 'g', content: 'run()', createdAt: 'old' }
      ]
    }
  ]
})

beforeEach(() => {
  setActivePinia(createPinia())
  storage.get.mockReset().mockResolvedValue(initial())
  storage.set.mockReset().mockResolvedValue(undefined)
})

test('favorites are published only after persistence succeeds', async () => {
  const store = useScriptStore()
  await store.loadConfig()
  let finish!: () => void
  storage.set.mockImplementationOnce(
    () =>
      new Promise(resolve => {
        finish = resolve
      })
  )
  const saving = store.setFavorite('g', true)
  await vi.waitFor(() => expect(storage.set).toHaveBeenCalledTimes(1))
  expect(findScriptNode(store.groups, 's')).not.toHaveProperty('favorite')
  finish()
  expect(await saving).toBe(true)
  expect(findScriptNode(store.groups, 's')).toHaveProperty('favorite', true)
})

test('a failed favorite write does not lose a queued editor change or poison later saves', async () => {
  const store = useScriptStore()
  await store.loadConfig()
  storage.set.mockRejectedValueOnce(new Error('disk failed'))
  const favorite = store.setFavorite('s', true)
  const editing = store.updateScript('g', 's', { content: 'edited()' })
  await expect(favorite).rejects.toThrow('disk failed')
  await editing
  expect(findScriptNode(store.groups, 's')).toMatchObject({ content: 'edited()', createdAt: 'old' })
  expect(findScriptNode(store.groups, 's')).not.toHaveProperty('favorite')
  const snapshot = storage.set.mock.calls.at(-1)?.[1] as ScriptConfig
  expect(snapshot.groups[0].children[0]).toHaveProperty('content', 'edited()')
})

test('queued favorites and editor writes preserve both changes; old configs remain usable', async () => {
  const store = useScriptStore()
  await store.loadConfig()
  await Promise.all([
    store.setFavorite('s', true),
    store.updateScript('g', 's', { name: '新名称' })
  ])
  expect(findScriptNode(store.groups, 's')).toMatchObject({
    favorite: true,
    name: '新名称',
    content: 'run()'
  })
  expect(await store.setFavorite('missing', true)).toBe(false)
})

test('category and script operations append, keep immutable inputs, and preserve node fields', async () => {
  const store = useScriptStore()
  await store.loadConfig()
  const group: ScriptGroup = { id: 'new', name: '分类', type: 'group', children: [] }
  const script: Script = {
    id: 'new-script',
    name: '脚本',
    type: 'script',
    groupId: 'new',
    content: 'new()',
    favorite: false
  }
  await store.addGroup(group, 'g')
  await store.addScript('new', script)
  expect(group.parentId).toBeUndefined()
  expect(script.createdAt).toBeUndefined()
  expect(findScriptNode(store.groups, 'new-script')).toMatchObject({
    ...script,
    createdAt: expect.any(String),
    updatedAt: expect.any(String)
  })
  await store.updateGroup('new', { name: '分类改名' })
  expect(findScriptNode(store.groups, 'new')).toHaveProperty('name', '分类改名')
  await store.deleteScript('wrong-group', 'new-script')
  expect(findScriptNode(store.groups, 'new-script')).toBeDefined()
  await store.deleteScript('new', 'new-script')
  expect(findScriptNode(store.groups, 'new-script')).toBeUndefined()
  await store.deleteGroup('new')
  expect(store.groups[0].children.map(node => node.id)).toEqual(['s'])
})

test('reloading while an editor write is pending waits for the saved config', async () => {
  const store = useScriptStore()
  await store.loadConfig()
  let persisted = initial()
  let finish!: () => void
  storage.get.mockImplementation(async () => structuredClone(persisted))
  storage.set.mockImplementationOnce(
    (_key, value) =>
      new Promise<void>(resolve => {
        finish = () => {
          persisted = value as ScriptConfig
          resolve()
        }
      })
  )
  const editing = store.updateScript('g', 's', { content: 'latest()' })
  await vi.waitFor(() => expect(storage.set).toHaveBeenCalledTimes(1))
  const loading = store.loadConfig()
  await Promise.resolve()
  expect(storage.get).toHaveBeenCalledTimes(1)
  finish()
  await Promise.all([editing, loading])
  expect(findScriptNode(store.groups, 's')).toHaveProperty('content', 'latest()')
})
