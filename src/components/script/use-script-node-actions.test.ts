import { beforeEach, expect, test, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useScriptStore } from '../../stores/script'
import { findScriptNode, getScriptFavoriteSummary } from '../../stores/script-tree'
import type { ScriptConfig, ScriptNode } from '../../types/script'
import { useScriptNodeActions } from './use-script-node-actions'

const storage = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn() }))
const messages = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))
vi.mock('../../stores/storage', () => ({ createStorageAdapter: () => storage }))
vi.mock('../../stores/user-preferences', () => ({
  useUserPreferencesStore: () => ({ preferences: { scriptUIState: {} } })
}))
vi.mock('element-plus', () => ({ ElMessage: messages }))

beforeEach(() => {
  setActivePinia(createPinia())
  storage.set.mockReset().mockResolvedValue(undefined)
  messages.success.mockReset()
  messages.error.mockReset()
})

async function fixture() {
  const config: ScriptConfig = {
    enabled: false,
    groups: [
      {
        id: 'g',
        name: '工具',
        type: 'group',
        children: [
          { id: 's', name: '调试', type: 'script', groupId: 'g', content: 'run()', favorite: true },
          { id: 'other', name: '其他', type: 'script', groupId: 'g', content: 'other()' }
        ]
      }
    ]
  }
  storage.get.mockResolvedValue(config)
  const store = useScriptStore()
  await store.loadConfig()
  const edit = vi.fn<(event: 'edit-script', node: ScriptNode) => void>()
  return { store, edit, ...useScriptNodeActions(edit) }
}

test('favorite category commands resolve the full source, not the pruned favorites tree', async () => {
  const f = await fixture()
  const projection = { ...f.store.groups[0], children: [f.store.groups[0].children[0]] }
  await f.handleNodeCommand('favorite', projection)
  expect(getScriptFavoriteSummary(f.store.groups[0])).toEqual({ scriptCount: 2, favoriteCount: 2 })
  expect(messages.success).toHaveBeenLastCalledWith('加入收藏成功')
  await f.handleNodeCommand('favorite', projection)
  expect(getScriptFavoriteSummary(f.store.groups[0]).favoriteCount).toBe(0)
  expect(messages.success).toHaveBeenLastCalledWith('取消收藏成功')
})

test('duplicate retains source code but is a fresh unfavorited script; editing still selects the source', async () => {
  const f = await fixture()
  const source = f.store.groups[0].children[0]
  await f.handleNodeCommand('edit', source)
  expect(f.edit).toHaveBeenCalledWith('edit-script', source)
  await f.handleNodeCommand('duplicate', source)
  const copy = f.store.groups[0].children.at(-1)
  expect(copy).toMatchObject({
    name: '调试 - 副本',
    content: 'run()',
    groupId: 'g',
    favorite: false
  })
  expect(copy?.id).not.toBe(source.id)
  expect(source).toHaveProperty('favorite', true)
  await f.handleNodeCommand('delete', copy!)
  expect(findScriptNode(f.store.groups, copy!.id)).toBeUndefined()
})

test('header and category commands append at correct levels without changing other branches', async () => {
  const f = await fixture()
  await f.handleAddGroup()
  expect(f.store.groups.map(group => group.name)).toEqual(['工具', '新分类'])
  await f.handleNodeCommand('category', f.store.groups[0])
  await f.handleNodeCommand('script', f.store.groups[0])
  expect(f.store.groups[0].children.map(node => node.name)).toEqual([
    '调试',
    '其他',
    '新分类',
    '新脚本'
  ])
  await f.handleNodeCommand('delete', f.store.groups[1])
  expect(f.store.groups).toHaveLength(1)
})

test('failed favorite persistence reports failure, never success', async () => {
  const f = await fixture()
  storage.set.mockRejectedValueOnce(new Error('failed'))
  await f.handleNodeCommand('favorite', f.store.groups[0])
  expect(messages.success).not.toHaveBeenCalled()
  expect(messages.error).toHaveBeenCalled()
  expect(getScriptFavoriteSummary(f.store.groups[0]).favoriteCount).toBe(1)
})

test('commands flush the current editor draft before resolving their source script', async () => {
  const f = await fixture()
  const original = f.store.groups[0].children[0]
  const actions = useScriptNodeActions(f.edit, async () => {
    await f.store.updateScript('g', 's', { content: 'unsavedDraft()' })
  })
  await actions.handleNodeCommand('duplicate', original)
  expect(f.store.groups[0].children.at(-1)).toHaveProperty('content', 'unsavedDraft()')
})
