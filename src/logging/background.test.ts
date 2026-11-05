import 'fake-indexeddb/auto'
import { afterEach, expect, test, vi } from 'vitest'
import { startLogging } from './background'
import { createLogEntry } from './model'
import { createTestEvent } from '../test-utils/fixtures'
import { setLogSink } from '../utils/logger'

afterEach(() => {
  vi.unstubAllGlobals()
  setLogSink(async () => {})
})

test('background routes extension-page requests, creates retention alarm and filters persisted levels', async () => {
  let logging = { levels: ['error'], retentionDays: 30 }
  const onMessage = createTestEvent()
  const onAlarm = createTestEvent()
  const onChanged = createTestEvent()
  const createAlarm = vi.fn(async () => {})
  vi.stubGlobal('chrome', {
    runtime: { id: 'test', getURL: (path: string) => `chrome-extension://test/${path}`, onMessage },
    storage: { local: { get: async () => ({ userPreferences: { logging } }) }, onChanged },
    alarms: { get: async () => undefined, create: createAlarm, onAlarm }
  })
  startLogging()
  const request = (operation: string, payload?: unknown) =>
    new Promise<{ success: boolean; data?: unknown }>(resolve => {
      onMessage.emit(
        { action: 'logging', operation, payload },
        { id: 'test', url: 'chrome-extension://test/index.html' },
        resolve
      )
    })
  expect((await request('clear')).success).toBe(true)
  await request('record', createLogEntry('info', 'popup', ['not saved'], Date.now()))
  await request('record', createLogEntry('error', 'popup', ['saved'], Date.now()))
  expect((await request('export', {})).data).toHaveLength(1)
  const viewed = await request('page', { level: 'error', page: 1, pageSize: 20 })
  expect(viewed.success).toBe(true)
  expect(viewed.data).toMatchObject({ total: 1, entries: [{ message: 'saved' }] })
  expect((await request('page', { level: 'error', page: 0, pageSize: 20 })).success).toBe(false)
  expect((await request('page', { level: 'bad', page: 1, pageSize: 20 })).success).toBe(false)
  expect((await request('page', { level: 'error', page: 1, pageSize: 101 })).success).toBe(false)
  expect(createAlarm).toHaveBeenCalledWith('raby-blue-log-retention', { periodInMinutes: 60 })
  expect((await request('export', { levels: ['not-a-level'] })).success).toBe(false)
  expect((await request('record', { message: 'invalid' })).success).toBe(false)
  const reply = vi.fn()
  onMessage.emit(
    { action: 'logging', operation: 'clear' },
    { id: 'test', url: 'http://website.test/' },
    reply
  )
  expect(reply).not.toHaveBeenCalled()
  logging = { levels: ['info'], retentionDays: 1 }
  onChanged.emit({ userPreferences: { newValue: { logging } } }, 'local')
  onAlarm.emit({ name: 'raby-blue-log-retention' })
  await request('record', createLogEntry('info', 'popup', ['new'], Date.now()))
  expect((await request('export', { levels: ['info'] })).data).toHaveLength(1)
  await request('clear')
  expect((await request('export', {})).data).toEqual([])
})
