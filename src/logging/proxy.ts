import type { ProxyRule } from '../types/proxy'
import type { RequestType } from '../proxy/ProxyStrategy'
import { findProxyMatch } from '../document-response-rules'
import { getRedirectResourceTypes } from '../proxy/request-policy'
import { logError, logInfo } from '../utils/logger'

export function logProxyRequest(
  sourceUrl: string,
  targetUrl: string,
  ruleName: string,
  requestHeaders?: Record<string, string>
) {
  logInfo('代理请求已处理', {
    sourceUrl,
    targetUrl,
    ruleName,
    ...(requestHeaders && Object.keys(requestHeaders).length ? { requestHeaders } : {})
  })
}

export function createProxyLogObserver() {
  let rules: ProxyRule[] = []
  let types: string[] = []
  let observing = false
  const pending = new Map<
    string,
    { source: string; target: string; name: string; confirmed: boolean }
  >()
  const before = (event: chrome.webRequest.WebRequestBodyDetails) => {
    if (pending.has(event.requestId) || !types.includes(event.type)) return
    const match = findProxyMatch(event.url, rules)
    if (!match || match.target === event.url) return
    pending.set(event.requestId, {
      source: event.url,
      target: new URL(match.target).href,
      name: match.rule.name,
      confirmed: false
    })
  }
  const redirect = (event: chrome.webRequest.WebRedirectionResponseDetails) => {
    const request = pending.get(event.requestId)
    if (!request) return
    if (request.confirmed || request.source !== event.url || request.target !== event.redirectUrl)
      pending.delete(event.requestId)
    else request.confirmed = true
  }
  const complete = (event: chrome.webRequest.WebResponseCacheDetails) => {
    const request = pending.get(event.requestId)
    pending.delete(event.requestId)
    if (request?.confirmed && request.target === event.url)
      logProxyRequest(request.source, request.target, request.name)
  }
  const error = (event: chrome.webRequest.WebResponseErrorDetails) => {
    const request = pending.get(event.requestId)
    pending.delete(event.requestId)
    if (request?.confirmed)
      logError('代理请求失败', {
        sourceUrl: request.source,
        targetUrl: request.target,
        ruleName: request.name,
        reason: event.error
      })
  }
  return {
    update(nextRules: ProxyRule[], nextTypes: RequestType[]) {
      pending.clear()
      rules = nextRules
      types = getRedirectResourceTypes(nextTypes)
      const nextObserving = !!rules.length && !!types.length
      if (observing === nextObserving) return
      observing = nextObserving
      if (observing) {
        const filter = { urls: ['http://*/*', 'https://*/*'] }
        chrome.webRequest.onBeforeRequest.addListener(before, filter)
        chrome.webRequest.onBeforeRedirect.addListener(redirect, filter)
        chrome.webRequest.onCompleted.addListener(complete, filter)
        chrome.webRequest.onErrorOccurred.addListener(error, filter)
      } else {
        chrome.webRequest.onBeforeRequest.removeListener(before)
        chrome.webRequest.onBeforeRedirect.removeListener(redirect)
        chrome.webRequest.onCompleted.removeListener(complete)
        chrome.webRequest.onErrorOccurred.removeListener(error)
      }
    }
  }
}
