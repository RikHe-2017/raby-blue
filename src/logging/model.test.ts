import { expect, test } from 'vitest'
import {
  createLogEntry,
  normalizeLoggingPreferences,
  retentionCutoff,
  changedHeaders,
  localDateFilter,
  todayRange
} from './model'
import { mergeUserPreferences, normalizeUserPreferences } from '../stores/user-preferences-model'

test('logging preferences use error/30 days, preserve empty selection and unrelated preferences', () => {
  expect(normalizeLoggingPreferences(undefined)).toEqual({ levels: ['error'], retentionDays: 30 })
  expect(normalizeLoggingPreferences({ levels: [], retentionDays: 1 })).toEqual({
    levels: [],
    retentionDays: 1
  })
  expect(
    normalizeLoggingPreferences({ levels: ['error', 'bad', 'error'], retentionDays: -1 })
  ).toEqual({ levels: ['error'], retentionDays: 30 })
  const original = normalizeUserPreferences(undefined)
  const updated = mergeUserPreferences(original, { logging: { levels: ['info'] } })
  expect(updated.logging).toEqual({ levels: ['info'], retentionDays: 30 })
  expect(original.logging.levels).toEqual(['error'])
  expect(updated.proxySidebar).toEqual(original.proxySidebar)
  expect(retentionCutoff(86400000 * 31, 30)).toBe(86400000)
})

test('logs preserve original URLs and headers without redaction, omit bodies/code and handle cyclic data', () => {
  const context: Record<string, unknown> = {
    sourceUrl: 'http://user:pass@localhost/a?token=secret&name=patient#secret',
    headers: { Authorization: 'Bearer secret', 'X-Label': 'dev' },
    body: 'medical data',
    code: 'private script',
    nested: { password: 'secret' }
  }
  context.self = context
  const entry = createLogEntry(
    'error',
    'background',
    ['Failed http://localhost/a?token=secret', new Error('Bearer secret'), context],
    10
  )
  const json = JSON.stringify(entry)
  expect(json).toContain('http://user:pass@localhost/a?token=secret&name=patient#secret')
  expect(json).toContain('Bearer secret')
  expect(json).not.toContain('medical data')
  expect(json).not.toContain('private script')
  expect(json).toContain('X-Label')
  expect(json).toContain('[Not collected]')
  expect(json).toContain('[Circular]')
  expect(context.body).toBe('medical data')
  expect(entry.timestamp).toBe(10)
  expect(entry.level).toBe('error')
})

test('only actually changed request headers are logged with their original values', () => {
  expect(
    changedHeaders({ Accept: 'json', 'X-Label': 'old' }, [
      { name: 'Accept', value: 'json' },
      { name: 'X-Label', value: 'new' },
      { name: 'Authorization', value: 'secret' }
    ])
  ).toEqual({ 'X-Label': 'new', Authorization: 'secret' })
})

test('date filtering includes the entire selected local end date, with no range meaning all dates', () => {
  expect(localDateFilter(undefined)).toEqual({})
  const filter = localDateFilter(['2026-11-01', '2026-11-04'])
  expect(filter.start).toBe(new Date(2026, 10, 1).getTime())
  expect(filter.end).toBe(new Date(2026, 10, 5).getTime() - 1)
  expect(todayRange(new Date(2026, 10, 5, 0, 1).getTime())).toEqual(['2026-11-05', '2026-11-05'])
})
