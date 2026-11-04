import 'fake-indexeddb/auto'
import { expect, test } from 'vitest'
import { createLogDatabase } from './database'
import { createLogEntry } from './model'

test('IndexedDB persists across connections, filters intersections and deletes expired logs only', async () => {
  const name = `logs-${crypto.randomUUID()}`
  const db = createLogDatabase(name)
  await db.add(createLogEntry('error', 'background', ['one'], 10))
  await db.add(createLogEntry('info', 'background', ['two'], 20))
  await db.add(createLogEntry('error', 'background', ['three'], 30))
  const reopened = createLogDatabase(name)
  expect(
    (await reopened.query({ start: 15, end: 30, levels: ['error'] })).map(row => row.message)
  ).toEqual(['three'])
  expect(await db.query({ levels: [] })).toEqual([])
  expect(await db.query({ end: 20 })).toHaveLength(2)
  await db.prune(20)
  expect((await reopened.query({})).map(row => row.message)).toEqual(['two', 'three'])
  await db.clear()
  expect(await reopened.query({})).toEqual([])
})
