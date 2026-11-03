import { expect, test } from 'vitest'
import type { Script, ScriptGroup } from '../types/script'
import {
  findScriptNode,
  getScriptFavoriteSummary,
  insertScriptNode,
  removeScriptNode,
  setScriptNodeFavorite,
  updateScriptNode
} from './script-tree'

export const scriptTree = (): ScriptGroup[] => [
  {
    id: 'root',
    name: '工具',
    type: 'group',
    children: [
      { id: 'one', name: '调试', type: 'script', groupId: 'root', content: 'one()' },
      {
        id: 'nested',
        name: '环境',
        type: 'group',
        parentId: 'root',
        children: [
          {
            id: 'two',
            name: '登录',
            type: 'script',
            groupId: 'nested',
            content: 'two()',
            favorite: true
          },
          {
            id: 'deep',
            name: '子目录',
            type: 'group',
            parentId: 'nested',
            children: [
              { id: 'three', name: '清理', type: 'script', groupId: 'deep', content: 'three()' }
            ]
          }
        ]
      },
      { id: 'empty', name: '空分类', type: 'group', parentId: 'root', children: [] }
    ]
  },
  { id: 'other', name: '其他', type: 'group', children: [] }
]

test('root favorites recursively include all descendants without mutating source or other groups', () => {
  const groups = scriptTree()
  const before = structuredClone(groups)
  expect(getScriptFavoriteSummary(groups[0])).toEqual({ scriptCount: 3, favoriteCount: 1 })
  const next = setScriptNodeFavorite(groups, 'root', true)
  expect(getScriptFavoriteSummary(next[0])).toEqual({ scriptCount: 3, favoriteCount: 3 })
  expect(next[1]).toBe(groups[1])
  expect(groups).toEqual(before)
  expect(setScriptNodeFavorite(next, 'root', true)).toBe(next)
  const cleared = setScriptNodeFavorite(next, 'nested', false)
  expect(getScriptFavoriteSummary(cleared[0])).toEqual({ scriptCount: 3, favoriteCount: 1 })
  expect(findScriptNode(cleared, 'one')).toBe(findScriptNode(next, 'one'))
})

test('missing favorite is false; empty/missing categories are safe no-ops', () => {
  const groups = scriptTree()
  expect(getScriptFavoriteSummary(findScriptNode(groups, 'one')!)).toEqual({
    scriptCount: 1,
    favoriteCount: 0
  })
  expect(getScriptFavoriteSummary(groups[1])).toEqual({ scriptCount: 0, favoriteCount: 0 })
  expect(setScriptNodeFavorite(groups, 'empty', true)).toBe(groups)
  expect(setScriptNodeFavorite(groups, 'missing', true)).toBe(groups)
})

test('insertions append at the requested level and preserve immutable parent references', () => {
  const groups = scriptTree()
  const group: ScriptGroup = { id: 'new', name: '新增', type: 'group', children: [] }
  const script: Script = {
    id: 'four',
    name: '新增脚本',
    type: 'script',
    groupId: 'nested',
    content: 'four()'
  }
  const next = insertScriptNode(insertScriptNode(groups, group), script, 'nested')
  expect(next.map(node => node.id)).toEqual(['root', 'other', 'new'])
  const nested = findScriptNode(next, 'nested')
  expect(nested?.type === 'group' && nested.children.map(node => node.id)).toEqual([
    'two',
    'deep',
    'four'
  ])
  expect(group.parentId).toBeUndefined()
  const child = insertScriptNode(groups, group, 'root')
  expect(findScriptNode(child, 'new')).toEqual({ ...group, parentId: 'root' })
  expect(findScriptNode(groups, 'four')).toBeUndefined()
  expect(insertScriptNode(groups, script)).toBe(groups)
  expect(insertScriptNode(groups, group, 'missing')).toBe(groups)
})

test('nested delete keeps sibling order and editing retains content, favorites and timestamps', () => {
  const groups = scriptTree()
  const changed = updateScriptNode(groups, 'two', { name: '改名' })
  expect(findScriptNode(changed, 'two')).toEqual({ ...findScriptNode(groups, 'two'), name: '改名' })
  expect(groups[0].children[0].name).toBe('调试')
  expect(updateScriptNode(groups, 'two', { name: '登录' })).toBe(groups)
  const deleted = removeScriptNode(changed, 'deep')
  expect(deleted[0].children.map(node => node.id)).toEqual(['one', 'nested', 'empty'])
  expect(findScriptNode(deleted, 'three')).toBeUndefined()
  expect(findScriptNode(deleted, 'two')).toBe(findScriptNode(changed, 'two'))
  expect(removeScriptNode(groups, 'missing')).toBe(groups)
})
