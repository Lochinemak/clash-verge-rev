import { readFileSync } from 'node:fs'

import axios from 'axios'

import { log_error, log_info, log_success } from './utils.mjs'

const REPOSITORY_URL = `${process.env.GITHUB_SERVER_URL || 'https://github.com'}/${
  process.env.GITHUB_REPOSITORY || 'Lochinemak/clash-verge-rev'
}`

async function sendTelegramNotification() {
  if (!process.env.TELEGRAM_BOT_TOKEN) {
    throw new Error('TELEGRAM_BOT_TOKEN is required')
  }
  if (!process.env.TELEGRAM_CHAT_ID) {
    throw new Error('TELEGRAM_CHAT_ID is required')
  }

  const version =
    process.env.VERSION ||
    (() => {
      const pkg = readFileSync('package.json', 'utf-8')
      return JSON.parse(pkg).version
    })()

  const downloadUrl =
    process.env.DOWNLOAD_URL ||
    `${REPOSITORY_URL}/releases/download/v${version}`

  const requestedBuildType = process.env.BUILD_TYPE?.toLowerCase()
  const prereleaseChannel = ['alpha', 'nightly', 'autobuild'].includes(
    requestedBuildType,
  )
    ? requestedBuildType
    : version.includes('nightly')
      ? 'nightly'
      : version.includes('alpha')
        ? 'alpha'
        : version.includes('autobuild')
          ? 'autobuild'
          : null
  const chatId = process.env.TELEGRAM_CHAT_ID
  const buildType = prereleaseChannel
    ? `${prereleaseChannel === 'nightly' ? 'Nightly' : prereleaseChannel === 'alpha' ? 'Alpha' : '滚动更新'}版`
    : '正式版'

  log_info(`Preparing Telegram notification for ${buildType} ${version}`)
  log_info(`Download URL: ${downloadUrl}`)

  let releaseContent
  try {
    releaseContent = readFileSync('release.txt', 'utf-8')
    log_info('成功读取 release.txt 文件')
  } catch (error) {
    log_error('无法读取 release.txt，使用默认发布说明', error)
    releaseContent = '更多新功能现已支持，详细更新日志请查看发布页面。'
  }

  function convertMarkdownToTelegramHTML(content) {
    // Strip stray HTML tags and markdown bold from heading text
    const cleanHeading = (text) =>
      text
        .replace(/<\/?[^>]+>/g, '')
        .replace(/\*\*/g, '')
        .trim()
    return content
      .split('\n')
      .map((line) => {
        if (line.trim().length === 0) {
          return ''
        } else if (line.startsWith('## ')) {
          return `<b>${cleanHeading(line.replace('## ', ''))}</b>`
        } else if (line.startsWith('### ')) {
          return `<b>${cleanHeading(line.replace('### ', ''))}</b>`
        } else if (line.startsWith('#### ')) {
          return `<b>${cleanHeading(line.replace('#### ', ''))}</b>`
        } else {
          let processedLine = line.replace(
            /\[([^\]]+)\]\(([^)]+)\)/g,
            (_match, text, url) => {
              const encodedUrl = encodeURI(url)
              return `<a href="${encodedUrl}">${text}</a>`
            },
          )
          processedLine = processedLine.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
          return processedLine
        }
      })
      .join('\n')
  }

  function normalizeDetailsTags(content) {
    return content
      .replace(
        /<summary>\s*<strong>\s*(.*?)\s*<\/strong>\s*<\/summary>/g,
        '\n<b>$1</b>\n',
      )
      .replace(/<summary>\s*(.*?)\s*<\/summary>/g, '\n<b>$1</b>\n')
      .replace(/<\/?details>/g, '')
      .replace(/<\/?strong>/g, (m) => (m === '</strong>' ? '</b>' : '<b>'))
      .replace(/<br\s*\/?>/g, '\n')
  }

  function sanitizeTelegramHTML(content) {
    const allowedTag =
      /^<\/?(?:b|strong|i|em|u|ins|s|strike|del|a|code|pre|blockquote|tg-spoiler|tg-emoji)(?:\s[^<>]*)?>$/i
    // Match tags or lone brackets separately so stray changelog text cannot swallow a real tag.
    return content.replace(/<\/?[a-z][^<>]*>|[<>]/gi, (token) => {
      if (token === '<') return '&lt;'
      if (token === '>') return '&gt;'
      return allowedTag.test(token)
        ? token
        : token.replace(/</g, '&lt;').replace(/>/g, '&gt;')
    })
  }

  releaseContent = normalizeDetailsTags(releaseContent)
  const formattedContent = sanitizeTelegramHTML(
    convertMarkdownToTelegramHTML(releaseContent),
  )

  const releaseTitle = prereleaseChannel ? `${buildType}发布` : '正式发布'
  const releaseTag =
    process.env.RELEASE_TAG ||
    (prereleaseChannel ? prereleaseChannel : `v${version}`)
  const encodedReleaseTag = encodeURIComponent(releaseTag)
  const content = `<b>🎉 <a href="${REPOSITORY_URL}/releases/tag/${releaseTag}">Clash Verge Next v${version}</a> ${releaseTitle}</b>\n\n${formattedContent}`

  try {
    await axios.post(
      `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        chat_id: chatId,
        text: content,
        link_preview_options: {
          is_disabled: false,
          url: `${REPOSITORY_URL}/releases/tag/${encodedReleaseTag}`,
          prefer_large_media: true,
        },
        parse_mode: 'HTML',
      },
    )
    log_success('✅ Telegram 通知发送成功')
  } catch (error) {
    const detail =
      error.response?.data?.description || error.code || 'request failed'
    log_error(`❌ Telegram 通知发送失败: ${detail}`)
    process.exit(1)
  }
}

sendTelegramNotification().catch((error) => {
  log_error('脚本执行失败:', error)
  process.exit(1)
})
