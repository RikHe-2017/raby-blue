import type { ProxyConfig } from './types/proxy'
import { createStorageAdapter } from './stores/storage'
import { ProxyManager } from './proxy/ProxyManager'
import { RedirectProxy } from './proxy/RedirectProxy'
import { ResponseProxy } from './proxy/ResponseProxy'
import { createProxySuccessNotifications } from './proxy/success-notifications'
import notificationIcon from '/icons/icon32.png?inline'
import { logError } from './utils/logger.ts'
import { createProxyConfigPersistence } from './proxy/config-persistence'
import { createProxyApplication } from './proxy/application'
import { startLogging } from './logging/background'
import { createProxyLogObserver } from './logging/proxy'
import { createFlowLogger } from './logging/flow-logger'
import { executeScriptRequest, injectScript } from './script-execution'

startLogging()

const storage = createStorageAdapter()
const proxyConfigPersistence = createProxyConfigPersistence({
  read: async () => (await storage.get('proxyConfig')) as ProxyConfig | undefined,
  write: config => storage.set('proxyConfig', config)
})
const notifications = createProxySuccessNotifications(notificationIcon)
const flowLogs = createFlowLogger()
const proxyLogs = createProxyLogObserver(flowLogs)
const readActiveTabId = async () =>
  (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0]?.id
const proxyManager = new ProxyManager(
  {
    redirect: new RedirectProxy(),
    response: new ResponseProxy(notifications, () => proxyConfigPersistence.disable(), flowLogs)
  },
  (rules, types, scope) => {
    notifications.update(rules, types)
    proxyLogs.update(rules, types, scope)
    if (scope && !rules.length) flowLogs.cancelAllProxies()
  },
  { readActiveTabId }
)

const proxyApplication = createProxyApplication({
  manager: proxyManager,
  persistence: proxyConfigPersistence,
  readConfig: async () => (await storage.get('proxyConfig')) as ProxyConfig | undefined,
  readStatus: async () =>
    (await chrome.storage.session.get('proxyRuntimeStatus')).proxyRuntimeStatus,
  publish: status => chrome.storage.session.set({ proxyRuntimeStatus: status })
})

const refreshProxyConfiguration = () =>
  proxyApplication.refresh().catch(error => {
    flowLogs.cancelAllProxies()
    logError('Proxy configuration update failed:', error)
  })

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.proxyConfig) refreshProxyConfiguration()
})

chrome.tabs.onActivated.addListener(() => refreshProxyConfiguration())
chrome.windows.onFocusChanged.addListener(() => refreshProxyConfiguration())

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
    void proxyApplication
      .save(request.config as ProxyConfig, request.updateEnabled === true)
      .then(runtimeStatus => sendResponse({ success: true, runtimeStatus }))
      .catch(error => {
        logError('保存代理配置失败:', error)
        sendResponse({
          success: false,
          error: error instanceof Error ? error.message : String(error),
          runtimeStatus: proxyApplication.getStatus()
        })
      })
    return true
  }

  if (request.action === 'executeScript') {
    void executeScriptRequest(request, {
      logs: flowLogs,
      createExecutionId: () => crypto.randomUUID(),
      readActiveTab: async () =>
        (await chrome.tabs.query({ active: true, currentWindow: true }))[0]?.id,
      inject: injectScript
    }).then(sendResponse)
    return true
  }
})
