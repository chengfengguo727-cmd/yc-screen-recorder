// electron-builder only writes the app icon and version info into the exe as
// part of its sign-and-edit step, and that step is off (see
// signAndEditExecutable in electron-builder.yml): extracting its signing
// toolchain needs symlink privileges this machine does not grant, which fails
// the whole build. Without it the installed app shows Electron's own icon, so
// do just the edit here with rcedit, before the installer is assembled.
const { execFileSync } = require('child_process')
const { existsSync, readdirSync } = require('fs')
const { join } = require('path')

function findRcedit() {
  const vendored = join(__dirname, '..', 'node_modules', 'electron-winstaller', 'vendor', 'rcedit.exe')
  if (existsSync(vendored)) return vendored
  const cache = join(process.env.LOCALAPPDATA || '', 'electron-builder', 'Cache', 'winCodeSign')
  if (existsSync(cache)) {
    for (const dir of readdirSync(cache)) {
      const candidate = join(cache, dir, 'rcedit-x64.exe')
      if (existsSync(candidate)) return candidate
    }
  }
  return null
}

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'win32') return
  const { appInfo } = context.packager
  const exe = join(context.appOutDir, `${appInfo.productFilename}.exe`)
  const rcedit = findRcedit()
  if (!rcedit) throw new Error('rcedit not found; the exe would keep Electron\'s icon')
  execFileSync(
    rcedit,
    [
      exe,
      '--set-icon', join(__dirname, 'icon.ico'),
      '--set-version-string', 'ProductName', appInfo.productName,
      '--set-version-string', 'FileDescription', appInfo.productName,
      '--set-version-string', 'CompanyName', 'YC',
      '--set-file-version', appInfo.version,
      '--set-product-version', appInfo.version
    ],
    { stdio: 'inherit' }
  )
  console.log(`  • rcedit  wrote icon and version info into ${appInfo.productFilename}.exe`)
}
