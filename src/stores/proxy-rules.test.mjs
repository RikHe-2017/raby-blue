import assert from 'node:assert/strict'
import test from 'node:test'
import { updateProxyRule, setProxyNodeFavorite, getProxyFavoriteSummary } from './proxy-rules.ts'

const config = () => ({
  enabled: false,
  groups: [
    {
      id: 'g',
      name: '环境',
      type: 'group',
      enabled: false,
      children: [
        {
          id: 'nested',
          name: '子环境',
          type: 'group',
          enabled: false,
          parentId: 'g',
          children: [
            {
              id: 'r',
              name: '代理',
              groupId: 'nested',
              type: 'rule',
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
  Object.defineProperty(original[0].children[0].children[0], '$treeNodeId', { value: 7 })
  const before = structuredClone(original)
  const next = updateProxyRule(original, 'r', { enabled: false, favorite: true })
  assert.notEqual(next, original)
  assert.notEqual(next[0], original[0])
  assert.notEqual(next[0].children[0], original[0].children[0])
  assert.equal(next[0].children[0].children[0].enabled, false)
  assert.equal(next[0].children[0].children[0].favorite, true)
  assert.equal('$treeNodeId' in next[0].children[0].children[0], false)
  assert.deepEqual(original, before)
})

test('目标值重复提交保持幂等，未命中和未变化的更新保留原树引用', () => {
  const original = config().groups
  const next = updateProxyRule(original, 'r', { enabled: false })
  assert.equal(updateProxyRule(next, 'r', { enabled: false }), next)
  assert.equal(updateProxyRule(next, 'missing', { favorite: true }), next)
  assert.equal(updateProxyRule(next, 'r', {}), next)
})

test('代理成功提示开关独立更新源规则，不影响启用和收藏且不修改输入', () => {
  const original = config().groups
  const before = structuredClone(original)
  const next = updateProxyRule(original, 'r', { showSuccessNotification: true })
  const changed = next[0].children[0].children[0]
  assert.equal(changed.showSuccessNotification, true)
  assert.equal(changed.enabled, true)
  assert.equal(changed.favorite, undefined)
  assert.deepEqual(original, before)
  assert.equal(updateProxyRule(next, 'r', { showSuccessNotification: true }), next)
  assert.equal(
    updateProxyRule(next, 'r', { showSuccessNotification: false })[0].children[0].children[0]
      .showSuccessNotification,
    false
  )
})

test('收藏根分组递归更新所有后代代理，取消收藏同样递归，不改变启用和目录结构', () => {
  const original = config().groups
  const before = structuredClone(original)
  const starred = setProxyNodeFavorite(original, 'g', true)
  assert.equal(starred[0].children[0].children[0].favorite, true)
  assert.deepEqual(getProxyFavoriteSummary(starred[0]), { ruleCount: 1, favoriteCount: 1 })
  assert.equal(starred[0].children[0].children[0].enabled, true)
  assert.equal(setProxyNodeFavorite(starred, 'g', true), starred)
  const cleared = setProxyNodeFavorite(starred, 'g', false)
  assert.equal(cleared[0].children[0].children[0].favorite, false)
  assert.deepEqual(original, before)
})

test('子分组收藏只影响本分支，单条取消后父级自动呈现非全收藏，空目录不影响统计', () => {
  const original = config().groups
  original[0].children.push({
    id: 'other',
    name: '其他代理',
    type: 'rule',
    groupId: 'g',
    enabled: false,
    sourceUrl: '',
    targetUrl: ''
  })
  original[0].children.push({
    id: 'empty',
    name: '空目录',
    type: 'group',
    enabled: false,
    children: []
  })
  const next = setProxyNodeFavorite(original, 'nested', true)
  assert.equal(next[0].children[1], original[0].children[1])
  assert.deepEqual(getProxyFavoriteSummary(next[0]), { ruleCount: 2, favoriteCount: 1 })
  const all = setProxyNodeFavorite(next, 'g', true)
  assert.deepEqual(getProxyFavoriteSummary(all[0]), { ruleCount: 2, favoriteCount: 2 })
  const partial = setProxyNodeFavorite(all, 'r', false)
  assert.deepEqual(getProxyFavoriteSummary(partial[0]), { ruleCount: 2, favoriteCount: 1 })
  assert.equal(setProxyNodeFavorite(all, 'missing', true), all)
  assert.deepEqual(getProxyFavoriteSummary(original[0].children[2]), {
    ruleCount: 0,
    favoriteCount: 0
  })
})
