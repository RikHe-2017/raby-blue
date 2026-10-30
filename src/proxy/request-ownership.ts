import type { ProxyRule } from '../types/proxy'
import { findProxyMatch } from '../document-response-rules.ts'

export interface ProxyRequestOwner {
  url: string
  target: string
  rule: ProxyRule
}

function matchSource(url: string, rules: ProxyRule[]): ProxyRequestOwner | undefined {
  const match = findProxyMatch(url, rules)
  if (!match) return undefined
  const target = new URL(match.target)
  target.hash = ''
  return { url, target: target.href, rule: match.rule }
}

export function getProxyRequestOwner(
  url: string,
  redirectFrom: string | undefined,
  rules: ProxyRule[],
  previous?: ProxyRequestOwner
): ProxyRequestOwner | undefined {
  if (!redirectFrom) {
    if (previous?.url === url || previous?.target === url) return { ...previous, url }
    return matchSource(url, rules)
  }
  // A destination only verifies the source mapping; it never selects a rule on its own.
  const candidates = [
    previous?.url === redirectFrom ? previous : undefined,
    matchSource(redirectFrom, rules)
  ]
  for (const owner of candidates) {
    if (owner && owner.url !== owner.target && owner.target === url) return { ...owner, url }
  }
  return matchSource(url, rules)
}
