import { spawnSync } from 'node:child_process'
import { copyFile, mkdir, mkdtemp, rename, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url))
const projectDirectory = path.resolve(scriptDirectory, '..')
const instructionsPath = path.join(
  projectDirectory,
  'src-tauri',
  'dmg',
  '无法打开应用说明.txt',
)
const instructionsName = '无法打开应用说明.txt'

function run(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8' })
  if (result.error) throw result.error
  if (result.status !== 0) {
    const details = [result.stdout, result.stderr].filter(Boolean).join('\n')
    throw new Error(
      `${command} ${args.join(' ')} failed${details ? `:\n${details}` : ''}`,
    )
  }
  return result.stdout.trim()
}

function appleScriptPath(value) {
  return value.replaceAll('\\', '\\\\').replaceAll('"', '\\"')
}

function setFinderPosition(mountPoint) {
  const escapedMountPoint = appleScriptPath(mountPoint)
  const script = `tell application "Finder"
  set volumeFolder to (POSIX file "${escapedMountPoint}") as alias
  set targetItem to item "${instructionsName}" of volumeFolder
  set position of targetItem to {80, 300}
end tell`
  run('osascript', ['-e', script])
}

async function packageDmg(dmgPath) {
  if (process.platform !== 'darwin') {
    throw new Error(
      'macOS DMG post-processing requires macOS hdiutil and Finder',
    )
  }

  const absoluteDmgPath = path.resolve(dmgPath)
  const temporaryDirectory = await mkdtemp(
    path.join(os.tmpdir(), 'clash-verge-dmg-'),
  )
  const writableBase = path.join(temporaryDirectory, 'writable')
  const compressedBase = path.join(temporaryDirectory, 'compressed')
  const writableDmg = `${writableBase}.dmg`
  const compressedDmg = `${compressedBase}.dmg`
  const replacementDmg = `${absoluteDmgPath}.tmp`
  const mountPoint = path.join(temporaryDirectory, 'mount')
  let attached = false

  try {
    try {
      await mkdir(mountPoint)
      run('hdiutil', [
        'convert',
        absoluteDmgPath,
        '-format',
        'UDRW',
        '-o',
        writableBase,
      ])
      run('hdiutil', [
        'attach',
        writableDmg,
        '-readwrite',
        '-nobrowse',
        '-noverify',
        '-noautoopen',
        '-mountpoint',
        mountPoint,
      ])
      attached = true

      await copyFile(instructionsPath, path.join(mountPoint, instructionsName))
      setFinderPosition(mountPoint)
    } finally {
      if (attached) {
        run('hdiutil', ['detach', mountPoint, '-force'])
        attached = false
      }
    }
    run('hdiutil', [
      'convert',
      writableDmg,
      '-format',
      'UDZO',
      '-imagekey',
      'zlib-level=9',
      '-o',
      compressedBase,
    ])
    await copyFile(compressedDmg, replacementDmg)
    await rename(replacementDmg, absoluteDmgPath)
  } finally {
    await rm(replacementDmg, { force: true })
    await rm(temporaryDirectory, { recursive: true, force: true })
  }
}

async function main() {
  const [dmgPath] = process.argv.slice(2)
  if (!dmgPath || dmgPath === '--help') {
    console.log('Usage: node scripts/package-macos-dmg.mjs <path-to-dmg>')
    if (!dmgPath) process.exitCode = 1
    return
  }
  await packageDmg(dmgPath)
  console.log(`Added ${instructionsName} to ${path.resolve(dmgPath)}`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
