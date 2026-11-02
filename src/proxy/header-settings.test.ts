import { requireValue } from '../test-utils/fixtures'
import { expect, test } from 'vitest'
import { validateHeaderSettings, mergeHeaderSettings } from './header-settings.ts'
import { findResponseMatch } from '../document-response-rules.ts'
import { getProxyRequestOwner } from './request-ownership.ts'
const row = (name: string, value = '', enabled = true, id = name) => ({ id, name, value, enabled })
test('setting headers replaces case variants, preserves unrelated duplicates and does not mutate inputs', () => {
  const original: [string, string][] = [
    ['X-Test', 'old'],
    ['x-test', 'older'],
    ['Link', 'a'],
    ['Link', 'b']
  ]
  const settings = [row('x-Test', ''), row('X-Disabled', 'ignored', false), row('X-New', 'new')]
  const before = structuredClone({ original, settings })
  expect(mergeHeaderSettings(original, settings)).toStrictEqual([
    ['Link', 'a'],
    ['Link', 'b'],
    ['x-Test', ''],
    ['X-New', 'new']
  ])
  expect({ original, settings }).toStrictEqual(before)
  expect(mergeHeaderSettings(original)).toStrictEqual(original)
})
test('validation rejects duplicate names/IDs, injection, malformed values and protected fields', () => {
  for (const settings of [
    [row('X-Test'), row('x-test')],
    [row('X-A', '', true, 'id'), row('X-B', '', true, 'id')],
    [row('bad name')],
    [row('X-Test', 'ok\r\nInjected: yes')],
    [row('X-Test', '中文')],
    [row('Host')],
    [row('Set-Cookie')],
    [row('User-Agent')],
    [row('X-HTTP-Method-Override', 'TRACE')],
    [row('Content-Length')],
    [row('Sec-Fetch-Site')],
    [{ ...row('X-Test'), enabled: 'true' }],
    {},
    null
  ])
    expect(() => validateHeaderSettings(settings, 'request')).toThrow()
  for (const name of ['Content-Encoding', 'Set-Cookie', 'Transfer-Encoding'])
    expect(() => validateHeaderSettings([row(name)], 'response')).toThrow()
  expect(() => validateHeaderSettings(undefined, 'request')).not.toThrow()
  expect(() =>
    validateHeaderSettings([row('Authorization', 'Bearer demo'), row('X-Blank')], 'request')
  ).not.toThrow()
  expect(() =>
    validateHeaderSettings([row('Access-Control-Allow-Origin', '*')], 'response')
  ).not.toThrow()
})
test('response matching returns the owning rule without conflating identical targets', () => {
  const rules = ['one', 'two'].map(id => ({
    id,
    name: 'fixture',
    type: 'rule' as const,
    groupId: 'g',
    enabled: true,
    sourceUrl: `http://remote/${id}/`,
    targetUrl: 'http://local/'
  }))
  expect(findResponseMatch('http://remote/two/file', rules)).toStrictEqual({
    rule: rules[1],
    target: 'http://local/file'
  })
  expect(findResponseMatch('http://local/file', rules)).toBe(undefined)
})
test('redirect ownership requires an exact mapping from the preceding URL, not just a target match', () => {
  const rules = ['one', 'two'].map(id => ({
    id,
    name: 'fixture',
    type: 'rule' as const,
    groupId: 'g',
    enabled: true,
    sourceUrl: `http://remote/${id}/`,
    targetUrl: 'http://local/',
    requestHeaders: [row('X-Rule', id)]
  }))
  expect(getProxyRequestOwner('http://local/file', undefined, rules)).toBe(undefined)
  expect(
    requireValue(getProxyRequestOwner('http://local/file', 'http://remote/two/file', rules)?.rule)
      .id
  ).toBe('two')
  expect(getProxyRequestOwner('http://other/file', 'http://local/file', rules)).toBe(undefined)
  expect(getProxyRequestOwner('http://local/wrong', 'http://remote/two/file', rules)).toBe(
    undefined
  )
})
test('redirect ownership follows browser URL normalization without broadening path matching', () => {
  const rules = [
    {
      id: 'r',
      name: 'fixture',
      type: 'rule' as const,
      groupId: 'g',
      enabled: true,
      sourceUrl: 'http://remote/app/',
      targetUrl: 'HTTP://LOCAL:80/base/',
      requestHeaders: [row('X-Test')]
    }
  ]
  expect(
    requireValue(
      getProxyRequestOwner('http://local/base/file', 'http://remote/app/file', rules)?.rule
    ).id
  ).toBe('r')
  expect(getProxyRequestOwner('http://local/base/other', 'http://remote/app/file', rules)).toBe(
    undefined
  )
  expect(
    requireValue(
      getProxyRequestOwner('http://local/base/file', 'http://remote/app/file', [
        {
          ...rules[0],
          name: 'fixture',
          type: 'rule' as const,
          groupId: 'g',
          enabled: true,
          sourceUrl: '^http://remote/app/file$',
          targetUrl: 'http://local/base/file#fragment'
        }
      ])?.rule
    ).id,
    'URL fragments do not participate in HTTP request attribution'
  ).toBe('r')
})
test('same-address header rules match direct requests without requiring a redirect', () => {
  const rule = {
    id: 'headers',
    name: 'fixture',
    type: 'rule' as const,
    groupId: 'g',
    enabled: true,
    sourceUrl: 'http://remote/api/',
    targetUrl: 'http://remote/api/',
    requestHeaders: [row('X-Label', 'xianghe11')]
  }
  const before = structuredClone(rule)
  expect(
    requireValue(getProxyRequestOwner('http://remote/api/list?q=1', undefined, [rule])?.rule).id
  ).toBe('headers')
  expect(
    requireValue(
      getProxyRequestOwner('http://remote/api/list', 'http://remote/start', [rule])?.rule
    ).id
  ).toBe('headers')
  expect(getProxyRequestOwner('http://remote/api-extra/list', undefined, [rule])).toBe(undefined)
  expect(getProxyRequestOwner('http://remote/other/', undefined, [rule])).toBe(undefined)
  expect(
    requireValue(
      getProxyRequestOwner('http://remote/api/list', undefined, [{ ...rule, requestHeaders: [] }])
        ?.rule
    ).id,
    'source ownership is independent of whether header overrides exist'
  ).toBe('headers')
  expect(rule).toStrictEqual(before)
})
test('blank targets apply request-only or response-only settings to the original source URL', () => {
  for (const targetUrl of ['', '   ']) {
    for (const headers of [
      { requestHeaders: [row('X-Label', 'xianghe11')] },
      { responseHeaders: [row('X-Reply', 'configured')] }
    ]) {
      const rule = {
        id: 'headers',
        name: 'fixture',
        type: 'rule' as const,
        groupId: 'g',
        enabled: true,
        sourceUrl: 'http://remote/api/',
        targetUrl,
        ...headers
      }
      const before = structuredClone(rule)
      expect(
        requireValue(getProxyRequestOwner('http://remote/api/list?q=1', undefined, [rule])?.rule).id
      ).toBe('headers')
      expect(getProxyRequestOwner('http://remote/elsewhere', undefined, [rule])).toBe(undefined)
      expect(rule).toStrictEqual(before)
    }
  }
})
test('source ownership is independent of target and headers, with immutable redirect snapshots', () => {
  const source = {
    id: 'a',
    name: 'fixture',
    type: 'rule' as const,
    groupId: 'g',
    enabled: true,
    sourceUrl: 'http://remote/app/',
    targetUrl: 'http://local/'
  }
  const destination = {
    id: 'b',
    name: 'fixture',
    type: 'rule' as const,
    groupId: 'g',
    enabled: true,
    sourceUrl: 'http://local/',
    targetUrl: '',
    requestHeaders: [row('X-Rule', 'b')]
  }
  const before = structuredClone([source, destination])
  const owner = getProxyRequestOwner('http://remote/app/file', undefined, [source, destination])
  expect(owner).toStrictEqual({
    url: 'http://remote/app/file',
    target: 'http://local/file',
    rule: source
  })
  const redirected = getProxyRequestOwner(
    'http://local/file',
    'http://remote/app/file',
    [{ ...source, targetUrl: 'http://changed/' }, destination],
    owner
  )
  expect(
    requireValue(redirected).rule,
    'in-flight source mapping is not replaced by current configuration'
  ).toBe(source)
  expect(
    requireValue(getProxyRequestOwner('http://local/file', undefined, [source, destination])).rule
  ).toBe(destination)
  expect(
    getProxyRequestOwner(
      'http://unrelated/file',
      'http://local/file',
      [source, destination],
      redirected
    )
  ).toBe(undefined)
  expect([source, destination]).toStrictEqual(before)
})
