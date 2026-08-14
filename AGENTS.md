# Repository Guidelines

## Project Structure & Module Organization

The React/TypeScript interface lives in `src/`, with reusable UI in
`src/components/`, routes in `src/pages/`, hooks in `src/hooks/`, and application
services in `src/services/`. The Tauri backend is under `src-tauri/`; shared Rust
crates are in `crates/`. Automation and release utilities live in `scripts/` and
`.github/workflows/`. Keep localized documentation in `docs/`. Tests are colocated
as `*.test.ts(x)` or stored under `tests/`.

## Build, Test, and Development Commands

- `pnpm install` installs the pinned JavaScript dependencies.
- `pnpm prebuild` downloads required sidecars and runtime data.
- `pnpm dev` starts the complete Tauri application for local development.
- `pnpm web:build` type-checks and creates the production web bundle.
- `cargo check --manifest-path src-tauri/Cargo.toml` checks Rust changes.
- `pnpm lint` and `pnpm format:check` enforce source quality and formatting.
- `pnpm test` runs Vitest; `pnpm test:dev-control` runs Node-based script tests.

## Coding Style & Naming Conventions

Use TypeScript with two-space indentation, single quotes, and no semicolons, as
enforced by Biome and ESLint. Name React components in PascalCase, hooks with a
`use` prefix, and utilities in camelCase. Rust code follows `rustfmt`; modules and
functions use snake_case. Prefer existing `@/` imports and shared components over
duplicating helpers.

## Testing Guidelines

Unit tests are allowed and expected when behavior changes or a regression needs
protection. Use Vitest and Testing Library for frontend behavior, and Node's test
runner for scripts. Name tests after observable behavior, for example
`use-update.test.tsx`. Run the focused test first, then the full relevant suite.

## Commit & Pull Request Guidelines

Follow the repository's Conventional Commit style, such as `fix(ui): remove raw
release-note HTML` or `chore(deps): use forked service`. Keep commits focused.
Pull requests should explain the user-visible result, list verification commands,
link related issues, and include screenshots for UI changes. Note platform-specific
impact and any release, signing, or migration requirements.

<!-- TRELLIS:START -->
# Trellis Instructions

These instructions are for AI assistants working in this project.

This project is managed by Trellis. The working knowledge you need lives under `.trellis/`:

- `.trellis/workflow.md` — development phases, when to create tasks, skill routing
- `.trellis/spec/` — package- and layer-scoped coding guidelines (read before writing code in a given layer)
- `.trellis/workspace/` — per-developer journals and session traces
- `.trellis/tasks/` — active and archived tasks (PRDs, research, jsonl context)

If a Trellis command is available on your platform (e.g. `/trellis:finish-work`, `/trellis:continue`), prefer it over manual steps. Not every platform exposes every command.

If you're using Codex or another agent-capable tool, additional project-scoped helpers may live in:
- `.agents/skills/` — reusable Trellis skills
- `.codex/agents/` — optional custom subagents

Managed by Trellis. Edits outside this block are preserved; edits inside may be overwritten by a future `trellis update`.

<!-- TRELLIS:END -->
