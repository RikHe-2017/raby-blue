<script lang="ts" setup>
  import { onMounted, onUnmounted, ref, watch, computed } from 'vue'
  import Sidebar from './Sidebar.vue'
  import ContentHeader from './ContentHeader.vue'
  import ConfigSection from './ConfigSection.vue'
  import { useProxyStore } from '../../stores/proxy'
  import type { ProxyGroup, ProxyRule, ProxyNode } from '../../types/proxy'
  import { isProxyGroup, isProxyRule } from '../../types/proxy'

  const proxyStore = useProxyStore()
  const proxyEnabled = ref(false)
  // 内容区域的状态（不需要持久化）
  const activeGroupId = ref<string>('')
  const activeItemId = ref<string>('')
  const sourceUrl = ref('')
  const targetUrl = ref('')
  const activeItemName = ref('')
  const isNameSaved = ref(false)
  const isConfigSaved = ref(false)
  let nameSaveTimer: ReturnType<typeof setTimeout> | null = null
  let configSaveTimer: ReturnType<typeof setTimeout> | null = null
  let pendingConfigSave: (() => void) | null = null

  const groups = computed(() => proxyStore.groups || [])

  // 递归查找分组
  const findGroupById = (groups: ProxyGroup[], id: string): ProxyGroup | null => {
    for (const group of groups) {
      if (group.id === id) {
        return group
      }
      // 从 children 中过滤出 ProxyGroup 类型，递归查找
      const childGroups = group.children.filter(isProxyGroup)
      if (childGroups.length > 0) {
        const found = findGroupById(childGroups, id)
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
    const rule = group.children.find(node => isProxyRule(node) && node.id === activeItemId.value)
    return rule && isProxyRule(rule) ? rule : null
  })

  // 递归查找第一个被启用的代理规则
  const findFirstEnabledRule = (
    groups: ProxyGroup[]
  ): { groupId: string; ruleId: string } | null => {
    for (const group of groups) {
      // 先检查当前分组的代理规则（从 children 中过滤出规则）
      const enabledRule = group.children.find(node => isProxyRule(node) && node.enabled)
      if (enabledRule && isProxyRule(enabledRule)) {
        return { groupId: group.id, ruleId: enabledRule.id }
      }

      // 如果没有找到，递归检查子分组
      const childGroups = group.children.filter(isProxyGroup)
      if (childGroups.length > 0) {
        const result = findFirstEnabledRule(childGroups)
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

  const savePendingConfig = () => {
    if (configSaveTimer) {
      clearTimeout(configSaveTimer)
      configSaveTimer = null
    }

    const save = pendingConfigSave
    pendingConfigSave = null
    save?.()
  }

  onMounted(async () => {
    await proxyStore.loadConfig()
    proxyEnabled.value = proxyStore.enabled

    // 恢复内容区域的选中状态（从 Tree 保存的状态中恢复）
    await proxyStore.loadUIState()
    if (proxyStore.uiState.activeGroupId && proxyStore.uiState.activeItemId) {
      const savedGroup = findGroupById(groups.value, proxyStore.uiState.activeGroupId)
      if (savedGroup) {
        if (proxyStore.uiState.activeItemId === proxyStore.uiState.activeGroupId) {
          activeGroupId.value = proxyStore.uiState.activeGroupId
          activeItemId.value = proxyStore.uiState.activeGroupId
        } else {
          const rule = savedGroup.children.find(
            node => isProxyRule(node) && node.id === proxyStore.uiState.activeItemId
          )
          if (rule) {
            activeGroupId.value = proxyStore.uiState.activeGroupId
            activeItemId.value = proxyStore.uiState.activeItemId
          } else {
            setDefaultActiveItem()
          }
        }
      } else {
        setDefaultActiveItem()
      }
    } else {
      setDefaultActiveItem()
    }
  })

  onUnmounted(() => {
    // 清理定时器
    if (nameSaveTimer) {
      clearTimeout(nameSaveTimer)
    }
    savePendingConfig()
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
      savePendingConfig()

      if (isActiveGroup.value && group) {
        // 当前选中的是分组
        activeItemName.value = group.name
        sourceUrl.value = ''
        targetUrl.value = ''
        isNameSaved.value = true
        isConfigSaved.value = true
      } else if (rule) {
        // 当前选中的是代理规则
        activeItemName.value = rule.name
        sourceUrl.value = rule.sourceUrl
        targetUrl.value = rule.targetUrl
        isNameSaved.value = true
        isConfigSaved.value = true
      } else {
        activeItemName.value = ''
        sourceUrl.value = ''
        targetUrl.value = ''
        isNameSaved.value = false
        isConfigSaved.value = false
      }
    },
    { immediate: true }
  )

  const handleGlobalProxyToggle = () => {
    proxyStore.toggleGlobalProxy()
  }

  // 监听内容区域状态变化，保存到 store（用于内容区域恢复）
  watch([activeGroupId, activeItemId], () => {
    proxyStore.uiState.activeGroupId = activeGroupId.value
    proxyStore.uiState.activeItemId = activeItemId.value
    proxyStore.saveUIState()
  })

  const handleEditRule = (ruleData: ProxyNode) => {
    if (!isProxyRule(ruleData)) return
    // 设置当前规则为活动项目，进入编辑模式
    activeGroupId.value = ruleData.groupId
    activeItemId.value = ruleData.id
  }

  // 监听 groups 变化，处理删除后的 UI 状态清理
  watch(
    groups,
    () => {
      // 检查当前选中的规则是否还存在
      if (
        activeRule.value === null &&
        activeItemId.value &&
        activeItemId.value !== activeGroupId.value
      ) {
        // 规则被删除了，清空选中状态
        activeItemId.value = ''
        activeItemName.value = ''
      }
      // 检查当前选中的分组是否还存在
      if (activeGroup.value === null && activeGroupId.value) {
        // 分组被删除了，切换到第一个分组或清空
        activeGroupId.value = groups.value.length > 0 ? groups.value[0].id : ''
        activeItemId.value = activeGroupId.value || ''
      }
    },
    { deep: true }
  )

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

  const updateProxyAddress = (field: 'sourceUrl' | 'targetUrl', value: string) => {
    if (!activeRule.value) return

    if (field === 'sourceUrl') sourceUrl.value = value
    else targetUrl.value = value

    const groupId = activeGroupId.value
    const ruleId = activeRule.value.id
    const addresses = {
      sourceUrl: sourceUrl.value.trim(),
      targetUrl: targetUrl.value.trim()
    }
    isConfigSaved.value = false
    pendingConfigSave = () => {
      proxyStore.updateRule(groupId, ruleId, addresses)
      if (activeGroupId.value === groupId && activeRule.value?.id === ruleId) {
        isConfigSaved.value = true
      }
    }

    if (configSaveTimer) clearTimeout(configSaveTimer)
    configSaveTimer = setTimeout(savePendingConfig, 500)
  }
</script>

<template>
  <div class="proxy-view">
    <!-- 左侧分组列表 -->
    <Sidebar
      :groups="groups"
      :active-group-id="activeGroupId"
      @update:active-group-id="val => (activeGroupId = val)"
      @update:active-item-id="val => (activeItemId = val)"
      @edit-rule="handleEditRule"
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
          :source-url="sourceUrl"
          :target-url="targetUrl"
          :is-name-saved="isNameSaved"
          :is-config-saved="isConfigSaved"
          @update:active-item-name="val => (activeItemName = val)"
          @update:source-url="val => updateProxyAddress('sourceUrl', val)"
          @update:target-url="val => updateProxyAddress('targetUrl', val)"
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
