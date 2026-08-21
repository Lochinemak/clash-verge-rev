/**
 * CLI tool to update version numbers in package.json, src-tauri/Cargo.toml, and src-tauri/tauri.conf.json.
 *
 * Usage:
 *   pnpm release-version <version>
 *
 * <version> can be:
 *   - A full semver version (e.g., 1.2.3, v1.2.3, 1.2.3-beta, v1.2.3+build)
 *   - A tag: "alpha", "beta", "rc", "alpha-latest", "nightly-latest", "autobuild", "autobuild-latest", or "deploytest"
 *     - "alpha", "beta", "rc": Appends the tag to the current base version (e.g., 1.2.3-beta)
 *     - "autobuild": Appends a timestamped autobuild tag (e.g., 1.2.3+autobuild.2406101530)
 *     - "autobuild-latest": Appends an autobuild tag with latest Tauri commit (e.g., 1.2.3+autobuild.0614.a1b2c3d)
 *     - "alpha-latest" / "nightly-latest": Appends a sortable prerelease tag
 *       with the latest Tauri commit (e.g., 1.2.3-alpha.20260816.t153045.a1b2c3d)
 *     - "deploytest": Appends a timestamped deploytest tag (e.g., 1.2.3+deploytest.2406101530)
 *
 * Examples:
 *   pnpm release-version 1.2.3
 *   pnpm release-version v1.2.3-beta
 *   pnpm release-version beta
 *   pnpm release-version autobuild
 *   pnpm release-version autobuild-latest
 *   pnpm release-version alpha-latest
 *   pnpm release-version nightly-latest
 *   pnpm release-version deploytest
 *
 * The script will:
 *   - Validate and normalize the version argument
 *   - Update the version field in package.json
 *   - Update the version field in src-tauri/Cargo.toml
 *   - Update the root package version in Cargo.lock
 *   - Update the version field in src-tauri/tauri.conf.json
 *   - Pin the Tauri updater endpoints to the matching release channel
 *
 * Errors are logged and the process exits with code 1 on failure.
 */

import { execSync } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'

import { program } from 'commander'

/**
 * 获取当前 git 短 commit hash
 * @returns {string}
 */
function getGitShortCommit() {
  try {
    return execSync('git rev-parse --short HEAD').toString().trim()
  } catch {
    console.warn("[WARN]: Failed to get git short commit, fallback to 'nogit'")
    return 'nogit'
  }
}

/**
 * 获取最新 Tauri 相关提交的短 hash
 * @returns {string}
 */
function getLatestTauriCommit() {
  try {
    const fullHash = execSync(
      'bash ./scripts-workflow/get_latest_tauri_commit.bash',
    )
      .toString()
      .trim()
    const shortHash = execSync(`git rev-parse --short ${fullHash}`)
      .toString()
      .trim()
    console.log(`[INFO]: Latest Tauri-related commit: ${shortHash}`)
    return shortHash
  } catch (error) {
    console.warn(
      '[WARN]: Failed to get latest Tauri commit, fallback to current git short commit',
    )
    console.warn(`[WARN]: Error details: ${error.message}`)
    return getGitShortCommit()
  }
}

/**
 * 生成短时间戳（格式：MMDD）或带 commit（格式：MMDD.cc39b27）
 * 使用 Asia/Shanghai 时区
 * @param {boolean} withCommit 是否带 commit
 * @param {boolean} useTauriCommit 是否使用 Tauri 相关的 commit（仅当 withCommit 为 true 时有效）
 * @returns {string}
 */
function generateShortTimestamp(withCommit = false, useTauriCommit = false) {
  const now = new Date()

  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    month: '2-digit',
    day: '2-digit',
  })

  const parts = formatter.formatToParts(now)
  const month = parts.find((part) => part.type === 'month').value
  const day = parts.find((part) => part.type === 'day').value

  if (withCommit) {
    const gitShort = useTauriCommit
      ? getLatestTauriCommit()
      : getGitShortCommit()
    return `${month}${day}.${gitShort}`
  }
  return `${month}${day}`
}

/**
 * Generate a sortable timestamp in Asia/Singapore (YYYYMMDD.tHHMMSS).
 * @returns {string}
 */
function generatePrereleaseTimestamp() {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Singapore',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  })
  const values = Object.fromEntries(
    formatter
      .formatToParts(new Date())
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  )
  return `${values.year}${values.month}${values.day}.t${values.hour}${values.minute}${values.second}`
}

/**
 * 验证版本号格式
 * @param {string} version
 * @returns {boolean}
 */
function isValidVersion(version) {
  return /^v?\d+\.\d+\.\d+(-(alpha|beta|rc|nightly)(\.[a-zA-Z0-9-]+)*)?(\+[a-zA-Z0-9-]+(\.[a-zA-Z0-9-]+)*)?$/i.test(
    version,
  )
}

/**
 * 标准化版本号
 * @param {string} version
 * @returns {string}
 */
function normalizeVersion(version) {
  return version.startsWith('v') ? version : `v${version}`
}

/**
 * 提取基础版本号（去掉所有 -tag 和 +build 部分）
 * @param {string} version
 * @returns {string}
 */
function getBaseVersion(version) {
  const match = version.match(/^v?(\d+\.\d+\.\d+)/)
  return match ? match[1] : version
}

const UPDATE_CHANNELS = {
  stable: {
    tag: 'updater',
    manifest: 'update.json',
    proxyManifest: 'update-proxy.json',
  },
  alpha: {
    tag: 'alpha',
    manifest: 'latest.json',
    proxyManifest: 'latest.json',
  },
  nightly: {
    tag: 'nightly',
    manifest: 'latest.json',
    proxyManifest: 'latest.json',
  },
}

function getUpdateChannel(version) {
  const versionWithoutV = version.replace(/^v/, '')
  const prerelease = versionWithoutV.split('+')[0].split('-')[1]
  if (!prerelease) return 'stable'

  const channel = prerelease.split('.')[0].toLowerCase()
  if (channel === 'alpha' || channel === 'nightly') return channel

  console.warn(
    `[WARN]: Version ${version} is outside the rolling prerelease channels; using stable updater endpoints.`,
  )
  return 'stable'
}

function getUpdaterEndpoints(version, { fixedWebview2 = false } = {}) {
  const channel = getUpdateChannel(version)
  if (channel === 'stable' && fixedWebview2) {
    const releasePath =
      'https://github.com/Lochinemak/clash-verge-rev/releases/download/updater'
    return [
      `https://ghfast.top/${releasePath}/update-fixed-webview2-proxy.json`,
      `${releasePath}/update-fixed-webview2.json`,
    ]
  }

  const { tag, manifest, proxyManifest } = UPDATE_CHANNELS[channel]
  const releasePath = `https://github.com/Lochinemak/clash-verge-rev/releases/download/${tag}`

  return [
    `https://ghfast.top/${releasePath}/${proxyManifest}`,
    `https://gh-proxy.org/${releasePath}/${proxyManifest}`,
    `${releasePath}/${manifest}`,
  ]
}

/**
 * 更新 package.json 版本号
 * @param {string} newVersion
 */
async function updatePackageVersion(newVersion) {
  const _dirname = process.cwd()
  const packageJsonPath = path.join(_dirname, 'package.json')
  try {
    const data = await fs.readFile(packageJsonPath, 'utf8')
    const packageJson = JSON.parse(data)

    console.log(
      '[INFO]: Current package.json version is: ',
      packageJson.version,
    )
    packageJson.version = newVersion.startsWith('v')
      ? newVersion.slice(1)
      : newVersion
    await fs.writeFile(
      packageJsonPath,
      JSON.stringify(packageJson, null, 2),
      'utf8',
    )
    console.log(
      `[INFO]: package.json version updated to: ${packageJson.version}`,
    )
  } catch (error) {
    console.error('Error updating package.json version:', error)
    throw error
  }
}

/**
 * 更新 Cargo.toml 版本号
 * @param {string} newVersion
 */
async function updateCargoVersion(newVersion) {
  const _dirname = process.cwd()
  const cargoTomlPath = path.join(_dirname, 'src-tauri', 'Cargo.toml')
  try {
    const data = await fs.readFile(cargoTomlPath, 'utf8')
    const lines = data.split('\n')
    const versionWithoutV = newVersion.startsWith('v')
      ? newVersion.slice(1)
      : newVersion

    const updatedLines = lines.map((line) => {
      if (line.trim().startsWith('version =')) {
        return line.replace(
          /version\s*=\s*"[^"]+"/,
          `version = "${versionWithoutV}"`,
        )
      }
      return line
    })

    await fs.writeFile(cargoTomlPath, updatedLines.join('\n'), 'utf8')
    console.log(`[INFO]: Cargo.toml version updated to: ${versionWithoutV}`)
  } catch (error) {
    console.error('Error updating Cargo.toml version:', error)
    throw error
  }
}

async function updateCargoLockVersion(newVersion) {
  const cargoLockPath = path.join(process.cwd(), 'Cargo.lock')
  const versionWithoutV = newVersion.replace(/^v/, '')
  const data = await fs.readFile(cargoLockPath, 'utf8')
  const packagePattern =
    /(\[\[package\]\]\nname = "clash-verge"\nversion = ")[^"]+("\n)/

  if (!packagePattern.test(data)) {
    throw new Error('Unable to find the clash-verge package in Cargo.lock')
  }

  await fs.writeFile(
    cargoLockPath,
    data.replace(packagePattern, `$1${versionWithoutV}$2`),
    'utf8',
  )
  console.log(`[INFO]: Cargo.lock version updated to: ${versionWithoutV}`)
}

/**
 * 更新 tauri.conf.json 版本号
 * @param {string} newVersion
 */
async function updateTauriConfigVersion(newVersion) {
  const _dirname = process.cwd()
  const tauriConfigPath = path.join(_dirname, 'src-tauri', 'tauri.conf.json')
  try {
    const data = await fs.readFile(tauriConfigPath, 'utf8')
    const tauriConfig = JSON.parse(data)
    const versionWithoutV = newVersion.startsWith('v')
      ? newVersion.slice(1)
      : newVersion

    console.log(
      '[INFO]: Current tauri.conf.json version is: ',
      tauriConfig.version,
    )

    // 使用完整版本信息，包含build metadata
    tauriConfig.version = versionWithoutV
    tauriConfig.plugins.updater.endpoints = getUpdaterEndpoints(newVersion)

    await fs.writeFile(
      tauriConfigPath,
      JSON.stringify(tauriConfig, null, 2),
      'utf8',
    )

    const fixedWebview2Endpoints = getUpdaterEndpoints(newVersion, {
      fixedWebview2: true,
    })
    for (const arch of ['x86', 'x64', 'arm64']) {
      const configPath = path.join(
        _dirname,
        'src-tauri',
        `webview2.${arch}.json`,
      )
      const config = JSON.parse(await fs.readFile(configPath, 'utf8'))
      if (
        JSON.stringify(config.plugins.updater.endpoints) ===
        JSON.stringify(fixedWebview2Endpoints)
      ) {
        continue
      }
      config.plugins.updater.endpoints = fixedWebview2Endpoints
      await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf8')
    }
    console.log(
      `[INFO]: tauri.conf.json version updated to: ${versionWithoutV}`,
    )
    console.log(
      `[INFO]: updater channel pinned to: ${getUpdateChannel(newVersion)}`,
    )
  } catch (error) {
    console.error('Error updating tauri.conf.json version:', error)
    throw error
  }
}

/**
 * 获取当前版本号
 */
async function getCurrentVersion() {
  const _dirname = process.cwd()
  const packageJsonPath = path.join(_dirname, 'package.json')
  try {
    const data = await fs.readFile(packageJsonPath, 'utf8')
    const packageJson = JSON.parse(data)
    return packageJson.version
  } catch (error) {
    console.error('Error getting current version:', error)
    throw error
  }
}

/**
 * 主函数
 */
async function main(versionArg) {
  if (!versionArg) {
    console.error('Error: Version argument is required')
    process.exit(1)
  }

  try {
    let newVersion
    const validTags = [
      'alpha',
      'beta',
      'rc',
      'autobuild',
      'autobuild-latest',
      'alpha-latest',
      'nightly-latest',
      'deploytest',
    ]

    if (validTags.includes(versionArg.toLowerCase())) {
      const currentVersion = await getCurrentVersion()
      const baseVersion = getBaseVersion(currentVersion)

      if (versionArg.toLowerCase() === 'autobuild') {
        // 格式: 2.3.0+autobuild.1004.cc39b27
        // 使用 Tauri 相关的最新 commit hash
        newVersion = `${baseVersion}+autobuild.${generateShortTimestamp(true, true)}`
      } else if (versionArg.toLowerCase() === 'autobuild-latest') {
        // 格式: 2.3.0+autobuild.1004.a1b2c3d (使用最新 Tauri 提交)
        const latestTauriCommit = getLatestTauriCommit()
        newVersion = `${baseVersion}+autobuild.${generateShortTimestamp()}.${latestTauriCommit}`
      } else if (
        versionArg.toLowerCase() === 'alpha-latest' ||
        versionArg.toLowerCase() === 'nightly-latest'
      ) {
        const channel = versionArg.toLowerCase().replace('-latest', '')
        const latestTauriCommit = getLatestTauriCommit()
        newVersion = `${baseVersion}-${channel}.${generatePrereleaseTimestamp()}.${latestTauriCommit}`
      } else if (versionArg.toLowerCase() === 'deploytest') {
        // 格式: 2.3.0+deploytest.1004.cc39b27
        // 使用 Tauri 相关的最新 commit hash
        newVersion = `${baseVersion}+deploytest.${generateShortTimestamp(true, true)}`
      } else {
        newVersion = `${baseVersion}-${versionArg.toLowerCase()}`
      }
    } else {
      if (!isValidVersion(versionArg)) {
        console.error('Error: Invalid version format')
        process.exit(1)
      }
      newVersion = normalizeVersion(versionArg)
    }

    console.log(`[INFO]: Updating versions to: ${newVersion}`)
    await updatePackageVersion(newVersion)
    await updateCargoVersion(newVersion)
    await updateCargoLockVersion(newVersion)
    await updateTauriConfigVersion(newVersion)
    console.log('[SUCCESS]: All version updates completed successfully!')
  } catch (error) {
    console.error('[ERROR]: Failed to update versions:', error)
    process.exit(1)
  }
}

program
  .name('pnpm release-version')
  .description('Update project version numbers')
  .argument('<version>', 'version tag or full version')
  .action(main)
  .parse(process.argv)
