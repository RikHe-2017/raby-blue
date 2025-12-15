import { StorageAdapter } from './StorageAdapter'

/**
 * IndexedDB 存储适配器
 * 用于非扩展环境（如开发环境）
 */
export class IndexedDBStorageAdapter extends StorageAdapter {
  private dbName = 'raby-blue'
  private storeName = 'proxy-config'
  private db: IDBDatabase | null = null

  /**
   * 初始化 IndexedDB
   */
  private async init(): Promise<void> {
    if (this.db) return

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 1)

      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        this.db = request.result
        resolve()
      }

      request.onupgradeneeded = event => {
        const db = (event.target as IDBOpenDBRequest).result
        if (!db.objectStoreNames.contains(this.storeName)) {
          db.createObjectStore(this.storeName)
        }
      }
    })
  }

  async get(key: string): Promise<any> {
    await this.init()

    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'))
        return
      }

      const transaction = this.db.transaction(this.storeName, 'readonly')
      const store = transaction.objectStore(this.storeName)
      const request = store.get(key)

      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        const result = request.result
        resolve(result ? JSON.parse(result) : null)
      }
    })
  }

  async set(key: string, value: any): Promise<void> {
    await this.init()

    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'))
        return
      }

      const transaction = this.db.transaction(this.storeName, 'readwrite')
      const store = transaction.objectStore(this.storeName)
      // 将数据序列化为字符串
      const serializedValue = JSON.stringify(value)
      const request = store.put(serializedValue, key)

      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve()
    })
  }
}
