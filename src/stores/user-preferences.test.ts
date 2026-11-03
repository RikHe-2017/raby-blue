import { expect, test } from 'vitest'
import { normalizeUserPreferences, mergeUserPreferences } from './user-preferences-model.ts'
test('脚本分区默认全部展开且使用简略收藏，旧偏好无需迁移', () => {
  const preferences = normalizeUserPreferences({ scriptUIState: { activeItemId: 'old' } })
  expect(preferences.scriptSidebar).toEqual({
    favoritesGrouped: false,
    openPanels: ['favorites', 'config'],
    favoritesExpandedKeys: []
  })
  expect(preferences.scriptUIState.activeItemId).toBe('old')
})

test('脚本全收起及收藏树展开状态独立往返，更新代理偏好不能覆盖脚本偏好', () => {
  const initial = normalizeUserPreferences(undefined)
  const next = mergeUserPreferences(initial, {
    scriptSidebar: { openPanels: [], favoritesGrouped: true, favoritesExpandedKeys: ['sg'] },
    scriptUIState: { expandedKeys: [], activeGroupId: 'sg', activeItemId: 's' }
  })
  const reloaded = normalizeUserPreferences(JSON.parse(JSON.stringify(next)))
  const final = mergeUserPreferences(reloaded, { proxySidebar: { openPanels: [] } })
  expect(final.scriptSidebar).toEqual({
    favoritesGrouped: true,
    openPanels: [],
    favoritesExpandedKeys: ['sg']
  })
  expect(final.scriptUIState).toEqual({ expandedKeys: [], activeGroupId: 'sg', activeItemId: 's' })
  expect(initial.scriptSidebar.openPanels).toEqual(['favorites', 'config'])
  expect(
    normalizeUserPreferences({
      scriptSidebar: {
        openPanels: ['config', 'bad', 'config'],
        favoritesExpandedKeys: ['x', 'x', 1]
      }
    }).scriptSidebar
  ).toEqual({ favoritesGrouped: false, openPanels: ['config'], favoritesExpandedKeys: ['x'] })
})
test('统一偏好默认值完整且不读取旧的独立偏好结构', () => {
  const defaults = normalizeUserPreferences(undefined)
  expect(defaults.activeTab).toBe('proxy')
  expect(defaults.proxySidebar).toStrictEqual({
    selectedGrouped: false,
    favoritesGrouped: false,
    openPanels: ['config', 'selected', 'favorites']
  })
  expect(defaults.proxyUIState).toStrictEqual({
    expandedKeys: [],
    activeGroupId: '',
    activeItemId: ''
  })
  expect(defaults.scriptUIState).toStrictEqual(defaults.proxyUIState)
  expect(defaults.scriptUIState).not.toBe(defaults.proxyUIState)
  expect(normalizeUserPreferences({ selectedGrouped: true, expandedKeys: ['old'] })).toStrictEqual(
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
  expect(initial).toStrictEqual(before)
  expect(three.activeTab).toBe('script')
  expect(three.proxySidebar.selectedGrouped).toBe(true)
  expect(three.proxySidebar.favoritesGrouped).toBe(true)
  expect(three.proxySidebar.openPanels).toStrictEqual([])
  expect(three.scriptUIState.activeItemId).toBe('s')
  expect(three.proxyUIState.activeItemId).toBe('r')
  expect(three.scriptUIState.expandedKeys).not.toBe(two.scriptUIState.expandedKeys)
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
  expect(next.proxyUIState.activeItemId).toBe('')
  expect(next.scriptUIState.activeItemId).toBe('s')
  expect(next.activeTab).toBe('script')
  expect(next.proxySidebar.selectedGrouped).toBe(true)
})
