import type { ProxyRule } from '../types/proxy'
import type { RequestType } from '../proxy/ProxyStrategy'
import type { ProxyRequestOwner } from '../proxy/request-ownership'
import { getProxyRequestOwner } from '../proxy/request-ownership'
import { getRequestType } from '../proxy/request-policy'
import { hasHeaderSettings } from '../proxy/header-settings'
import { changedHeaders } from './model'
import type { FlowLogger } from './flow-logger'

type Session = chrome.debugger.Debuggee & { sessionId?: string }
interface RequestEvent {
  requestId: string
  networkId?: string
  resourceType?: string
  type?: string
  redirectResponse?: object
  responseStatusCode?: number
  responseErrorReason?: string
  responseHeaders?: { name: string; value: string }[]
  request: { url: string; headers: Record<string, string> }
}
export interface DebuggerCommandObservation {
  session: Session
  event: RequestEvent
  owner?: ProxyRequestOwner
  method: string
  params: Record<string, unknown>
}

export function createDebuggerLogObserver(logs: FlowLogger) {
  let rules: ProxyRule[] = []
  let types: RequestType[] = []
  let scope: { tabId?: number } | undefined
  const key = (session: Session, id: string, fetch = false) =>
    `cdp:${session.tabId}:${session.sessionId ?? ''}:${fetch ? 'fetch' : 'network'}:${id}`
  const fetchKey = (session: Session, event: RequestEvent) =>
    key(session, event.networkId ?? event.requestId, !event.networkId)
  const eligible = (owner: ProxyRequestOwner, type: string) =>
    hasHeaderSettings(owner.rule) ||
    (types.includes(getRequestType(type)) && owner.url !== owner.target)
  return {
    update(nextRules: ProxyRule[], nextTypes: RequestType[], nextScope?: { tabId?: number }) {
      rules = nextRules
      types = nextTypes
      scope = nextScope
    },
    onEvent(session: Session, method: string, params?: object, start = true) {
      if (session.tabId === undefined) return
      if (method === 'Network.loadingFinished' || method === 'Network.loadingFailed') {
        const event = params as { requestId: string; canceled?: boolean; errorText?: string }
        const id = key(session, event.requestId)
        if (event.canceled || event.errorText === 'net::ERR_ABORTED') logs.cancel(id)
        else if (method === 'Network.loadingFinished') logs.loaded(id)
        else logs.failed(id, event.errorText ?? '请求加载失败')
        return
      }
      if (method !== 'Network.requestWillBeSent' && method !== 'Fetch.requestPaused') return
      const event = params as RequestEvent
      const fetch = method === 'Fetch.requestPaused'
      const id = fetch ? fetchKey(session, event) : key(session, event.requestId)
      if (event.responseErrorReason) {
        if (event.responseErrorReason === 'Aborted') logs.cancel(id)
        else logs.failed(id, event.responseErrorReason)
        return
      }
      if (
        !start ||
        event.redirectResponse ||
        event.responseStatusCode !== undefined ||
        (scope && scope.tabId !== session.tabId)
      )
        return
      const owner = getProxyRequestOwner(event.request.url, undefined, rules)
      if (!owner || !eligible(owner, event.resourceType ?? event.type ?? 'Other')) return
      logs.beginProxy(id, {
        kind: 'proxy',
        tabId: session.tabId,
        sessionId: session.sessionId,
        sourceUrl: owner.url,
        targetUrl: owner.target,
        ruleId: owner.rule.id,
        ruleName: owner.rule.name
      })
    },
    onCommandStarting({ session, event, owner, method }: DebuggerCommandObservation) {
      if (method !== 'Fetch.failRequest') return
      const id = fetchKey(session, event)
      const rejectedRedirect =
        event.resourceType === 'Document' &&
        owner &&
        owner.url !== owner.target &&
        owner.rule.requestHeaders?.some(row => row.enabled) &&
        event.responseStatusCode !== undefined &&
        event.responseStatusCode >= 300 &&
        event.responseStatusCode < 400 &&
        event.responseHeaders?.some(header => header.name.toLowerCase() === 'location')
      if (rejectedRedirect) logs.failed(id, '已配置请求头时请填写不再跳转的最终目标地址')
      logs.cancel(id)
    },
    onCommandSucceeded({ session, event, owner, method, params }: DebuggerCommandObservation) {
      const id = fetchKey(session, event)
      if (method === 'Fetch.failRequest') {
        logs.cancel(id)
        return
      }
      if (event.responseErrorReason) return
      const headers = changedHeaders(
        event.request.headers,
        (params.headers ?? []) as { name: string; value: string }[]
      )
      if (
        method === 'Fetch.continueRequest' &&
        (params.url || (owner && hasHeaderSettings(owner.rule)))
      )
        logs.applied(id, headers)
      if (method === 'Fetch.continueResponse' && owner && hasHeaderSettings(owner.rule))
        logs.applied(id)
      if (method === 'Fetch.fulfillRequest') {
        logs.applied(id, headers)
        logs.loaded(id)
      }
      // Without Network identity there is no reliable terminal event after continuing.
      if (!event.networkId && method !== 'Fetch.fulfillRequest') logs.cancel(id)
    },
    onCommandFailed({ session, event }: DebuggerCommandObservation) {
      logs.cancel(fetchKey(session, event))
    },
    targetFailed(session: Session, event: RequestEvent, error: unknown) {
      const id = fetchKey(session, event)
      logs.applied(id)
      logs.failed(id, error)
    },
    cancelScope(nextScope: { tabId?: number; sessionId?: string }) {
      logs.cancelProxyScope(nextScope, 'cdp:')
    }
  }
}
