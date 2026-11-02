import { requireRule, requireGroup, requireValue } from '../../test-utils/fixtures'
import { expect, test } from 'vitest'
import {
  collectProxyEntries,
  filterProxyGroups,
  filterProxyEntries,
  indexProxyNodes
} from './sidebar-projections.ts'
import { normalizeSidebarPreferences } from '../../stores/user-preferences-model.ts'
import type { ProxyGroup, ProxyRule } from '../../types/proxy'
test('侧栏偏好保持简略默认值，并独立规范化面板列表', () => {
  expect(normalizeSidebarPreferences(undefined)).toStrictEqual({
    selectedGrouped: false,
    favoritesGrouped: false,
    openPanels: ['config', 'selected', 'favorites']
  })
  const saved = {
    selectedGrouped: true,
    favoritesGrouped: false,
    openPanels: ['config', 'favorites', 'unknown']
  }
  const before = structuredClone(saved)
  expect(normalizeSidebarPreferences(saved)).toStrictEqual({
    selectedGrouped: true,
    favoritesGrouped: false,
    openPanels: ['config', 'favorites']
  })
  expect(saved).toStrictEqual(before)
  expect(normalizeSidebarPreferences({ openPanels: [] }).openPanels).toStrictEqual([])
})
const rule = (id: string, groupId: string, enabled: boolean): ProxyRule => ({
  id,
  groupId,
  name: 'HOSPITAL',
  type: 'rule' as const,
  enabled,
  sourceUrl: '',
  targetUrl: ''
})
const groups: ProxyGroup[] = [
  {
    id: 'root',
    name: '前端代理',
    type: 'group' as const,
    enabled: false,
    children: [
      {
        id: 'dev',
        name: '研发环境',
        type: 'group' as const,
        enabled: false,
        parentId: 'root',
        children: [rule('a', 'dev', true), rule('b', 'dev', false)]
      },
      {
        id: 'test',
        name: '测试环境',
        type: 'group' as const,
        enabled: false,
        parentId: 'root',
        children: [rule('c', 'test', true)]
      },
      { id: 'empty', name: '空目录', type: 'group' as const, enabled: false, children: [] }
    ]
  }
]
test('简略条目保留顺序、同名代理和完整目录，不受分组开关影响', () => {
  const entries = collectProxyEntries(groups)
  expect(entries.map(entry => [entry.rule.id, entry.path])).toStrictEqual([
    ['a', '前端代理 / 研发环境'],
    ['b', '前端代理 / 研发环境'],
    ['c', '前端代理 / 测试环境']
  ])
  expect(entries.filter(entry => entry.rule.enabled).map(entry => entry.rule.id)).toStrictEqual([
    'a',
    'c'
  ])
})
test('分类视图仅保留匹配规则与祖先，不修改原树', () => {
  const before = structuredClone(groups)
  const selected = filterProxyGroups(groups, ['c'])
  expect(selected[0].children.length).toBe(1)
  expect(selected[0].children[0].id).toBe('test')
  expect(requireGroup(selected[0].children[0]).children.map(rule => rule.id)).toStrictEqual(['c'])
  expect(groups).toStrictEqual(before)
})
test('收藏直接由源规则字段派生，与启用独立且删除后不残留', () => {
  const source = structuredClone(groups)
  requireRule(requireGroup(source[0].children[0]).children[1]).favorite = true
  const favoriteEntries = collectProxyEntries(source).filter(entry => entry.rule.favorite === true)
  expect(favoriteEntries.map(entry => entry.rule.id)).toStrictEqual(['b'])
  const favorites = filterProxyGroups(
    source,
    favoriteEntries.map(entry => entry.rule.id)
  )
  expect(requireGroup(favorites[0].children[0]).children[0].enabled).toBe(false)
  expect(filterProxyGroups(groups, ['missing'])).toStrictEqual([])
  expect(filterProxyGroups(groups, [])).toStrictEqual([])
  expect(collectProxyEntries([])).toStrictEqual([])
  requireGroup(source[0].children[0]).children = []
  expect(collectProxyEntries(source).filter(entry => entry.rule.favorite === true)).toStrictEqual(
    []
  )
})
test('取消勾选或删除最后一条规则后分类视图不残留空目录', () => {
  expect(filterProxyGroups(groups, [])).toStrictEqual([])
  const changed = structuredClone(groups)
  changed[0].children[0].name = '新名称'
  expect(collectProxyEntries(changed)[0].path).toBe('前端代理 / 新名称')
})
test('快捷面板搜索匹配代理名称或完整路径，忽略大小写和首尾空格，不改变源条目', () => {
  const entries = collectProxyEntries(groups)
  const before = structuredClone(entries)
  expect(filterProxyEntries(entries, '  hospital ').length).toBe(3)
  expect(filterProxyEntries(entries, '测试环境').map(entry => entry.rule.id)).toStrictEqual(['c'])
  expect(filterProxyEntries(entries, '前端代理').length).toBe(3)
  expect(filterProxyEntries(entries, '不存在')).toStrictEqual([])
  expect(filterProxyEntries(entries, '   ')).toBe(entries)
  expect(entries).toStrictEqual(before)
})
test('共用原树时通过节点 ID 找到完整分组，避免筛选视图缩小分组操作范围', () => {
  const projected = filterProxyGroups(groups, ['a'])
  const originals = indexProxyNodes(groups)
  expect(requireGroup(projected[0].children[0]).children.length).toBe(1)
  expect(requireGroup(requireValue(originals.get('dev'))).children.length).toBe(2)
  expect(originals.get('a')).toBe(requireGroup(groups[0].children[0]).children[0])
})
