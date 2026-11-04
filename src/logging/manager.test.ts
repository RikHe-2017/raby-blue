import 'fake-indexeddb/auto'
import { expect, test } from 'vitest'
import { createLogDatabase } from './database'
import { createLogManager } from './manager'
import { createLogEntry } from './model'
import type { LoggingPreferences } from './model'

test('manager filters writes, cleans on retention change, fixes export upper bound and serializes clear', async () => {
  let now = 40 * 86400000
  let preferences: LoggingPreferences = { levels: ['error'], retentionDays: 30 }
  const db = createLogDatabase(`manager-${crypto.randomUUID()}`)
  const manager = createLogManager(
    db,
    async () => preferences,
    () => now
  )
  await manager.record(createLogEntry('info', 'popup', ['ignored'], now))
  await manager.record(createLogEntry('error', 'popup', ['saved'], now))
  expect(await manager.export({})).toHaveLength(1)
  preferences = { levels: ['info', 'warning', 'error'], retentionDays: 1 }
  now += 2 * 86400000
  await manager.cleanup()
  expect(await manager.export({})).toEqual([])
  const recording = manager.record(createLogEntry('info', 'background', ['new'], now))
  await manager.clear()
  await recording
  expect(await manager.export({})).toEqual([])
  await db.add(createLogEntry('error', 'background', ['future'], now + 1))
  expect(await manager.export({})).toEqual([])
})

test('failed writes reject without blocking the next operation or recursively logging', async () => {
  let fail = true
  const entries: unknown[] = []
  const manager = createLogManager(
    {
      add: async entry => {
        if (fail) throw new Error('quota')
        entries.push(entry)
      },
      clear: async () => {},
      prune: async () => {},
      query: async () => []
    },
    async () => ({ levels: ['error'], retentionDays: 30 })
  )
  await expect(
    manager.record(createLogEntry('error', 'background', ['first'], Date.now()))
  ).rejects.toThrow('quota')
  fail = false
  await manager.record(createLogEntry('error', 'background', ['second'], Date.now()))
  expect(entries).toHaveLength(1)
})
