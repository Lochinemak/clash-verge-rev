# Remove sponsorship and advertising content

## Goal

Remove every repository-owned sponsorship surface and third-party advertising
section so project documentation no longer solicits funding or promotes
commercial services.

## Background

- `.github/FUNDING.yml:1` enables GitHub's repository Sponsor button.
- `README.md:94` contains the primary donation section.
- Seven localized READMEs under `docs/` contain equivalent donation sections.
- The same eight README files contain localized `Promotion` sections advertising
  Doggygo VPN and GPTKefu through `verge.dginv.click`, `gptkefu.com`, and the
  `@crisp_ai` Telegram channel.
- `.github/workflows/autobuild.yml`, `.github/workflows/release.yml`, and
  `.github/workflows/telegram-notify.yml` inject five Doggygo VPN advertisements
  into generated release notes or Telegram notifications.
- No fixed sponsorship page, route, menu item, translation key, or sponsor URL
  exists in the React/Tauri application source.
- The update dialog renders release notes fetched from the upstream repository.
  Those notes have contained a commercial recommendation, so the updater can
  display advertising even though no advertisement is stored in application UI
  source.
- `src/components/setting/mods/sysproxy-viewer.tsx:66` mentions
  `sponsor.cdn.skk.moe` only as an example hostname; it is unrelated to project
  sponsorship.

## Requirements

- Delete `.github/FUNDING.yml`.
- Remove the complete donation section (heading and link) from `README.md` and
  every localized `docs/README_*.md` that contains it.
- Remove each complete localized commercial promotion section, including its
  separator and all Doggygo VPN/GPTKefu copy and links, from the same READMEs.
- Remove commercial recommendation blocks from generated release and Telegram
  notification messages without changing their normal release content.
- Point application updater endpoints and release links at
  `Lochinemak/clash-verge-rev`, so displayed release notes are controlled by the
  fork owner.
- Continue rendering Markdown release notes, but do not enable embedded raw HTML.
- Use a fork-owned updater signing key; never commit its private key or password.
- Preserve the project's own Telegram update channel and normal project links;
  they are community/documentation navigation, not advertising.
- Do not remove unrelated hostname examples whose names happen to contain
  `sponsor`.
- Preserve all unrelated working-tree changes.
- Unit tests may be added when they provide useful regression coverage.

## Acceptance Criteria

- [x] No tracked file references `github.com/sponsors` or configures a GitHub
      funding account.
- [x] No README contains a project donation/sponsorship heading or link.
- [x] No tracked file contains the advertising URLs `verge.dginv.click`,
      `gptkefu.com`, or `t.me/crisp_ai`, and no README retains a localized
      commercial promotion section.
- [x] The update dialog reads release notes only from the fork-owned release and
      does not render raw HTML embedded in Markdown.
- [x] Updater configuration uses fork-owned endpoints and a matching fork-owned
      signing public key.
- [x] Frontend lint, type/build, and formatting checks pass.
- [x] The development application is started successfully and its startup result
      is reported; any environment-only launch limitation is documented.

## Out of Scope

- Removing the project's own Telegram channel, general GitHub/documentation
  links, or third-party domains whose names happen to contain `sponsor`.
- Rebranding application identifiers or data directories, which would break
  in-place upgrade compatibility.
