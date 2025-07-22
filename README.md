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
