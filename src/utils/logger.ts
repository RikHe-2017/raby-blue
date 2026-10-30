export function logError(...details: unknown[]): void {
  console.log('[error]:', ...details)
}

export function logWarn(...details: unknown[]): void {
  console.log('[warn]:', ...details)
}

export function logInfo(...details: unknown[]): void {
  console.log('[info]:', ...details)
}
