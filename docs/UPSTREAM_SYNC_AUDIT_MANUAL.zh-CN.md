# 上游同步、广告与订阅安全审查手册

本文规定 Lochinemak fork 体系同步上游代码时的标准流程。核心原则是：

1. 上游代码先同步到原分支，禁止直接同步到 `loch/dev`。
2. 从已同步的原分支创建隔离审查分支。
3. 必须完成广告和订阅数据外传审查；发现问题时先修复、再复审。
4. 只有审查结论为 `PASS` 时，才允许把审查分支合并到 `loch/dev`。

本流程适用于主程序及五个 fork 依赖仓库。它不授权自动发布、覆盖远端分支、强制推送或删除用户改动。

## 1. 分支和上游映射

以下是当前仓库布局的基线。每次操作前仍须用 `git remote -v` 和 `git branch -a` 复核；如果实际远端或上游分支发生变化，应停止并更新本表，不能猜测。

| 仓库目录 | 原分支 | 上游来源分支 | 开发分支 |
| --- | --- | --- | --- |
| `clash-verge-rev` | `dev` | `upstream/dev` | `loch/dev` |
| `clash-verge-logger` | `main` | `upstream/main` | `loch/dev` |
| `clash-verge-service-ipc` | `main` | `upstream/main` | `loch/dev` |
| `kode-bridge` | `dev` | `upstream/dev` | `loch/dev` |
| `sysproxy-rs` | `main` | `upstream/main` | `loch/dev` |
| `tauri-plugin-mihomo` | `main` | `upstream/refactor-use-reqwest-ipc` | `loch/dev` |

建议按以下顺序处理，以便先稳定依赖，再审查主程序：

1. `clash-verge-logger`
2. `sysproxy-rs`
3. `kode-bridge`
4. `clash-verge-service-ipc`
5. `tauri-plugin-mihomo`
6. `clash-verge-rev`

## 2. 审查结果定义

最终结论只能是以下三种之一：

- `PASS`：没有广告，没有未经用户明确授权的订阅或节点数据外传；没有未处置的高风险问题。
- `PASS WITH ACCEPTED RISK`：只存在已有且被明确记录、批准的风险；必须写明批准人、原因和范围。
- `FAIL`：发现广告、可疑外传、审查证据不足、构建产物无法验证，或有未处置的高风险问题。

只有 `PASS` 可以直接进入合并。`PASS WITH ACCEPTED RISK` 必须获得维护者明确批准后才能按 `PASS` 处理。`FAIL` 禁止合并到 `loch/dev`。

## 3. 同步前准备

### 3.1 确认工作区干净

在目标仓库中执行：

```bash
git status --short
git branch --show-current
git remote -v
git branch -a --no-color
```

停止条件：

- 存在未提交或未跟踪文件。
- 当前远端不是 Lochinemak fork 的 `origin` 和官方项目的 `upstream`。
- 本地原分支、上游来源分支或 `loch/dev` 缺失。
- 正在进行 merge、rebase、cherry-pick 或 bisect。

不要用 `git reset --hard`、强制 checkout 或清理命令处理脏工作区。先提交现有工作，或在另一个干净 worktree 中执行同步。

### 3.2 获取远端状态

```bash
git fetch origin --prune --tags
git fetch upstream --prune --tags
```

再次检查远端分支。以主程序为例：

```bash
git log --oneline --decorate --max-count=10 origin/dev upstream/dev origin/loch/dev
git merge-base upstream/dev origin/loch/dev
```

不要仅依据远端默认分支名称决定同步来源；应使用第 1 节的明确映射。

## 4. 同步上游到原分支

下面用主程序举例；其他仓库替换 `BASE` 和 `UPSTREAM_REF`。

```bash
BASE=dev
UPSTREAM_REF=upstream/dev
SYNC_DATE=$(date +%Y%m%d)
REVIEW_BRANCH="review/upstream-${SYNC_DATE}"

git switch "$BASE"
OLD_BASE=$(git rev-parse HEAD)
git merge --ff-only "$UPSTREAM_REF"
NEW_BASE=$(git rev-parse HEAD)
git push origin "$BASE"
```

规则：

- 只能使用 `--ff-only` 更新原分支，确保它仍然是上游的可追溯镜像。
- `--ff-only` 失败时立即停止。不要自动 rebase、创建合并提交或强推原分支。
- 保存 `OLD_BASE` 和 `NEW_BASE`，它们是本次审查范围。
- 如果 `OLD_BASE` 等于 `NEW_BASE`，记录“无上游增量”，无需创建空合并。

`tauri-plugin-mihomo` 当前使用以下映射：

```bash
BASE=main
UPSTREAM_REF=upstream/refactor-use-reqwest-ipc
```

同步完成后，从原分支创建隔离审查分支：

```bash
git switch -c "$REVIEW_BRANCH"
git log --oneline --decorate "$OLD_BASE..$NEW_BASE"
git diff --stat "$OLD_BASE..$NEW_BASE"
git diff --find-renames "$OLD_BASE..$NEW_BASE"
```

如果审查中需要删除广告或修复安全问题，只能提交到 `review/upstream-*`，不要污染作为上游镜像的原分支。

## 5. 广告审查

广告审查必须同时覆盖新增代码、完整当前树、构建/发布流程和所有语言文档。不能只看 README。

### 5.1 禁止内容

除非维护者明确列入允许清单，以下内容均判定为广告：

- 机场、VPN、代理供应商推荐。
- 注册邀请码、返佣码、推广码、联盟链接。
- 付费产品导流、赞助商宣传、营销文案。
- `FUNDING.yml`、GitHub Sponsors 或捐赠入口。
- 安装包、更新说明、Telegram 通知或 Release body 中动态注入的推广内容。
- 通过短链、重定向域名、Base64、字符串拼接或远端配置隐藏的推广地址。

正常的许可证归属、项目来源说明、开发工具文档链接和必要的第三方依赖链接不属于广告，但必须与运行时导流区分。

### 5.2 增量扫描

```bash
git diff --unified=80 "$OLD_BASE..HEAD" -- \
  README.md docs .github src src-tauri scripts package.json Cargo.toml

git diff "$OLD_BASE..HEAD" | rg -ni \
  'promotion|advertis|sponsor|funding|donat|affiliate|referral|invite|register\?code|promo|推广|广告|返佣|邀请码|机场|VPN推荐|赞助|捐助'

git diff "$OLD_BASE..HEAD" | rg -ni \
  'https?://|t\.me/|github\.com/sponsors|register|invite|referral|redirect'
```

必须人工检查每个新增域名和每个被修改的 URL，尤其是：

- `.github/workflows/**`
- `scripts/**`
- `README.md` 和 `docs/README_*.md`
- 更新器配置和 Release 说明生成逻辑
- 设置页、关于页、通知和弹窗

### 5.3 全树扫描

```bash
rg -ni --hidden \
  -g '!**/.git/**' -g '!**/target/**' -g '!**/node_modules/**' \
  'promotion|advertis|sponsor|funding|donat|affiliate|referral|invite|register\?code|promo|推广|广告|返佣|邀请码|机场|VPN推荐|赞助|捐助' .

rg -n --hidden \
  -g '!**/.git/**' -g '!**/target/**' -g '!**/node_modules/**' \
  -o "https?://[^\"' )}>]+" . | sort -u
```

审查结论必须列出所有新增或变化的外部域名，并给出 `允许`、`删除` 或 `需要确认` 的判定。

## 6. 订阅和节点数据外传审查

目标是证明敏感数据没有从来源流入未经授权的网络、日志或外部程序。不能只搜索 `upload`；必须完成数据流追踪。

### 6.1 敏感数据来源

至少追踪以下数据：

- 订阅 URL、查询 token 和 Basic Auth 凭据。
- 远程订阅响应正文和 `profiles/*.yaml`。
- `profiles.yaml`、运行时配置和 `proxy-providers`。
- 节点服务器、端口、UUID、密码、私钥和证书。
- 节点名称、代理组选择、连接目的地和流量信息。
- Mihomo `external-controller` 地址和 `secret`。
- WebDAV 备份、日志、诊断信息和剪贴板内容。

### 6.2 网络和外部输出汇点

必须审查：

- HTTP/HTTPS GET、POST、PUT、PATCH、DELETE。
- WebSocket、TCP/UDP、DNS、WebDAV 和 IPC。
- `fetch`、`reqwest`、`axios`、下载器、更新器和 shell 命令。
- telemetry、analytics、crash report、Sentry、PostHog、webhook。
- 日志、通知、剪贴板、二维码、外部浏览器 URL。
- 备份归档、导入导出、远端 Web UI。
- 构建时下载并随包分发的二进制文件。

建议先做增量扫描：

```bash
git diff "$OLD_BASE..HEAD" | rg -ni \
  'subscription|profile|proxy-providers|proxies|node|secret|token|password|uuid|订阅|节点'

git diff "$OLD_BASE..HEAD" | rg -ni \
  'reqwest|fetch\(|axios|WebSocket|TcpStream|UdpSocket|\.post\(|\.put\(|\.patch\(|upload|webdav|telemetry|analytics|sentry|posthog|webhook|clipboard|open_web_url'
```

然后扫描完整树：

```bash
rg -n --hidden \
  -g '!**/.git/**' -g '!**/target/**' -g '!**/node_modules/**' \
  'reqwest::|Client::builder|Client::new|fetch\(|axios|WebSocket|TcpStream::connect|UdpSocket::connect|\.post\(|\.put\(|\.patch\(|upload|webdav|telemetry|analytics|sentry|posthog|webhook' .

rg -n --hidden \
  -g '!**/.git/**' -g '!**/target/**' -g '!**/node_modules/**' \
  'subscription|subscription-userinfo|profile-web-page-url|proxy-providers|PrfItem|file_data|profiles\.yaml|external-controller|secret|mask_url|mask_err' .
```

### 6.3 强制数据流表

对每个敏感来源填写一行；没有代码路径也要写“未发现汇点”，不能留空。

| 敏感来源 | 读取位置 | 中间转换/存储 | 输出汇点 | 目标域名/进程 | 是否用户明确触发 | 结论 |
| --- | --- | --- | --- | --- | --- | --- |
| 订阅 URL |  |  |  |  |  |  |
| 订阅正文 |  |  |  |  |  |  |
| 节点凭据 |  |  |  |  |  |  |
| Controller secret |  |  |  |  |  |  |
| 日志/备份 |  |  |  |  |  |  |

以下情况直接判定为 `FAIL`：

- 把订阅、节点或 Controller 数据发送到硬编码第三方服务器。
- 网络请求的目标不是用户订阅地址、用户节点、用户配置的服务或明确允许的项目基础设施。
- 遥测、崩溃报告或日志包含订阅 URL、token、节点凭据或配置正文。
- 后台自动上传备份，或用户界面没有明确说明上传内容和目标。
- HTTPS 客户端无条件接受无效证书并传输敏感数据。
- 外部网页获得 Controller secret，却没有清晰警告和信任边界。
- 前端可以读取完整订阅，同时拥有不受限制的任意域名请求能力，且缺少有效 CSP 或等价隔离。
- 下载的 sidecar/服务二进制没有固定 checksum、签名或可复现来源。

### 6.4 预期网络行为

以下行为不自动等于偷订阅，但仍须确认没有附带额外敏感字段：

- 向用户填写的订阅 URL 发送 GET。
- Mihomo 连接用户选择的节点，或下载配置中的 provider/rule provider。
- 访问本地回环地址、Unix Socket 或 Named Pipe 的 Mihomo/服务 IPC。
- 访问明确配置的更新服务器并验证更新签名。
- 用户主动选择后，把备份上传到用户配置的 WebDAV。
- 用户主动执行延迟测试、IP 检测或打开外部链接。

“功能上合理”不能代替隐私审查。例如 WebDAV 属于预期功能，但仍必须校验证书、明确提示上传内容，并避免后台静默触发。

### 6.5 当前重点回归点

每次同步至少复核以下路径，因为它们曾被识别为高价值敏感边界：

- `src-tauri/src/config/prfitem.rs`：订阅下载、重定向、认证和响应正文。
- `src-tauri/src/feat/profile.rs`、`src-tauri/src/cmd/profile.rs`：更新、错误和日志脱敏。
- `src-tauri/src/core/backup.rs`、`src-tauri/src/feat/backup.rs`：完整配置备份和 WebDAV 上传。
- `src/components/setting/mods/web-ui-viewer.tsx`：Controller secret 进入第三方 URL。
- `src-tauri/capabilities/*.json`、`src-tauri/tauri.conf.json`：WebView 网络权限、Asset Protocol 和 CSP。
- `scripts/prebuild.mjs`：Mihomo/服务二进制下载和完整性校验。
- `tauri-plugin-mihomo/src/**`：Mihomo API 的实际目标地址和认证头。

## 7. 动态网络验证

出现以下任一情况时，静态审查之后必须增加动态验证：

- 新增或修改网络库、请求、备份、日志、更新器、Web UI、遥测或 sidecar。
- 数据流无法仅从代码明确证明。
- 新增远端域名或构建时下载项。

动态验证只能使用专门创建的合成订阅，禁止使用真实用户订阅。合成数据应包含易识别的 canary，例如：

```text
SUBSCRIPTION_TOKEN_CANARY_20260815
NODE_PASSWORD_CANARY_20260815
CONTROLLER_SECRET_CANARY_20260815
```

在隔离环境中运行应用并记录 DNS、HTTP(S)、WebSocket 和进程连接，执行：

1. 导入、切换和更新合成订阅。
2. 自动更新计时器触发场景。
3. 节点和 provider 更新。
4. 本地备份；如果审查 WebDAV，则使用自有测试服务器。
5. 打开外部 Web UI、更新页、IP 信息和日志页。
6. 退出、重启和后台驻留。

在抓包、代理日志、应用日志和备份内容中搜索全部 canary。任何 canary 出现在未授权目标都判定为 `FAIL`。

## 8. 修复和复审

发现广告或安全问题后：

1. 在 `review/upstream-*` 分支修复。
2. 每个修复使用独立、可审查的提交。
3. 重新执行增量扫描、全树扫描和必要的动态验证。
4. 审查范围改为 `$OLD_BASE..HEAD`，确保修复提交也被覆盖。
5. 更新审查记录；旧的失败记录不能直接删除，应标记为“已修复”并附提交号。

不得通过简单加入 allowlist 来消除告警，除非能够说明目标、发送字段、触发条件和信任依据。

## 9. 合并门禁

合并前必须满足：

- [ ] 原分支通过 `--ff-only` 与指定上游来源同步。
- [ ] 原分支已经推送到 Lochinemak `origin`，且没有强推。
- [ ] 本次 `OLD_BASE..HEAD` 的全部提交已审查。
- [ ] 广告扫描没有未处置结果。
- [ ] 敏感数据流表已填写完整。
- [ ] 所有新增/变化的外部域名都有结论。
- [ ] 没有未处置的高风险订阅外传问题。
- [ ] 必要的动态验证已完成且 canary 未泄漏。
- [ ] 依赖和 sidecar 来源能够被固定版本及完整性验证。
- [ ] 相关格式、lint、类型检查和构建检查通过。
- [ ] 没有新增单元测试，符合项目 `AGENTS.md`。
- [ ] 审查结论明确记录为 `PASS`。

建议使用以下审查记录模板：

```markdown
## Upstream audit YYYY-MM-DD

- Repository:
- Original branch:
- Upstream ref:
- OLD_BASE:
- NEW_BASE:
- Review branch:
- Commits reviewed:
- New/changed domains:
- Advertising findings:
- Subscription data-flow findings:
- Dynamic verification:
- Fix commits:
- Residual risks:
- Result: PASS / PASS WITH ACCEPTED RISK / FAIL
- Reviewer:
```

## 10. 合并到 `loch/dev`

只有审查记录为 `PASS` 后才执行：

```bash
git status --short
git switch loch/dev
git pull --ff-only origin loch/dev
git merge --no-ff "$REVIEW_BRANCH" \
  -m "merge: sync and audit upstream ${SYNC_DATE}"
```

发生冲突时：

- 不要机械选择 `ours` 或 `theirs`。
- 对广告、更新器 URL、fork 依赖、订阅处理、WebDAV、Web UI 权限和日志脱敏逐项人工处理。
- 冲突解决后重新运行第 5、6、7 和 9 节的相关检查。
- 无法确认时执行 `git merge --abort`，保持 `loch/dev` 不变。

主程序建议至少运行：

```bash
pnpm lint
pnpm typecheck
pnpm run web:build
cargo check --workspace --all-targets
```

依赖仓库应运行各自已有的格式、lint、类型和构建检查。项目禁止编写新的单元测试；本流程不要求为同步操作新增单元测试。

全部检查通过后才允许推送：

```bash
git push origin loch/dev
```

不要在检查完成前推送合并结果，不要使用 `--force` 或 `--force-with-lease`。

## 11. 合并后记录和清理

记录以下内容：

- 原分支和 `loch/dev` 的最终提交号。
- 审查记录位置或 Pull Request。
- 移除的广告及对应提交。
- 修复或明确接受的安全风险。
- 实际运行的验证命令和结果。

确认远端分支、CI 和构建结果正常后，审查分支才可以按团队约定删除。删除分支不是本流程的自动步骤。

如果已产生合并提交但尚未推送，优先使用可恢复的方式重新审查；如果已经推送且必须撤销，创建 `git revert -m 1 <merge-commit>`，不要重写共享分支历史。
