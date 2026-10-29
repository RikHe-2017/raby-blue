<script lang="ts" setup>
  import { computed, ref } from 'vue'
  import { ElMessage } from 'element-plus'
  import ProxyTree from './ProxyTree.vue'
  import ProxyQuickPanel from './ProxyQuickPanel.vue'
  import { collectProxyEntries } from './sidebar-projections'
  import { useUserPreferencesStore } from '../../stores/user-preferences'
  import { useProxyStore } from '../../stores/proxy'
  import type { ProxyGroup, ProxyNode, ProxyRule } from '../../types/proxy'

  interface Props {
    groups: ProxyGroup[]
    activeGroupId: string
    activeItemId: string
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
  const userPreferences = useUserPreferencesStore()
  const sidebarPreferences = computed(() => userPreferences.preferences.proxySidebar)
  const entries = computed(() => collectProxyEntries(props.groups))
  const selectedEntries = computed(() => entries.value.filter(entry => entry.rule.enabled))
  const favoriteEntries = computed(() =>
    entries.value.filter(entry => entry.rule.favorite === true)
  )
  const quickPanels = computed(() => [
    {
      id: 'selected',
      title: '已选择',
      entries: selectedEntries.value,
      grouped: sidebarPreferences.value.selectedGrouped,
      emptyText: '暂无已选择的代理'
    },
    {
      id: 'favorites',
      title: '收藏',
      entries: favoriteEntries.value,
      grouped: sidebarPreferences.value.favoritesGrouped,
      emptyText: '暂无收藏的代理'
    }
  ])

  const updateMode = (panel: string, grouped: boolean) => {
    userPreferences.update({
      proxySidebar:
        panel === 'selected' ? { selectedGrouped: grouped } : { favoritesGrouped: grouped }
    })
  }

  const setRuleEnabled = (ruleId: string, enabled: boolean) => {
    proxyStore.updateRule(ruleId, { enabled })
  }

  const setFavorite = async (nodeId: string, favorite: boolean) => {
    try {
      if (await proxyStore.setFavorite(nodeId, favorite)) {
        ElMessage.success(favorite ? '加入收藏成功' : '取消收藏成功')
      }
    } catch {
      ElMessage.error('收藏保存失败，请重试')
    }
  }

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
      </div>
    </div>

    <el-scrollbar class="sidebar__panels">
      <el-collapse
        :model-value="sidebarPreferences.openPanels"
        @update:model-value="
          value => userPreferences.update({ proxySidebar: { openPanels: value as string[] } })
        "
      >
        <el-collapse-item
          v-for="panel in quickPanels"
          :key="panel.id"
          :name="panel.id"
          :disabled="!userPreferences.ready"
        >
          <template #title>
            <span class="sidebar__panel-title">{{ panel.title }}</span>
            <span class="sidebar__count">{{ panel.entries.length }}</span>
            <span class="sidebar__mode" @click.stop @keydown.stop>
              <el-switch
                :model-value="panel.grouped"
                :aria-label="`${panel.title}分类模式`"
                :disabled="!userPreferences.ready"
                active-text="分类"
                inactive-text="简略"
                size="small"
                @update:model-value="value => updateMode(panel.id, value === true)"
              />
            </span>
          </template>
          <p
            v-if="panel.id === 'selected' && !proxyStore.enabled && panel.entries.length"
            class="sidebar__notice"
          >
            全局代理已关闭，已勾选项暂未生效
          </p>
          <ProxyQuickPanel
            :entries="panel.entries"
            :groups="groups"
            :grouped="panel.grouped"
            :active-item-id="activeItemId"
            :favorites-ready="userPreferences.ready"
            :empty-text="panel.emptyText"
            @select="handleNodeClick"
            @edit-rule="handleEditRule"
            @set-enabled="setRuleEnabled"
            @set-favorite="setFavorite"
          />
        </el-collapse-item>
        <el-collapse-item name="config" :disabled="!userPreferences.ready">
          <template #title>
            <span class="sidebar__panel-title">代理配置</span>
            <span class="sidebar__count">{{ entries.length }}</span>
          </template>
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

          <div class="sidebar__tree">
            <ProxyTree
              :groups="groups"
              :filter-text="filterText"
              :active-item-id="activeItemId"
              :favorites-ready="userPreferences.ready"
              @node-click="handleNodeClick"
              @edit-rule="handleEditRule"
              @set-favorite="setFavorite"
              @set-enabled="setRuleEnabled"
            />
          </div>
        </el-collapse-item>
      </el-collapse>
    </el-scrollbar>
  </div>
</template>

<style lang="scss" scoped>
  .sidebar {
    width: 300px;
    flex: 0 0 300px;
    min-height: 0;
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
    overflow: hidden;
    padding-right: 8px;

    :deep(.el-tree-node__content) {
      width: 100%;
      display: flex;
    }
  }

  .sidebar__panels {
    flex: 1;
    min-height: 0;
  }

  .sidebar__panels :deep(.el-collapse-item__header) {
    padding-left: 8px;
  }

  .sidebar__panels :deep(.el-collapse-item__title) {
    display: flex;
    flex: 1;
    align-items: center;
    min-width: 0;
  }

  .sidebar__panels :deep(.el-collapse-item__content) {
    padding-bottom: 8px;
  }

  .sidebar__panel-title {
    font-weight: 600;
    white-space: nowrap;
  }

  .sidebar__count {
    margin-left: 8px;
    color: var(--el-text-color-secondary);
    font-size: 12px;
  }

  .sidebar__mode {
    margin-left: auto;
    margin-right: 8px;
    display: inline-flex;
    align-items: center;
  }

  .sidebar__notice {
    margin: 0;
    padding: 0 8px 8px;
    color: var(--el-text-color-secondary);
    font-size: 12px;
  }
</style>
