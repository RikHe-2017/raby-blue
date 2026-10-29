import assert from 'node:assert/strict'
import test from 'node:test'
import { updateProxyRule } from './proxy-rules.ts'

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
