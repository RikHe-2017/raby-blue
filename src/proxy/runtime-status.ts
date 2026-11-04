export interface ProxyRuntimeStatus {
  phase: 'applying' | 'active' | 'disabled' | 'error'
  message?: string
  cleanupFailed?: boolean
}

export function isProxyRuntimeStatus(value: unknown): value is ProxyRuntimeStatus {
  if (!value || typeof value !== 'object') return false
  const status = value as Record<string, unknown>
  return (
    ['applying', 'active', 'disabled', 'error'].includes(String(status.phase)) &&
    (status.message === undefined || typeof status.message === 'string') &&
    (status.cleanupFailed === undefined || typeof status.cleanupFailed === 'boolean')
  )
}
