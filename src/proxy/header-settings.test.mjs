import assert from 'node:assert/strict'
import test from 'node:test'
import { validateHeaderSettings, mergeHeaderSettings } from './header-settings.ts'
import { findResponseMatch } from '../document-response-rules.ts'
import { getProxyRequestOwner } from './request-ownership.ts'

const row = (name, value = '', enabled = true, id = name) => ({ id, name, value, enabled })

test('setting headers replaces case variants, preserves unrelated duplicates and does not mutate inputs', () => {
  const original = [
    ['X-Test', 'old'],
    ['x-test', 'older'],
    ['Link', 'a'],
    ['Link', 'b']
  ]
  const settings = [row('x-Test', ''), row('X-Disabled', 'ignored', false), row('X-New', 'new')]
  const before = structuredClone({ original, settings })
  assert.deepEqual(mergeHeaderSettings(original, settings), [
    ['Link', 'a'],
    ['Link', 'b'],
    ['x-Test', ''],
    ['X-New', 'new']
  ])
  assert.deepEqual({ original, settings }, before)
  assert.deepEqual(mergeHeaderSettings(original), original)
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
    assert.throws(() => validateHeaderSettings(settings, 'request'))
  for (const name of ['Content-Encoding', 'Set-Cookie', 'Transfer-Encoding'])
    assert.throws(() => validateHeaderSettings([row(name)], 'response'))
  assert.doesNotThrow(() => validateHeaderSettings(undefined, 'request'))
  assert.doesNotThrow(() =>
    validateHeaderSettings([row('Authorization', 'Bearer demo'), row('X-Blank')], 'request')
  )
  assert.doesNotThrow(() =>
    validateHeaderSettings([row('Access-Control-Allow-Origin', '*')], 'response')
  )
})

test('response matching returns the owning rule without conflating identical targets', () => {
  const rules = ['one', 'two'].map(id => ({
    id,
    sourceUrl: `http://remote/${id}/`,
    targetUrl: 'http://local/'
  }))
  assert.deepEqual(findResponseMatch('http://remote/two/file', rules), {
    rule: rules[1],
    target: 'http://local/file'
  })
  assert.equal(findResponseMatch('http://local/file', rules), undefined)
})

test('redirect ownership requires an exact mapping from the preceding URL, not just a target match', () => {
  const rules = ['one', 'two'].map(id => ({
    id,
    sourceUrl: `http://remote/${id}/`,
    targetUrl: 'http://local/',
    requestHeaders: [row('X-Rule', id)]
  }))
  assert.equal(getProxyRequestOwner('http://local/file', undefined, rules), undefined)
  assert.equal(
    getProxyRequestOwner('http://local/file', 'http://remote/two/file', rules)?.rule.id,
    'two'
  )
  assert.equal(getProxyRequestOwner('http://other/file', 'http://local/file', rules), undefined)
  assert.equal(
    getProxyRequestOwner('http://local/wrong', 'http://remote/two/file', rules),
    undefined
  )
})

test('redirect ownership follows browser URL normalization without broadening path matching', () => {
  const rules = [
    {
      id: 'r',
      sourceUrl: 'http://remote/app/',
      targetUrl: 'HTTP://LOCAL:80/base/',
      requestHeaders: [row('X-Test')]
    }
  ]
  assert.equal(
    getProxyRequestOwner('http://local/base/file', 'http://remote/app/file', rules)?.rule.id,
    'r'
  )
  assert.equal(
    getProxyRequestOwner('http://local/base/other', 'http://remote/app/file', rules),
    undefined
  )
  assert.equal(
    getProxyRequestOwner('http://local/base/file', 'http://remote/app/file', [
      {
        ...rules[0],
        sourceUrl: '^http://remote/app/file$',
        targetUrl: 'http://local/base/file#fragment'
      }
    ])?.rule.id,
    'r',
    'URL fragments do not participate in HTTP request attribution'
  )
})

test('same-address header rules match direct requests without requiring a redirect', () => {
  const rule = {
    id: 'headers',
    sourceUrl: 'http://remote/api/',
    targetUrl: 'http://remote/api/',
    requestHeaders: [row('X-Label', 'xianghe11')]
  }
  const before = structuredClone(rule)
  assert.equal(
    getProxyRequestOwner('http://remote/api/list?q=1', undefined, [rule])?.rule.id,
    'headers'
  )
  assert.equal(
    getProxyRequestOwner('http://remote/api/list', 'http://remote/start', [rule])?.rule.id,
    'headers'
  )
  assert.equal(getProxyRequestOwner('http://remote/api-extra/list', undefined, [rule]), undefined)
  assert.equal(getProxyRequestOwner('http://remote/other/', undefined, [rule]), undefined)
  assert.equal(
    getProxyRequestOwner('http://remote/api/list', undefined, [{ ...rule, requestHeaders: [] }])
      ?.rule.id,
    'headers',
    'source ownership is independent of whether header overrides exist'
  )
  assert.deepEqual(rule, before)
})

test('blank targets apply request-only or response-only settings to the original source URL', () => {
  for (const targetUrl of ['', '   ']) {
    for (const headers of [
      { requestHeaders: [row('X-Label', 'xianghe11')] },
      { responseHeaders: [row('X-Reply', 'configured')] }
    ]) {
      const rule = { id: 'headers', sourceUrl: 'http://remote/api/', targetUrl, ...headers }
      const before = structuredClone(rule)
      assert.equal(
        getProxyRequestOwner('http://remote/api/list?q=1', undefined, [rule])?.rule.id,
        'headers'
      )
      assert.equal(getProxyRequestOwner('http://remote/elsewhere', undefined, [rule]), undefined)
      assert.deepEqual(rule, before)
    }
  }
})

test('source ownership is independent of target and headers, with immutable redirect snapshots', () => {
  const source = { id: 'a', sourceUrl: 'http://remote/app/', targetUrl: 'http://local/' }
  const destination = {
    id: 'b',
    sourceUrl: 'http://local/',
    targetUrl: '',
    requestHeaders: [row('X-Rule', 'b')]
  }
  const before = structuredClone([source, destination])
  const owner = getProxyRequestOwner('http://remote/app/file', undefined, [source, destination])
  assert.deepEqual(owner, {
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
  assert.equal(
    redirected.rule,
    source,
    'in-flight source mapping is not replaced by current configuration'
  )
  assert.equal(
    getProxyRequestOwner('http://local/file', undefined, [source, destination]).rule,
    destination
  )
  assert.equal(
    getProxyRequestOwner(
      'http://unrelated/file',
      'http://local/file',
      [source, destination],
      redirected
    ),
    undefined
  )
  assert.deepEqual([source, destination], before)
})
