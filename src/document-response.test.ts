import { expect, test } from 'vitest'
import type { ProxyConfig, ProxyRule } from './types/proxy'
import {
  findResponseTarget,
  findProxyMatch,
  isRegexSource,
  buildSourcePattern,
  getEnabledProxyRules,
  getFulfillmentHeaders,
  getReplacementRequestHeaders,
  getReplacementRequestBody
} from './document-response-rules.ts'
const rule: ProxyRule = {
  id: 'a',
  name: 'frontend',
  type: 'rule' as const,
  groupId: 'g',
  enabled: true,
  sourceUrl: 'http://remote/app/',
  targetUrl: 'http://localhost:8098/'
}

test.each([
  ['', false],
  ['https://example.com/app/', false],
  ['https://example.com/app/?q=one+two', false],
  ['^https://example\\.com/app/(.*)$', true],
  ['http://remote/(.*)', true],
  ['^http://remote/(one|two)/', true]
] as const)('source %s shares regex-mode detection with URL matching', (source, expected) => {
  expect(isRegexSource(source)).toBe(expected)
  if (expected) expect(buildSourcePattern(source)).toBe(source)
})

test('document requests retain path and query; nonmatches and self-maps are skipped', () => {
  expect(findResponseTarget('http://remote/app/', [rule])).toBe('http://localhost:8098/')
  expect(findResponseTarget('http://remote/app/page?q=1', [rule])).toBe(
    'http://localhost:8098/page?q=1'
  )
  expect(findResponseTarget('http://elsewhere/', [rule])).toBe(undefined)
  expect(findResponseTarget(rule.sourceUrl, [{ ...rule, targetUrl: rule.sourceUrl }])).toBe(
    undefined
  )
  expect(findResponseTarget(rule.sourceUrl, [{ ...rule, sourceUrl: '' }])).toBe(undefined)
})
test('regex captures, target dollar signs, invalid regex and invalid protocols', () => {
  expect(
    findResponseTarget('http://remote/a', [
      { ...rule, sourceUrl: '^http://remote/(.*)$', targetUrl: 'http://local/$/' }
    ])
  ).toBe('http://local/$/a')
  expect(findResponseTarget(rule.sourceUrl, [{ ...rule, sourceUrl: '[' }])).toBe(undefined)
  expect(findResponseTarget(rule.sourceUrl, [{ ...rule, targetUrl: 'javascript:alert(1)' }])).toBe(
    undefined
  )
})
test('an omitted target preserves the complete original URL instead of only the captured suffix', () => {
  for (const targetUrl of ['', '  ']) {
    for (const sourceUrl of ['http://remote/app/', '^http://remote/(.*)$']) {
      const input = { ...rule, sourceUrl, targetUrl }
      const url = 'http://remote/app/list?q=1'
      expect(findProxyMatch(url, [input])).toStrictEqual({ rule: input, target: url })
      expect(findResponseTarget(url, [input])).toBe(undefined)
    }
  }
  expect(findProxyMatch(rule.sourceUrl, [{ ...rule, targetUrl: 'not-a-url' }])).toBe(undefined)
})
test('request headers preserve API authorization, content type and range without original cookies', () => {
  const headers = {
    Authorization: 'Bearer test',
    'Content-Type': 'application/json',
    Range: 'bytes=0-99',
    Cookie: 'private=1',
    Host: 'remote',
    Origin: 'http://remote',
    Referer: 'http://remote/page',
    'Content-Length': '123',
    'Sec-Fetch-Site': 'same-origin'
  }
  const before = structuredClone(headers)
  expect(getReplacementRequestHeaders(headers)).toStrictEqual({
    Authorization: 'Bearer test',
    'Content-Type': 'application/json',
    Range: 'bytes=0-99'
  })
  expect(headers).toStrictEqual(before)
})
test('enabled rules derive from canonical source without mutation', () => {
  const config: ProxyConfig = {
    enabled: true,
    groups: [
      {
        id: 'g',
        name: 'test',
        enabled: true,
        type: 'group' as const,
        children: [rule, { ...rule, enabled: false }]
      }
    ]
  }
  const before = JSON.stringify(config)
  expect(getEnabledProxyRules(config)).toStrictEqual([rule])
  expect(getEnabledProxyRules({ ...config, enabled: false })).toStrictEqual([])
  expect(JSON.stringify(config)).toBe(before)
})
test('decoded bodies discard transport headers without MIME filtering', () => {
  expect(
    getFulfillmentHeaders([
      ['Content-Length', '123'],
      ['content-encoding', 'gzip'],
      ['connection', 'close'],
      ['content-type', 'text/plain'],
      ['x-test', 'yes']
    ])
  ).toStrictEqual([
    { name: 'content-type', value: 'text/plain' },
    { name: 'x-test', value: 'yes' }
  ])
})
test('binary upload bytes take precedence over the lossy text representation', () => {
  const request = {
    postData: '\u0000\u0007',
    postDataEntries: [{ bytes: 'AID/' }, { bytes: 'Bw==' }]
  }
  const before = structuredClone(request)
  expect([...(getReplacementRequestBody(request) as Uint8Array)]).toStrictEqual([0, 128, 255, 7])
  expect(request).toStrictEqual(before)
  expect(getReplacementRequestBody({ postData: 'hello' })).toBe('hello')
  expect(getReplacementRequestBody({})).toBe(undefined)
  expect(() => getReplacementRequestBody({ postDataEntries: [{}] })).toThrow(/请求正文/)
})
