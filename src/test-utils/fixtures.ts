import { expect } from 'vitest'
import type { ProxyGroup, ProxyNode, ProxyRule } from '../types/proxy'

export function requireValue<T>(value: T): NonNullable<T> {
  expect(value).not.toBeNull()
  expect(value).not.toBeUndefined()
  return value as NonNullable<T>
}

export function requireGroup(node: ProxyNode): ProxyGroup {
  expect(node.type).toBe('group')
  if (node.type !== 'group') throw new Error('Expected a proxy group fixture')
  return node
}

export function requireRule(node: ProxyNode): ProxyRule {
  expect(node.type).toBe('rule')
  if (node.type !== 'rule') throw new Error('Expected a proxy rule fixture')
  return node
}

export function createTestEvent<Args extends unknown[] = unknown[]>() {
  const listeners = new Set<(...args: Args) => void>()
  return {
    addListener: (listener: (...args: Args) => void) => listeners.add(listener),
    removeListener: (listener: (...args: Args) => void) => listeners.delete(listener),
    emit: (...args: Args) => [...listeners].forEach(listener => listener(...args)),
    get size() {
      return listeners.size
    }
  }
}

export type DebugSession = { tabId: number; sessionId?: string }

export interface DebugCommand {
  session: DebugSession
  method: string
  params: {
    requestId?: string
    url?: string
    postData?: string
    interceptResponse?: boolean
    headers?: { name: string; value: string }[]
    responseHeaders?: { name: string; value: string }[]
    patterns?: { resourceType?: string; requestStage?: string; urlPattern?: string }[]
  }
}
