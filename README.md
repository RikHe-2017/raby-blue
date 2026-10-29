# Browser Proxy Extension

一个基于 Vue 3 + TypeScript + Element Plus 的浏览器代理扩展，支持无限代理配置和分组管理。

## 🚀 功能特性

- 🌐 浏览器请求重定向
- 📁 无限代理配置分组
- 🔄 实时启用/禁用切换
- 💾 数据持久化存储
- 🎨 现代化 UI 界面
- 🔍 搜索和过滤功能
- 📱 响应式设计

## 🛠️ 技术栈

- **前端框架**: Vue 3 + TypeScript
- **构建工具**: Vite
- **UI 组件库**: Element Plus
- **状态管理**: Pinia
- **代码规范**: ESLint + Prettier
- **浏览器扩展**: Chrome Extension Manifest V3

## 📦 安装和运行

### 开发环境

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 构建开发版本（包含 sourcemap）
npm run build:dev

# 构建生产版本
npm run build
```

运行 `npm run dev` 后，在 `chrome://extensions/` 开启开发者模式，点击“加载已解压的扩展程序”，选择项目下的 `dist-dev` 目录。开发服务器需要保持运行。

开发版名称为 `RabyBlue Dev`。修改 Vue 页面和样式会通过 Vite 热更新；修改后台脚本会自动重新加载扩展，此时需要重新打开弹出窗口。

开发服务默认使用端口 5174。端口被占用时可运行 `npm run dev -- --port 5175`，待启动完成后重新加载开发扩展。

`dist-dev` 仅用于开发；`npm run build` 生成的 `dist` 是独立运行的生产扩展，不依赖开发服务器。扩展清单统一维护在 `manifest.config.ts`，由 CRXJS 生成最终的 `manifest.json`。

### 代码质量

```bash
# 代码格式化
npm run format

# 检查代码格式
npm run format:check

# ESLint 检查和修复
npm run lint

# ESLint 检查（不修复）
npm run lint:check
```

## 🔧 开发工具配置

### VS Code 扩展推荐

- **ESLint**: 代码质量检查
- **Prettier**: 代码格式化
- **Vue Language Features (Volar)**: Vue 3 支持
- **TypeScript Vue Plugin (Volar)**: TypeScript 支持

### 自动格式化

项目已配置自动格式化，保存文件时会自动：

- 使用 Prettier 格式化代码
- 使用 ESLint 修复可自动修复的问题

## 📁 项目结构

```
src/
├── components/          # Vue 组件
├── stores/             # Pinia 状态管理
├── types/              # TypeScript 类型定义
├── styles/             # 样式文件
├── App.vue             # 主应用组件
├── main.ts             # 应用入口
└── background.ts       # 浏览器扩展后台脚本
```

## 🎯 代码规范

### Prettier 配置

- 单引号
- 无分号
- 2 空格缩进
- 100 字符行宽
- 无尾随逗号

### ESLint 规则

- Vue 3 最佳实践
- TypeScript 严格模式
- 代码质量检查
- 自动修复支持

## 🚀 部署

### 浏览器扩展

1. 运行 `npm run build`
2. 在浏览器中打开扩展管理页面
3. 启用开发者模式
4. 点击"加载已解压的扩展程序"
5. 选择 `dist` 目录

### 普通网页

1. 运行 `npm run build`
2. 将 `dist` 目录部署到 Web 服务器

## 📝 许可证

MIT
