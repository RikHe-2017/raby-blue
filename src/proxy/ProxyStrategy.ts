import type { ProxyRule } from '../types/proxy'

export const REQUEST_TYPES = [
  'document',
  'stylesheet',
  'script',
  'image',
  'font',
  'object',
  'xmlhttprequest',
  'ping',
  'csp_report',
  'media',
  'websocket',
  'webtransport',
  'webbundle',
  'other'
] as const

export type RequestType = (typeof REQUEST_TYPES)[number]
export type ProxyMode = 'redirect' | 'response'
export type RequestPolicy = Readonly<Record<RequestType, ProxyMode>>

export interface StrategyConfig {
  rules: ProxyRule[]
  resourceTypes: RequestType[]
  tabId?: number
}

export interface ProxyStrategy {
  update(config: StrategyConfig, signal?: AbortSignal): Promise<void>
  dispose(): Promise<void>
}
