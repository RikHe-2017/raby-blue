import { requireValue, requireRule, requireGroup } from '../../test-utils/fixtures'
import { expect, test } from 'vitest'
import { applyBackup, createBackup, parseBackup } from './transfer.ts'
import type { ProxyRule } from '../../types/proxy'
import type { ScriptConfig } from '../../types/script'
const rule = (
  id: string,
  name: string,
  groupId: string,
  targetUrl = 'http://localhost/'
): ProxyRule => ({
  id,
  name,
  groupId,
  type: 'rule' as const,
  enabled: false,
  sourceUrl: 'https://example.com/',
  targetUrl
})
const proxy = <T>(children: T[] = []) => ({
  enabled: true,
  groups: [{ id: 'g', name: '环境', enabled: true, type: 'group' as const, children }]
})
test('代理成功提示开关随导入导出保留，增量同名保留本地，缺失字段仍允许，错误类型被拒绝', () => {
  const local = proxy([{ ...rule('local', '已有', 'g'), showSuccessNotification: true }])
  const incoming = proxy([
    { ...rule('remote', '已有', 'g'), showSuccessNotification: false },
    { ...rule('new', '新增', 'g'), showSuccessNotification: true }
  ])
  const scripts = { enabled: false, groups: [] }
  const backup = parseBackup(JSON.stringify(createBackup('proxy', incoming, scripts, 'now')))
  expect(
    requireValue(backup.proxyConfig).groups[0].children.map(
      item => requireRule(item).showSuccessNotification
    )
  ).toStrictEqual([false, true])
  expect(
    requireValue(
      applyBackup({ proxyConfig: local, scriptConfig: scripts }, backup, 'merge').proxyConfig
    ).groups[0].children.map(item => requireRule(item).showSuccessNotification)
  ).toStrictEqual([true, true])
  expect(
    requireRule(
      requireValue(
        applyBackup({ proxyConfig: local, scriptConfig: scripts }, backup, 'replace').proxyConfig
      ).groups[0].children[0]
    ).showSuccessNotification
  ).toBe(false)
  expect(() =>
    parseBackup(
      JSON.stringify({ version: '1.0.0', proxyConfig: proxy([rule('old', '旧代理', 'g')]) })
    )
  ).not.toThrow()
  for (const value of ['false', 0, null]) {
    expect(() =>
      parseBackup(
        JSON.stringify({
          version: '1.0.0',
          proxyConfig: proxy([{ ...rule('bad', '非法开关', 'g'), showSuccessNotification: value }])
        })
      )
    ).toThrow(/showSuccessNotification/)
  }
})
test('收藏字段随源代理导出、覆盖和增量导入，旧文件未填写时仍兼容', () => {
  const local = proxy([{ ...rule('r', '代理', 'g'), favorite: true }])
  const incoming = proxy([
    { ...rule('remote', '代理', 'g'), favorite: false },
    { ...rule('new', '新增', 'g'), favorite: true }
  ])
  const backup = createBackup('proxy', incoming, { enabled: false, groups: [] }, 'now')
  expect(
    requireRule(requireValue(parseBackup(JSON.stringify(backup)).proxyConfig).groups[0].children[1])
      .favorite
  ).toBe(true)
  expect(
    requireRule(
      requireValue(
        applyBackup(
          { proxyConfig: local, scriptConfig: { enabled: false, groups: [] } },
          backup,
          'replace'
        ).proxyConfig
      ).groups[0].children[0]
    ).favorite
  ).toBe(false)
  const merged = applyBackup(
    { proxyConfig: local, scriptConfig: { enabled: false, groups: [] } },
    backup,
    'merge'
  )
  expect(
    requireValue(merged.proxyConfig).groups[0].children.map(node => requireRule(node).favorite)
  ).toStrictEqual([true, true])
  expect(() =>
    parseBackup(
      JSON.stringify({ version: '1.0.0', proxyConfig: proxy([rule('old', '旧配置', 'g')]) })
    )
  ).not.toThrow()
  expect(() =>
    parseBackup(
      JSON.stringify({
        version: '1.0.0',
        proxyConfig: proxy([{ ...rule('bad', '错误字段', 'g'), favorite: 'true' }])
      })
    )
  ).toThrow(/favorite/)
})
const scripts = {
  enabled: false,
  groups: [
    {
      id: 'sg',
      name: '工具',
      type: 'group' as const,
      children: [
        { id: 's', name: '脚本', type: 'script' as const, groupId: 'sg', content: 'console.log(1)' }
      ]
    }
  ]
} satisfies ScriptConfig
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
  expect(
    requireRule(requireValue(parsed.proxyConfig).groups[0].children[0]).requestHeaders
  ).toStrictEqual(settings)
  requireValue(
    requireRule(requireValue(parsed.proxyConfig).groups[0].children[0]).requestHeaders
  )[0].value = 'copy'
  expect(settings[0].value).toBe('local')
  const merged = applyBackup(
    { proxyConfig: current, scriptConfig: scripts },
    { version: '1.0.0', proxyConfig: incoming },
    'merge'
  )
  expect(
    requireValue(
      requireRule(requireValue(merged.proxyConfig).groups[0].children[0]).requestHeaders
    )[0].value
  ).toBe('local')
  for (const headers of [
    [{ ...settings[0], name: 'bad name' }],
    [{ ...settings[0], value: 'bad\r\nvalue' }],
    {},
    null
  ]) {
    const invalid = proxy([{ ...rule('r', '代理', 'g'), requestHeaders: headers }])
    expect(() => parseBackup(JSON.stringify({ version: '1.0.0', proxyConfig: invalid }))).toThrow()
  }
})
test('三个导出范围只包含选中的数据，且输出与输入不共享对象', () => {
  const local = proxy([rule('r', '代理', 'g')])
  for (const scope of ['proxy', 'script', 'all'] as const) {
    const backup = createBackup(scope, local, scripts, '2026-10-29T00:00:00.000Z')
    expect(Boolean(backup.proxyConfig)).toBe(scope !== 'script')
    expect(Boolean(backup.scriptConfig)).toBe(scope !== 'proxy')
    expect(parseBackup(JSON.stringify(backup))).toStrictEqual(backup)
  }
  const backup = createBackup('all', local, scripts, '2026-10-29T00:00:00.000Z')
  requireValue(backup.proxyConfig).groups[0].name = '修改导出副本'
  expect(local.groups[0].name).toBe('环境')
})
test('覆盖导入只返回文件包含的类型', () => {
  const backup = createBackup('script', proxy(), scripts, 'now')
  const result = applyBackup(
    { proxyConfig: proxy(), scriptConfig: { enabled: true, groups: [] } },
    backup,
    'replace'
  )
  expect(result.proxyConfig).toBe(undefined)
  expect(result.scriptConfig).toStrictEqual(scripts)
  expect(result.scriptConfig).not.toBe(scripts)
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
        type: 'group' as const,
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
  expect(requireValue(result).enabled).toBe(true)
  expect(requireValue(result).groups[0].enabled).toBe(true)
  expect(requireRule(requireValue(result).groups[0].children[0]).targetUrl).toBe('http://local/')
  expect(requireRule(requireValue(result).groups[0].children[1]).groupId).toBe('g')
  expect(requireValue(result).groups[0].children.length).toBe(2)
  expect({ current, incoming }).toStrictEqual(before)
})
test('同名只在同级同类型冲突，不同分组可保留同名规则；ID 冲突时修复父子引用', () => {
  const current = proxy([rule('r', '同名', 'g')])
  const incoming = {
    enabled: false,
    groups: [
      {
        id: 'g',
        name: '新环境',
        type: 'group' as const,
        enabled: false,
        children: [
          {
            id: 'r',
            name: '子分组',
            type: 'group' as const,
            enabled: false,
            parentId: 'g',
            children: [rule('leaf', '同名', 'r')]
          }
        ]
      }
    ]
  }
  const backup = { version: '1.0.0' as const, proxyConfig: incoming }
  const result = applyBackup({ proxyConfig: current, scriptConfig: scripts }, backup, 'merge')
  expect(result).toStrictEqual(
    applyBackup({ proxyConfig: current, scriptConfig: scripts }, backup, 'merge')
  )
  const group = requireValue(result.proxyConfig).groups[1]
  expect(group.id).not.toBe('g')
  expect(group.children[0].id).not.toBe('r')
  expect(requireGroup(group.children[0]).parentId).toBe(group.id)
  expect(requireRule(requireGroup(group.children[0]).children[0]).groupId).toBe(
    group.children[0].id
  )
})
test('同名脚本保留本地正文和时间信息', () => {
  const incoming = structuredClone(scripts)
  incoming.groups[0].children[0].content = 'remote'
  const result = applyBackup(
    { proxyConfig: proxy(), scriptConfig: scripts },
    { version: '1.0.0', scriptConfig: incoming },
    'merge'
  )
  expect(result.scriptConfig).toStrictEqual(scripts)
})
test('同名嵌套分组递归补充新项，保留本地分组字段并重定向新节点引用', () => {
  const current = proxy([
    {
      id: 'nested',
      name: '子环境',
      type: 'group' as const,
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
        type: 'group' as const,
        enabled: false,
        children: [
          {
            id: 'remote-nested',
            name: '子环境',
            type: 'group' as const,
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
  const nested = requireValue(result).groups[0].children[0]
  expect(nested.id).toBe('nested')
  expect(nested.enabled).toBe(true)
  expect(requireRule(requireGroup(nested).children[0]).targetUrl).toBe('http://local/')
  expect(requireRule(requireGroup(nested).children[1]).groupId).toBe('nested')
})
test('兼容旧版代理、脚本以及空配置导出文件', () => {
  expect(
    parseBackup(JSON.stringify({ version: '1.0.0', config: proxy() })).proxyConfig
  ).toStrictEqual(proxy())
  expect(parseBackup(JSON.stringify({ config: scripts })).scriptConfig).toStrictEqual(scripts)
  const empty = { enabled: false, groups: [] }
  expect(
    parseBackup(JSON.stringify({ config: empty }), 'script-config-2026-10-29.json').scriptConfig
  ).toStrictEqual(empty)
  expect(() => parseBackup(JSON.stringify({ config: empty }))).toThrow(/识别/)
})
test('导入前拒绝重复 ID、非法节点、错误字段类型和父子引用，不接受未知版本', () => {
  const valid = createBackup('all', proxy([rule('r', '规则', 'g')]), scripts, 'now')
  type InvalidBackup = {
    version: unknown
    proxyConfig: {
      groups: {
        children: {
          targetUrl: unknown
          groupId: unknown
          id: unknown
        }[]
      }[]
    }
    scriptConfig: {
      groups: {
        children: {
          type: unknown
        }[]
      }[]
    }
  }
  const variants: ((value: InvalidBackup) => void)[] = [
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
    const invalid = structuredClone(valid) as InvalidBackup
    mutate(invalid)
    expect(() => parseBackup(JSON.stringify(invalid))).toThrow()
  }
})
