import type { ProxyConfig } from './types/proxy'

let proxyConfig: ProxyConfig = {
  enabled: false,
  groups: []
}

// 递归转换分组数据：将对象结构转换为数组结构
const convertGroupToArray = (group: any): any => {
  const convertedGroup = { ...group }

  // 转换 rules
  if (group.rules && typeof group.rules === 'object' && !Array.isArray(group.rules)) {
    convertedGroup.rules = Object.values(group.rules)
  }

  // 递归转换 children
  if (group.children && typeof group.children === 'object' && !Array.isArray(group.children)) {
    convertedGroup.children = Object.values(group.children).map(convertGroupToArray)
  }

  return convertedGroup
}

// 数据转换函数：将对象结构转换为数组结构
const convertChromeStorageToArray = (data: any): any => {
  if (!data) return data

  // 如果是配置数据，需要转换 groups 和 rules
  if (data.groups && typeof data.groups === 'object' && !Array.isArray(data.groups)) {
    const convertedData = { ...data }
    convertedData.groups = Object.values(data.groups).map(convertGroupToArray)
    return convertedData
  }

  return data
}

// 构建declarativeNetRequest规则 - 借鉴XSwitch的匹配逻辑
const buildDeclarativeRules = (rules: any[]): chrome.declarativeNetRequest.Rule[] => {
  return rules.map((rule, index) => {
    const sourceUrl = rule.sourceUrl
    const targetUrl = rule.targetUrl

    // 借鉴XSwitch的匹配逻辑
    const hasRegexChars = /[\\|\[|\]|\(|\)|\*|\$|\^]/.test(sourceUrl)

    let condition: any = {
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
chrome.storage.sync.get('proxyConfig', result => {
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
function getAllEnabledRules(groups: any[]): any[] {
  const rules: any[] = []

  for (const group of groups) {
    // Check rules in current group
    if (group.rules && Array.isArray(group.rules)) {
      for (const rule of group.rules) {
        if (rule.enabled) {
          rules.push(rule)
        }
      }
    }

    // Recursively check children groups
    if (group.children && group.children.length > 0) {
      rules.push(...getAllEnabledRules(group.children))
    }
  }

  return rules
}

// 处理脚本执行请求
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'executeScript') {
    // 获取当前活动标签页
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
      if (tabs[0]?.id) {
        const tabId = tabs[0].id

        // 使用chrome.scripting.executeScript执行脚本
        chrome.scripting
          .executeScript({
            target: { tabId },
            func: new Function(request.code)
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
