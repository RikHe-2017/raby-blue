import type { FlowLogger } from './logging/flow-logger'
import { logError } from './utils/logger'
import { i18n } from './locales'

export async function injectScript(
  tabId: number,
  code: string
): Promise<chrome.scripting.InjectionResult[]> {
  // Chrome may resolve injection even when page code throws; return an explicit result envelope.
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: async (userCode: string) => {
      try {
        return { success: true as const, value: await new Function(userCode)() }
      } catch (error) {
        return {
          success: false as const,
          error: error instanceof Error ? error.message : String(error)
        }
      }
    },
    args: [code],
    injectImmediately: true,
    world: 'MAIN'
  })
  return results.map(result => {
    const outcome = result.result
    if (!outcome) throw new Error(i18n.global.t('runtime.scriptResultMissing'))
    if (!outcome.success) throw new Error(outcome.error)
    return { ...result, result: outcome.value }
  })
}

export async function executeScriptRequest(
  input: { code: string; scriptId: string; scriptName: string },
  dependencies: {
    logs: FlowLogger
    readActiveTab(): Promise<number | undefined>
    inject(tabId: number, code: string): Promise<chrome.scripting.InjectionResult[]>
    createExecutionId(): string
  }
): Promise<
  { success: true; results: chrome.scripting.InjectionResult[] } | { success: false; error: string }
> {
  const { logs } = dependencies
  const { code, scriptId, scriptName } = input
  const executionId = dependencies.createExecutionId()
  const key = `script:${executionId}`
  try {
    const tabId = await dependencies.readActiveTab()
    logs.beginScript(key, {
      kind: 'script',
      executionId,
      scriptId,
      scriptName,
      tabId
    })
    if (tabId === undefined) {
      logs.failed(key, i18n.global.t('runtime.activeTabMissing'))
      return { success: false, error: i18n.global.t('runtime.activeTabMissing') }
    }
    try {
      const results = await dependencies.inject(tabId, code)
      logs.scriptSucceeded(key)
      return { success: true, results }
    } catch (error) {
      logs.failed(key, error)
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
  } catch (error) {
    logError(String(error))
    return { success: false, error: error instanceof Error ? error.message : String(error) }
  } finally {
    logs.cancel(key)
  }
}
