import { requireRule } from '../test-utils/fixtures'
import { requireGroup } from '../test-utils/fixtures'
import { expect, test } from 'vitest'
import { updateProxyRule, setProxyNodeFavorite, getProxyFavoriteSummary } from './proxy-rules.ts'
import type { ProxyConfig } from '../types/proxy'
const config = (): ProxyConfig => ({
  enabled: false,
  groups: [
    {
      id: 'g',
      name: '环境',
      type: 'group' as const,
      enabled: false,
      children: [
        {
          id: 'nested',
          name: '子环境',
          type: 'group' as const,
          enabled: false,
          parentId: 'g',
          children: [
            {
              id: 'r',
              name: '代理',
              groupId: 'nested',
              type: 'rule' as const,
              enabled: true,
              sourceUrl: '',
              targetUrl: ''
            }
          ]
        }
      ]
    }
  ]
})
test('规则更新产生新的根、祖先和规则引用，不修改输入，不携带组件内部元数据', () => {
  const original = config().groups
  Object.defineProperty(requireGroup(original[0].children[0]).children[0], '$treeNodeId', {
    value: 7
  })
  const before = structuredClone(original)
  const next = updateProxyRule(original, 'r', { enabled: false, favorite: true })
  expect(next).not.toBe(original)
  expect(next[0]).not.toBe(original[0])
  expect(next[0].children[0]).not.toBe(original[0].children[0])
  expect(requireGroup(next[0].children[0]).children[0].enabled).toBe(false)
  expect(requireRule(requireGroup(next[0].children[0]).children[0]).favorite).toBe(true)
  expect('$treeNodeId' in requireGroup(next[0].children[0]).children[0]).toBe(false)
  expect(original).toStrictEqual(before)
})
test('目标值重复提交保持幂等，未命中和未变化的更新保留原树引用', () => {
  const original = config().groups
  const next = updateProxyRule(original, 'r', { enabled: false })
  expect(updateProxyRule(next, 'r', { enabled: false })).toBe(next)
  expect(updateProxyRule(next, 'missing', { favorite: true })).toBe(next)
  expect(updateProxyRule(next, 'r', {})).toBe(next)
})
test('代理成功提示开关独立更新源规则，不影响启用和收藏且不修改输入', () => {
  const original = config().groups
  const before = structuredClone(original)
  const next = updateProxyRule(original, 'r', { showSuccessNotification: true })
  const changed = requireGroup(next[0].children[0]).children[0]
  expect(requireRule(changed).showSuccessNotification).toBe(true)
  expect(changed.enabled).toBe(true)
  expect(requireRule(changed).favorite).toBe(undefined)
  expect(original).toStrictEqual(before)
  expect(updateProxyRule(next, 'r', { showSuccessNotification: true })).toBe(next)
  expect(
    requireRule(
      requireGroup(updateProxyRule(next, 'r', { showSuccessNotification: false })[0].children[0])
        .children[0]
    ).showSuccessNotification
  ).toBe(false)
})
test('收藏根分组递归更新所有后代代理，取消收藏同样递归，不改变启用和目录结构', () => {
  const original = config().groups
  const before = structuredClone(original)
  const starred = setProxyNodeFavorite(original, 'g', true)
  expect(requireRule(requireGroup(starred[0].children[0]).children[0]).favorite).toBe(true)
  expect(getProxyFavoriteSummary(starred[0])).toStrictEqual({ ruleCount: 1, favoriteCount: 1 })
  expect(requireGroup(starred[0].children[0]).children[0].enabled).toBe(true)
  expect(setProxyNodeFavorite(starred, 'g', true)).toBe(starred)
  const cleared = setProxyNodeFavorite(starred, 'g', false)
  expect(requireRule(requireGroup(cleared[0].children[0]).children[0]).favorite).toBe(false)
  expect(original).toStrictEqual(before)
})
test('子分组收藏只影响本分支，单条取消后父级自动呈现非全收藏，空目录不影响统计', () => {
  const original = config().groups
  original[0].children.push({
    id: 'other',
    name: '其他代理',
    type: 'rule' as const,
    groupId: 'g',
    enabled: false,
    sourceUrl: '',
    targetUrl: ''
  })
  original[0].children.push({
    id: 'empty',
    name: '空目录',
    type: 'group' as const,
    enabled: false,
    children: []
  })
  const next = setProxyNodeFavorite(original, 'nested', true)
  expect(next[0].children[1]).toBe(original[0].children[1])
  expect(getProxyFavoriteSummary(next[0])).toStrictEqual({ ruleCount: 2, favoriteCount: 1 })
  const all = setProxyNodeFavorite(next, 'g', true)
  expect(getProxyFavoriteSummary(all[0])).toStrictEqual({ ruleCount: 2, favoriteCount: 2 })
  const partial = setProxyNodeFavorite(all, 'r', false)
  expect(getProxyFavoriteSummary(partial[0])).toStrictEqual({ ruleCount: 2, favoriteCount: 1 })
  expect(setProxyNodeFavorite(all, 'missing', true)).toBe(all)
  expect(getProxyFavoriteSummary(original[0].children[2])).toStrictEqual({
    ruleCount: 0,
    favoriteCount: 0
  })
})
