import { createContext, runInContext } from 'node:vm'
import { afterEach, expect, test, vi } from 'vitest'
import {
  injectProxySuccessNotification,
  installProxySuccessNotification
} from './proxy-success-notification'
import { installPageNotification } from './page-notification'
import type { PageNotificationController } from './page-notification'

type MessageListener = (
  message: unknown,
  sender: { id: string },
  respond: (result: { shown: boolean }) => void
) => void

type ClickListener = (event: { stopPropagation(): void }) => void

interface ElementStub {
  tag: string
  className?: string
  textContent?: string
  children: ElementStub[]
  shadow?: ElementStub
  events: Map<string, ClickListener>
  append(...children: ElementStub[]): void
  remove(): void
  attachShadow(): ElementStub
  getContext(): { drawImage(): void }
  setAttribute(): void
  addEventListener(name: string, listener: ClickListener): void
}

async function pageFixture(installListener = true) {
  vi.useFakeTimers()
  const displayed: ElementStub[] = []
  const listeners: MessageListener[] = []
  const visibilityListeners: (() => void)[] = []
  const createElement = (tag: string): ElementStub => {
    const element: ElementStub = {
      tag,
      children: [],
      events: new Map(),
      append(...children) {
        element.children.push(...children)
      },
      remove() {
        const index = displayed.indexOf(element)
        if (index !== -1) displayed.splice(index, 1)
      },
      attachShadow() {
        element.shadow = createElement('shadow')
        return element.shadow
      },
      getContext: () => ({ drawImage() {} }),
      setAttribute() {},
      addEventListener(name, listener) {
        element.events.set(name, listener)
      }
    }
    return element
  }
  const append = vi.fn((element: ElementStub) => displayed.push(element))
  const document = {
    visibilityState: 'visible',
    documentElement: { append },
    createElement,
    addEventListener(_name: string, listener: () => void) {
      visibilityListeners.push(listener)
    }
  }
  const context = createContext({
    document,
    chrome: {
      runtime: {
        id: 'raby-blue',
        onMessage: { addListener: (listener: MessageListener) => listeners.push(listener) }
      }
    },
    atob,
    Blob,
    createImageBitmap: async () => ({ width: 32, height: 32 }),
    CSSStyleSheet: class {
      replaceSync() {}
    },
    setTimeout,
    clearTimeout
  })
  // Execute the actual serialized content script in a separate page realm, without a browser.
  const install = async () => {
    await runInContext(
      `(${installPageNotification.toString()})('data:image/png;base64,AA==')`,
      context
    )
    if (installListener)
      return runInContext(`(${installProxySuccessNotification.toString()})()`, context)
  }
  await install()
  const send = (ids: string[], senderId = 'raby-blue') => {
    let response: { shown: boolean } | undefined
    const message = {
      action: 'proxySuccess',
      items: ids.map(id => ({ id, name: 'API', mapped: true }))
    }
    for (const listener of listeners)
      listener(message, { id: senderId }, value => {
        response = value
      })
    return response
  }
  const visibility = (value: string) => {
    document.visibilityState = value
    visibilityListeners.forEach(listener => listener())
  }
  const controller = () => context.rabyBlueNotification as PageNotificationController
  return { displayed, listeners, append, send, install, visibility, controller }
}

afterEach(() => {
  vi.clearAllTimers()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

test('page singleton owns hasShown; hiding and reinstalling cannot reset it', async () => {
  const page = await pageFixture(false)
  const notification = page.controller()
  expect(notification.hasShown).toBe(false)
  expect(notification.show('自定义提示内容')).toBe(true)
  expect(notification.hasShown).toBe(true)
  const content = page.displayed[0].shadow?.children[0].children[0]
  expect(content?.children.find(node => node.className === 'description')?.textContent).toBe(
    '自定义提示内容'
  )
  notification.hide()
  expect(page.displayed).toHaveLength(0)
  await page.install()
  expect(page.controller()).toBe(notification)
  expect(notification.show('另一条提示')).toBe(false)
  expect(page.displayed).toHaveLength(0)
})

test('injection installs the shared singleton before its message listener in the same document', async () => {
  const executeScript = vi.fn(async (_options: unknown) => [{ result: true }])
  vi.stubGlobal('chrome', { scripting: { executeScript } })
  const target = { tabId: 10, documentIds: ['doc1'] }
  expect(await injectProxySuccessNotification(target, 'icon')).toBe(true)
  expect(executeScript.mock.calls.map(([options]) => options)).toEqual([
    { target, func: installPageNotification, args: ['icon'], injectImmediately: true },
    { target, func: installProxySuccessNotification, injectImmediately: true }
  ])
  executeScript.mockClear()
  executeScript.mockResolvedValueOnce([{ result: false }])
  expect(await injectProxySuccessNotification(target, 'icon')).toBe(false)
  expect(executeScript).toHaveBeenCalledTimes(1)
})

test('notification container renders its title and content inside the shadow root', async () => {
  const page = await pageFixture()
  expect(page.send(['r'])).toEqual({ shown: true })
  const notice = page.displayed[0].shadow?.children[0]
  expect(notice?.className).toBe('notice')
  const content = notice?.children.find(node => node.className === 'content')
  const title = content?.children.find(node => node.className === 'title')
  const description = content?.children.find(node => node.className === 'description')
  expect(title?.children[0].textContent).toBe('欢迎使用蓝兔')
  expect(description?.textContent).toBe('代理配置已生效，RabyBlue时刻为您服务～')
})

test('auto-hide and repeated injection do not allow another proxy to notify in the same page', async () => {
  const page = await pageFixture()
  expect(page.send(['r'])).toEqual({ shown: true })
  vi.advanceTimersByTime(3000)
  expect(page.displayed).toHaveLength(0)
  expect(page.send(['r'])).toEqual({ shown: false })
  await page.install()
  expect(page.listeners).toHaveLength(1)
  expect(page.send(['r'])).toEqual({ shown: false })
  expect(page.send(['second'])).toEqual({ shown: false })
  expect(page.append).toHaveBeenCalledTimes(1)
})

test('manual close does not allow a different proxy to notify again', async () => {
  const page = await pageFixture()
  expect(page.send(['r'])).toEqual({ shown: true })
  const close = page.displayed[0].shadow?.children[0].children.find(node => node.tag === 'button')
  expect(close).toBeDefined()
  close?.events.get('click')?.({ stopPropagation() {} })
  expect(page.displayed).toHaveLength(0)
  expect(page.send(['second'])).toEqual({ shown: false })
})

test('a new page realm resets display history without touching any persistent storage', async () => {
  const previous = await pageFixture()
  expect(previous.send(['r'])).toEqual({ shown: true })
  expect(previous.send(['r'])).toEqual({ shown: false })
  const refreshed = await pageFixture()
  expect(refreshed.send(['r'])).toEqual({ shown: true })
  expect(previous.send(['r'])).toEqual({ shown: false })
})

test('hidden pages do not consume display history; returning to a page does not reset it', async () => {
  const page = await pageFixture()
  page.visibility('hidden')
  expect(page.send(['r'])).toEqual({ shown: false })
  page.visibility('visible')
  expect(page.send(['r'])).toEqual({ shown: true })
  page.visibility('hidden')
  expect(page.displayed).toHaveLength(0)
  page.visibility('visible')
  expect(page.send(['r'])).toEqual({ shown: false })
})

test('duplicate messages and different proxy batches cannot replace the first notice', async () => {
  const page = await pageFixture()
  expect(page.send(['r'])).toEqual({ shown: true })
  const notice = page.displayed[0]
  expect(page.send(['r'])).toEqual({ shown: false })
  expect(page.displayed[0]).toBe(notice)
  expect(page.send(['r', 'second'])).toEqual({ shown: false })
  expect(page.send(['second'])).toEqual({ shown: false })
  expect(page.displayed[0]).toBe(notice)
  expect(page.append).toHaveBeenCalledTimes(1)
})

test('failed rendering does not mark a rule as shown and foreign senders cannot consume it', async () => {
  const page = await pageFixture()
  expect(page.send(['r'], 'other-extension')).toBeUndefined()
  page.append.mockImplementationOnce(() => {
    throw new Error('document not ready')
  })
  expect(() => page.send(['r'])).toThrow('document not ready')
  expect(page.send(['r'])).toEqual({ shown: true })
  expect(page.send(['r'])).toEqual({ shown: false })
})
