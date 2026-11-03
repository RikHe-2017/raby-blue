import type { ProxyConfig } from '../types/proxy'

interface ProxyConfigStorage {
  read(): Promise<ProxyConfig | undefined>
  write(config: ProxyConfig): Promise<void>
}

export function createProxyConfigPersistence(storage: ProxyConfigStorage) {
  let queue: Promise<void> = Promise.resolve()
  const enqueue = (write: () => Promise<void>) => {
    const operation = queue.catch(() => {}).then(write)
    queue = operation
    return operation
  }

  return {
    save(config: ProxyConfig, updateEnabled = false) {
      const snapshot = structuredClone(config)
      return enqueue(async () => {
        const current = await storage.read()
        await storage.write({
          ...snapshot,
          enabled: updateEnabled ? snapshot.enabled : (current?.enabled ?? snapshot.enabled)
        })
      })
    },

    disable() {
      return enqueue(async () => {
        const current = await storage.read()
        if (current?.enabled) await storage.write({ ...current, enabled: false })
      })
    }
  }
}
