import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import { useScriptStore } from '../../stores/script'
import { findScriptNode, getScriptFavoriteSummary } from '../../stores/script-tree'
import type { ScriptGroup, ScriptNode } from '../../types/script'

export function useScriptNodeActions(
  emit: (event: 'edit-script', node: ScriptNode) => void,
  beforeCommand: () => Promise<void> = () => Promise.resolve()
) {
  const store = useScriptStore()
  const busy = ref(false)

  const handleAddGroup = async (parentId?: string) => {
    const group: ScriptGroup = {
      id: crypto.randomUUID(),
      name: '新分类',
      type: 'group',
      children: []
    }
    return store.addGroup(group, parentId)
  }

  const handleNodeCommand = async (command: string, displayedNode: ScriptNode) => {
    if (busy.value) return
    busy.value = true
    try {
      await beforeCommand()
      const node = findScriptNode(store.groups, displayedNode.id)
      if (!node) return
      if (command === 'edit' && node.type === 'script') {
        emit('edit-script', node)
        return
      }
      if (command === 'favorite') {
        const summary = getScriptFavoriteSummary(node)
        if (!summary.scriptCount) return
        const favorite = summary.favoriteCount !== summary.scriptCount
        if (await store.setFavorite(node.id, favorite)) {
          ElMessage.success(favorite ? '加入收藏成功' : '取消收藏成功')
        }
      } else if (node.type === 'group') {
        if (command === 'category') await handleAddGroup(node.id)
        else if (command === 'script')
          await store.addScript(node.id, {
            id: crypto.randomUUID(),
            name: '新脚本',
            content: '// 请输入你的JS代码',
            groupId: node.id,
            type: 'script',
            favorite: false
          })
        else if (command === 'delete' && (await store.deleteGroup(node.id)))
          ElMessage.success('分组已删除')
      } else if (command === 'duplicate') {
        await store.addScript(node.groupId, {
          ...node,
          id: crypto.randomUUID(),
          name: `${node.name} - 副本`,
          favorite: false
        })
      } else if (command === 'delete' && (await store.deleteScript(node.groupId, node.id))) {
        ElMessage.success('脚本已删除')
      }
    } catch {
      ElMessage.error(command === 'favorite' ? '收藏保存失败，请重试' : '操作保存失败，请重试')
    } finally {
      busy.value = false
    }
  }

  return { busy, handleAddGroup, handleNodeCommand }
}
