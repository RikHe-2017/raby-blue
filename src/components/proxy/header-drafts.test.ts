import { requireValue } from '../../test-utils/fixtures'
import { expect, test } from 'vitest'
import { createHeaderDrafts } from './header-drafts.ts'
import type { HeaderField } from './header-drafts.ts'
import type { ProxyRule } from '../../types/proxy'
const rule = (id: string): ProxyRule => ({
  id,
  name: id,
  type: 'rule' as const,
  enabled: false,
  groupId: 'g',
  sourceUrl: '',
  targetUrl: ''
})
const row = (value = 'value') => ({ id: 'h', enabled: true, name: 'X-Test', value })
const setup = (save?: () => Promise<void>) => {
  const rules = new Map<string, ProxyRule>([
    ['a', rule('a')],
    ['b', rule('b')]
  ])
  const writes: [string, Partial<Pick<ProxyRule, HeaderField>>][] = []
  const drafts = createHeaderDrafts(
    id => rules.get(id),
    async (id, patch) => {
      writes.push([id, structuredClone(patch)])
      rules.set(id, { ...rules.get(id)!, ...patch })
      if (save) await save()
    }
  )
  return { rules, writes, drafts }
}
test('invalid drafts remain local; valid headers persist by rule and become saved only after success', async () => {
  let release!: () => void
  const { drafts, writes } = setup(
    () =>
      new Promise<void>(resolve => {
        release = resolve
      })
  )
  drafts.change('a', 'requestHeaders', [{ ...row(), name: '' }])
  await drafts.flush()
  expect(writes.length).toBe(0)
  expect(drafts.get('a', 'requestHeaders').error).toBeTruthy()
  drafts.change('a', 'requestHeaders', [row()])
  const flushing = drafts.flush()
  await new Promise(resolve => setImmediate(resolve))
  expect(drafts.get('a', 'requestHeaders').saved).toBe(false)
  release()
  await flushing
  expect(drafts.get('a', 'requestHeaders').saved).toBe(true)
  expect(writes[0][0]).toBe('a')
  drafts.dispose()
})
test('failure remains unsaved and retries; deleted or externally replaced rules never get stale drafts', async () => {
  let fail = true
  const { drafts, rules, writes } = setup(async () => {
    if (fail) throw new Error('storage unavailable')
  })
  drafts.change('a', 'responseHeaders', [row()])
  await expect(drafts.flush()).rejects.toThrow(/storage unavailable/)
  expect(drafts.get('a', 'responseHeaders').saved).toBe(false)
  fail = false
  await drafts.flush()
  expect(drafts.get('a', 'responseHeaders').saved).toBe(true)
  drafts.change('b', 'requestHeaders', [row()])
  rules.delete('b')
  await drafts.flush()
  expect(writes.some(([id]) => id === 'b')).toBe(false)
  drafts.change('a', 'responseHeaders', [row('draft')])
  rules.set('a', { ...rule('a'), responseHeaders: [row('imported')] })
  await drafts.flush()
  expect(requireValue(requireValue(rules.get('a')).responseHeaders)[0].value).toBe('imported')
  drafts.dispose()
})
test('newer edits stay pending during an older save and are flushed in order', async () => {
  let release!: () => void
  let count = 0
  const { drafts, rules } = setup(() =>
    ++count === 1
      ? new Promise<void>(resolve => {
          release = resolve
        })
      : Promise.resolve()
  )
  drafts.change('a', 'requestHeaders', [row('first')])
  const first = drafts.flush()
  await new Promise(resolve => setImmediate(resolve))
  drafts.change('a', 'requestHeaders', [row('second')])
  release()
  await first
  expect(drafts.get('a', 'requestHeaders').saved).toBe(false)
  await drafts.flush()
  expect(requireValue(requireValue(rules.get('a')).requestHeaders)[0].value).toBe('second')
  expect(drafts.get('a', 'requestHeaders').saved).toBe(true)
  drafts.dispose()
})
