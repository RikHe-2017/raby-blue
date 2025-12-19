<script lang="ts" setup>
  import { ref } from 'vue'
  import { ElMessage } from 'element-plus'
  import ProxyTree from './ProxyTree.vue'
  import { useProxyStore } from '../../stores/proxy'
  import type { ProxyGroup, ProxyNode, ProxyRule } from '../../types/proxy'

  interface Props {
    groups: ProxyGroup[]
    activeGroupId: string
  }

  interface Emits {
    (e: 'update:activeGroupId', value: string): void
    (e: 'update:activeItemId', value: string): void
    (e: 'edit-rule', data: ProxyNode): void
  }

  const props = defineProps<Props>()
  const emit = defineEmits<Emits>()

  const proxyStore = useProxyStore()
  const filterText = ref('')

  // Header 下拉菜单：创建顶级分组或代理
  const handleDropdownCommand = (command: string) => {
    if (command === 'category') {
      const newGroup: ProxyGroup = {
        id: crypto.randomUUID(),
        name: '新分类',
        enabled: false,
        type: 'group',
        children: []
      }
      proxyStore.addGroup(newGroup)
    } else if (command === 'proxy') {
      const groupId = props.activeGroupId
      if (!groupId) {
        // 如果没有选中分组，先创建一个默认分组
        const newGroup: ProxyGroup = {
          id: crypto.randomUUID(),
          name: '新分类',
          enabled: false,
          type: 'group',
          children: []
        }
        proxyStore.addGroup(newGroup)
        return
      }
      const newRule: ProxyRule = {
        id: crypto.randomUUID(),
        name: '新代理',
        sourceUrl: '',
        targetUrl: '',
        enabled: false,
        groupId,
        type: 'rule'
      }
      proxyStore.addRule(groupId, newRule)
    }
  }

  // 导出配置 - 直接处理
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

  // 导入配置 - 直接处理
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

  const handleExportImportCommand = (command: string) => {
    if (command === 'export') {
      handleExportConfig()
    } else if (command === 'import') {
      handleImportConfig()
    }
  }

  const handleNodeClick = (data: ProxyNode) => {
    // 直接处理节点点击逻辑，更新父组件的 UI 状态
    if (data.type === 'group') {
      emit('update:activeGroupId', data.id)
      emit('update:activeItemId', data.id)
    } else if (data.type === 'rule') {
      emit('update:activeGroupId', data.groupId)
      emit('update:activeItemId', data.id)
    }
  }

  const handleEditRule = (data: ProxyNode) => {
    emit('edit-rule', data)
  }
</script>

<template>
  <div class="sidebar">
    <div class="sidebar__header">
      <div class="sidebar__header-title">代理分组</div>
      <div class="sidebar__header-actions">
        <el-dropdown @command="handleDropdownCommand">
          <el-icon class="sidebar__header-icon sidebar__header-icon--add">
            <i-ep-plus />
          </el-icon>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="category"> 创建分类 </el-dropdown-item>
              <el-dropdown-item command="proxy"> 创建代理 </el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
        <el-dropdown @command="handleExportImportCommand">
          <el-icon class="sidebar__header-icon sidebar__header-icon--export-import">
            <i-ep-setting />
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
    <div class="sidebar__search">
      <el-input
        v-model="filterText"
        placeholder="搜索分类或代理..."
        class="sidebar__search-input"
        clearable
      >
        <template #prefix>
          <el-icon><i-ep-search /></el-icon>
        </template>
      </el-input>
    </div>

    <el-scrollbar class="sidebar__tree">
      <ProxyTree
        :groups="groups"
        :filter-text="filterText"
        @node-click="handleNodeClick"
        @edit-rule="handleEditRule"
      />
    </el-scrollbar>
  </div>
</template>

<style lang="scss" scoped>
  .sidebar {
    width: 300px;
    background: var(--el-bg-color);
    border-right: 1px solid var(--el-border-color);
    display: flex;
    flex-direction: column;
    box-shadow: 2px 0 8px rgba(0, 0, 0, 0.05);
  }

  .sidebar__header {
    padding: 4px 8px;
    border-bottom: 1px solid var(--el-border-color);
    display: flex;
    justify-content: space-between;
    align-items: center;

    .sidebar__header-title {
      font-size: 14px;
      font-weight: 600;
    }
  }

  .sidebar__header-actions {
    display: flex;
    gap: 8px;
    align-items: center;
  }

  .sidebar__header-icon {
    cursor: pointer;
    transition: all 0.3s;
    border-radius: var(--el-border-radius-small);

    &:hover {
      background: rgba(255, 255, 255, 0.2);
      transform: scale(1.1);
    }
  }

  .sidebar__search {
    padding: 4px 8px;
    border-bottom: 1px solid var(--el-border-color);
  }

  .sidebar__tree {
    flex: 1;
    overflow: hidden;
    padding-right: 8px;

    :deep(.el-tree-node__content) {
      width: 100%;
      display: flex;
    }
  }
</style>
