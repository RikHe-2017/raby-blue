import { expect, test } from 'vitest'
import type { ProxyConfig } from '../types/proxy'
import { createProxyConfigPersistence } from './config-persistence'

const config = (): ProxyConfig => ({
  enabled: true,
  groups: [
    {
      id: 'g',
      name: 'group',
      type: 'group',
      enabled: true,
      children: [
        {
          id: 'r',
          name: 'rule',
          type: 'rule',
          groupId: 'g',
          enabled: true,
          sourceUrl: 'http://source.test/',
          targetUrl: 'http://target.test/'
        }
      ]
    }
  ]
})

function fixture() {
  let current = config()
  const writes: ProxyConfig[] = []
  const persistence = createProxyConfigPersistence({
    read: async () => current,
    write: async value => {
      current = structuredClone(value)
      writes.push(current)
    }
  })
  return { persistence, writes, read: () => current }
}

test('disabling only changes the global switch, preserves selections and does not mutate input', async () => {
  const f = fixture()
  const original = f.read()
  const before = structuredClone(original)
  await Promise.all([f.persistence.disable(), f.persistence.disable(), f.persistence.disable()])
  expect(f.writes).toHaveLength(1)
  expect(f.read()).toStrictEqual({ ...before, enabled: false })
  expect(original).toStrictEqual(before)
})

test('automatic saves queued around cancellation preserve disable while retaining editor changes', async () => {
  const f = fixture()
  const draft = config()
  draft.groups[0].name = 'edited'
  const before = structuredClone(draft)
  const first = f.persistence.save(draft)
  const disable = f.persistence.disable()
  const pending = f.persistence.save(draft)
  await Promise.all([first, disable, pending])
  expect(f.read()).toStrictEqual({ ...draft, enabled: false })
  expect(draft).toStrictEqual(before)
})

test('only an explicit switch action can re-enable and later stale saves cannot reverse it', async () => {
  const f = fixture()
  await f.persistence.disable()
  const oldOffSnapshot = structuredClone(f.read())
  await f.persistence.save(config(), true)
  await f.persistence.save(oldOffSnapshot)
  expect(f.read().enabled).toBe(true)
})

test('a failed write is reported without poisoning the next disable attempt', async () => {
  let current = config()
  let fail = true
  const persistence = createProxyConfigPersistence({
    read: async () => current,
    write: async value => {
      if (fail) throw new Error('storage failed')
      current = value
    }
  })
  await expect(persistence.disable()).rejects.toThrow('storage failed')
  expect(current.enabled).toBe(true)
  fail = false
  await persistence.disable()
  expect(current.enabled).toBe(false)
})
