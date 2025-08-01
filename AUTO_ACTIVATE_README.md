# 自动激活第一个被勾选的代理功能

## 功能概述

新增了自动激活第一个被勾选代理的功能，提升用户体验。

## 功能特性

### 1. 启动时自动激活

- 应用启动时自动查找第一个被启用的代理规则
- 如果找到启用的代理，自动激活该代理进行编辑
- 如果没有启用的代理，则激活第一个分组

### 2. 动态激活

- 当用户勾选/取消勾选代理规则时
- 如果当前没有选中任何代理规则，自动激活第一个被启用的代理
- 确保用户始终能看到有效的代理配置

## 实现逻辑

### 查找算法

```typescript
const findFirstEnabledRule = (groups: ProxyGroup[]): { groupId: string; ruleId: string } | null => {
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
```

### 激活时机

1. **应用启动时**：在 `onMounted` 生命周期中执行
2. **代理状态改变时**：在 `handleCheckboxChange` 中执行

## 使用场景

### 场景1：首次使用

- 用户创建新的代理规则并启用
- 系统自动激活该代理，用户可以立即编辑配置

### 场景2：导入配置

- 用户导入包含启用代理的配置文件
- 系统自动激活第一个启用的代理进行查看和编辑

### 场景3：切换代理状态

- 用户启用某个代理规则
- 如果当前没有选中代理，系统自动激活该代理

## 测试方法

1. **使用测试配置文件**：
   - 导入 `test-enabled-config.json` 文件
   - 观察系统是否自动激活"启用的代理1"

2. **手动测试**：
   - 创建多个代理规则
   - 启用其中一个
   - 观察是否自动激活该代理

3. **状态切换测试**：
   - 取消所有代理的启用状态
   - 重新启用某个代理
   - 观察是否自动激活

## 技术细节

### 优先级顺序

1. 第一个被启用的代理规则
2. 第一个分组（如果没有启用的代理）

### 递归搜索

- 支持嵌套分组的递归搜索
- 按分组顺序和代理顺序进行查找

### 状态管理

- 使用 Vue 的响应式系统
- 通过 `activeGroupId` 和 `activeItemId` 管理激活状态

## 注意事项

1. **性能考虑**：查找算法的时间复杂度为 O(n)，其中 n 是代理规则的总数
2. **用户体验**：确保用户始终能看到有效的代理配置
3. **状态一致性**：保持激活状态与代理启用状态的一致性

## 相关文件

- `src/App.vue` - 主要实现逻辑
- `test-enabled-config.json` - 测试配置文件
- `AUTO_ACTIVATE_README.md` - 本说明文档
