import type { ProxyConfig } from './types/proxy'
import { createStorageAdapter } from './stores/storage'
import { ProxyManager } from './proxy/ProxyManager'
import { RedirectProxy } from './proxy/RedirectProxy'
import { ResponseProxy } from './proxy/ResponseProxy'
import { createProxySuccessNotifications } from './proxy/success-notifications'
import notificationIcon from '/icons/icon32.png?inline'
import { logError } from './utils/logger.ts'
import { createProxyConfigPersistence } from './proxy/config-persistence'

const storage = createStorageAdapter()
const proxyConfigPersistence = createProxyConfigPersistence({
  read: async () => (await storage.get('proxyConfig')) as ProxyConfig | undefined,
  write: config => storage.set('proxyConfig', config)
})
const notifications = createProxySuccessNotifications(notificationIcon)
const proxyManager = new ProxyManager(
  {
    redirect: new RedirectProxy(),
    response: new ResponseProxy(notifications, () => proxyConfigPersistence.disable())
  },
  notifications.update
)

const refreshProxyConfiguration = () => {
  return proxyManager
    .refresh(async () => {
      const config = (await storage.get('proxyConfig')) as ProxyConfig | undefined
      return config ?? { enabled: false, groups: [] }
    })
    .catch(error => {
      logError('Proxy configuration update failed:', error)
    })
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.proxyConfig) refreshProxyConfiguration()
})

refreshProxyConfiguration()

// 处理脚本执行请求
chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  if (request.action === 'saveProxyConfig') {
    if (
      !request.config ||
      typeof request.config.enabled !== 'boolean' ||
      !Array.isArray(request.config.groups)
    ) {
      sendResponse({ success: false, error: '无效的代理配置' })
      return false
    }
    void proxyConfigPersistence
      .save(request.config as ProxyConfig, request.updateEnabled === true)
      .then(() => sendResponse({ success: true }))
      .catch(error => {
        logError('保存代理配置失败:', error)
        sendResponse({ success: false, error: String(error) })
      })
    return true
  }

  if (request.action === 'executeScript') {
    // 获取当前活动标签页
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
      if (tabs[0]?.id) {
        const tabId = tabs[0].id

        // 将代码作为参数传递，在函数内部使用 Function 构造函数
        // 使用 world: 'MAIN' 可能有助于绕过某些 CSP 限制
        const executeCode = function (userCode: string) {
          try {
            const func = new Function(userCode)
            return func()
          } catch (error) {
            throw error
          }
        }

        chrome.scripting
          .executeScript({
            target: { tabId },
            func: executeCode,
            args: [request.code],
            injectImmediately: true,
            world: 'MAIN' // 在页面的主世界中执行
          })
          .then(results => {
            sendResponse({ success: true, results })
          })
          .catch(error => {
            logError('Script execution error:', error)
            sendResponse({
              success: false,
              error: error.message || '脚本执行失败'
            })
          })
      } else {
        sendResponse({
          success: false,
          error: '未找到活动标签页'
        })
      }
    })

    // 返回true表示异步响应
    return true
  }
})
