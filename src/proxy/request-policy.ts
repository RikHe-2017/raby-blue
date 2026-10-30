import { buildSourcePattern } from '../document-response-rules.ts'
import { REQUEST_TYPES } from './ProxyStrategy.ts'
import type { RequestPolicy, RequestType, StrategyConfig } from './ProxyStrategy'
import type { ProxyRule } from '../types/proxy'

export const DEFAULT_REQUEST_POLICY: RequestPolicy = Object.freeze({
  document: 'response',
  stylesheet: 'redirect',
  script: 'redirect',
  image: 'redirect',
  font: 'redirect',
  object: 'redirect',
  xmlhttprequest: 'redirect',
  ping: 'redirect',
  csp_report: 'redirect',
  media: 'redirect',
  websocket: 'redirect',
  webtransport: 'redirect',
  webbundle: 'redirect',
  other: 'redirect'
})

const DEBUGGER_TYPES: Readonly<Record<string, RequestType>> = {
  Document: 'document',
  Stylesheet: 'stylesheet',
  Script: 'script',
  Image: 'image',
  Font: 'font',
  Media: 'media',
  XHR: 'xmlhttprequest',
  Fetch: 'xmlhttprequest',
  EventSource: 'xmlhttprequest',
  Ping: 'ping',
  CSPViolationReport: 'csp_report',
  WebSocket: 'websocket'
}

export function getRequestType(debuggerType: string): RequestType {
  return DEBUGGER_TYPES[debuggerType] ?? 'other'
}

export function splitStrategyConfig(rules: ProxyRule[], policy: RequestPolicy) {
  if (REQUEST_TYPES.some(type => policy[type] !== 'redirect' && policy[type] !== 'response'))
    throw new Error('每个请求类型必须指定一种代理策略')
  getResponsePatterns(REQUEST_TYPES.filter(type => policy[type] === 'response'))
  return {
    redirect: {
      rules: [...rules],
      resourceTypes: REQUEST_TYPES.filter(type => policy[type] === 'redirect')
    },
    response: {
      rules: [...rules],
      resourceTypes: REQUEST_TYPES.filter(type => policy[type] === 'response')
    }
  }
}

export function getResponsePatterns(types: RequestType[]) {
  const supported = new Set<RequestType>(
    Object.values(DEBUGGER_TYPES).filter(type => type !== 'websocket')
  )
  if (types.some(type => !supported.has(type)))
    throw new Error('所选请求类型不支持按类型响应替换，请使用重定向策略')
  return Object.entries(DEBUGGER_TYPES)
    .filter(([, type]) => types.includes(type))
    .flatMap(([resourceType]) =>
      ['http://*', 'https://*'].map(urlPattern => ({
        urlPattern,
        resourceType,
        requestStage: 'Request'
      }))
    )
}

export function getRedirectResourceTypes(
  types: RequestType[]
): chrome.declarativeNetRequest.ResourceType[] {
  return types.flatMap(type =>
    type === 'document' ? ['main_frame', 'sub_frame'] : [type]
  ) as chrome.declarativeNetRequest.ResourceType[]
}

export function buildRedirectRules(config: StrategyConfig): chrome.declarativeNetRequest.Rule[] {
  const resourceTypes = getRedirectResourceTypes(config.resourceTypes)
  if (!resourceTypes.length) return []
  return config.rules.map((rule, index) => ({
    id: index + 1,
    priority: config.rules.length - index,
    action:
      !rule.targetUrl.trim() || rule.sourceUrl === rule.targetUrl.trim()
        ? {
            type: 'allow' as chrome.declarativeNetRequest.RuleActionType
          }
        : {
            type: 'redirect' as chrome.declarativeNetRequest.RuleActionType,
            redirect: { regexSubstitution: rule.targetUrl.trim() + '\\1' }
          },
    condition: {
      regexFilter: buildSourcePattern(rule.sourceUrl),
      resourceTypes: [...resourceTypes]
    }
  }))
}
