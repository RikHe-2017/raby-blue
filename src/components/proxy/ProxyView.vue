<script lang="ts" setup>
  import { onMounted, onUnmounted, ref, watch, computed, nextTick } from 'vue'
  import Sidebar from './Sidebar.vue'
  import ContentHeader from './ContentHeader.vue'
  import ConfigSection from './ConfigSection.vue'
  import { useProxyStore } from '../../stores/proxy'
  import type { ProxyGroup, ProxyRule } from '../../types/proxy'

  interface TreeNode {
    id: string
    label: string
    type: 'group' | 'rule'
    enabled?: boolean
    sourceUrl?: string
    targetUrl?: string
    groupId?: string
    children?: TreeNode[]
  }

  const proxyStore = useProxyStore()
  const proxyEnabled = ref(false)
  const activeGroupId = ref<string>('')
  const activeItemId = ref<string>('')
  const jsonConfig = ref('')
  const activeItemName = ref('')
  const isNameSaved = ref(false)
  const isConfigSaved = ref(false)
  let nameSaveTimer: ReturnType<typeof setTimeout> | null = null
  let configSaveTimer: ReturnType<typeof setTimeout> | null = null
  const expandedKeys = ref<string[]>([])
  let uiStateSaveTimer: ReturnType<typeof setTimeout> | null = null

  const groups = computed(() => proxyStore.groups)

  // 递归查找分组
  const findGroupById = (groups: ProxyGroup[], id: string): ProxyGroup | null => {
    for (const group of groups) {
      if (group.id === id) {
        return group
      }
      if (group.children) {
        const found = findGroupById(group.children, id)
        if (found) return found
      }
    }
    return null
  }

  const activeGroup = computed(() => {
    return findGroupById(groups.value, activeGroupId.value)
  })

  // 判断当前选中的是否为分组
  const isActiveGroup = computed(() => {
    return !!(activeGroupId.value && activeItemId.value === activeGroupId.value)
  })

  // 当前选中的代理规则
  const activeRule = computed((): ProxyRule | null => {
    if (isActiveGroup.value) return null
    const group = activeGroup.value
    if (!group) return null
    return group.rules.find(rule => rule.id === activeItemId.value) || null
  })

  // 递归查找第一个被启用的代理规则
  const findFirstEnabledRule = (
    groups: ProxyGroup[]
  ): { groupId: string; ruleId: string } | null => {
    for (const group of groups) {
      // 先检查当前分组的代理规则
      const enabledRule = group.rules.find(rule => rule.enabled)
      if (enabledRule) {
        return { groupId: group.id, ruleId: enabledRule.id }
      }

      // 如果没有找到，递归检查子分组
      if (group.children) {
        const result = findFirstEnabledRule(group.children)
        if (result) return result
      }
    }
    return null
  }

  // 设置默认选中项
  const setDefaultActiveItem = () => {
    // 查找第一个被启用的代理规则
    const firstEnabledRule = findFirstEnabledRule(groups.value)

    if (firstEnabledRule) {
      // 如果找到启用的代理规则，激活它
      activeGroupId.value = firstEnabledRule.groupId
      activeItemId.value = firstEnabledRule.ruleId
    } else if (groups.value.length > 0) {
      // 如果没有启用的代理规则，激活第一个分组
      activeGroupId.value = groups.value[0].id
      activeItemId.value = groups.value[0].id
    }
  }

  // 默认JSON配置示例
  const defaultJsonConfig = {
    proxy: ['*.example.com/static/jquery.js', 'localhost/static/jquery.js']
  }

  onMounted(async () => {
    await proxyStore.loadConfig()
    await proxyStore.loadUIState()
    proxyEnabled.value = proxyStore.enabled

    // 确保 expandedKeys 是数组格式
    await nextTick()
    const savedExpandedKeys = Array.isArray(proxyStore.uiState.expandedKeys)
      ? [...proxyStore.uiState.expandedKeys]
      : []

    // 恢复UI状态
    if (savedExpandedKeys.length > 0) {
      // 过滤掉不存在的节点ID（可能被删除了）
      const validExpandedKeys: string[] = []
      const collectAllGroupIds = (groups: ProxyGroup[]): string[] => {
        const ids: string[] = []
        groups.forEach(group => {
          ids.push(group.id)
          if (group.children) {
            ids.push(...collectAllGroupIds(group.children))
          }
        })
        return ids
      }
      const allGroupIds = collectAllGroupIds(groups.value)
      savedExpandedKeys.forEach(id => {
        if (allGroupIds.includes(id)) {
          validExpandedKeys.push(id)
        }
      })
      await nextTick()
      expandedKeys.value = validExpandedKeys.length > 0 ? validExpandedKeys : allGroupIds
    } else {
      // 如果没有保存的状态，默认展开所有节点
      const allGroupIds: string[] = []
      const collectGroupIds = (groups: ProxyGroup[]) => {
        groups.forEach(group => {
          allGroupIds.push(group.id)
          if (group.children) {
            collectGroupIds(group.children)
          }
        })
      }
      collectGroupIds(groups.value)
      await nextTick()
      expandedKeys.value = allGroupIds
    }

    // 恢复选中状态
    if (proxyStore.uiState.activeGroupId && proxyStore.uiState.activeItemId) {
      // 验证保存的ID是否仍然存在
      const savedGroup = findGroupById(groups.value, proxyStore.uiState.activeGroupId)
      if (savedGroup) {
        // 检查是选中分组还是规则
        if (proxyStore.uiState.activeItemId === proxyStore.uiState.activeGroupId) {
          // 选中分组
          activeGroupId.value = proxyStore.uiState.activeGroupId
          activeItemId.value = proxyStore.uiState.activeGroupId
        } else {
          // 检查规则是否存在
          const rule = savedGroup.rules.find(r => r.id === proxyStore.uiState.activeItemId)
          if (rule) {
            activeGroupId.value = proxyStore.uiState.activeGroupId
            activeItemId.value = proxyStore.uiState.activeItemId
          } else {
            // 规则不存在，使用默认逻辑
            setDefaultActiveItem()
          }
        }
      } else {
        // 分组不存在，使用默认逻辑
        setDefaultActiveItem()
      }
    } else {
      // 没有保存的状态，使用默认逻辑
      setDefaultActiveItem()
    }

    // 初始化完成，允许 watch 触发保存
    isInitializing = false
  })

  // 监听选中状态变化，保存UI状态
  let isInitializing = true
  watch([activeGroupId, activeItemId], () => {
    // 初始化完成后才保存
    if (!isInitializing) {
      saveUIState()
    }
  })

  onUnmounted(() => {
    // 清理定时器
    if (nameSaveTimer) {
      clearTimeout(nameSaveTimer)
    }
    if (configSaveTimer) {
      clearTimeout(configSaveTimer)
    }
    if (uiStateSaveTimer) {
      clearTimeout(uiStateSaveTimer)
    }
    // 组件卸载前保存一次UI状态
    proxyStore.uiState.expandedKeys = [...expandedKeys.value]
    proxyStore.uiState.activeGroupId = activeGroupId.value
    proxyStore.uiState.activeItemId = activeItemId.value
    proxyStore.saveUIState()
  })

  watch(
    () => proxyStore.enabled,
    newValue => {
      proxyEnabled.value = newValue
    }
  )

  // 监听活动项目变化
  watch(
    [activeGroup, activeRule],
    ([group, rule]) => {
      if (isActiveGroup.value && group) {
        // 当前选中的是分组
        activeItemName.value = group.name
        jsonConfig.value = ''
        isNameSaved.value = true
        isConfigSaved.value = true
      } else if (rule) {
        // 当前选中的是代理规则
        activeItemName.value = rule.name
        // 如果代理规则有配置，使用实际配置，否则使用默认示例
        if (rule.sourceUrl && rule.targetUrl) {
          const config = {
            proxy: [rule.sourceUrl, rule.targetUrl]
          }
          jsonConfig.value = JSON.stringify(config, null, 2)
        } else {
          jsonConfig.value = JSON.stringify(defaultJsonConfig, null, 2)
        }
        isNameSaved.value = true
        isConfigSaved.value = true
      } else {
        activeItemName.value = ''
        jsonConfig.value = JSON.stringify(defaultJsonConfig, null, 2)
        isNameSaved.value = false
        isConfigSaved.value = false
      }
    },
    { immediate: true }
  )

  // 监听展开状态变化，保存UI状态
  watch(
    expandedKeys,
    () => {
      // 初始化完成后才保存
      if (!isInitializing) {
        saveUIState()
      }
    },
    { deep: true }
  )

  // 保存UI状态（防抖）
  const saveUIState = () => {
    // 清除之前的定时器
    if (uiStateSaveTimer) {
      clearTimeout(uiStateSaveTimer)
    }

    // 防抖保存，300ms后保存
    uiStateSaveTimer = setTimeout(() => {
      proxyStore.uiState.expandedKeys = [...expandedKeys.value]
      proxyStore.uiState.activeGroupId = activeGroupId.value
      proxyStore.uiState.activeItemId = activeItemId.value
      proxyStore.saveUIState()
    }, 300)
  }

  const handleGlobalProxyToggle = () => {
    proxyStore.toggleGlobalProxy()
  }

  const handleNodeClick = (data: TreeNode) => {
    if (data.type === 'group') {
      // 点击分组，设置为活动分组和活动项目
      activeGroupId.value = data.id
      activeItemId.value = data.id
    } else if (data.type === 'rule') {
      // 点击代理规则，设置其所属分组为活动分组，规则为活动项目
      activeGroupId.value = data.groupId!
      activeItemId.value = data.id
    }
    // 保存UI状态
    saveUIState()
  }

  // 处理节点展开
  const handleNodeExpand = (data: TreeNode) => {
    if (!expandedKeys.value.includes(data.id)) {
      expandedKeys.value.push(data.id)
    }
    // 初始化完成后才保存
    if (!isInitializing) {
      saveUIState()
    }
  }

  // 处理节点折叠
  const handleNodeCollapse = (data: TreeNode) => {
    const index = expandedKeys.value.indexOf(data.id)
    if (index > -1) {
      expandedKeys.value.splice(index, 1)
    }
    // 初始化完成后才保存
    if (!isInitializing) {
      saveUIState()
    }
  }

  const handleCheckboxChange = (data: TreeNode) => {
    // 现在只有代理规则会有复选框
    if (data.type === 'rule') {
      proxyStore.updateRule(data.groupId!, data.id, { enabled: data.enabled })

      // 如果当前没有选中的代理规则，自动激活第一个被启用的代理
      if (!activeItemId.value || activeItemId.value === activeGroupId.value) {
        const firstEnabledRule = findFirstEnabledRule(groups.value)
        if (firstEnabledRule) {
          activeGroupId.value = firstEnabledRule.groupId
          activeItemId.value = firstEnabledRule.ruleId
        }
      }
    }
  }

  const handleAddGroup = () => {
    const newGroup: ProxyGroup = {
      id: crypto.randomUUID(),
      name: '新分类',
      enabled: false,
      rules: []
    }
    proxyStore.addGroup(newGroup)
    if (!activeGroupId.value) {
      activeGroupId.value = newGroup.id
    }
  }

  const handleAddProxy = () => {
    if (!activeGroupId.value) {
      // 如果没有选中分组，创建一个默认分组
      handleAddGroup()
      return
    }
    handleAddProxyToGroup(activeGroupId.value)
  }

  const handleAddProxyToGroup = (groupId: string) => {
    const newRule: ProxyRule = {
      id: crypto.randomUUID(),
      name: '新代理',
      sourceUrl: '',
      targetUrl: '',
      enabled: false,
      groupId
    }
    proxyStore.addRule(groupId, newRule)
  }

  const handleDuplicateRule = (ruleData: TreeNode) => {
    const duplicatedRule: ProxyRule = {
      id: crypto.randomUUID(),
      name: `${ruleData.label} - 副本`,
      sourceUrl: ruleData.sourceUrl || '',
      targetUrl: ruleData.targetUrl || '',
      enabled: false,
      groupId: ruleData.groupId!
    }
    proxyStore.addRule(ruleData.groupId!, duplicatedRule)
  }

  const handleEditRule = (ruleData: TreeNode) => {
    // 设置当前规则为活动项目，进入编辑模式
    activeGroupId.value = ruleData.groupId!
    activeItemId.value = ruleData.id
  }

  const handleDeleteRule = (ruleData: TreeNode) => {
    // 删除代理规则
    proxyStore.deleteRule(ruleData.groupId!, ruleData.id)

    // 如果删除的是当前选中的规则，清空选中状态
    if (activeItemId.value === ruleData.id) {
      activeItemId.value = ''
      activeItemName.value = ''
      jsonConfig.value = JSON.stringify(defaultJsonConfig, null, 2)
    }

    ElMessage.success('代理规则已删除')
  }

  const handleDeleteGroup = (groupId: string) => {
    proxyStore.deleteGroup(groupId)
    if (activeGroupId.value === groupId) {
      activeGroupId.value = groups.value.length > 0 ? groups.value[0].id : ''
    }
  }

  const handleSaveItemName = async () => {
    if (isActiveGroup.value && activeGroupId.value && activeItemName.value.trim()) {
      proxyStore.updateGroup(activeGroupId.value, { name: activeItemName.value.trim() })
      isNameSaved.value = true
    } else if (activeRule.value && activeItemName.value.trim()) {
      proxyStore.updateRule(activeGroupId.value, activeRule.value.id, {
        name: activeItemName.value.trim()
      })
      isNameSaved.value = true
    }
  }

  // 监听名称变化，实时保存
  watch(activeItemName, () => {
    if (!activeGroupId.value) return

    isNameSaved.value = false

    // 清除之前的定时器
    if (nameSaveTimer) {
      clearTimeout(nameSaveTimer)
    }

    // 防抖保存，500ms后保存
    nameSaveTimer = setTimeout(() => {
      handleSaveItemName()
    }, 500)
  })

  // 导出配置功能
  const handleExportConfig = () => {
    try {
      const exportData = {
        version: '1.0.0',
        exportTime: new Date().toISOString(),
        config: proxyStore.config
      }

      const dataStr = JSON.stringify(exportData, null, 2)
      const dataBlob = new Blob([dataStr], { type: 'application/json' })

      const link = document.createElement('a')
      link.href = URL.createObjectURL(dataBlob)
      link.download = `proxy-config-${new Date().toISOString().slice(0, 10)}.json`
      link.click()

      URL.revokeObjectURL(link.href)
      ElMessage.success('配置导出成功')
    } catch (error) {
      console.error('导出配置失败:', error)
      ElMessage.error('导出配置失败')
    }
  }

  // 导入配置功能
  const handleImportConfig = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json'
    input.onchange = async event => {
      const file = (event.target as HTMLInputElement).files?.[0]
      if (!file) return

      try {
        const text = await file.text()
        const importData = JSON.parse(text)

        // 验证导入数据的格式
        if (!importData.config || !importData.config.groups) {
          throw new Error('无效的配置文件格式')
        }

        // 确认是否要覆盖现有配置
        const confirmMessage = '导入配置将覆盖现有配置，是否继续？'
        if (confirm(confirmMessage)) {
          // 更新配置
          proxyStore.config.enabled = importData.config.enabled
          proxyStore.config.groups = importData.config.groups

          // 保存配置
          await proxyStore.saveConfig()

          ElMessage.success('配置导入成功')
        }
      } catch (error) {
        console.error('导入配置失败:', error)
        ElMessage.error(`导入配置失败: ${error instanceof Error ? error.message : '未知错误'}`)
      }
    }
    input.click()
  }

  const handleJsonInput = (value: string) => {
    const config = JSON.parse(value)
    // 这里可以添加JSON验证逻辑
    console.log('JSON配置已更新:', config)
  }

  const saveJsonConfig = () => {
    try {
      const config = JSON.parse(jsonConfig.value)

      // 验证配置格式
      if (!config.proxy || !Array.isArray(config.proxy)) {
        throw new Error('配置格式错误：缺少 proxy 数组')
      }

      // 只处理代理规则，不处理分组
      if (activeRule.value) {
        // 解析代理规则
        const proxyRules = config.proxy

        // 解析 "源地址 -> 目标地址" 格式
        if (Array.isArray(proxyRules) && proxyRules.length === 2) {
          const [sourceUrl, targetUrl] = proxyRules

          // 更新代理规则
          proxyStore.updateRule(activeGroupId.value, activeRule.value.id, {
            sourceUrl: sourceUrl.trim(),
            targetUrl: targetUrl.trim()
          })

          isConfigSaved.value = true
        } else {
          throw new Error('代理规则格式错误：应为 ["源地址", "目标地址"] 格式')
        }
      } else {
        throw new Error('请先选择一个代理规则')
      }
    } catch (e) {
      console.error('保存配置失败:', e)
      isConfigSaved.value = false
    }
  }

  // 监听JSON配置变化，实时保存
  watch(jsonConfig, () => {
    if (!activeRule.value) return

    isConfigSaved.value = false

    // 清除之前的定时器
    if (configSaveTimer) {
      clearTimeout(configSaveTimer)
    }

    // 防抖保存，800ms后保存（JSON解析需要更多时间）
    configSaveTimer = setTimeout(() => {
      saveJsonConfig()
    }, 800)
  })

  const formatJson = () => {
    const config = JSON.parse(jsonConfig.value)
    jsonConfig.value = JSON.stringify(config, null, 2)
  }
</script>

<template>
  <div class="proxy-view">
    <!-- 左侧分组列表 -->
    <Sidebar
      :groups="groups"
      :expanded-keys="expandedKeys"
      :active-item-id="activeItemId"
      @node-click="handleNodeClick"
      @node-expand="handleNodeExpand"
      @node-collapse="handleNodeCollapse"
      @checkbox-change="handleCheckboxChange"
      @add-group="handleAddGroup"
      @add-proxy="handleAddProxy"
      @export-config="handleExportConfig"
      @import-config="handleImportConfig"
      @duplicate-rule="handleDuplicateRule"
      @edit-rule="handleEditRule"
      @delete-rule="handleDeleteRule"
      @delete-group="handleDeleteGroup"
    />

    <!-- 右侧内容区域 -->
    <div class="proxy-view__content">
      <ContentHeader :proxy-enabled="proxyEnabled" @toggle-proxy="handleGlobalProxyToggle" />

      <div class="proxy-view__content-body">
        <ConfigSection
          :active-group-id="activeGroupId"
          :is-active-group="isActiveGroup"
          :active-rule="activeRule"
          :active-item-name="activeItemName"
          :json-config="jsonConfig"
          :is-name-saved="isNameSaved"
          :is-config-saved="isConfigSaved"
          @update:active-item-name="val => (activeItemName = val)"
          @update:json-config="val => (jsonConfig = val)"
          @json-input="handleJsonInput"
          @format-json="formatJson"
        />
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
  .proxy-view {
    display: flex;
    width: 100%;
    height: 100%;
  }

  .proxy-view__content {
    flex: 1;
    display: flex;
    flex-direction: column;
    background: var(--el-bg-color-page);
  }

  .proxy-view__content-body {
    flex: 1;
    padding: 8px;
    overflow-y: auto;
  }
</style>
