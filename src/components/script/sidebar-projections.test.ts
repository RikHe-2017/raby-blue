import { expect, test } from 'vitest'
import type { ScriptGroup } from '../../types/script'
import {
  collectScriptEntries,
  filterScriptEntries,
  filterScriptGroups
} from './sidebar-projections'

const groups: ScriptGroup[] = [
  {
    id: 'root',
    name: '工具',
    type: 'group',
    children: [
      { id: 'a', name: '调试', type: 'script', groupId: 'root', content: 'a()' },
      {
        id: 'sub',
        name: '测试环境',
        parentId: 'root',
        type: 'group',
        children: [
          { id: 'b', name: '登录', type: 'script', groupId: 'sub', content: 'b()', favorite: true }
        ]
      }
    ]
  }
]

test('entries keep source identities and paths; search matches script or ancestor case-insensitively', () => {
  const entries = collectScriptEntries(groups)
  expect(entries.map(entry => entry.path)).toEqual(['工具', '工具 / 测试环境'])
  expect(entries[0].script).toBe(groups[0].children[0])
  expect(filterScriptEntries(entries, '  测试环境  ').map(entry => entry.script.id)).toEqual(['b'])
  expect(filterScriptEntries(entries, '调试').map(entry => entry.script.id)).toEqual(['a'])
  expect(filterScriptEntries(entries, 'not-found')).toEqual([])
  expect(filterScriptEntries(entries, '')).toBe(entries)
})

test('favorites tree preserves ancestry and source leaves without mutating or duplicating data', () => {
  const before = structuredClone(groups)
  const projected = filterScriptGroups(groups, ['b'])
  expect(projected[0].children.map(node => node.id)).toEqual(['sub'])
  expect(projected[0].children[0]).not.toBe(groups[0].children[1])
  expect(collectScriptEntries(projected)[0].script).toBe(collectScriptEntries(groups)[1].script)
  expect(filterScriptGroups(groups, [])).toEqual([])
  expect(groups).toEqual(before)
})
