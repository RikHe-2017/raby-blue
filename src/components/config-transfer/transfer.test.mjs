import assert from 'node:assert/strict'
import test from 'node:test'
import { applyBackup, createBackup, parseBackup } from './transfer.ts'

const rule = (id, name, groupId, targetUrl = 'http://localhost/') => ({
  id,
  name,
  groupId,
  type: 'rule',
  enabled: false,
  sourceUrl: 'https://example.com/',
  targetUrl
})
const proxy = (children = []) => ({
  enabled: true,
  groups: [{ id: 'g', name: '环境', enabled: true, type: 'group', children }]
})

test('收藏字段随源代理导出、覆盖和增量导入，旧文件未填写时仍兼容', () => {
  const local = proxy([{ ...rule('r', '代理', 'g'), favorite: true }])
  const incoming = proxy([
    { ...rule('remote', '代理', 'g'), favorite: false },
    { ...rule('new', '新增', 'g'), favorite: true }
  ])
  const backup = createBackup('proxy', incoming, { enabled: false, groups: [] }, 'now')
  assert.equal(parseBackup(JSON.stringify(backup)).proxyConfig.groups[0].children[1].favorite, true)
  assert.equal(
    applyBackup(
      { proxyConfig: local, scriptConfig: { enabled: false, groups: [] } },
      backup,
      'replace'
    ).proxyConfig.groups[0].children[0].favorite,
    false
  )
  const merged = applyBackup(
    { proxyConfig: local, scriptConfig: { enabled: false, groups: [] } },
    backup,
    'merge'
  )
  assert.deepEqual(
    merged.proxyConfig.groups[0].children.map(node => node.favorite),
    [true, true]
  )
  assert.doesNotThrow(() =>
    parseBackup(
      JSON.stringify({ version: '1.0.0', proxyConfig: proxy([rule('old', '旧配置', 'g')]) })
    )
  )
  assert.throws(
    () =>
      parseBackup(
        JSON.stringify({
          version: '1.0.0',
          proxyConfig: proxy([{ ...rule('bad', '错误字段', 'g'), favorite: 'true' }])
        })
      ),
    /favorite/
  )
})
const scripts = {
  enabled: false,
  groups: [
    {
      id: 'sg',
      name: '工具',
      type: 'group',
      children: [
        { id: 's', name: '脚本', type: 'script', groupId: 'sg', content: 'console.log(1)' }
      ]
    }
  ]
}

test('头设置跟随导出导入且同名代理保留本地设置，非法头配置在文件边界被拒绝', () => {
  const settings = [{ id: 'header', enabled: true, name: 'X-Test', value: 'local' }]
  const current = proxy([
    { ...rule('r', '代理', 'g'), requestHeaders: settings, responseHeaders: [] }
  ])
  const incoming = proxy([
    { ...rule('remote', '代理', 'g'), requestHeaders: [{ ...settings[0], value: 'remote' }] }
  ])
  const backup = createBackup('proxy', current, scripts, 'now')
  const parsed = parseBackup(JSON.stringify(backup))
  assert.deepEqual(parsed.proxyConfig.groups[0].children[0].requestHeaders, settings)
  parsed.proxyConfig.groups[0].children[0].requestHeaders[0].value = 'copy'
  assert.equal(settings[0].value, 'local')
  const merged = applyBackup(
    { proxyConfig: current, scriptConfig: scripts },
    { version: '1.0.0', proxyConfig: incoming },
    'merge'
  )
  assert.equal(merged.proxyConfig.groups[0].children[0].requestHeaders[0].value, 'local')
  for (const headers of [
    [{ ...settings[0], name: 'bad name' }],
    [{ ...settings[0], value: 'bad\r\nvalue' }],
    {},
    null
  ]) {
    const invalid = proxy([{ ...rule('r', '代理', 'g'), requestHeaders: headers }])
    assert.throws(() => parseBackup(JSON.stringify({ version: '1.0.0', proxyConfig: invalid })))
  }
})

test('三个导出范围只包含选中的数据，且输出与输入不共享对象', () => {
  const local = proxy([rule('r', '代理', 'g')])
  for (const scope of ['proxy', 'script', 'all']) {
    const backup = createBackup(scope, local, scripts, '2026-10-29T00:00:00.000Z')
    assert.equal(Boolean(backup.proxyConfig), scope !== 'script')
    assert.equal(Boolean(backup.scriptConfig), scope !== 'proxy')
    assert.deepEqual(parseBackup(JSON.stringify(backup)), backup)
  }
  const backup = createBackup('all', local, scripts, '2026-10-29T00:00:00.000Z')
  backup.proxyConfig.groups[0].name = '修改导出副本'
  assert.equal(local.groups[0].name, '环境')
})

test('覆盖导入只返回文件包含的类型', () => {
  const backup = createBackup('script', proxy(), scripts, 'now')
  const result = applyBackup(
    { proxyConfig: proxy(), scriptConfig: { enabled: true, groups: [] } },
    backup,
    'replace'
  )
  assert.equal(result.proxyConfig, undefined)
  assert.deepEqual(result.scriptConfig, scripts)
  assert.notEqual(result.scriptConfig, scripts)
})

test('增量递归合并同名分组，同名代理保留本地，补充新代理且不修改输入', () => {
  const current = proxy([rule('r', '保留', 'g', 'http://local/')])
  const incoming = {
    enabled: false,
    groups: [
      {
        id: 'foreign',
        name: '环境',
        enabled: false,
        type: 'group',
        children: [rule('x', '保留', 'foreign', 'http://remote/'), rule('y', '新增', 'foreign')]
      }
    ]
  }
  const before = structuredClone({ current, incoming })
  const result = applyBackup(
    { proxyConfig: current, scriptConfig: scripts },
    { version: '1.0.0', proxyConfig: incoming },
    'merge'
  ).proxyConfig
  assert.equal(result.enabled, true)
  assert.equal(result.groups[0].enabled, true)
  assert.equal(result.groups[0].children[0].targetUrl, 'http://local/')
  assert.equal(result.groups[0].children[1].groupId, 'g')
  assert.equal(result.groups[0].children.length, 2)
  assert.deepEqual({ current, incoming }, before)
})

test('同名只在同级同类型冲突，不同分组可保留同名规则；ID 冲突时修复父子引用', () => {
  const current = proxy([rule('r', '同名', 'g')])
  const incoming = {
    enabled: false,
    groups: [
      {
        id: 'g',
        name: '新环境',
        type: 'group',
        enabled: false,
        children: [
          {
            id: 'r',
            name: '子分组',
            type: 'group',
            enabled: false,
            parentId: 'g',
            children: [rule('leaf', '同名', 'r')]
          }
        ]
      }
    ]
  }
  const backup = { version: '1.0.0', proxyConfig: incoming }
  const result = applyBackup({ proxyConfig: current, scriptConfig: scripts }, backup, 'merge')
  assert.deepEqual(
    result,
    applyBackup({ proxyConfig: current, scriptConfig: scripts }, backup, 'merge')
  )
  const group = result.proxyConfig.groups[1]
  assert.notEqual(group.id, 'g')
  assert.notEqual(group.children[0].id, 'r')
  assert.equal(group.children[0].parentId, group.id)
  assert.equal(group.children[0].children[0].groupId, group.children[0].id)
})

test('同名脚本保留本地正文和时间信息', () => {
  const incoming = structuredClone(scripts)
  incoming.groups[0].children[0].content = 'remote'
  const result = applyBackup(
    { proxyConfig: proxy(), scriptConfig: scripts },
    { version: '1.0.0', scriptConfig: incoming },
    'merge'
  )
  assert.deepEqual(result.scriptConfig, scripts)
})

test('同名嵌套分组递归补充新项，保留本地分组字段并重定向新节点引用', () => {
  const current = proxy([
    {
      id: 'nested',
      name: '子环境',
      type: 'group',
      parentId: 'g',
      enabled: true,
      children: [rule('keep', '已有', 'nested', 'http://local/')]
    }
  ])
  const incoming = {
    enabled: false,
    groups: [
      {
        id: 'remote',
        name: '环境',
        type: 'group',
        enabled: false,
        children: [
          {
            id: 'remote-nested',
            name: '子环境',
            type: 'group',
            parentId: 'remote',
            enabled: false,
            children: [
              rule('remote-keep', '已有', 'remote-nested', 'http://remote/'),
              rule('new', '新增', 'remote-nested')
            ]
          }
        ]
      }
    ]
  }
  const result = applyBackup(
    { proxyConfig: current, scriptConfig: scripts },
    parseBackup(JSON.stringify({ version: '1.0.0', proxyConfig: incoming })),
    'merge'
  ).proxyConfig
  const nested = result.groups[0].children[0]
  assert.equal(nested.id, 'nested')
  assert.equal(nested.enabled, true)
  assert.equal(nested.children[0].targetUrl, 'http://local/')
  assert.equal(nested.children[1].groupId, 'nested')
})

test('兼容旧版代理、脚本以及空配置导出文件', () => {
  assert.deepEqual(
    parseBackup(JSON.stringify({ version: '1.0.0', config: proxy() })).proxyConfig,
    proxy()
  )
  assert.deepEqual(parseBackup(JSON.stringify({ config: scripts })).scriptConfig, scripts)
  const empty = { enabled: false, groups: [] }
  assert.deepEqual(
    parseBackup(JSON.stringify({ config: empty }), 'script-config-2026-10-29.json').scriptConfig,
    empty
  )
  assert.throws(() => parseBackup(JSON.stringify({ config: empty })), /识别/)
})

test('导入前拒绝重复 ID、非法节点、错误字段类型和父子引用，不接受未知版本', () => {
  const valid = createBackup('all', proxy([rule('r', '规则', 'g')]), scripts, 'now')
  const variants = [
    value => {
      value.proxyConfig.groups[0].children[0].targetUrl = 12
    },
    value => {
      value.proxyConfig.groups[0].children[0].groupId = 'unknown'
    },
    value => {
      value.proxyConfig.groups[0].children[0].id = 'g'
    },
    value => {
      value.scriptConfig.groups[0].children[0].type = 'rule'
    },
    value => {
      value.version = '999.0.0'
    }
  ]
  for (const mutate of variants) {
    const invalid = structuredClone(valid)
    mutate(invalid)
    assert.throws(() => parseBackup(JSON.stringify(invalid)))
  }
})
