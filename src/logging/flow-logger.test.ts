import { expect, test } from 'vitest'
import { createFlowLogger, type ProxyContext } from './flow-logger'

const context: ProxyContext = {
  kind: 'proxy',
  tabId: 1,
  sourceUrl: 'http://a/x',
  targetUrl: 'http://b/x',
  ruleId: 'r',
  ruleName: 'local'
}

test.each([true, false])('success requires both confirmations, loaded first: %s', first => {
  const written: unknown[] = []
  const logs = createFlowLogger({ write: (...args) => written.push(args) })
  logs.beginProxy('x', context)
  if (first) logs.loaded('x')
  else logs.applied('x')
  expect(written).toHaveLength(0)
  if (first) logs.applied('x')
  else logs.loaded('x')
  logs.failed('x', 'late')
  expect(written).toHaveLength(1)
})

test('failure is buffered until applied and consumed once before writing', () => {
  const written: unknown[] = []
  const logs = createFlowLogger({ write: (...args) => written.push(args) })
  logs.beginProxy('x', context)
  logs.failed('x', new Error('refused'))
  expect(written).toHaveLength(0)
  logs.applied('x', { Authorization: 'raw' })
  logs.failed('x', 'duplicate')
  logs.loaded('x')
  expect(written).toHaveLength(1)
  expect(JSON.stringify(written)).toContain('refused')
  expect(JSON.stringify(written)).toContain('Authorization')
})

test('shared capacity, immutable snapshots, scoped cleanup and write isolation', () => {
  const written: unknown[] = []
  const logs = createFlowLogger({
    capacity: 2,
    write: (...args) => {
      written.push(args)
      throw Error('storage')
    }
  })
  const input = { ...context }
  logs.beginProxy('old', input)
  input.ruleName = 'changed'
  logs.beginScript('script', {
    kind: 'script',
    executionId: 's',
    scriptId: 's',
    scriptName: 'script'
  })
  logs.beginProxy('new', context)
  expect(logs.applied('old')).toBe(false)
  logs.cancelAllProxies()
  expect(logs.scriptSucceeded('script')).toBe(true)
  expect(logs.scriptSucceeded('script')).toBe(false)
  logs.beginProxy('snapshot', input)
  input.ruleName = 'later'
  logs.applied('snapshot')
  expect(() => logs.failed('snapshot', 'refused')).not.toThrow()
  expect(JSON.stringify(written)).toContain('changed')
  expect(JSON.stringify(written)).not.toContain('later')
})

test('redirect validation and cancellation cannot become business results', () => {
  const written: unknown[] = []
  const logs = createFlowLogger({ write: (...args) => written.push(args) })
  logs.beginProxy('x', context)
  logs.redirected('x', context.sourceUrl, 'http://other/x')
  logs.loaded('x')
  logs.beginProxy('y', context)
  logs.cancelProxyScope({ tabId: 1, sessionId: '' })
  logs.failed('y', 'late')
  expect(written).toEqual([])
})

test('terminal consumption precedes writes, disabled recording cannot revive results', () => {
  const written: unknown[] = []
  let enabled = false
  let logs: ReturnType<typeof createFlowLogger>
  logs = createFlowLogger({
    write: (...args) => {
      expect(logs.failed('x', 'reentrant')).toBe(false)
      if (enabled) written.push(args)
    }
  })
  logs.beginProxy('x', context)
  logs.applied('x')
  logs.loaded('x')
  enabled = true
  expect(logs.loaded('x')).toBe(false)
  expect(written).toEqual([])
})

test('frozen input and changed headers are independent immutable snapshots', () => {
  const written: unknown[] = []
  const headers = { Authorization: 'raw' }
  const logs = createFlowLogger({ write: (...args) => written.push(args) })
  logs.beginProxy(
    'frozen',
    Object.freeze({ ...context, requestHeaders: Object.freeze({ Existing: 'original' }) })
  )
  logs.applied('frozen', headers)
  headers.Authorization = 'later'
  logs.loaded('frozen')
  expect(JSON.stringify(written)).toContain('raw')
  expect(JSON.stringify(written)).not.toContain('later')
})
