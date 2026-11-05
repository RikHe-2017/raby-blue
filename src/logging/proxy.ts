import type { ProxyRule } from '../types/proxy'
import type { RequestType } from '../proxy/ProxyStrategy'
import { findProxyMatch } from '../document-response-rules'
import { getRedirectResourceTypes } from '../proxy/request-policy'
import { hasHeaderSettings } from '../proxy/header-settings'
import { createFlowLogger, type FlowLogger } from './flow-logger'

export function createProxyLogObserver(logs: FlowLogger = createFlowLogger()) {
  let rules: ProxyRule[] = []
  let types: string[] = []
  let scope: { tabId?: number } | undefined
  const key = (id: string) => `web:${id}`
  const before = (event: chrome.webRequest.WebRequestBodyDetails) => {
    if (event.tabId < 0 || (scope && scope.tabId !== event.tabId) || !types.includes(event.type))
      return
    const match = findProxyMatch(event.url, rules)
    if (!match || hasHeaderSettings(match.rule) || match.target === event.url) return
    logs.beginProxy(key(event.requestId), {
      kind: 'proxy',
      tabId: event.tabId,
      sourceUrl: event.url,
      targetUrl: new URL(match.target).href,
      ruleId: match.rule.id,
      ruleName: match.rule.name
    })
  }
  const redirect = (event: chrome.webRequest.WebRedirectionResponseDetails) =>
    logs.redirected(key(event.requestId), event.url, event.redirectUrl)
  const complete = (event: chrome.webRequest.WebResponseCacheDetails) => {
    logs.loaded(key(event.requestId), event.url)
    logs.cancel(key(event.requestId))
  }
  const error = (event: chrome.webRequest.WebResponseErrorDetails) => {
    if (event.error !== 'net::ERR_ABORTED') logs.failed(key(event.requestId), event.error)
    logs.cancel(key(event.requestId))
  }
  // Terminal listeners survive configuration transactions to settle existing snapshots.
  const filter = { urls: ['http://*/*', 'https://*/*'] }
  chrome.webRequest.onBeforeRequest.addListener(before, filter)
  chrome.webRequest.onBeforeRedirect.addListener(redirect, filter)
  chrome.webRequest.onCompleted.addListener(complete, filter)
  chrome.webRequest.onErrorOccurred.addListener(error, filter)
  chrome.tabs?.onRemoved?.addListener(tabId => logs.cancelProxyScope({ tabId }))
  return {
    update(nextRules: ProxyRule[], nextTypes: RequestType[], nextScope?: { tabId?: number }) {
      rules = nextRules
      types = getRedirectResourceTypes(nextTypes)
      scope = nextScope
    }
  }
}
