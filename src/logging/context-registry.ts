export interface ContextRegistry<T> {
  readonly size: number
  register(key: string, value: T): boolean
  get(key: string): T | undefined
  replace(key: string, value: T): boolean
  take(key: string): T | undefined
  discardWhere(predicate: (value: T, key: string) => boolean): void
}

export function createContextRegistry<T>(capacity = 10000): ContextRegistry<T> {
  if (!Number.isSafeInteger(capacity) || capacity <= 0) throw new RangeError('Invalid capacity')
  const entries = new Map<string, T>()
  const touch = (key: string, value: T) => {
    entries.delete(key)
    entries.set(key, value)
  }
  return {
    get size() {
      return entries.size
    },
    register(key, value) {
      if (entries.has(key)) {
        touch(key, entries.get(key)!)
        return false
      }
      entries.set(key, value)
      if (entries.size > capacity) entries.delete(entries.keys().next().value!)
      return true
    },
    get(key) {
      if (!entries.has(key)) return undefined
      const value = entries.get(key)!
      touch(key, value)
      return value
    },
    replace(key, value) {
      if (!entries.has(key)) return false
      touch(key, value)
      return true
    },
    take(key) {
      const value = entries.get(key)
      entries.delete(key)
      return value
    },
    discardWhere(predicate) {
      for (const [key, value] of entries) if (predicate(value, key)) entries.delete(key)
    }
  }
}
