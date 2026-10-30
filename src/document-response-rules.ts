import type { ProxyConfig, ProxyNode, ProxyRule } from './types/proxy'

export function getEnabledProxyRules(config: ProxyConfig): ProxyRule[] {
  const visit = (nodes: ProxyNode[]): ProxyRule[] =>
    nodes.flatMap(node =>
      node.type === 'group' ? visit(node.children) : node.enabled ? [node] : []
    )
  return config.enabled ? visit(config.groups) : []
}

export function buildSourcePattern(source: string): string {
  return /[\\\[\]()*$^|]/.test(source)
    ? source.replace(/\?\?/g, '\\?\\?')
    : source.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(.*)'
}

export function findResponseTarget(url: string, rules: ProxyRule[]): string | undefined {
  return findResponseMatch(url, rules)?.target
}

export function findResponseMatch(
  url: string,
  rules: ProxyRule[]
): { rule: ProxyRule; target: string } | undefined {
  const match = findProxyMatch(url, rules)
  return match && new URL(match.target).href !== url ? match : undefined
}

export function findProxyMatch(
  url: string,
  rules: ProxyRule[]
): { rule: ProxyRule; target: string } | undefined {
  for (const rule of rules) {
    if (!rule.sourceUrl) continue
    try {
      const match = new RegExp(buildSourcePattern(rule.sourceUrl), 'i').exec(url)
      if (!match) continue
      const targetPrefix = rule.targetUrl.trim()
      const target = targetPrefix ? targetPrefix + (match[1] ?? '') : url
      const parsed = new URL(target)
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return { rule, target }
    } catch {
      continue
    }
  }
}

export function getReplacementRequestHeaders(
  headers: Record<string, string>
): Record<string, string> {
  const excluded = new Set([
    'host',
    'cookie',
    'origin',
    'referer',
    'content-length',
    'accept-encoding',
    'connection',
    'keep-alive',
    'transfer-encoding',
    'te',
    'trailer',
    'upgrade'
  ])
  return Object.fromEntries(
    Object.entries(headers).filter(([name]) => {
      const key = name.toLowerCase()
      return !excluded.has(key) && !key.startsWith('sec-') && !key.startsWith('proxy-')
    })
  )
}

export function getReplacementRequestBody(request: {
  postData?: string
  postDataEntries?: { bytes?: string }[]
}) {
  if (!request.postDataEntries?.length) return request.postData
  const parts = request.postDataEntries.map(entry => {
    if (entry.bytes === undefined) throw new Error('无法完整读取请求正文，已停止转发以避免数据丢失')
    return Uint8Array.from(atob(entry.bytes), character => character.charCodeAt(0))
  })
  const body = new Uint8Array(parts.reduce((total, part) => total + part.length, 0))
  let offset = 0
  for (const part of parts) {
    body.set(part, offset)
    offset += part.length
  }
  return body
}

export function getFulfillmentHeaders(
  headers: [string, string][]
): { name: string; value: string }[] {
  const transportHeaders = new Set([
    'content-encoding',
    'content-length',
    'transfer-encoding',
    'connection',
    'keep-alive',
    'proxy-authenticate',
    'proxy-authorization',
    'te',
    'trailer',
    'upgrade'
  ])
  return headers
    .filter(([name]) => !transportHeaders.has(name.toLowerCase()))
    .map(([name, value]) => ({ name, value }))
}
