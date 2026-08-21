import { execFileSync } from 'node:child_process'
import fs from 'node:fs/promises'

const STABLE_VERSION_PATTERN = /^v?(\d+)\.(\d+)\.(\d+)$/

function parseStableVersion(value, label) {
  const match = value?.trim().match(STABLE_VERSION_PATTERN)
  if (!match) {
    throw new Error(`${label} must be a stable X.Y.Z version; got '${value}'`)
  }

  return {
    raw: `${match[1]}.${match[2]}.${match[3]}`,
    parts: match.slice(1).map(Number),
  }
}

function compareVersions(left, right) {
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index]
  }
  return 0
}

async function writeOutput(changed, version) {
  if (!process.env.GITHUB_OUTPUT) return
  await fs.appendFile(
    process.env.GITHUB_OUTPUT,
    `changed=${changed}\nversion=${version}\n`,
    'utf8',
  )
}

async function main() {
  const released = parseStableVersion(process.argv[2], 'Released version')
  const packageJson = JSON.parse(await fs.readFile('package.json', 'utf8'))
  const current = parseStableVersion(packageJson.version, 'Development version')
  const comparison = compareVersions(current.parts, released.parts)

  if (comparison > 0) {
    console.log(
      `[INFO]: Development version ${current.raw} is already ahead of ${released.raw}; no bump needed.`,
    )
    await writeOutput(false, current.raw)
    return
  }

  if (comparison < 0) {
    throw new Error(
      `Development version ${current.raw} is behind released version ${released.raw}`,
    )
  }

  const nextVersion = `${released.parts[0]}.${released.parts[1]}.${released.parts[2] + 1}`
  execFileSync(process.execPath, ['scripts/release-version.mjs', nextVersion], {
    stdio: 'inherit',
  })
  await writeOutput(true, nextVersion)
}

main().catch((error) => {
  console.error(`[ERROR]: ${error.message}`)
  process.exitCode = 1
})
