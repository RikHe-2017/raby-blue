import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import { useScriptStore } from '../../stores/script'
import { findScriptNode, getScriptFavoriteSummary } from '../../stores/script-tree'
import type { ScriptGroup, ScriptNode } from '../../types/script'
import { i18n } from '../../locales'

export function useScriptNodeActions(
  emit: (event: 'edit-script', node: ScriptNode) => void,
  beforeCommand: () => Promise<void> = () => Promise.resolve()
) {
  const store = useScriptStore()
  const busy = ref(false)

  const handleAddGroup = async (parentId?: string) => {
    const group: ScriptGroup = {
      id: crypto.randomUUID(),
      name: i18n.global.t('script.newGroup'),
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
          ElMessage.success(
            favorite
              ? i18n.global.t('script.favoriteSaved')
              : i18n.global.t('script.favoriteRemoved')
          )
        }
      } else if (node.type === 'group') {
        if (command === 'category') await handleAddGroup(node.id)
        else if (command === 'script')
          await store.addScript(node.id, {
            id: crypto.randomUUID(),
            name: i18n.global.t('script.newScript'),
            content: i18n.global.t('script.defaultContent'),
            groupId: node.id,
            type: 'script',
            favorite: false
          })
        else if (command === 'delete' && (await store.deleteGroup(node.id)))
          ElMessage.success(i18n.global.t('script.groupDeleted'))
      } else if (command === 'duplicate') {
        await store.addScript(node.groupId, {
          ...node,
          id: crypto.randomUUID(),
          name: i18n.global.t('common.duplicateSuffix', { name: node.name }),
          favorite: false
        })
      } else if (command === 'delete' && (await store.deleteScript(node.groupId, node.id))) {
        ElMessage.success(i18n.global.t('script.scriptDeleted'))
      }
    } catch {
      ElMessage.error(
        command === 'favorite'
          ? i18n.global.t('script.favoriteSaveFailed')
          : i18n.global.t('errors.operationFailed')
      )
    } finally {
      busy.value = false
    }
  }

  return { busy, handleAddGroup, handleNodeCommand }
}
