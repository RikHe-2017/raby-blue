<script lang="ts" setup>
  import { onMounted, ref, watch, computed } from 'vue'
  import {
    ElButton,
    ElSwitch,
    ElInput,
    ElEmpty,
    ElTree,
    ElIcon,
    ElDropdown,
    ElDropdownMenu,
    ElDropdownItem
  } from 'element-plus'
  import { Plus, Delete, Search, Setting } from '@element-plus/icons-vue'
  import type { FilterNodeMethodFunction, TreeInstance } from 'element-plus'
  import { useProxyStore } from './stores/proxy'
  import type { ProxyGroup, ProxyRule } from './types/proxy'
  import { ElMessage } from 'element-plus'

  const proxyStore = useProxyStore()
  const proxyEnabled = ref(false)
  const activeGroupId = ref<string>('')
  const activeItemId = ref<string>('')
  const jsonConfig = ref('')
  const filterText = ref('')
  const treeRef = ref<TreeInstance>()
  const activeItemName = ref('')

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
    return activeGroupId.value && activeItemId.value === activeGroupId.value
  })

  // 当前选中的代理规则
  const activeRule = computed(() => {
    if (isActiveGroup.value) return null
    const group = activeGroup.value
    if (!group) return null
    return group.rules.find(rule => rule.id === activeItemId.value)
  })

  // 递归构建树形数据结构
  const buildTreeData = (groups: ProxyGroup[]): any[] => {
    return groups.map(group => ({
      id: group.id,
      label: group.name,
      type: 'group',
      enabled: group.enabled,
      children: [
        // 子分组
        ...(group.children ? buildTreeData(group.children) : []),
        // 代理规则
        ...group.rules.map(rule => ({
          id: rule.id,
          label: rule.name,
          type: 'rule',
          enabled: rule.enabled,
          sourceUrl: rule.sourceUrl,
          targetUrl: rule.targetUrl,
          groupId: group.id
        }))
      ]
    }))
  }

  // 树形数据结构
  const treeData = computed(() => {
    return buildTreeData(groups.value)
  })

  const treeProps = {
    children: 'children',
    label: 'label'
  }

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

  onMounted(async () => {
    await proxyStore.loadConfig()
    proxyEnabled.value = proxyStore.enabled

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
  })

  // 监听搜索文本变化
  watch(filterText, val => {
    treeRef.value?.filter(val)
  })

  // 默认JSON配置示例
  const defaultJsonConfig = {
    proxy: ['*.example.com/static/jquery.js', 'localhost/static/jquery.js']
  }

  // 监听活动项目变化
  watch(
    [activeGroup, activeRule],
    ([group, rule]) => {
      if (isActiveGroup.value && group) {
        // 当前选中的是分组
        activeItemName.value = group.name
        jsonConfig.value = ''
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
      } else {
        activeItemName.value = ''
        jsonConfig.value = JSON.stringify(defaultJsonConfig, null, 2)
      }
    },
    { immediate: true }
  )

  watch(
    () => proxyStore.enabled,
    newValue => {
      proxyEnabled.value = newValue
    }
  )

  // 节点过滤方法
  const filterNode: FilterNodeMethodFunction = (value: string, data: any) => {
    if (!value) return true
    return data.label.toLowerCase().includes(value.toLowerCase())
  }

  const handleGlobalProxyToggle = () => {
    proxyStore.toggleGlobalProxy()
  }

  const handleNodeClick = (data: any) => {
    if (data.type === 'group') {
      // 点击分组，设置为活动分组和活动项目
      activeGroupId.value = data.id
      activeItemId.value = data.id
    } else if (data.type === 'rule') {
      // 点击代理规则，设置其所属分组为活动分组，规则为活动项目
      activeGroupId.value = data.groupId
      activeItemId.value = data.id
    }
  }

  const handleCheckboxChange = (data: any) => {
    // 现在只有代理规则会有复选框
    if (data.type === 'rule') {
      proxyStore.updateRule(data.groupId, data.id, { enabled: data.enabled })

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

  const handleDropdownCommand = (command: string) => {
    if (command === 'category') {
      handleAddGroup()
    } else if (command === 'proxy') {
      handleAddProxy()
    }
  }

  const handleNodeDropdownCommand = (command: string, parentData: any) => {
    if (command === 'category') {
      handleAddSubGroup(parentData)
    } else if (command === 'proxy') {
      handleAddProxyToGroup(parentData)
    }
  }

  const handleRuleDropdownCommand = (command: string, ruleData: any) => {
    if (command === 'duplicate') {
      handleDuplicateRule(ruleData)
    } else if (command === 'edit') {
      handleEditRule(ruleData)
    } else if (command === 'delete') {
      handleDeleteRule(ruleData)
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

  const handleAddSubGroup = (parentData: any) => {
    const newGroup: ProxyGroup = {
      id: crypto.randomUUID(),
      name: '新分类',
      enabled: false,
      rules: []
    }
    proxyStore.addGroup(newGroup, parentData.id)
    // 设置新创建的分组为活动分组
    activeGroupId.value = newGroup.id
    activeItemId.value = newGroup.id
  }

  const handleAddProxy = () => {
    if (!activeGroupId.value) {
      // 如果没有选中分组，创建一个默认分组
      handleAddGroup()
      return
    }
    handleAddProxyToGroup({ id: activeGroupId.value })
  }

  const handleAddProxyToGroup = (parentData: any) => {
    const newRule: ProxyRule = {
      id: crypto.randomUUID(),
      name: '新代理',
      sourceUrl: '',
      targetUrl: '',
      enabled: false,
      groupId: parentData.id
    }
    proxyStore.addRule(parentData.id, newRule)
  }

  const handleDuplicateRule = (ruleData: any) => {
    const duplicatedRule: ProxyRule = {
      id: crypto.randomUUID(),
      name: `${ruleData.label} - 副本`,
      sourceUrl: ruleData.sourceUrl,
      targetUrl: ruleData.targetUrl,
      enabled: false,
      groupId: ruleData.groupId
    }
    proxyStore.addRule(ruleData.groupId, duplicatedRule)
  }

  const handleEditRule = (ruleData: any) => {
    // 设置当前规则为活动项目，进入编辑模式
    activeGroupId.value = ruleData.groupId
    activeItemId.value = ruleData.id
  }

  const handleDeleteRule = (ruleData: any) => {
    // 删除代理规则
    proxyStore.deleteRule(ruleData.groupId, ruleData.id)

    // 如果删除的是当前选中的规则，清空选中状态
    if (activeItemId.value === ruleData.id) {
      activeItemId.value = ''
      activeItemName.value = ''
      jsonConfig.value = JSON.stringify(defaultJsonConfig, null, 2)
    }

    ElMessage.success('代理规则已删除')
  }

  const handleSaveItemName = () => {
    if (isActiveGroup.value && activeGroupId.value && activeItemName.value.trim()) {
      proxyStore.updateGroup(activeGroupId.value, { name: activeItemName.value.trim() })
    } else if (activeRule.value && activeItemName.value.trim()) {
      proxyStore.updateRule(activeGroupId.value, activeRule.value.id, {
        name: activeItemName.value.trim()
      })
    }
  }

  const handleDeleteGroup = (groupId: string) => {
    proxyStore.deleteGroup(groupId)
    if (activeGroupId.value === groupId) {
      activeGroupId.value = groups.value.length > 0 ? groups.value[0].id : ''
    }
  }

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

  // 处理导出导入命令
  const handleExportImportCommand = (command: string) => {
    if (command === 'export') {
      handleExportConfig()
    } else if (command === 'import') {
      handleImportConfig()
    }
  }

  const handleJsonInput = (value: string) => {
    try {
      const config = JSON.parse(value)
      // 这里可以添加JSON验证逻辑
      console.log('JSON配置已更新:', config)
    } catch (e) {
      // JSON格式错误，忽略
    }
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

          // 显示成功消息
          ElMessage.success('配置保存成功')
        } else {
          throw new Error('代理规则格式错误：应为 ["源地址", "目标地址"] 格式')
        }
      } else {
        throw new Error('请先选择一个代理规则')
      }
    } catch (e) {
      console.error('保存配置失败:', e)
      ElMessage.error(`保存失败: ${e instanceof Error ? e.message : '未知错误'}`)
    }
  }

  const formatJson = () => {
    try {
      const config = JSON.parse(jsonConfig.value)
      jsonConfig.value = JSON.stringify(config, null, 2)
    } catch (e) {
      console.error('JSON格式错误，无法格式化:', e)
    }
  }
</script>

<template>
  <div class="app-container">
    <!-- 左侧分组列表 -->
    <div class="sidebar">
      <div class="sidebar-header">
        <h3>代理分组</h3>
        <div class="header-actions">
          <el-dropdown @command="handleDropdownCommand">
            <el-icon class="add-icon">
              <Plus />
            </el-icon>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="category"> 创建分类 </el-dropdown-item>
                <el-dropdown-item command="proxy"> 创建代理 </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
          <el-dropdown @command="handleExportImportCommand">
            <el-icon class="export-import-icon">
              <Setting />
            </el-icon>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="export"> 导出配置 </el-dropdown-item>
                <el-dropdown-item command="import"> 导入配置 </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </div>

      <!-- 搜索框 -->
      <div class="search-container">
        <el-input
          v-model="filterText"
          placeholder="搜索分类或代理..."
          class="search-input"
          clearable
        >
          <template #prefix>
            <el-icon><Search /></el-icon>
          </template>
        </el-input>
      </div>

      <el-scrollbar class="tree-container">
        <el-tree
          ref="treeRef"
          :data="treeData"
          :props="treeProps"
          node-key="id"
          :default-expand-all="true"
          :expand-on-click-node="false"
          highlight-current
          :filter-node-method="filterNode"
        >
          <template #default="{ node, data }">
            <div
              class="tree-node"
              :class="{
                active:
                  (data.type === 'group' &&
                    data.id === activeGroupId &&
                    data.id === activeItemId) ||
                  (data.type === 'rule' && data.id === activeItemId)
              }"
              @click.stop="handleNodeClick(data)"
            >
              <div class="node-content">
                <!-- 只在代理规则显示复选框 -->
                <el-checkbox
                  v-if="data.type === 'rule'"
                  v-model="data.enabled"
                  @change="handleCheckboxChange(data)"
                  @click.stop
                  style="margin-right: 4px"
                />
                <span class="node-label">{{ node.label }}</span>
              </div>
              <div class="node-actions">
                <!-- 分组节点的操作 -->
                <template v-if="data.type === 'group'">
                  <el-dropdown @command="command => handleNodeDropdownCommand(command, data)">
                    <el-icon class="action-icon add-icon">
                      <Plus />
                    </el-icon>
                    <template #dropdown>
                      <el-dropdown-menu>
                        <el-dropdown-item command="category"> 创建分类 </el-dropdown-item>
                        <el-dropdown-item command="proxy"> 创建代理 </el-dropdown-item>
                      </el-dropdown-menu>
                    </template>
                  </el-dropdown>
                  <el-icon class="action-icon delete-icon" @click.stop="handleDeleteGroup(data.id)">
                    <Delete />
                  </el-icon>
                </template>

                <!-- 叶子节点（代理规则）的操作 -->
                <template v-else-if="data.type === 'rule'">
                  <el-dropdown @command="command => handleRuleDropdownCommand(command, data)">
                    <el-icon class="action-icon add-icon">
                      <Plus />
                    </el-icon>
                    <template #dropdown>
                      <el-dropdown-menu>
                        <el-dropdown-item command="duplicate"> 复制代理 </el-dropdown-item>
                        <el-dropdown-item command="edit"> 编辑代理 </el-dropdown-item>
                        <el-dropdown-item command="delete" divided> 删除代理 </el-dropdown-item>
                      </el-dropdown-menu>
                    </template>
                  </el-dropdown>
                </template>
              </div>
            </div>
          </template>
        </el-tree>
      </el-scrollbar>
    </div>

    <!-- 右侧内容区域 -->
    <div class="content">
      <div class="content-header">
        <div class="header-left">
          <span class="title">浏览器请求代理</span>
          <el-switch
            v-model="proxyEnabled"
            active-text="启用"
            inactive-text="禁用"
            @change="handleGlobalProxyToggle"
          />
        </div>
      </div>

      <div class="content-body">
        <div v-if="activeGroupId" class="config-section">
          <!-- 名称编辑区域 -->
          <div class="name-edit-section">
            <h4>{{ isActiveGroup ? '分组名称' : '代理名称' }}</h4>
            <el-input
              v-model="activeItemName"
              :placeholder="isActiveGroup ? '请输入分组名称' : '请输入代理名称'"
              @blur="handleSaveItemName"
              @keyup.enter="handleSaveItemName"
            />
          </div>

          <!-- 代理配置区域 -->
          <div v-if="!isActiveGroup && activeRule" class="proxy-config-section">
            <!-- JSON 编辑器区域 -->
            <div class="json-editor-section">
              <div class="editor-header">
                <h4>JSON 配置文件</h4>
                <div class="editor-actions">
                  <el-button type="primary" size="small" @click="saveJsonConfig">
                    保存配置
                  </el-button>
                  <el-button size="small" @click="formatJson"> 格式化 </el-button>
                </div>
              </div>

              <div class="json-editor-container">
                <el-input
                  v-model="jsonConfig"
                  type="textarea"
                  :rows="20"
                  placeholder="请输入JSON配置..."
                  class="json-editor"
                  @input="handleJsonInput"
                />
              </div>

              <div class="config-example">
                <h5>配置说明：</h5>
                <p class="example-text">
                  在 proxy 数组中配置代理规则，格式为 "源地址 -> 目标地址"。 支持通配符匹配，如
                  "*.example.com/*" 匹配所有 example.com 域名下的资源。
                </p>
              </div>
            </div>
          </div>
        </div>

        <div v-else class="empty-state">
          <el-empty description="请选择一个分组或代理来配置" />
        </div>
      </div>
    </div>
  </div>
</template>

<style lang="scss">
  .app-container {
    display: flex;
    width: 800px;
    height: 600px;
    background-color: $color-2;
  }

  .sidebar {
    width: 280px;
    background-color: $color-1;
    border-right: 1px solid $color-4;
    display: flex;
    flex-direction: column;

    .sidebar-header {
      padding: $space-mini;
      border-bottom: 1px solid $color-4;
      display: flex;
      justify-content: space-between;
      align-items: center;

      h3 {
        margin: 0;
        font-size: $font-size-medium;
        color: $color-12;
      }

      .header-actions {
        display: flex;
        gap: $space-mini;
        align-items: center;

        .add-icon,
        .export-import-icon {
          font-size: 18px;
          color: $color-8;
          cursor: pointer;
          transition: color 0.2s;

          &:hover {
            color: $color-10;
          }
        }
      }
    }

    .search-container {
      padding: $space-mini;
      border-bottom: 1px solid $color-4;

      .search-input {
        width: 100%;
      }
    }

    .tree-container {
      flex: 1;
      overflow-y: auto;
      padding: $space-small;

      .tree-node {
        display: flex;
        align-items: center;
        justify-content: space-between;
        width: 100%;
        padding: 0 $space-small;

        .node-content {
          display: flex;
          align-items: center;
          flex: 1;

          .node-label {
            font-size: $font-size-default;
            color: $color-12;
          }
        }

        .node-actions {
          display: flex;
          gap: $space-mini;

          .action-icon {
            font-size: 14px;
            color: $color-8;
            cursor: pointer;
            transition: color 0.2s;
            opacity: 0;

            &:hover {
              color: $color-10;
            }

            &.add-icon:hover {
              color: #409eff;
            }

            &.delete-icon:hover {
              color: #f56c6c;
            }
          }
        }

        &:hover {
          .action-icon {
            opacity: 1;
          }
        }
      }
    }
  }

  .content {
    flex: 1;
    display: flex;
    flex-direction: column;

    .content-header {
      background-color: $color-1;
      border-bottom: 1px solid $color-4;
      padding: $space-mini;

      .header-left {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: $space-mini;

        .title {
          font-size: $font-size-large;
          font-weight: bold;
          color: $color-12;
        }
      }
    }

    .content-body {
      flex: 1;
      padding: $space-mini;
      overflow-y: auto;

      .config-section {
        .name-edit-section {
          margin-bottom: $space-mini;
          padding-bottom: $space-mini;
          border-bottom: 1px solid $color-4;

          h4 {
            margin: 0 0 $space-small 0;
            font-size: $font-size-medium;
            color: $color-12;
          }
        }

        .proxy-config-section {
          .config-header {
            margin-bottom: $space-mini;

            h4 {
              margin: 0;
              font-size: $font-size-medium;
              color: $color-12;
            }
          }

          .config-form {
            margin-bottom: $space-mini;
            padding-bottom: $space-mini;
            border-bottom: 1px solid $color-4;

            .form-item {
              display: flex;
              align-items: center;
              margin-bottom: $space-small;

              label {
                width: 80px;
                font-size: $font-size-default;
                color: $color-12;
                margin-right: $space-small;
              }

              .el-input {
                flex: 1;
              }

              .el-switch {
                margin-left: $space-small;
              }
            }
          }
        }

        .json-editor-section {
          .editor-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: $space-mini;

            h4 {
              margin: 0;
              font-size: $font-size-medium;
              color: $color-12;
            }

            .editor-actions {
              display: flex;
              gap: $space-small;
            }
          }

          .json-editor-container {
            margin-bottom: $space-mini;

            .json-editor {
              font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
              font-size: $font-size-small;
              line-height: 1.5;
            }
          }

          .config-example {
            background-color: $color-1;
            border: 1px solid $color-4;
            border-radius: $radius-small;
            padding: $space-mini;

            h5 {
              margin: 0 0 $space-small 0;
              font-size: $font-size-default;
              color: $color-12;
            }

            .example-text {
              margin: 0;
              font-size: $font-size-small;
              color: $color-10;
              line-height: 1.5;
            }
          }
        }
      }

      .empty-state {
        display: flex;
        justify-content: center;
        align-items: center;
        height: 100%;
      }
    }
  }

  // 自定义树形组件样式
  :deep(.el-tree) {
    background: transparent;

    .el-tree-node__content {
      height: auto;
      padding: $space-mini 0;

      &:hover {
        background-color: $color-3;
      }
    }

    .el-tree-node.is-current > .el-tree-node__content {
      background-color: $theme-primary-light !important;
      border-left: 3px solid $theme-primary;
      padding-left: $space-small;
    }

    .el-tree-node__expand-icon {
      color: $color-8;
    }

    .el-tree-node__label {
      font-size: $font-size-default;
      color: $color-12;
    }
  }

  // 当前激活节点的特殊样式
  .tree-node.active {
    background-color: $theme-primary;
    border-radius: $radius-small;

    .node-label {
      font-weight: 500;
      color: #fff !important;
    }

    .action-icon {
      opacity: 1;
      color: $theme-primary;

      &:hover {
        color: $theme-primary-hover;
      }
    }
  }
</style>
