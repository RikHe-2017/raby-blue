import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'
import fs from 'fs'
import { execSync } from 'child_process'

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
    const manifestDest = resolve(__dirname, '../dist/manifest.json')

    if (!fs.existsSync(manifestDest)) {
      throw new Error('dist/manifest.json 不存在，请先运行 npm run build')
    }

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

    // 创建dist-crx目录
    const crxDir = resolve(__dirname, '../dist-crx')
    if (!fs.existsSync(crxDir)) {
      fs.mkdirSync(crxDir, { recursive: true })
    }

    // 复制所有文件到dist-crx目录
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

    copyDirectory(distDir, crxDir)
    console.log('✅ 复制所有文件到dist-crx目录')

    // 生成.crx文件
    generateCrxFile(crxDir).then(() => {
      console.log('✅ 扩展构建完成！')
      console.log('📁 输出目录: dist-crx/')
      console.log('📦 扩展文件: dist-crx/RabyBlue.crx')
    })
  } catch (error) {
    console.error('❌ 构建失败:', error)
    process.exit(1)
  }
}

// 生成.crx文件
async function generateCrxFile(extensionDir) {
  try {
    console.log('🔧 开始生成.crx文件...')

    // 检查Chrome是否安装
    let chromePath = ''
    try {
      // macOS - 检查常见的Chrome路径
      const possiblePaths = [
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        '/Applications/Chromium.app/Contents/MacOS/Chromium',
        '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'
      ]

      for (const path of possiblePaths) {
        if (fs.existsSync(path)) {
          chromePath = path
          break
        }
      }

      // 如果没找到，尝试使用which命令查找
      if (!chromePath) {
        try {
          const result = execSync('which google-chrome', { encoding: 'utf8' }).trim()
          if (result) {
            chromePath = result
          }
        } catch (error) {
          // which命令失败，继续使用默认路径
        }
      }
    } catch (error) {
      console.log('⚠️ 检查Chrome路径时出错:', error.message)
    }

    if (!chromePath) {
      console.log('⚠️ 未找到Chrome浏览器，跳过.crx文件生成')
      console.log('📝 请手动使用Chrome的打包扩展功能生成.crx文件')
      return
    }

    const crxPath = resolve(extensionDir, 'RabyBlue.crx')
    const pemPath = resolve(extensionDir, 'RabyBlue.pem')

    // 检查是否已有私钥文件
    let packCommand
    if (fs.existsSync(pemPath)) {
      // 如果有私钥文件，使用它
      packCommand = `"${chromePath}" --pack-extension="${extensionDir}" --pack-extension-key="${pemPath}"`
    } else {
      // 如果没有私钥文件，不指定key参数，Chrome会自动生成
      packCommand = `"${chromePath}" --pack-extension="${extensionDir}"`
    }

    try {
      execSync(packCommand, { stdio: 'inherit' })

      // Chrome会在扩展目录的父目录中生成文件，需要移动到正确位置
      const parentDir = resolve(extensionDir, '..')
      const generatedCrx = resolve(parentDir, 'dist-crx.crx')
      const generatedPem = resolve(parentDir, 'dist-crx.pem')
      const targetCrx = resolve(extensionDir, 'RabyBlue.crx')
      const targetPem = resolve(extensionDir, 'RabyBlue.pem')

      // 移动文件到正确位置
      if (fs.existsSync(generatedCrx)) {
        fs.renameSync(generatedCrx, targetCrx)
      }
      if (fs.existsSync(generatedPem)) {
        fs.renameSync(generatedPem, targetPem)
      }

      console.log('✅ .crx文件生成完成！')
      console.log('📦 CRX文件: dist-crx/RabyBlue.crx')
      console.log('🔑 密钥文件: dist-crx/RabyBlue.pem')
    } catch (error) {
      console.log('⚠️ 自动生成.crx文件失败，请手动生成')
      console.log('📝 手动生成步骤：')
      console.log('1. 打开Chrome浏览器')
      console.log('2. 访问 chrome://extensions/')
      console.log('3. 开启"开发者模式"')
      console.log('4. 点击"打包扩展程序"')
      console.log('5. 选择扩展程序根目录：dist-crx/')
      console.log('6. 点击"打包扩展程序"按钮')
      console.log('7. 将生成的.crx文件重命名为Raby.crx')
    }
  } catch (error) {
    console.log('⚠️ 生成.crx文件时出错:', error.message)
  }
}

// 运行构建
buildExtension()
