import assert from 'node:assert/strict'
import test from 'node:test'
import {
  findResponseTarget,
  getEnabledProxyRules,
  getFulfillmentHeaders,
  getReplacementRequestHeaders,
  getReplacementRequestBody
} from './document-response-rules.ts'

const rule = {
  id: 'a',
  name: 'frontend',
  type: 'rule',
  groupId: 'g',
  enabled: true,
  sourceUrl: 'http://remote/app/',
  targetUrl: 'http://localhost:8098/'
}

test('document requests retain path and query; nonmatches and self-maps are skipped', () => {
  assert.equal(findResponseTarget('http://remote/app/', [rule]), 'http://localhost:8098/')
  assert.equal(
    findResponseTarget('http://remote/app/page?q=1', [rule]),
    'http://localhost:8098/page?q=1'
  )
  assert.equal(findResponseTarget('http://elsewhere/', [rule]), undefined)
  assert.equal(
    findResponseTarget(rule.sourceUrl, [{ ...rule, targetUrl: rule.sourceUrl }]),
    undefined
  )
  assert.equal(findResponseTarget(rule.sourceUrl, [{ ...rule, sourceUrl: '' }]), undefined)
})

test('regex captures, target dollar signs, invalid regex and invalid protocols', () => {
  assert.equal(
    findResponseTarget('http://remote/a', [
      { ...rule, sourceUrl: '^http://remote/(.*)$', targetUrl: 'http://local/$/' }
    ]),
    'http://local/$/a'
  )
  assert.equal(findResponseTarget(rule.sourceUrl, [{ ...rule, sourceUrl: '[' }]), undefined)
  assert.equal(
    findResponseTarget(rule.sourceUrl, [{ ...rule, targetUrl: 'javascript:alert(1)' }]),
    undefined
  )
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
  assert.deepEqual(getReplacementRequestHeaders(headers), {
    Authorization: 'Bearer test',
    'Content-Type': 'application/json',
    Range: 'bytes=0-99'
  })
  assert.deepEqual(headers, before)
})

test('enabled rules derive from canonical source without mutation', () => {
  const config = {
    enabled: true,
    groups: [{ type: 'group', children: [rule, { ...rule, enabled: false }] }]
  }
  const before = JSON.stringify(config)
  assert.deepEqual(getEnabledProxyRules(config), [rule])
  assert.deepEqual(getEnabledProxyRules({ ...config, enabled: false }), [])
  assert.equal(JSON.stringify(config), before)
})

test('decoded bodies discard transport headers without MIME filtering', () => {
  assert.deepEqual(
    getFulfillmentHeaders([
      ['Content-Length', '123'],
      ['content-encoding', 'gzip'],
      ['connection', 'close'],
      ['content-type', 'text/plain'],
      ['x-test', 'yes']
    ]),
    [
      { name: 'content-type', value: 'text/plain' },
      { name: 'x-test', value: 'yes' }
    ]
  )
})

test('binary upload bytes take precedence over the lossy text representation', () => {
  const request = {
    postData: '\u0000\u0007',
    postDataEntries: [{ bytes: 'AID/' }, { bytes: 'Bw==' }]
  }
  const before = structuredClone(request)
  assert.deepEqual([...getReplacementRequestBody(request)], [0, 128, 255, 7])
  assert.deepEqual(request, before)
  assert.equal(getReplacementRequestBody({ postData: 'hello' }), 'hello')
  assert.equal(getReplacementRequestBody({}), undefined)
  assert.throws(() => getReplacementRequestBody({ postDataEntries: [{}] }), /请求正文/)
})
