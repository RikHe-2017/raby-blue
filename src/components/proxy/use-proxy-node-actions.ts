import { ElMessage } from 'element-plus'
import { useProxyStore } from '../../stores/proxy'
import type { ProxyGroup, ProxyNode, ProxyRule } from '../../types/proxy'
import { isProxyRule } from '../../types/proxy'
import { getProxyFavoriteSummary } from '../../stores/proxy-rules'

interface ProxyNodeActionEmitter {
  (event: 'edit-rule', data: ProxyNode): void
  (event: 'set-favorite', id: string, favorite: boolean): void
}

export function useProxyNodeActions(emit: ProxyNodeActionEmitter) {
  const proxyStore = useProxyStore()

  // 添加分组 - 直接处理
  const handleAddGroup = (parentId?: string) => {
    const newGroup: ProxyGroup = {
      id: crypto.randomUUID(),
      name: '新分类',
      enabled: false,
      type: 'group',
      children: []
    }
    proxyStore.addGroup(newGroup, parentId)
  }

  // 添加代理规则 - 直接处理
  const handleAddProxy = (parentId: string) => {
    const newRule: ProxyRule = {
      id: crypto.randomUUID(),
      name: '新代理',
      sourceUrl: '',
      targetUrl: '',
      enabled: false,
      groupId: parentId,
      type: 'rule'
    }
    proxyStore.addRule(parentId, newRule)
  }

  // 分组下拉菜单命令处理
  const handleDropdownCommand = (command: string, parentData: ProxyNode) => {
    if (command === 'category') {
      handleAddGroup(parentData.id)
    } else if (command === 'proxy') {
      handleAddProxy(parentData.id)
    }
  }

  // 复制规则 - 直接处理
  const handleDuplicateRule = (ruleData: ProxyNode) => {
    if (!isProxyRule(ruleData)) return
    const duplicatedRule: ProxyRule = {
      id: crypto.randomUUID(),
      name: `${ruleData.name} - 副本`,
      requestHeaders: ruleData.requestHeaders?.map(row => ({ ...row, id: crypto.randomUUID() })),
      responseHeaders: ruleData.responseHeaders?.map(row => ({ ...row, id: crypto.randomUUID() })),
      sourceUrl: ruleData.sourceUrl || '',
      targetUrl: ruleData.targetUrl || '',
      enabled: false,
      groupId: ruleData.groupId,
      type: 'rule'
    }
    proxyStore.addRule(ruleData.groupId, duplicatedRule)
  }

  // 编辑规则 - 需要通知父组件切换到编辑模式
  const handleEditRule = (ruleData: ProxyNode) => {
    emit('edit-rule', ruleData)
  }

  // 删除规则 - 直接处理
  const handleDeleteRule = (ruleData: ProxyNode) => {
    if (!isProxyRule(ruleData)) return
    proxyStore.deleteRule(ruleData.groupId, ruleData.id)
    ElMessage.success('代理规则已删除')
  }

  // 规则下拉菜单命令处理
  const handleRuleDropdownCommand = (command: string, ruleData: ProxyNode) => {
    if (command === 'duplicate') {
      handleDuplicateRule(ruleData)
    } else if (command === 'edit') {
      handleEditRule(ruleData)
    } else if (command === 'delete') {
      handleDeleteRule(ruleData)
    }
  }

  // 删除分组 - 直接处理
  const handleDeleteGroup = (groupId: string) => {
    proxyStore.deleteGroup(groupId)
    ElMessage.success('分组已删除')
  }

  const handleNodeCommand = (command: string, data: ProxyNode) => {
    if (command === 'favorite') {
      const summary = getProxyFavoriteSummary(data)
      emit('set-favorite', data.id, summary.favoriteCount !== summary.ruleCount)
    } else if (data.type === 'group') {
      if (command === 'delete') handleDeleteGroup(data.id)
      else handleDropdownCommand(command, data)
    } else handleRuleDropdownCommand(command, data)
  }

  return { handleNodeCommand }
}
