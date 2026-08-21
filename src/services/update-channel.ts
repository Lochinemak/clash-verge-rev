export type UpdateChannel = 'stable' | 'alpha' | 'nightly'

const VERSION_PATTERN =
  /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z-]+)(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z.-]+)?$/

export const normalizeUpdateVersion = (
  version: string | null | undefined,
): string | null => {
  if (typeof version !== 'string') return null
  const normalized = version.trim().replace(/^v/i, '')
  return VERSION_PATTERN.test(normalized) ? normalized : null
}

export const getUpdateChannel = (
  version: string | null | undefined,
): UpdateChannel | null => {
  const normalized = normalizeUpdateVersion(version)
  if (!normalized) return null

  const prerelease = normalized.split('+')[0].split('-')[1]
  if (!prerelease) return 'stable'

  const channel = prerelease.split('.')[0].toLowerCase()
  return channel === 'alpha' || channel === 'nightly' ? channel : null
}

export const getReleaseTagForVersion = (
  version: string | null | undefined,
): string | null => {
  const normalized = normalizeUpdateVersion(version)
  const channel = getUpdateChannel(normalized)
  if (!normalized || !channel) return null

  if (channel === 'alpha') return 'alpha'
  if (channel === 'nightly') return 'nightly'
  return `v${normalized}`
}
