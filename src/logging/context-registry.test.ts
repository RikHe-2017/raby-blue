import { expect, test } from 'vitest'
import { createContextRegistry } from './context-registry'

test('default bound and reads refresh LRU without resurrecting evicted entries', () => {
  const registry = createContextRegistry<number>()
  for (let i = 0; i < 10000; i++) registry.register(String(i), i)
  expect(registry.get('0')).toBe(0)
  registry.register('10000', 10000)
  expect(registry.size).toBe(10000)
  expect(registry.get('1')).toBeUndefined()
  expect(registry.replace('1', 1)).toBe(false)
  expect(registry.take('0')).toBe(0)
  expect(registry.take('0')).toBeUndefined()
})

test('duplicate registration preserves snapshots, replace touches, filtering does not', () => {
  const registry = createContextRegistry<number>(2)
  registry.register('a', 1)
  registry.register('b', 2)
  expect(registry.register('a', 9)).toBe(false)
  expect(registry.get('a')).toBe(1)
  registry.register('c', 3)
  expect(registry.get('b')).toBeUndefined()
  registry.replace('a', 4)
  registry.discardWhere(value => value === 99)
  registry.register('d', 5)
  expect(registry.get('c')).toBeUndefined()
  registry.discardWhere(value => value === 4)
  expect(registry.size).toBe(1)
})

test.each([0, -1, 1.5, Infinity, NaN])('rejects invalid capacity %s', capacity => {
  expect(() => createContextRegistry(capacity)).toThrow(RangeError)
})
