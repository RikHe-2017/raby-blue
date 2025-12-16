# JS脚本管理功能设计方案

## 📋 功能概述

在现有代理配置功能的基础上，新增JS脚本管理功能，允许用户在网页上执行自定义JavaScript脚本。

## 🎨 UI设计图

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           Chrome Extension                              │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                           │
│  ┌─────────────────┐  ┌──────────────────────────────────────────────┐  │
│  │  功能切换标签    │  │                                              │  │
│  ├────────┬────────┤  │                                              │  │
│  │ 代理配置 │ JS脚本 │  │                                              │  │
│  └────────┴────────┘  └──────────────────────────────────────────────┘  │
│                                                                           │
│  ┌─────────────────┐  ┌──────────────────────────────────────────────┐  │
│  │                 │  │  [名称编辑器]                                │  │
│  │  左侧树状结构    │  │  5.0-debug                                  │  │
│  │                 │  │                                              │  │
│  │ ┌─ 5.0脚本      │  │ ┌────────────────────────────────────────┐ │  │
│  │ │  ├─ 5.0-debug│  │ │ JS代码编辑器                    [格式化]│ │  │
│  │ │  └─ 5.0-test │  │ │ [执行]                                    │ │  │
│  │ │               │  │ │                                            │ │  │
│  │ └─ 测试脚本      │  │ │ sessionStorage.setItem(                │ │  │
│  │    └─ test-1    │  │ │   'imaWebDme/debug',                    │ │  │
│  │                 │  │ │   1                                      │ │  │
│  │ [+ 创建分类]     │  │ │ )                                        │ │  │
│  │ [+ 创建脚本]     │  │ │                                            │ │  │
│  │                 │  │ │                                            │ │  │
│  │                 │  │ │                                            │ │  │
│  │                 │  │ └────────────────────────────────────────┘ │  │
│  │                 │  │                                              │  │
│  │                 │  │ 💡 提示：脚本将在当前活动标签页中执行         │  │
│  │                 │  │                                              │  │
│  └─────────────────┘  └──────────────────────────────────────────────┘  │
│                                                                           │
└─────────────────────────────────────────────────────────────────────────┘
```

## 🏗️ 架构设计

### 1. 数据结构

```typescript
// types/script.ts
export interface Script {
  id: string
  name: string
  content: string        // JS代码内容
  enabled: boolean      // 是否启用（可选，用于批量执行）
  groupId: string
  createdAt?: string
  updatedAt?: string
}

export interface ScriptGroup {
  id: string
  name: string
  scripts: Script[]
  parentId?: string
  children?: ScriptGroup[]
}

export interface ScriptConfig {
  enabled: boolean
  groups: ScriptGroup[]
}
```

### 2. 组件结构

```
src/
├── components/
│   ├── ScriptSidebar.vue      # 左侧脚本树（类似Sidebar.vue）
│   ├── ScriptTree.vue          # 树组件（类似ProxyTree.vue）
│   ├── ScriptEditor.vue        # JS代码编辑器（类似JsonEditor.vue）
│   └── ScriptSection.vue       # 右侧内容区域（类似ConfigSection.vue）
├── stores/
│   └── script.ts               # 脚本Store（类似proxy.ts）
└── types/
    └── script.ts               # 脚本类型定义
```

### 3. App.vue集成方案

**方案A：标签页切换（推荐）**
- 在App.vue顶部添加标签页
- 切换"代理配置"和"JS脚本"两个标签
- 每个标签下独立的功能区域

**方案B：侧边栏切换**
- 在左侧边栏顶部添加切换按钮
- 切换显示代理树或脚本树

**推荐方案A**，因为：
- 功能更清晰，用户不会混淆
- 可以同时保留两个功能的UI状态
- 更符合Chrome扩展的使用习惯

## 📝 功能特性

### 左侧树状结构（ScriptSidebar + ScriptTree）
- ✅ 树状目录结构（支持多级分组）
- ✅ 脚本文件列表
- ✅ 搜索功能
- ✅ 右键菜单：
  - 创建分类
  - 创建脚本
  - 复制脚本
  - 编辑脚本
  - 删除脚本/分类
- ✅ 节点展开/折叠状态保存

### 右侧编辑器（ScriptSection + ScriptEditor）
- ✅ 名称编辑器（编辑脚本名称）
- ✅ JS代码编辑器（textarea，支持语法高亮可选）
- ✅ 右上角操作按钮：
  - **格式化按钮**：使用Prettier或简单格式化JS代码
  - **执行按钮**：在当前活动标签页中执行脚本
- ✅ 保存状态提示（类似JSON编辑器的保存图标）
- ✅ 执行结果反馈（成功/失败提示）

### 数据存储
- ✅ 使用现有的StorageAdapter（IndexedDB/Chrome Storage）
- ✅ 存储键名：`scriptConfig`
- ✅ UI状态存储：`scriptUIState`

### 脚本执行
- ✅ 通过Chrome Extension的`chrome.tabs.executeScript`或`chrome.scripting.executeScript`执行
- ✅ 执行前验证脚本语法（可选）
- ✅ 执行结果反馈给用户

## 🎯 交互流程

1. **创建脚本**：
   - 点击"创建脚本" → 在选中分组下创建新脚本
   - 自动选中新脚本，右侧显示编辑器
   - 默认内容：`// 请输入你的JS代码`

2. **编辑脚本**：
   - 点击树节点 → 右侧显示脚本名称和代码
   - 修改代码 → 自动保存（防抖500ms）
   - 修改名称 → 自动保存（防抖500ms）

3. **执行脚本**：
   - 点击"执行"按钮
   - 获取当前活动标签页
   - 执行脚本代码
   - 显示执行结果（成功/失败）

4. **格式化代码**：
   - 点击"格式化"按钮
   - 使用简单的JS格式化逻辑
   - 更新编辑器内容

## 🔧 技术实现要点

1. **代码编辑器**：
   - 使用`el-input type="textarea"`（简单实现）
   - 或集成Monaco Editor（更好的体验，但体积大）

2. **代码格式化**：
   - 简单方案：使用正则表达式格式化
   - 推荐方案：集成prettier或使用Babel格式化

3. **脚本执行**：
   ```typescript
   // background.ts 中添加
   chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
     if (request.action === 'executeScript') {
       chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
         if (tabs[0]?.id) {
           chrome.scripting.executeScript({
             target: { tabId: tabs[0].id },
             func: new Function(request.code)
           }, (results) => {
             sendResponse({ success: true, results })
           })
         }
       })
       return true
     }
   })
   ```

4. **语法验证**：
   - 使用`new Function()`包装代码进行语法检查
   - 捕获语法错误并提示用户

## 📦 文件清单

需要创建的文件：
1. `src/types/script.ts` - 类型定义
2. `src/stores/script.ts` - Pinia Store
3. `src/components/ScriptSidebar.vue` - 左侧边栏
4. `src/components/ScriptTree.vue` - 树组件
5. `src/components/ScriptEditor.vue` - JS编辑器
6. `src/components/ScriptSection.vue` - 内容区域
7. 修改 `src/App.vue` - 集成标签页切换
8. 修改 `src/background.ts` - 添加脚本执行功能

## ✅ 确认事项

请确认以下设计点：

1. **UI布局**：是否采用标签页切换方案？
2. **代码编辑器**：使用简单的textarea还是Monaco Editor？
3. **代码格式化**：是否需要完整的Prettier格式化，还是简单格式化即可？
4. **脚本执行**：是否需要执行结果返回（console.log输出）？
5. **脚本启用**：是否需要像代理规则一样的启用/禁用开关？
6. **批量执行**：是否需要支持批量执行某个分组下的所有脚本？

---

**请确认设计方案后，我将开始实现代码。**

