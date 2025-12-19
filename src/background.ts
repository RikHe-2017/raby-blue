import type { ProxyConfig, ProxyGroup, ProxyRule } from './types/proxy'
import { isProxyGroup, isProxyRule } from './types/proxy'

let proxyConfig: ProxyConfig = {
  enabled: false,
  groups: []
}

// Chrome Storage 可能将数组存储为对象，需要转换回数组结构
interface ChromeStorageGroup {
  [key: string]: unknown
  id?: string
  name?: string
  enabled?: boolean
  type?: string
  rules?: Record<string, unknown> | unknown[]
  children?: Record<string, unknown> | unknown[]
}

interface ChromeStorageConfig {
  enabled?: boolean
  groups?: Record<string, ChromeStorageGroup> | ProxyGroup[]
}

// 递归转换分组数据：将对象结构转换为数组结构
const convertGroupToArray = (group: unknown): ProxyGroup => {
  const groupObj = group as ChromeStorageGroup
  const convertedGroup: Partial<ProxyGroup> = {
    id: groupObj.id as string,
    name: groupObj.name as string,
    enabled: groupObj.enabled as boolean,
    type: 'group' as const,
    children: []
  }

  // 转换 rules（如果存在且是对象）
  if (groupObj.rules && typeof groupObj.rules === 'object' && !Array.isArray(groupObj.rules)) {
    convertedGroup.children = Object.values(groupObj.rules) as ProxyRule[]
  }

  // 递归转换 children
  if (
    groupObj.children &&
    typeof groupObj.children === 'object' &&
    !Array.isArray(groupObj.children)
  ) {
    const convertedChildren = Object.values(groupObj.children).map(convertGroupToArray)
    if (convertedGroup.children) {
      convertedGroup.children.push(...convertedChildren)
    } else {
      convertedGroup.children = convertedChildren
    }
  }

  return convertedGroup as ProxyGroup
}

// 数据转换函数：将对象结构转换为数组结构
const convertChromeStorageToArray = (
  data: ChromeStorageConfig | ProxyConfig | null
): ProxyConfig => {
  if (!data) {
    return { enabled: false, groups: [] }
  }

  // 如果 groups 是对象（Chrome Storage 的数组转对象问题），需要转换
  if (data.groups && typeof data.groups === 'object' && !Array.isArray(data.groups)) {
    const convertedGroups = Object.values(data.groups).map(convertGroupToArray)
    return {
      enabled: data.enabled ?? false,
      groups: convertedGroups
    }
  }

  // 已经是数组结构，直接返回
  return data as ProxyConfig
}

// 构建declarativeNetRequest规则 - 借鉴XSwitch的匹配逻辑
const buildDeclarativeRules = (rules: ProxyRule[]): chrome.declarativeNetRequest.Rule[] => {
  return rules.map((rule, index) => {
    const sourceUrl = rule.sourceUrl
    const targetUrl = rule.targetUrl

    // 借鉴XSwitch的匹配逻辑
    const hasRegexChars = /[\\|\[|\]|\(|\)|\*|\$|\^]/.test(sourceUrl)

    let condition: chrome.declarativeNetRequest.RuleCondition = {
      resourceTypes: [
        'main_frame',
        'sub_frame',
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
        'other'
      ] as chrome.declarativeNetRequest.ResourceType[]
    }

    let redirectUrl = targetUrl

    if (hasRegexChars) {
      // 正则表达式匹配
      try {
        // 处理 ?? 特殊语法
        const regexPattern = sourceUrl.replace(/\?\?/g, '\\?\\?')
        condition.regexFilter = regexPattern

        // 对于正则表达式，我们需要构建替换URL
        // 使用捕获组来保留匹配的部分
        redirectUrl = targetUrl + '\\1'
      } catch (e) {
        console.error('Regex pattern error:', e)
        condition.urlFilter = sourceUrl
      }
    } else {
      // 字符串匹配 - 使用XSwitch的简单替换逻辑
      // 对于字符串匹配，我们需要特殊处理
      // 因为declarativeNetRequest不支持直接的字符串替换
      // 我们需要使用正则表达式来实现类似的效果
      const escapedSource = sourceUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      condition.regexFilter = escapedSource + '(.*)'
      redirectUrl = targetUrl + '\\1'
    }
    const declarativeRule: chrome.declarativeNetRequest.Rule = {
      id: index + 1,
      priority: 1,
      action: {
        type: 'redirect' as chrome.declarativeNetRequest.RuleActionType,
        redirect: {
          regexSubstitution: redirectUrl
        }
      },
      condition
    }

    console.log(`Rule ${index + 1}:`, {
      name: rule.name,
      sourceUrl: sourceUrl,
      targetUrl: targetUrl,
      condition: condition,
      redirectUrl: redirectUrl
    })

    return declarativeRule
  })
}

// 扩展启动日志
console.log('🚀 RabyBlue Extension Started')
console.log('📋 Extension ID:', chrome.runtime.id)
console.log('📅 Start Time:', new Date().toISOString())

// Load configuration from storage
chrome.storage.local.get('proxyConfig', result => {
  console.log('📦 Loading configuration from storage:', result)
  if (result.proxyConfig) {
    proxyConfig = convertChromeStorageToArray(result.proxyConfig)
    console.log('✅ Configuration loaded:', proxyConfig)
    updateDeclarativeRules()
  } else {
    console.log('⚠️ No configuration found, using default')
  }
})

// Listen for configuration changes
chrome.storage.onChanged.addListener(changes => {
  if (changes.proxyConfig) {
    proxyConfig = convertChromeStorageToArray(changes.proxyConfig.newValue)
    updateDeclarativeRules()
  }
})

// Update declarative net request rules
async function updateDeclarativeRules() {
  // Remove existing rules
  const existingRules = await chrome.declarativeNetRequest.getDynamicRules()
  const ruleIds = existingRules.map(rule => rule.id)

  if (ruleIds.length > 0) {
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: ruleIds
    })
  }

  if (!proxyConfig.enabled) {
    console.log('Global proxy is disabled, no rules added')
    return
  }

  // Get all enabled rules
  const enabledRules = getAllEnabledRules(proxyConfig.groups)

  if (enabledRules.length === 0) {
    console.log('No enabled rules found')
    return
  }

  // Build declarative rules using XSwitch-like logic
  const rules = buildDeclarativeRules(enabledRules)

  // Add new rules
  await chrome.declarativeNetRequest.updateDynamicRules({
    addRules: rules
  })

  console.log('Updated declarative rules:', rules)
}

// Get all enabled rules from groups recursively
function getAllEnabledRules(groups: ProxyGroup[]): ProxyRule[] {
  const rules: ProxyRule[] = []

  for (const group of groups) {
    // Check rules in current group (from children array)
    if (group.children && Array.isArray(group.children)) {
      for (const node of group.children) {
        // Filter out ProxyRule type nodes that are enabled
        if (isProxyRule(node) && node.enabled) {
          rules.push(node)
        }
      }
    }

    // Recursively check children groups (filter ProxyGroup type)
    if (group.children && group.children.length > 0) {
      const childGroups = group.children.filter(isProxyGroup)
      if (childGroups.length > 0) {
        rules.push(...getAllEnabledRules(childGroups))
      }
    }
  }

  return rules
}

// 处理脚本执行请求
chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
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
            console.error('Script execution error:', error)
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
