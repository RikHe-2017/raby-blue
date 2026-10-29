import assert from 'node:assert/strict'
import test from 'node:test'
import {
  collectProxyEntries,
  filterProxyGroups,
  filterProxyEntries
} from './sidebar-projections.ts'
import { normalizeSidebarPreferences } from '../../stores/user-preferences-model.ts'

test('侧栏偏好保持简略默认值，并独立规范化面板列表', () => {
  assert.deepEqual(normalizeSidebarPreferences(undefined), {
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
  assert.deepEqual(normalizeSidebarPreferences(saved), {
    selectedGrouped: true,
    favoritesGrouped: false,
    openPanels: ['config', 'favorites']
  })
  assert.deepEqual(saved, before)
  assert.deepEqual(normalizeSidebarPreferences({ openPanels: [] }).openPanels, [])
})

const rule = (id, groupId, enabled) => ({
  id,
  groupId,
  name: 'HOSPITAL',
  type: 'rule',
  enabled,
  sourceUrl: '',
  targetUrl: ''
})
const groups = [
  {
    id: 'root',
    name: '前端代理',
    type: 'group',
    enabled: false,
    children: [
      {
        id: 'dev',
        name: '研发环境',
        type: 'group',
        enabled: false,
        parentId: 'root',
        children: [rule('a', 'dev', true), rule('b', 'dev', false)]
      },
      {
        id: 'test',
        name: '测试环境',
        type: 'group',
        enabled: false,
        parentId: 'root',
        children: [rule('c', 'test', true)]
      },
      { id: 'empty', name: '空目录', type: 'group', enabled: false, children: [] }
    ]
  }
]

test('简略条目保留顺序、同名代理和完整目录，不受分组开关影响', () => {
  const entries = collectProxyEntries(groups)
  assert.deepEqual(
    entries.map(entry => [entry.rule.id, entry.path]),
    [
      ['a', '前端代理 / 研发环境'],
      ['b', '前端代理 / 研发环境'],
      ['c', '前端代理 / 测试环境']
    ]
  )
  assert.deepEqual(
    entries.filter(entry => entry.rule.enabled).map(entry => entry.rule.id),
    ['a', 'c']
  )
})

test('分类视图仅保留匹配规则与祖先，不修改原树', () => {
  const before = structuredClone(groups)
  const selected = filterProxyGroups(groups, ['c'])
  assert.equal(selected[0].children.length, 1)
  assert.equal(selected[0].children[0].id, 'test')
  assert.deepEqual(
    selected[0].children[0].children.map(rule => rule.id),
    ['c']
  )
  assert.deepEqual(groups, before)
})

test('收藏直接由源规则字段派生，与启用独立且删除后不残留', () => {
  const source = structuredClone(groups)
  source[0].children[0].children[1].favorite = true
  const favoriteEntries = collectProxyEntries(source).filter(entry => entry.rule.favorite === true)
  assert.deepEqual(
    favoriteEntries.map(entry => entry.rule.id),
    ['b']
  )
  const favorites = filterProxyGroups(
    source,
    favoriteEntries.map(entry => entry.rule.id)
  )
  assert.equal(favorites[0].children[0].children[0].enabled, false)
  assert.deepEqual(filterProxyGroups(groups, ['missing']), [])
  assert.deepEqual(filterProxyGroups(groups, []), [])
  assert.deepEqual(collectProxyEntries([]), [])
  source[0].children[0].children = []
  assert.deepEqual(
    collectProxyEntries(source).filter(entry => entry.rule.favorite === true),
    []
  )
})

test('取消勾选或删除最后一条规则后分类视图不残留空目录', () => {
  assert.deepEqual(filterProxyGroups(groups, []), [])
  const changed = structuredClone(groups)
  changed[0].children[0].name = '新名称'
  assert.equal(collectProxyEntries(changed)[0].path, '前端代理 / 新名称')
})

test('快捷面板搜索匹配代理名称或完整路径，忽略大小写和首尾空格，不改变源条目', () => {
  const entries = collectProxyEntries(groups)
  const before = structuredClone(entries)
  assert.equal(filterProxyEntries(entries, '  hospital ').length, 3)
  assert.deepEqual(
    filterProxyEntries(entries, '测试环境').map(entry => entry.rule.id),
    ['c']
  )
  assert.equal(filterProxyEntries(entries, '前端代理').length, 3)
  assert.deepEqual(filterProxyEntries(entries, '不存在'), [])
  assert.equal(filterProxyEntries(entries, '   '), entries)
  assert.deepEqual(entries, before)
})
