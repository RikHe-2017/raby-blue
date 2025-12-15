import { StorageAdapter } from './StorageAdapter'
import { ChromeStorageAdapter } from './ChromeStorageAdapter'
import { IndexedDBStorageAdapter } from './IndexedDBStorageAdapter'

/**
 * 检查是否在浏览器扩展环境中运行
 */
const isExtension = typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id

/**
 * 根据环境创建相应的存储适配器实例
 */
export function createStorageAdapter(): StorageAdapter {
  return isExtension ? new ChromeStorageAdapter() : new IndexedDBStorageAdapter()
}
