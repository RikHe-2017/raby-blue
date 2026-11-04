import type { ProxyRule } from '../types/proxy'
import type { RequestType } from './ProxyStrategy'
import { findProxyMatch } from '../document-response-rules.ts'
import { getRedirectResourceTypes } from './request-policy.ts'
import { injectProxySuccessNotification } from '../content/proxy-success-notification.ts'

export interface ProxySuccessObserver {
  begin(tabId: number, rule: ProxyRule): (() => void) | undefined
}

interface PageState {
  documentId?: string
  navigating: boolean
  eligible: boolean
  pending: Map<string, Ticket>
  delivering: Set<string>
  installing?: Promise<boolean>
  timer?: ReturnType<typeof setTimeout>
}

interface Ticket {
  tabId: number
  epoch: number
  page: PageState
  ruleId: string
  signature: string
  version: number
}

const signature = (rule: ProxyRule) =>
  JSON.stringify([
    rule.enabled,
    rule.showSuccessNotification,
    rule.sourceUrl,
    rule.targetUrl,
    rule.requestHeaders,
    rule.responseHeaders
  ])

export function createProxySuccessNotifications(iconDataUrl: string) {
  let rules: ProxyRule[] = []
  let redirectTypes: string[] = []
  let focusedWindow: number | undefined
  let activeTab: number | undefined
  let epoch = 0
  let observingRedirects = false
  let nextVersion = 0
  let versions = new Map<string, { signature: string; value: number }>()
  const pages = new Map<number, PageState>()
  const redirects = new Map<
    string,
    {
      tabId: number
      source: string
      target: string
      confirmed: boolean
      complete?: () => void
    }
  >()

  const pageFor = (tabId: number) => {
    let page = pages.get(tabId)
    if (!page) {
      page = {
        navigating: false,
        eligible: false,
        pending: new Map(),
        delivering: new Set()
      }
      pages.set(tabId, page)
    }
    return page
  }

  const currentRule = (ticket: Ticket) => {
    const rule = rules.find(item => item.id === ticket.ruleId)
    return activeTab === ticket.tabId &&
      epoch === ticket.epoch &&
      pages.get(ticket.tabId) === ticket.page &&
      rule?.enabled &&
      rule.showSuccessNotification === true &&
      versions.get(rule.id)?.value === ticket.version &&
      signature(rule) === ticket.signature
      ? rule
      : undefined
  }

  const install = (tabId: number, page: PageState): Promise<boolean> => {
    if (tabId !== activeTab || !page.documentId || page.navigating) return Promise.resolve(false)
    if (!rules.some(rule => rule.enabled && rule.showSuccessNotification === true))
      return Promise.resolve(false)
    if (!page.installing) {
      page.installing = injectProxySuccessNotification(
        { tabId, documentIds: [page.documentId] },
        iconDataUrl
      )
        .then(installed => {
          if (!installed) page.installing = undefined
          return installed
        })
        .catch(() => {
          page.installing = undefined
          return false
        })
    }
    return page.installing
  }

  const flush = async (tabId: number, page: PageState) => {
    page.timer = undefined
    if (!page.documentId || page.navigating) return
    const tickets = [...page.pending.values()]
    page.pending.clear()
    const fresh = () =>
      tickets.filter(ticket => currentRule(ticket) && !page.delivering.has(ticket.ruleId))
    if (!fresh().length || !(await install(tabId, page))) return
    const deliver = fresh()
    if (!deliver.length) return
    for (const ticket of deliver) page.delivering.add(ticket.ruleId)
    try {
      await chrome.tabs.sendMessage(
        tabId,
        {
          action: 'proxySuccess',
          items: deliver.map(ticket => {
            const rule = currentRule(ticket)!
            return {
              id: rule.id,
              name: rule.name,
              mapped: !!rule.targetUrl.trim() && rule.targetUrl.trim() !== rule.sourceUrl
            }
          })
        },
        { documentId: page.documentId }
      )
    } catch {
      // Navigation or an unavailable receiver must never affect the actual proxy request.
      page.installing = undefined
    } finally {
      for (const ticket of deliver) page.delivering.delete(ticket.ruleId)
    }
  }

  const schedule = (tabId: number, page: PageState) => {
    if (!page.timer)
      page.timer = setTimeout(() => {
        void flush(tabId, page)
      }, 180)
  }

  const begin: ProxySuccessObserver['begin'] = (tabId, rule) => {
    if (!rule.enabled || rule.showSuccessNotification !== true || tabId < 0) return
    const page = pageFor(tabId)
    page.eligible = true
    if (activeTab !== tabId) return
    const ticket: Ticket = {
      tabId,
      epoch,
      page,
      ruleId: rule.id,
      signature: signature(rule),
      version: versions.get(rule.id)?.value ?? -1
    }
    void install(tabId, page)
    return () => {
      if (!currentRule(ticket)) return
      page.pending.set(rule.id, ticket)
      schedule(tabId, page)
    }
  }

  const activate = (tabId?: number) => {
    epoch++
    activeTab = tabId
    for (const page of pages.values()) {
      clearTimeout(page.timer)
      page.timer = undefined
      page.pending.clear()
    }
    if (tabId === undefined) return
    const page = pageFor(tabId)
    if (page.documentId) {
      if (page.eligible) void install(tabId, page)
      return
    }
    if (!page.navigating)
      void chrome.webNavigation
        .getFrame({ tabId, frameId: 0 })
        .then(frame => {
          if (pages.get(tabId) !== page || page.navigating) return
          page.documentId = frame?.documentId
          if (page.eligible && activeTab === tabId) void install(tabId, page)
        })
        .catch(() => {})
  }

  chrome.tabs.onActivated.addListener(info => {
    if (info.windowId === focusedWindow) activate(info.tabId)
  })
  chrome.windows.onFocusChanged.addListener(windowId => {
    focusedWindow = windowId
    activate()
    const revision = epoch
    if (windowId < 0) return
    void chrome.tabs
      .query({ active: true, windowId })
      .then(tabs => {
        if (epoch === revision) activate(tabs[0]?.id)
      })
      .catch(() => {})
  })
  chrome.webNavigation.onBeforeNavigate.addListener(event => {
    if (event.frameId !== 0) return
    const previous = pages.get(event.tabId)
    clearTimeout(previous?.timer)
    pages.delete(event.tabId)
    pageFor(event.tabId).navigating = true
    for (const [key, request] of redirects) if (request.tabId === event.tabId) redirects.delete(key)
  })
  chrome.webNavigation.onCommitted.addListener(event => {
    if (event.frameId !== 0) return
    let page = pageFor(event.tabId)
    if (page.documentId && page.documentId !== event.documentId) {
      clearTimeout(page.timer)
      pages.delete(event.tabId)
      page = pageFor(event.tabId)
    }
    page.documentId = event.documentId
    page.navigating = false
    if (event.tabId === activeTab && page.eligible) void install(event.tabId, page)
    if (page.pending.size) schedule(event.tabId, page)
  })
  const forget = (tabId: number) => {
    clearTimeout(pages.get(tabId)?.timer)
    pages.delete(tabId)
    for (const [key, request] of redirects) if (request.tabId === tabId) redirects.delete(key)
  }
  chrome.tabs.onRemoved.addListener(forget)
  chrome.webNavigation.onErrorOccurred.addListener(event => {
    if (event.frameId === 0) forget(event.tabId)
  })

  const onBeforeRequest = (event: chrome.webRequest.WebRequestBodyDetails) => {
    if (redirects.has(event.requestId) || !redirectTypes.includes(event.type)) return
    const match = findProxyMatch(event.url, rules)
    if (!match || new URL(match.target).href === event.url) return
    const complete = begin(event.tabId, match.rule)
    redirects.set(event.requestId, {
      tabId: event.tabId,
      source: event.url,
      target: new URL(match.target).href,
      confirmed: false,
      complete
    })
  }
  const onBeforeRedirect = (event: chrome.webRequest.WebRedirectionResponseDetails) => {
    const request = redirects.get(event.requestId)
    if (!request) return
    if (request.confirmed || event.url !== request.source || event.redirectUrl !== request.target)
      redirects.delete(event.requestId)
    else request.confirmed = true
  }
  const onCompleted = (event: chrome.webRequest.WebResponseCacheDetails) => {
    const request = redirects.get(event.requestId)
    redirects.delete(event.requestId)
    if (request?.confirmed && event.url === request.target) request.complete?.()
  }
  const onError = (event: chrome.webRequest.WebResponseErrorDetails) => {
    redirects.delete(event.requestId)
  }
  const initialEpoch = epoch
  const ready = chrome.windows
    .getLastFocused()
    .then(async window => {
      if (epoch !== initialEpoch || !window.focused || window.id === undefined) return
      focusedWindow = window.id
      const tabs = await chrome.tabs.query({ active: true, windowId: window.id })
      if (epoch === initialEpoch) activate(tabs[0]?.id)
    })
    .catch(() => {})

  return {
    ready,
    begin,
    update(nextRules: ProxyRule[], types: RequestType[]) {
      versions = new Map(
        nextRules.map(rule => {
          const nextSignature = signature(rule)
          const previous = versions.get(rule.id)
          return [
            rule.id,
            previous?.signature === nextSignature
              ? previous
              : { signature: nextSignature, value: ++nextVersion }
          ]
        })
      )
      rules = nextRules
      redirectTypes = getRedirectResourceTypes(types)
      const observe =
        !!redirectTypes.length &&
        rules.some(
          rule =>
            rule.showSuccessNotification === true &&
            rule.targetUrl.trim() &&
            rule.targetUrl.trim() !== rule.sourceUrl
        )
      if (!observe) redirects.clear()
      for (const page of pages.values()) {
        for (const [id, ticket] of page.pending) if (!currentRule(ticket)) page.pending.delete(id)
      }
      if (observe === observingRedirects) return
      observingRedirects = observe
      if (observe) {
        const filter = { urls: ['http://*/*', 'https://*/*'] }
        chrome.webRequest.onBeforeRequest.addListener(onBeforeRequest, filter)
        chrome.webRequest.onBeforeRedirect.addListener(onBeforeRedirect, filter)
        chrome.webRequest.onCompleted.addListener(onCompleted, filter)
        chrome.webRequest.onErrorOccurred.addListener(onError, filter)
      } else {
        chrome.webRequest.onBeforeRequest.removeListener(onBeforeRequest)
        chrome.webRequest.onBeforeRedirect.removeListener(onBeforeRedirect)
        chrome.webRequest.onCompleted.removeListener(onCompleted)
        chrome.webRequest.onErrorOccurred.removeListener(onError)
      }
    }
  }
}
