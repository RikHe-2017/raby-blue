import type { ProxyRule } from './types/proxy'
import {
  findResponseTarget,
  getFulfillmentHeaders,
  getReplacementRequestHeaders,
  getReplacementRequestBody
} from './document-response-rules.ts'
import { getRequestType, getResponsePatterns } from './proxy/request-policy.ts'
import type { RequestType } from './proxy/ProxyStrategy'

interface PausedRequest {
  requestId: string
  resourceType: string
  networkId?: string
  request: {
    url: string
    method: string
    headers: Record<string, string>
    postData?: string
    postDataEntries?: { bytes?: string }[]
    hasPostData?: boolean
  }
}

type Session = chrome.debugger.Debuggee & { sessionId?: string }

export function createResponseReplacement() {
  let rules: ProxyRule[] = []
  let resourceTypes: RequestType[] = []
  const attached = new Set<number>()
  const connecting = new Map<number, Promise<void>>()
  const dismissed = new Set<number>()
  const pending = new Map<number, Set<AbortController>>()
  const errors = new Map<number, string>()
  const sessions = new Map<string, Session>()

  const forgetSessions = (tabId: number) => {
    for (const [key, session] of sessions) if (session.tabId === tabId) sessions.delete(key)
  }

  const showError = async (tabId: number, message: string) => {
    errors.set(tabId, message)
    console.error('Response replacement:', message)
    await chrome.action.setBadgeText({ tabId, text: '!' }).catch(() => {})
    await chrome.action.setBadgeBackgroundColor({ tabId, color: '#f56c6c' }).catch(() => {})
    await chrome.action.setTitle({ tabId, title: `RabyBlue: ${message}` }).catch(() => {})
  }

  const clearError = async (tabId: number) => {
    errors.delete(tabId)
    await chrome.action.setBadgeText({ tabId, text: '' }).catch(() => {})
    await chrome.action.setTitle({ tabId, title: 'RabyBlue' }).catch(() => {})
  }

  const enableSession = async (session: Session) => {
    await chrome.debugger.sendCommand(session, 'Fetch.enable', {
      patterns: getResponsePatterns(resourceTypes)
    })
    sessions.set(`${session.tabId}:${session.sessionId ?? ''}`, session)
    await chrome.debugger.sendCommand(session, 'Target.setAutoAttach', {
      autoAttach: true,
      waitForDebuggerOnStart: true,
      flatten: true,
      filter: [
        { type: 'iframe', exclude: false },
        { type: 'worker', exclude: false },
        { type: 'shared_worker', exclude: false },
        { type: 'service_worker', exclude: false }
      ]
    })
  }

  const detach = async (tabId: number) => {
    pending.get(tabId)?.forEach(controller => controller.abort())
    pending.delete(tabId)
    forgetSessions(tabId)
    if (attached.delete(tabId)) await chrome.debugger.detach({ tabId }).catch(() => {})
    await clearError(tabId)
  }

  const attach = async (tabId: number) => {
    if (!rules.length || attached.has(tabId) || dismissed.has(tabId)) return
    if (connecting.has(tabId)) return connecting.get(tabId)
    const connection = (async () => {
      try {
        await chrome.debugger.attach({ tabId }, '1.3')
        attached.add(tabId)
        if (!rules.length) return await detach(tabId)
        await enableSession({ tabId })
        await clearError(tabId)
      } catch (error) {
        await detach(tabId)
        if (rules.length) {
          dismissed.add(tabId)
          await showError(
            tabId,
            `请求替换连接失败，请关闭冲突的调试连接后重新启用代理：${String(error)}`
          )
        }
      }
    })()
    connecting.set(tabId, connection)
    try {
      await connection
    } finally {
      connecting.delete(tabId)
    }
  }

  const handleRequest = async (session: Session, event: PausedRequest) => {
    const tabId = session.tabId
    if (tabId === undefined) return
    const target = resourceTypes.includes(getRequestType(event.resourceType))
      ? findResponseTarget(event.request.url, rules)
      : undefined
    if (!target) {
      await chrome.debugger.sendCommand(session, 'Fetch.continueRequest', {
        requestId: event.requestId
      })
      return
    }
    const controller = new AbortController()
    const requests = pending.get(tabId) ?? new Set<AbortController>()
    requests.add(controller)
    pending.set(tabId, requests)
    const timer = setTimeout(() => controller.abort(), 15000)
    try {
      if (event.resourceType === 'EventSource' || event.resourceType === 'WebSocket')
        throw new Error('持续流式响应和 WebSocket 暂不支持整包响应替换')
      let body = getReplacementRequestBody(event.request)
      if (event.request.hasPostData && body === undefined) {
        if (!event.networkId) throw new Error('无法读取请求正文')
        const result = (await chrome.debugger.sendCommand(session, 'Network.getRequestPostData', {
          requestId: event.networkId
        })) as { postData: string }
        body = result.postData
      }
      const method = event.request.method
      const response = await fetch(target, {
        method,
        headers: getReplacementRequestHeaders(event.request.headers),
        body: method === 'GET' || method === 'HEAD' ? undefined : body,
        credentials: 'omit',
        cache: 'no-store',
        redirect: 'follow',
        signal: controller.signal
      })
      const bytes = new Uint8Array(await response.arrayBuffer())
      // Chunk the conversion to avoid overflowing the call stack for large responses.
      let binary = ''
      for (let offset = 0; offset < bytes.length; offset += 32768)
        binary += String.fromCharCode(...bytes.subarray(offset, offset + 32768))
      await chrome.debugger.sendCommand(session, 'Fetch.fulfillRequest', {
        requestId: event.requestId,
        responseCode: response.status,
        responseHeaders: getFulfillmentHeaders([...response.headers.entries()]),
        body: btoa(binary)
      })
      await clearError(tabId)
    } catch (error) {
      if (attached.has(tabId) && rules.length) {
        await showError(tabId, `目标请求读取失败：${String(error)}`)
        await chrome.debugger
          .sendCommand(session, 'Fetch.failRequest', {
            requestId: event.requestId,
            errorReason: 'Failed'
          })
          .catch(() => {})
      }
    } finally {
      clearTimeout(timer)
      requests.delete(controller)
      if (!requests.size && pending.get(tabId) === requests) pending.delete(tabId)
    }
  }

  chrome.debugger.onEvent.addListener((session, method, params) => {
    if (method === 'Fetch.requestPaused') {
      void handleRequest(session, params as PausedRequest).catch(error =>
        console.error('Response interception:', error)
      )
    } else if (method === 'Target.attachedToTarget') {
      const child = params as { sessionId: string }
      const target = { ...session, sessionId: child.sessionId }
      void enableSession(target)
        .catch(error => console.error('Iframe interception:', error))
        .finally(() =>
          chrome.debugger.sendCommand(target, 'Runtime.runIfWaitingForDebugger').catch(() => {})
        )
    } else if (method === 'Target.detachedFromTarget') {
      const child = params as { sessionId: string }
      sessions.delete(`${session.tabId}:${child.sessionId}`)
    }
  })

  chrome.debugger.onDetach.addListener((session, reason) => {
    if (session.tabId === undefined || !attached.delete(session.tabId)) return
    console.warn('Response replacement detached:', { tabId: session.tabId, reason })
    pending.get(session.tabId)?.forEach(controller => controller.abort())
    pending.delete(session.tabId)
    forgetSessions(session.tabId)
    dismissed.add(session.tabId)
    if (rules.length)
      void showError(session.tabId, '请求替换已断开，刷新页面将重试；如仍失败，请重新启用代理')
  })

  const reconnectOnNavigation = async (tabId: number) => {
    if (!rules.length) return
    dismissed.delete(tabId)
    if (attached.has(tabId)) {
      try {
        await chrome.debugger.sendCommand({ tabId }, 'Page.getFrameTree')
        return
      } catch (error) {
        if (!String(error).includes('Debugger is not attached')) throw error
        attached.delete(tabId)
        forgetSessions(tabId)
        pending.get(tabId)?.forEach(controller => controller.abort())
        pending.delete(tabId)
      }
    }
    await attach(tabId)
  }

  chrome.webNavigation.onBeforeNavigate.addListener(event => {
    if (!/^https?:\/\//.test(event.url)) return
    if (event.frameId === 0)
      void reconnectOnNavigation(event.tabId).catch(error =>
        showError(event.tabId, `请求替换连接检查失败：${String(error)}`)
      )
    else void attach(event.tabId)
  })
  chrome.webNavigation.onErrorOccurred.addListener(event => {
    const message = errors.get(event.tabId)
    if (message) void showError(event.tabId, message)
  })
  chrome.tabs.onUpdated.addListener((tabId, change, tab) => {
    if (!change.url && change.status !== 'complete') return
    if (/^https?:\/\//.test(tab.url ?? '')) void attach(tabId)
    else if (change.status === 'complete') void detach(tabId)
  })
  chrome.tabs.onRemoved.addListener(tabId => {
    attached.delete(tabId)
    dismissed.delete(tabId)
    errors.delete(tabId)
    pending.get(tabId)?.forEach(controller => controller.abort())
    pending.delete(tabId)
    forgetSessions(tabId)
  })

  return {
    async update(nextRules: ProxyRule[], nextTypes: RequestType[] = ['document']) {
      const patterns = getResponsePatterns(nextTypes)
      const scopeChanged = JSON.stringify(resourceTypes) !== JSON.stringify(nextTypes)
      const mappings = (items: ProxyRule[]) => items.map(rule => [rule.sourceUrl, rule.targetUrl])
      if (scopeChanged || JSON.stringify(mappings(rules)) !== JSON.stringify(mappings(nextRules)))
        pending.forEach(requests => requests.forEach(controller => controller.abort()))
      resourceTypes = [...nextTypes]
      rules = nextTypes.length ? nextRules : []
      dismissed.clear()
      if (scopeChanged && rules.length)
        for (const session of sessions.values())
          await chrome.debugger.sendCommand(session, 'Fetch.enable', { patterns })
      const tabs = await chrome.tabs.query({})
      for (const tab of tabs) {
        if (tab.id === undefined) continue
        if (rules.length && /^https?:\/\//.test(tab.url ?? '')) await attach(tab.id)
        else await detach(tab.id)
      }
    }
  }
}
