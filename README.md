# RabyBlue（蓝兔）

基于 Vue 3、TypeScript、Element Plus 和 Chrome Manifest V3 的浏览器请求代理与 JavaScript 脚本管理扩展。作者：RikHe。

## 功能

- 代理分类、多级目录、搜索，以及已选择和收藏面板。
- 代理规则启停、自动保存、请求头与响应头设置。
- 页面文档使用调试协议请求改写，其他请求默认使用浏览器重定向规则。
- JavaScript 脚本分组、编辑与在当前页面手动执行。
- 单独或合并导出代理、脚本；增量导入或覆盖导入。
- 增量导入保留同级、同类型、同名的本地项目，同名分类递归合并。
- 面板折叠状态和展示模式等用户偏好本地保存。

## 环境

- Node.js >= 22.21.1；`.nvmrc` 固定开发基线为 22.21.1。
- npm，统一使用 `package-lock.json`，不维护 pnpm 锁文件。
- Chrome 125 或更新版本是扩展清单声明的最低版本，不代表每个版本均已实测。

`package.json` 的 `engines` 声明版本要求；npm 默认不因此强制阻止安装。不使用 npm 发布此项目，`private: true` 仅防止误发 npm，不影响 GitHub 公开仓库。

## 开发

```bash
git clone https://github.com/RikHe-2017/raby-blue.git
cd raby-blue
nvm use # 使用 nvm 时执行
npm ci
npm run dev
```

在 `chrome://extensions/` 开启开发者模式，选择“加载已解压的扩展程序”，加载 `dist-dev`。开发服务器需要保持运行，默认端口为 5174。

端口被占用时使用 `npm run dev -- --port 5175`，随后重新加载开发扩展。界面支持热更新；后台脚本变更可能触发扩展重载，需要重新打开弹窗。

## 生产构建与安装

```bash
npm ci
npm run build
```

在扩展管理页面加载 `dist`。生产构建不依赖开发服务器，也不自动生成 ZIP 或 CRX。升级已安装版本前，建议先导出代理和脚本备份。

本项目以扩展运行方式为主，不承诺直接部署为普通网页后拥有 Chrome 扩展能力。

## 使用

1. 在“代理配置”中创建分类，再在分类菜单内添加代理。
2. 填写源地址及目标地址，例如将 `https://example.com/app/` 映射到 `http://127.0.0.1:3000/app/`。未匹配的路径不会自动被代理。
3. 启用所需代理和全局开关，刷新目标页面。编辑内容会自动保存。
4. 在节点菜单中收藏代理或分类；收藏分类会递归影响其子项。已选择和收藏支持简略、分类两种展示。
5. 顶部齿轮可导入、导出配置。增量导入为默认方式；覆盖导入只替换文件包含的数据类型，执行前请先备份。
6. 在“JS 脚本”中编辑并执行自己信任的代码。代码在当前页面环境执行，不是安全沙箱。

## 权限、隐私与限制

完整说明见 [隐私说明](PRIVACY.md) 和 [安全政策](SECURITY.md)。

- 文档代理和头设置需要 `debugger` 权限，Chrome 可能显示“开始调试此浏览器”。这是浏览器提示，扩展不能隐藏。
- 默认策略区分的是浏览器识别的页面文档请求，而不是仅凭 `.html` 后缀或响应内容类型判断。
- 默认非文档重定向仍受 CORS、混合内容、本地网络访问和服务端配置约束。给 HTML 响应增加允许跨域的头，不会自动授权字体、脚本或接口响应。
- 内部页面、浏览器商店页面等受保护页面不能按普通网页处理。调试连接与其他调试工具可能相互影响。
- 这不是系统级 HTTP/SOCKS 代理，不能保证所有协议或持续流式连接都能替换。
- 不建议为使用本扩展而全局关闭浏览器安全检查。
- 配置导出文件可能包含内网地址、脚本及鉴权头，应当作为敏感文件保存，不要提交到公开仓库。

## 检查与测试

```bash
npm test
npm run test:typecheck
npm run lint:check
npm run format:check
npm run build
```

`npm test` 使用 Vitest 在 Node 环境运行 `src` 和 `scripts/vite` 下的 TypeScript 单元测试，不启动浏览器。`npm run test:watch` 监听文件变化，`npm run test:typecheck` 检查测试及其依赖的类型。修复格式可使用 `npm run format`，提交前检查实际差异。

GitHub Actions 执行单元测试、ESLint 和生产构建。开发贡献见 [CONTRIBUTING.md](CONTRIBUTING.md)，发布检查见 [docs/RELEASING.md](docs/RELEASING.md)。

## 许可证与素材

历史 README 标注为 MIT，但独立许可证及版权声明尚待维护者确认，当前文档不替代正式授权。发布前请完成许可证选择。

图标源文件位于 `scripts/assets/icon-source.png`，生成命令为 `npm run generate-icons`。素材来源与公开分发授权仍需作者确认，不能仅凭文件在仓库内就认定可自由使用。
