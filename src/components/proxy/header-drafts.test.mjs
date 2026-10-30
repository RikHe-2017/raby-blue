import assert from 'node:assert/strict'
import test from 'node:test'
import { createHeaderDrafts } from './header-drafts.ts'

const row = (value = 'value') => ({ id: 'h', enabled: true, name: 'X-Test', value })
const setup = save => {
  const rules = new Map([
    ['a', { id: 'a' }],
    ['b', { id: 'b' }]
  ])
  const writes = []
  const drafts = createHeaderDrafts(
    id => rules.get(id),
    async (id, patch) => {
      writes.push([id, structuredClone(patch)])
      rules.set(id, { ...rules.get(id), ...patch })
      if (save) await save()
    }
  )
  return { rules, writes, drafts }
}

test('invalid drafts remain local; valid headers persist by rule and become saved only after success', async () => {
  let release
  const { drafts, writes } = setup(
    () =>
      new Promise(resolve => {
        release = resolve
      })
  )
  drafts.change('a', 'requestHeaders', [{ ...row(), name: '' }])
  await drafts.flush()
  assert.equal(writes.length, 0)
  assert.ok(drafts.get('a', 'requestHeaders').error)
  drafts.change('a', 'requestHeaders', [row()])
  const flushing = drafts.flush()
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(drafts.get('a', 'requestHeaders').saved, false)
  release()
  await flushing
  assert.equal(drafts.get('a', 'requestHeaders').saved, true)
  assert.equal(writes[0][0], 'a')
  drafts.dispose()
})

test('failure remains unsaved and retries; deleted or externally replaced rules never get stale drafts', async () => {
  let fail = true
  const { drafts, rules, writes } = setup(async () => {
    if (fail) throw new Error('storage unavailable')
  })
  drafts.change('a', 'responseHeaders', [row()])
  await assert.rejects(drafts.flush(), /storage unavailable/)
  assert.equal(drafts.get('a', 'responseHeaders').saved, false)
  fail = false
  await drafts.flush()
  assert.equal(drafts.get('a', 'responseHeaders').saved, true)
  drafts.change('b', 'requestHeaders', [row()])
  rules.delete('b')
  await drafts.flush()
  assert.equal(
    writes.some(([id]) => id === 'b'),
    false
  )
  drafts.change('a', 'responseHeaders', [row('draft')])
  rules.set('a', { id: 'a', responseHeaders: [row('imported')] })
  await drafts.flush()
  assert.equal(rules.get('a').responseHeaders[0].value, 'imported')
  drafts.dispose()
})

test('newer edits stay pending during an older save and are flushed in order', async () => {
  let release
  let count = 0
  const { drafts, rules } = setup(() =>
    ++count === 1
      ? new Promise(resolve => {
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
  assert.equal(drafts.get('a', 'requestHeaders').saved, false)
  await drafts.flush()
  assert.equal(rules.get('a').requestHeaders[0].value, 'second')
  assert.equal(drafts.get('a', 'requestHeaders').saved, true)
  drafts.dispose()
})
