import type { LogEntry, LogFilter, LogPage, LogPageFilter } from './model'

export function createLogDatabase(name = 'raby-blue-logs') {
  let connection: Promise<IDBDatabase> | undefined
  const open = (): Promise<IDBDatabase> => {
    if (connection) return connection
    connection = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(name, 1)
      request.onupgradeneeded = () => {
        const store = request.result.createObjectStore('logs', {
          keyPath: 'id',
          autoIncrement: true
        })
        store.createIndex('timestamp', 'timestamp')
        store.createIndex('level', 'level')
        store.createIndex('levelTimestamp', ['level', 'timestamp'])
      }
      request.onerror = () => reject(request.error)
      request.onblocked = () => reject(new Error('日志数据库被其他连接占用'))
      request.onsuccess = () => {
        const db = request.result
        db.onversionchange = () => {
          db.close()
          connection = undefined
        }
        resolve(db)
      }
    }).catch(error => {
      connection = undefined
      throw error
    })
    return connection
  }

  const write = async (action: (store: IDBObjectStore) => void): Promise<void> => {
    const db = await open()
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction('logs', 'readwrite')
      transaction.oncomplete = () => resolve()
      transaction.onabort = transaction.onerror = () =>
        reject(transaction.error ?? new Error('日志写入失败'))
      action(transaction.objectStore('logs'))
    })
  }

  return {
    async page(filter: LogPageFilter): Promise<LogPage> {
      const start = filter.start ?? 0
      const end = filter.end ?? Number.MAX_SAFE_INTEGER
      if (start > end) return { entries: [], total: 0 }
      const db = await open()
      return new Promise((resolve, reject) => {
        const transaction = db.transaction('logs', 'readonly')
        const index = transaction.objectStore('logs').index('levelTimestamp')
        const range = IDBKeyRange.bound([filter.level, start], [filter.level, end])
        const count = index.count(range)
        const request = index.openCursor(range, 'prev')
        const entries: LogEntry[] = []
        const offset = (filter.page - 1) * filter.pageSize
        let skipped = false
        request.onsuccess = () => {
          const cursor = request.result
          if (!cursor) return
          if (offset && !skipped) {
            skipped = true
            cursor.advance(offset)
            return
          }
          entries.push(cursor.value as LogEntry)
          if (entries.length < filter.pageSize) cursor.continue()
        }
        transaction.oncomplete = () => resolve({ entries, total: count.result })
        transaction.onabort = transaction.onerror = () =>
          reject(transaction.error ?? new Error('日志查询失败'))
      })
    },
    add: (entry: LogEntry) =>
      write(store => {
        store.add(entry)
      }),
    clear: () =>
      write(store => {
        store.clear()
      }),
    prune: (cutoff: number) =>
      write(store => {
        const request = store.index('timestamp').openCursor(IDBKeyRange.upperBound(cutoff, true))
        request.onsuccess = () => {
          const cursor = request.result
          if (cursor) {
            cursor.delete()
            cursor.continue()
          }
        }
      }),
    async query(filter: LogFilter): Promise<LogEntry[]> {
      if (filter.levels?.length === 0) return []
      const db = await open()
      return new Promise((resolve, reject) => {
        const transaction = db.transaction('logs', 'readonly')
        const entries: LogEntry[] = []
        const start = filter.start ?? 0
        const end = filter.end ?? Number.MAX_SAFE_INTEGER
        if (start > end) {
          resolve([])
          return
        }
        const singleLevel = filter.levels?.length === 1 ? filter.levels[0] : undefined
        const request = singleLevel
          ? transaction
              .objectStore('logs')
              .index('levelTimestamp')
              .openCursor(IDBKeyRange.bound([singleLevel, start], [singleLevel, end]))
          : transaction
              .objectStore('logs')
              .index('timestamp')
              .openCursor(IDBKeyRange.bound(start, end))
        request.onsuccess = () => {
          const cursor = request.result
          if (!cursor) return
          const row = cursor.value as LogEntry
          if (!filter.levels || filter.levels.includes(row.level)) entries.push(row)
          cursor.continue()
        }
        transaction.oncomplete = () => resolve(entries)
        transaction.onabort = transaction.onerror = () =>
          reject(transaction.error ?? new Error('日志读取失败'))
      })
    }
  }
}
