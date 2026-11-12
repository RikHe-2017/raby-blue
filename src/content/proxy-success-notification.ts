import { installPageNotification } from './page-notification'
import type { PageNotificationScope } from './page-notification'
import { i18n } from '../locales'

export async function injectProxySuccessNotification(
  target: chrome.scripting.InjectionTarget,
  iconDataUrl: string
): Promise<boolean> {
  const installed = await chrome.scripting.executeScript({
    target,
    func: installPageNotification,
    args: [iconDataUrl, i18n.global.t('notification.welcome'), i18n.global.t('notification.close')],
    injectImmediately: true
  })
  if (!installed.some(result => result.result === true)) return false
  const listeners = await chrome.scripting.executeScript({
    target,
    func: installProxySuccessNotification,
    args: [i18n.global.t('notification.proxySuccess')],
    injectImmediately: true
  })
  return listeners.some(result => result.result === true)
}

// Serialized by executeScript; runtime dependencies must come from the page scope.
export function installProxySuccessNotification(contentText: string) {
  const scope = globalThis as typeof globalThis &
    PageNotificationScope & { rabyBlueSuccessInstalled?: boolean }
  if (scope.rabyBlueSuccessInstalled) return true
  if (document.visibilityState !== 'visible' || !scope.rabyBlueNotification) return false
  const notification = scope.rabyBlueNotification
  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (sender.id !== chrome.runtime.id || message?.action !== 'proxySuccess') return
    if (document.visibilityState !== 'visible' || !Array.isArray(message.items)) {
      respond({ shown: false })
      return
    }
    const hasValidItem = message.items.some(
      (item: { id?: unknown; name?: unknown; mapped?: unknown }) =>
        typeof item?.id === 'string' &&
        item.id.length > 0 &&
        typeof item.name === 'string' &&
        typeof item.mapped === 'boolean'
    )
    respond({
      shown: hasValidItem && notification.show(contentText)
    })
  })
  scope.rabyBlueSuccessInstalled = true
  return true
}
