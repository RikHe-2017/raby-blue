export function debuggerErrorMessage(error: unknown): string {
  const message =
    error && typeof error === 'object' && 'message' in error && typeof error.message === 'string'
      ? error.message
      : String(error)
  try {
    const parsed: unknown = JSON.parse(message)
    if (
      parsed &&
      typeof parsed === 'object' &&
      'message' in parsed &&
      typeof parsed.message === 'string'
    )
      return parsed.message
  } catch {
    // Chrome may return either a protocol JSON error or a plain error message.
  }
  return message
}

export function isEndedInterception(error: unknown): boolean {
  return /^(?:Invalid InterceptionId\.?|Invalid session id\.?|Session with given id not found\.?|No session with given id.*|Debugger is not attached.*|Target closed\.?|No target with given id.*)$/i.test(
    debuggerErrorMessage(error)
  )
}

export function isMissingDebuggerMethod(error: unknown, method: string): boolean {
  const message = debuggerErrorMessage(error)
  return (
    message === 'Method not found' ||
    (message.includes(method) && /wasn't found|not found|not supported/i.test(message))
  )
}

export function isUnavailableDebugTarget(error: unknown): boolean {
  return (
    isEndedInterception(error) ||
    /Cannot access a chrome:\/\/ URL|No tab with id|Invalid tab ID/i.test(
      debuggerErrorMessage(error)
    )
  )
}
