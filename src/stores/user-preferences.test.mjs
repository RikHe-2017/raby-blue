import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizeUserPreferences, mergeUserPreferences } from './user-preferences-model.ts'

test('统一偏好默认值完整且不读取旧的独立偏好结构', () => {
  const defaults = normalizeUserPreferences(undefined)
  assert.equal(defaults.activeTab, 'proxy')
  assert.deepEqual(defaults.proxySidebar, {
    selectedGrouped: false,
    favoritesGrouped: false,
    openPanels: ['config', 'selected', 'favorites']
  })
  assert.deepEqual(defaults.proxyUIState, { expandedKeys: [], activeGroupId: '', activeItemId: '' })
  assert.deepEqual(defaults.scriptUIState, defaults.proxyUIState)
  assert.notEqual(defaults.scriptUIState, defaults.proxyUIState)
  assert.deepEqual(
    normalizeUserPreferences({ selectedGrouped: true, expandedKeys: ['old'] }),
    defaults
  )
})

test('分区更新保留其他偏好，输入不变且返回普通独立数组', () => {
  const initial = normalizeUserPreferences(undefined)
  const before = structuredClone(initial)
  const one = mergeUserPreferences(initial, {
    activeTab: 'script',
    proxySidebar: { selectedGrouped: true }
  })
  const two = mergeUserPreferences(one, {
    scriptUIState: { expandedKeys: ['sg'], activeGroupId: 'sg', activeItemId: 's' }
  })
  const three = mergeUserPreferences(two, {
    proxyUIState: { expandedKeys: ['g'], activeItemId: 'r' },
    proxySidebar: { favoritesGrouped: true, openPanels: [] }
  })
  assert.deepEqual(initial, before)
  assert.equal(three.activeTab, 'script')
  assert.equal(three.proxySidebar.selectedGrouped, true)
  assert.equal(three.proxySidebar.favoritesGrouped, true)
  assert.deepEqual(three.proxySidebar.openPanels, [])
  assert.equal(three.scriptUIState.activeItemId, 's')
  assert.equal(three.proxyUIState.activeItemId, 'r')
  assert.notEqual(three.scriptUIState.expandedKeys, two.scriptUIState.expandedKeys)
})

test('覆盖导入只重置相应目录偏好，不影响页签、其他目录和模式', () => {
  const current = mergeUserPreferences(normalizeUserPreferences(undefined), {
    activeTab: 'script',
    proxySidebar: { selectedGrouped: true },
    proxyUIState: { activeGroupId: 'g', activeItemId: 'r', expandedKeys: ['g'] },
    scriptUIState: { activeGroupId: 'sg', activeItemId: 's' }
  })
  const next = mergeUserPreferences(current, {
    proxyUIState: { expandedKeys: [], activeGroupId: '', activeItemId: '' }
  })
  assert.equal(next.proxyUIState.activeItemId, '')
  assert.equal(next.scriptUIState.activeItemId, 's')
  assert.equal(next.activeTab, 'script')
  assert.equal(next.proxySidebar.selectedGrouped, true)
})
