import type { ProxyRule } from './types/proxy'
import {
  getFulfillmentHeaders,
  getReplacementRequestHeaders,
  getReplacementRequestBody
} from './document-response-rules.ts'
import { getRequestType, getResponsePatterns } from './proxy/request-policy.ts'
import type { RequestType } from './proxy/ProxyStrategy'
import {
  hasHeaderSettings,
  mergeHeaderSettings,
  validateHeaderSettings
} from './proxy/header-settings.ts'
import { getProxyRequestOwner } from './proxy/request-ownership.ts'
import type { ProxyRequestOwner } from './proxy/request-ownership'
import {
  isEndedInterception,
  isMissingDebuggerMethod,
  isUnavailableDebugTarget
} from './proxy/debugger-errors.ts'
import type { ProxySuccessObserver } from './proxy/success-notifications'

interface PausedRequest {
  requestId: string
  resourceType: string
  networkId?: string
  responseStatusCode?: number
  responseStatusText?: string
  responseErrorReason?: string
  responseHeaders?: { name: string; value: string }[]
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

interface PausedOperation {
  session: Session
  event: PausedRequest
  responseStage: boolean
  sending: boolean
  finished: boolean
  command?: string
  controller?: AbortController
}

class InterceptionEnded extends Error {}

export function createResponseReplacement(notifications?: ProxySuccessObserver) {
  let rules: ProxyRule[] = []
  let resourceTypes: RequestType[] = []
  const attached = new Set<number>()
  const connecting = new Map<number, Promise<void>>()
  const dismissed = new Set<number>()
  const pending = new Map<number, Set<AbortController>>()
  const errors = new Map<number, string>()
  const sessions = new Map<string, Session>()
  const unsupportedSessions = new WeakSet<Session>()
  const pausedOperations = new Map<string, PausedOperation>()
  const networkRequests = new Map<string, ProxyRequestOwner>()
  const successes = new Map<string, { complete: () => void; applied: boolean; loaded: boolean }>()
  const requestOwners = new Map<
    string,
    {
      owner: ProxyRequestOwner
      networkId?: string
      rewrittenDocument: boolean
      success?: { complete: () => void; applied: boolean; loaded: boolean }
    }
  >()
  let headerRules: ProxyRule[] = []
  let observeLoading = false
  const networkKey = (session: Session, id: string) =>
    `${session.tabId}:${session.sessionId ?? ''}:${id}`
  const sessionKey = (session: Session) => `${session.tabId}:${session.sessionId ?? ''}`
  const isCurrentSession = (session: Session) =>
    session.tabId !== undefined &&
    attached.has(session.tabId) &&
    sessions.get(sessionKey(session)) === session &&
    !!rules.length
  const isCurrentOperation = (operation: PausedOperation) =>
    isCurrentSession(operation.session) &&
    !operation.finished &&
    pausedOperations.get(networkKey(operation.session, operation.event.requestId)) === operation
  const cancelOperation = (operation: PausedOperation) => {
    operation.finished = true
    operation.controller?.abort()
  }
  const sendPausedCommand = async (
    operation: PausedOperation,
    method: string,
    params: Record<string, unknown>
  ) => {
    if (!isCurrentOperation(operation) || operation.sending) throw new InterceptionEnded()
    operation.sending = true
    operation.command = method
    try {
      await chrome.debugger.sendCommand(operation.session, method, params)
      operation.finished = true
    } finally {
      operation.sending = false
    }
  }
  const clearRedirects = (tabId?: number) => {
    for (const key of networkRequests.keys())
      if (tabId === undefined || key.startsWith(`${tabId}:`)) networkRequests.delete(key)
    for (const key of requestOwners.keys())
      if (tabId === undefined || key.startsWith(`${tabId}:`)) requestOwners.delete(key)
    for (const key of successes.keys())
      if (tabId === undefined || key.startsWith(`${tabId}:`)) successes.delete(key)
  }
  const beginSuccess = (tabId: number, rule: ProxyRule) => {
    try {
      return notifications?.begin(tabId, rule)
    } catch {
      return undefined
    }
  }
  const finishSuccess = (success?: { complete: () => void; applied: boolean; loaded: boolean }) => {
    if (success?.applied && success.loaded) {
      try {
        success.complete()
      } catch {
        /* Notification failure must not interrupt proxying. */
      }
    }
  }
  const interceptionPatterns = () => {
    const patterns = getResponsePatterns(resourceTypes)
    if (!headerRules.length) return patterns
    return ['http://*', 'https://*'].flatMap(urlPattern => [
      { urlPattern, requestStage: 'Request' },
      { urlPattern, requestStage: 'Response' }
    ])
  }

  const forgetSessions = (tabId: number) => {
    clearRedirects(tabId)
    for (const [key, session] of sessions) if (session.tabId === tabId) sessions.delete(key)
    for (const [key, operation] of pausedOperations) {
      if (operation.session.tabId === tabId) {
        cancelOperation(operation)
        pausedOperations.delete(key)
      }
    }
  }

  const showError = async (tabId: number, message: string, context?: Record<string, unknown>) => {
    errors.set(tabId, message)
    console.error('Response replacement:', message, ...(context ? [context] : []))
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
    const key = sessionKey(session)
    sessions.set(key, session)
    try {
      if (headerRules.length || observeLoading)
        await chrome.debugger.sendCommand(session, 'Network.enable')
      if (!isCurrentSession(session)) throw new InterceptionEnded()
      try {
        await chrome.debugger.sendCommand(session, 'Fetch.enable', {
          patterns: interceptionPatterns()
        })
      } catch (error) {
        if (!session.sessionId || !isMissingDebuggerMethod(error, 'Fetch.enable')) throw error
        unsupportedSessions.add(session)
        console.debug('Child target does not support Fetch interception:', {
          tabId: session.tabId,
          sessionId: session.sessionId
        })
        return
      }
      if (!isCurrentSession(session)) throw new InterceptionEnded()
      try {
        await chrome.debugger.sendCommand(session, 'Target.setAutoAttach', {
          autoAttach: true,
          waitForDebuggerOnStart: true,
          flatten: true,
          filter: [
            { type: 'iframe', exclude: false },
            { type: 'worker', exclude: false },
            { type: 'shared_worker', exclude: false },
            { type: 'service_worker', exclude: false },
            { exclude: true }
          ]
        })
      } catch (error) {
        if (!session.sessionId || !isMissingDebuggerMethod(error, 'Target.setAutoAttach'))
          throw error
      }
    } catch (error) {
      if (sessions.get(key) === session) sessions.delete(key)
      throw error
    }
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
        const tab = await chrome.tabs.get(tabId)
        if (!/^https?:\/\//.test(tab.url ?? '') || !rules.length) return
        await chrome.debugger.attach({ tabId }, '1.3')
        attached.add(tabId)
        if (!rules.length) return await detach(tabId)
        await enableSession({ tabId })
        await clearError(tabId)
      } catch (error) {
        await detach(tabId)
        if (
          rules.length &&
          !(error instanceof InterceptionEnded) &&
          !isUnavailableDebugTarget(error)
        ) {
          dismissed.add(tabId)
          await showError(
            tabId,
            `请求调试连接失败，请刷新页面或重新启用代理后重试：${String(error)}`
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

  const handleRequest = async (
    session: Session,
    event: PausedRequest,
    operation: PausedOperation
  ) => {
    const tabId = session.tabId
    if (tabId === undefined) return
    const requestKey = networkKey(session, event.requestId)
    if (event.responseStatusCode !== undefined || event.responseErrorReason) {
      const binding = requestOwners.get(requestKey)
      requestOwners.delete(requestKey)
      if (!binding) {
        await sendPausedCommand(operation, 'Fetch.continueRequest', {
          requestId: event.requestId
        })
        return
      }
      const { rule } = binding.owner
      if (event.responseErrorReason) {
        if (binding.networkId) successes.delete(networkKey(session, binding.networkId))
        if (event.responseErrorReason !== 'Aborted')
          await showError(tabId, `目标请求加载失败：${event.responseErrorReason}`)
        await sendPausedCommand(operation, 'Fetch.continueRequest', {
          requestId: event.requestId
        })
        return
      }
      const status = event.responseStatusCode!
      const redirects =
        status >= 300 &&
        status < 400 &&
        (event.responseHeaders ?? []).some(header => header.name.toLowerCase() === 'location')
      if (redirects && binding.rewrittenDocument && rule.requestHeaders?.some(row => row.enabled)) {
        if (binding.networkId) successes.delete(networkKey(session, binding.networkId))
        await showError(tabId, '已配置请求头时请填写不再跳转的最终目标地址')
        await sendPausedCommand(operation, 'Fetch.failRequest', {
          requestId: event.requestId,
          errorReason: 'Failed'
        })
        return
      }
      const overrides = rule.responseHeaders?.some(row => row.enabled)
      await sendPausedCommand(operation, 'Fetch.continueResponse', {
        requestId: event.requestId,
        ...(overrides
          ? {
              responseCode: status,
              ...(event.responseStatusText ? { responsePhrase: event.responseStatusText } : {}),
              responseHeaders: mergeHeaderSettings(
                (event.responseHeaders ?? []).map(({ name, value }) => [name, value]),
                rule.responseHeaders
              ).map(([name, value]) => ({ name, value }))
            }
          : {})
      })
      if (binding.success && !redirects) {
        binding.success.applied = true
        finishSuccess(binding.success)
      }
      await clearError(tabId)
      return
    }
    const networkOwner = event.networkId
      ? networkRequests.get(networkKey(session, event.networkId))
      : undefined
    const owner = getProxyRequestOwner(event.request.url, undefined, rules, networkOwner)
    const match =
      owner &&
      owner.target !== event.request.url &&
      resourceTypes.includes(getRequestType(event.resourceType))
        ? owner
        : undefined
    const directHeaderOnly =
      owner &&
      hasHeaderSettings(owner.rule) &&
      getProxyRequestOwner(event.request.url, undefined, [owner.rule])?.target === event.request.url
    const complete =
      owner && (match || directHeaderOnly) ? beginSuccess(tabId, owner.rule) : undefined
    const success =
      complete && event.networkId ? { complete, applied: false, loaded: false } : undefined
    if (success) successes.set(networkKey(session, event.networkId!), success)
    if (
      owner &&
      (hasHeaderSettings(owner.rule) || (!!match && event.resourceType === 'Document'))
    ) {
      requestOwners.set(requestKey, {
        owner,
        networkId: event.networkId,
        rewrittenDocument: !!match && event.resourceType === 'Document',
        success
      })
      if (headerRules.length && event.networkId && !networkOwner)
        networkRequests.set(networkKey(session, event.networkId), owner)
    }
    const requestHeaders = owner?.rule.requestHeaders?.some(row => row.enabled)
      ? {
          headers: mergeHeaderSettings(
            Object.entries(event.request.headers),
            owner.rule.requestHeaders
          ).map(([name, value]) => ({ name, value }))
        }
      : {}
    if (!match) {
      await sendPausedCommand(operation, 'Fetch.continueRequest', {
        requestId: event.requestId,
        ...requestHeaders
      })
      return
    }
    if (event.resourceType === 'Document') {
      // Keep document loading in the browser to retain its network security metadata.
      try {
        await sendPausedCommand(operation, 'Fetch.continueRequest', {
          requestId: event.requestId,
          url: match.target,
          interceptResponse: true,
          ...requestHeaders
        })
      } catch (error) {
        requestOwners.delete(requestKey)
        throw error
      }
      return
    }
    const controller = new AbortController()
    operation.controller = controller
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
      const response = await fetch(match.target, {
        method,
        headers: Object.fromEntries(
          mergeHeaderSettings(
            Object.entries(getReplacementRequestHeaders(event.request.headers)),
            match.rule.requestHeaders
          )
        ),
        body: method === 'GET' || method === 'HEAD' ? undefined : body,
        credentials: 'omit',
        cache: 'no-store',
        redirect: match.rule.requestHeaders?.some(row => row.enabled) ? 'error' : 'follow',
        signal: controller.signal
      })
      const bytes = new Uint8Array(await response.arrayBuffer())
      // Chunk the conversion to avoid overflowing the call stack for large responses.
      let binary = ''
      for (let offset = 0; offset < bytes.length; offset += 32768)
        binary += String.fromCharCode(...bytes.subarray(offset, offset + 32768))
      await sendPausedCommand(operation, 'Fetch.fulfillRequest', {
        requestId: event.requestId,
        responseCode: response.status,
        responseHeaders: getFulfillmentHeaders(
          mergeHeaderSettings([...response.headers.entries()], match.rule.responseHeaders)
        ),
        body: btoa(binary)
      })
      try {
        complete?.()
      } catch {
        /* Page hints are best-effort. */
      }
      await clearError(tabId)
    } catch (error) {
      if (
        error instanceof InterceptionEnded ||
        isEndedInterception(error) ||
        !isCurrentOperation(operation)
      )
        return
      if (attached.has(tabId) && rules.length) {
        const headerHint = match.rule.requestHeaders?.some(row => row.enabled)
          ? '；已配置请求头时请填写不再跳转的最终目标地址'
          : ''
        await showError(tabId, `目标请求读取失败：${String(error)}${headerHint}`)
        await sendPausedCommand(operation, 'Fetch.failRequest', {
          requestId: event.requestId,
          errorReason: 'Failed'
        }).catch(() => {})
      }
    } finally {
      clearTimeout(timer)
      requests.delete(controller)
      if (!requests.size && pending.get(tabId) === requests) pending.delete(tabId)
    }
  }

  chrome.debugger.onEvent.addListener((session, method, params) => {
    const activeSession = sessions.get(sessionKey(session))
    if (!activeSession || !isCurrentSession(activeSession)) return
    if (method === 'Network.requestWillBeSent') {
      const event = params as {
        requestId: string
        request: { url: string }
        redirectResponse?: { url: string }
      }
      const key = networkKey(session, event.requestId)
      const owner = getProxyRequestOwner(
        event.request.url,
        event.redirectResponse?.url,
        rules,
        networkRequests.get(key)
      )
      if (owner) networkRequests.set(key, owner)
      else networkRequests.delete(key)
    } else if (method === 'Network.loadingFinished' || method === 'Network.loadingFailed') {
      const networkId = (params as { requestId: string }).requestId
      const failed = params as { canceled?: boolean; errorText?: string }
      const canceled = failed.canceled || failed.errorText === 'net::ERR_ABORTED'
      for (const [key, operation] of pausedOperations) {
        if (operation.session === activeSession && operation.event.networkId === networkId) {
          cancelOperation(operation)
          pausedOperations.delete(key)
        }
      }
      const success = successes.get(networkKey(session, networkId))
      successes.delete(networkKey(session, networkId))
      if (success && method === 'Network.loadingFinished') {
        success.loaded = true
        finishSuccess(success)
      }
      networkRequests.delete(networkKey(session, networkId))
      for (const [key, binding] of requestOwners) {
        if (
          key.startsWith(`${session.tabId}:${session.sessionId ?? ''}:`) &&
          binding.networkId === networkId
        ) {
          requestOwners.delete(key)
          if (method === 'Network.loadingFailed' && !canceled && binding.rewrittenDocument)
            void showError(
              session.tabId!,
              `目标文档加载失败：${(params as { errorText: string }).errorText}`
            )
        }
      }
    } else if (method === 'Fetch.requestPaused') {
      if (unsupportedSessions.has(activeSession)) return
      const event = params as PausedRequest
      const key = networkKey(session, event.requestId)
      const responseStage = event.responseStatusCode !== undefined || !!event.responseErrorReason
      const existing = pausedOperations.get(key)
      if (existing && existing.responseStage === responseStage) return
      const operation: PausedOperation = {
        session: activeSession,
        event,
        responseStage,
        sending: false,
        finished: false
      }
      pausedOperations.set(key, operation)
      void handleRequest(session, event, operation)
        .catch(async error => {
          if (pausedOperations.get(key) === operation && isCurrentSession(activeSession)) {
            if (event.networkId) successes.delete(networkKey(session, event.networkId))
            requestOwners.delete(key)
          }
          if (
            error instanceof InterceptionEnded ||
            isEndedInterception(error) ||
            !isCurrentOperation(operation)
          ) {
            console.debug('Interception already ended:', {
              tabId: session.tabId,
              sessionId: session.sessionId,
              requestId: event.requestId
            })
            return
          }
          if (session.tabId !== undefined) {
            const url = new URL(event.request.url)
            await showError(session.tabId, `头设置或响应替换失败：${String(error)}`, {
              tabId: session.tabId,
              sessionId: session.sessionId,
              requestId: event.requestId,
              resourceType: event.resourceType,
              command: operation.command,
              url: url.origin + url.pathname
            }).catch(() => {})
          }
          await sendPausedCommand(operation, 'Fetch.failRequest', {
            requestId: event.requestId,
            errorReason: 'Failed'
          }).catch(() => {})
        })
        .finally(() => {
          if (pausedOperations.get(key) === operation) pausedOperations.delete(key)
        })
    } else if (method === 'Target.attachedToTarget') {
      const child = params as { sessionId: string }
      const target = { ...session, sessionId: child.sessionId }
      void enableSession(target)
        .catch(async error => {
          if (!(error instanceof InterceptionEnded) && !isEndedInterception(error)) {
            console.error('Child target interception:', { sessionId: child.sessionId, error })
            await chrome.debugger
              .sendCommand(target, 'Runtime.runIfWaitingForDebugger')
              .catch(() => {})
          }
        })
        .finally(() => {
          if (sessions.get(sessionKey(target)) === target && isCurrentSession(target))
            return chrome.debugger
              .sendCommand(target, 'Runtime.runIfWaitingForDebugger')
              .catch(() => {})
        })
    } else if (method === 'Target.detachedFromTarget') {
      const child = params as { sessionId: string }
      sessions.delete(`${session.tabId}:${child.sessionId}`)
      const prefix = `${session.tabId}:${child.sessionId}:`
      for (const key of networkRequests.keys())
        if (key.startsWith(prefix)) networkRequests.delete(key)
      for (const key of requestOwners.keys()) if (key.startsWith(prefix)) requestOwners.delete(key)
      for (const key of successes.keys()) if (key.startsWith(prefix)) successes.delete(key)
      for (const [key, operation] of pausedOperations) {
        if (key.startsWith(prefix)) {
          cancelOperation(operation)
          pausedOperations.delete(key)
        }
      }
    }
  })

  chrome.debugger.onDetach.addListener((session, reason) => {
    if (session.tabId === undefined || !attached.delete(session.tabId)) return
    console.warn('Response replacement detached:', { tabId: session.tabId, reason })
    pending.get(session.tabId)?.forEach(controller => controller.abort())
    pending.delete(session.tabId)
    forgetSessions(session.tabId)
    dismissed.add(session.tabId)
    if (rules.length && reason !== 'target_closed')
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
        if (!isEndedInterception(error)) throw error
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
    else void detach(tabId)
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
      getResponsePatterns(nextTypes)
      for (const rule of nextRules) {
        validateHeaderSettings(rule.requestHeaders, 'request')
        validateHeaderSettings(rule.responseHeaders, 'response')
      }
      const nextHeaderRules = nextRules.filter(hasHeaderSettings)
      const nextObserveLoading =
        !!notifications && nextRules.some(rule => rule.showSuccessNotification === true)
      const scopeChanged =
        JSON.stringify(resourceTypes) !== JSON.stringify(nextTypes) ||
        !!headerRules.length !== !!nextHeaderRules.length ||
        observeLoading !== nextObserveLoading
      const mappings = (items: ProxyRule[]) =>
        items.map(rule => [
          rule.sourceUrl,
          rule.targetUrl,
          rule.requestHeaders,
          rule.responseHeaders
        ])
      if (scopeChanged || JSON.stringify(mappings(rules)) !== JSON.stringify(mappings(nextRules)))
        pending.forEach(requests => requests.forEach(controller => controller.abort()))
      resourceTypes = [...nextTypes]
      observeLoading = nextObserveLoading
      headerRules = nextHeaderRules
      rules = nextTypes.length || headerRules.length ? nextRules : []
      if (!rules.length || scopeChanged) clearRedirects()
      dismissed.clear()
      if (scopeChanged && rules.length)
        for (const session of sessions.values()) {
          if (!isCurrentSession(session) || unsupportedSessions.has(session)) continue
          try {
            if (headerRules.length || observeLoading)
              await chrome.debugger.sendCommand(session, 'Network.enable')
            else await chrome.debugger.sendCommand(session, 'Network.disable')
            if (!isCurrentSession(session)) continue
            await chrome.debugger.sendCommand(session, 'Fetch.enable', {
              patterns: interceptionPatterns()
            })
          } catch (error) {
            if (!isCurrentSession(session) || isEndedInterception(error)) continue
            if (session.sessionId && isMissingDebuggerMethod(error, 'Fetch.enable')) {
              unsupportedSessions.add(session)
              continue
            }
            throw error
          }
        }
      const tabs = await chrome.tabs.query({})
      for (const tab of tabs) {
        if (tab.id === undefined) continue
        if (rules.length && /^https?:\/\//.test(tab.url ?? '')) await attach(tab.id)
        else await detach(tab.id)
      }
    }
  }
}
