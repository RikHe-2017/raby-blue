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

test('viewer pages use level/date index, newest first, stable ties and bounded page size', async () => {
  const db = createLogDatabase(`viewer-${crypto.randomUUID()}`)
  for (const [timestamp, level, message] of [
    [10, 'error', 'old'],
    [20, 'error', 'first'],
    [20, 'error', 'second'],
    [30, 'info', 'other']
  ] as const)
    await db.add(createLogEntry(level, 'background', [message], timestamp))
  const query = { start: 10, end: 30, level: 'error' as const, page: 1, pageSize: 2 }
  const first = await db.page(query)
  expect(first.total).toBe(3)
  expect(first.entries.map(row => row.message)).toEqual(['second', 'first'])
  expect((await db.page({ ...query, page: 2 })).entries.map(row => row.message)).toEqual(['old'])
  expect((await db.page({ ...query, page: 3 })).entries).toEqual([])
  expect((await db.page({ ...query, start: 21 })).total).toBe(0)
})
