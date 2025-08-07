import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'
import fs from 'fs'
import { createWriteStream } from 'fs'
import archiver from 'archiver'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

async function buildExtension() {
  try {
    console.log('🚀 构建浏览器扩展...')

    // 检查dist目录是否存在
    const distDir = resolve(__dirname, '../dist')
    if (!fs.existsSync(distDir)) {
      throw new Error('dist目录不存在，请先运行 npm run build')
    }

    // 检查manifest.json是否存在
    const manifestSrc = resolve(__dirname, '../public/manifest.json')
    const manifestDest = resolve(__dirname, '../dist/manifest.json')

    if (!fs.existsSync(manifestSrc)) {
      throw new Error('manifest.json 文件不存在')
    }

    // 复制manifest.json到dist目录
    fs.copyFileSync(manifestSrc, manifestDest)
    console.log('✅ 复制manifest.json')

    // 复制图标文件
    const iconsDir = resolve(__dirname, '../public/icons')
    const iconsDestDir = resolve(__dirname, '../dist/icons')

    if (!fs.existsSync(iconsDestDir)) {
      fs.mkdirSync(iconsDestDir, { recursive: true })
    }

    if (fs.existsSync(iconsDir)) {
      const iconFiles = fs.readdirSync(iconsDir)
      iconFiles.forEach(file => {
        const src = resolve(iconsDir, file)
        const dest = resolve(iconsDestDir, file)
        fs.copyFileSync(src, dest)
      })
      console.log('✅ 复制图标文件')
    }

    // 创建dist-extension目录
    const extensionDir = resolve(__dirname, '../dist-extension')
    if (!fs.existsSync(extensionDir)) {
      fs.mkdirSync(extensionDir, { recursive: true })
    }

    // 复制所有文件到dist-extension目录
    const copyDirectory = (src, dest) => {
      if (!fs.existsSync(dest)) {
        fs.mkdirSync(dest, { recursive: true })
      }

      const items = fs.readdirSync(src)
      items.forEach(item => {
        const srcPath = resolve(src, item)
        const destPath = resolve(dest, item)
        const stat = fs.statSync(srcPath)

        if (stat.isDirectory()) {
          copyDirectory(srcPath, destPath)
        } else {
          fs.copyFileSync(srcPath, destPath)
        }
      })
    }

    copyDirectory(distDir, extensionDir)
    console.log('✅ 复制所有文件到dist-extension目录')

    // 创建ZIP文件
    const zipPath = resolve(extensionDir, 'raby-extension.zip')
    const output = createWriteStream(zipPath)
    const archive = archiver('zip', { zlib: { level: 9 } })

    output.on('close', () => {
      console.log('✅ 扩展构建完成！')
      console.log('📁 输出目录: dist-extension/')
      console.log('📦 扩展文件: dist-extension/raby-extension.zip')
      console.log('📦 解压目录: dist-extension/ (可直接加载)')

      // 生成安装说明
      generateInstallInstructions()
    })

    archive.on('error', err => {
      throw err
    })

    archive.pipe(output)
    archive.directory(extensionDir, false)
    archive.finalize()
  } catch (error) {
    console.error('❌ 构建失败:', error)
    process.exit(1)
  }
}

// 生成安装说明
function generateInstallInstructions() {
  const instructions = `# Raby 浏览器扩展 - 安装说明

## 构建完成！

扩展已成功构建，有两种安装方式：

### 方式1：加载已解压的扩展程序（推荐）
1. 打开Chrome浏览器
2. 进入扩展管理页面：chrome://extensions/
3. 开启"开发者模式"
4. 点击"加载已解压的扩展程序"
5. 选择 \`dist-extension\` 目录
6. 点击"选择文件夹"确认安装

### 方式2：使用ZIP文件
1. 解压 \`raby-extension.zip\` 文件
2. 按照方式1的步骤加载解压后的目录

## 功能特性

- 🔄 代理请求重定向
- 📁 分组管理
- ⚙️ 配置导入导出
- 🎯 自动激活启用代理
- 🎨 现代化UI界面

## 使用说明

1. 点击扩展图标打开管理界面
2. 创建代理分组和规则
3. 配置源地址和目标地址
4. 启用需要的代理规则
5. 使用导入导出功能备份配置

## 注意事项

- 首次安装可能需要重启浏览器
- 确保在开发者模式下安装
- 如遇权限问题，请检查扩展权限设置
- 建议定期备份配置

## 更新扩展

如需更新扩展：
1. 重新运行构建脚本：\`npm run build:extension\`
2. 在Chrome扩展管理页面点击"重新加载"
3. 或者卸载后重新安装新版本

## 技术支持

如有问题，请查看项目文档或提交Issue。
`

  const installPath = resolve(__dirname, '../dist-extension/INSTALL.md')
  fs.writeFileSync(installPath, instructions)
  console.log('📝 安装说明已生成: dist-extension/INSTALL.md')
}

// 运行构建
buildExtension()
