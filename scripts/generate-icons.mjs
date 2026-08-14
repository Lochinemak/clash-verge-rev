import { spawnSync } from 'node:child_process'
import {
  cpSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const iconDir = join(root, 'src-tauri', 'icons')
const sourceDir = join(iconDir, 'source')
const workDir = mkdtempSync(join(tmpdir(), 'clash-verge-icons-'))

const generate = (source, output) => {
  const result = spawnSync(
    'pnpm',
    ['exec', 'tauri', 'icon', join(sourceDir, source), '-o', output],
    { cwd: root, stdio: 'inherit' },
  )
  if (result.status !== 0) throw new Error(`Failed to generate ${source}`)
}

try {
  const appOutput = join(workDir, 'app')
  generate('app-icon.svg', appOutput)

  for (const name of [
    '32x32.png',
    '128x128.png',
    '128x128@2x.png',
    'StoreLogo.png',
    'Square30x30Logo.png',
    'Square44x44Logo.png',
    'Square71x71Logo.png',
    'Square89x89Logo.png',
    'Square107x107Logo.png',
    'Square142x142Logo.png',
    'Square150x150Logo.png',
    'Square284x284Logo.png',
    'Square310x310Logo.png',
    'icon.icns',
    'icon.ico',
    'icon.png',
  ]) {
    cpSync(join(appOutput, name), join(iconDir, name))
  }
  cpSync(
    join(appOutput, 'icon.ico'),
    join(root, 'src', 'assets', 'image', 'logo.ico'),
  )

  const trayFiles = new Map([
    ['tray-common.svg', ['tray-icon.ico']],
    ['tray-sys.svg', ['tray-icon-sys.ico']],
    ['tray-tun.svg', ['tray-icon-tun.ico']],
    ['tray-common-mono.svg', ['tray-icon-mono.ico']],
    [
      'tray-sys-mono.svg',
      ['tray-icon-sys-mono.ico', 'tray-icon-sys-mono-new.ico'],
    ],
    [
      'tray-tun-mono.svg',
      ['tray-icon-tun-mono.ico', 'tray-icon-tun-mono-new.ico'],
    ],
  ])

  for (const [source, targets] of trayFiles) {
    const output = join(workDir, source.replace('.svg', ''))
    generate(source, output)
    for (const target of targets) {
      cpSync(join(output, 'icon.ico'), join(iconDir, target))
    }
  }

  const brandMark = readFileSync(join(sourceDir, 'brand-mark.svg'), 'utf8')
  writeFileSync(
    join(root, 'src', 'assets', 'image', 'icon_light.svg'),
    brandMark.replaceAll('currentColor', '#172554'),
  )
  writeFileSync(
    join(root, 'src', 'assets', 'image', 'icon_dark.svg'),
    brandMark.replaceAll('currentColor', '#F8FAFC'),
  )
  cpSync(
    join(sourceDir, 'liquid-glass.svg'),
    join(iconDir, 'liquid-glass.icon', 'Assets', 'ClashVerge.svg'),
  )
} finally {
  rmSync(workDir, { recursive: true, force: true })
}
