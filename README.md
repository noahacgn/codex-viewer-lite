# Codex Viewer Lite

Read-only Codex session viewer rebuilt with `SvelteKit + Hono`.

## Key Features

1. Project list from local `~/.codex/sessions`.
2. Session list and session detail pages.
3. Main chat timeline rendered with Markdown.
4. Live refresh via SSE (`project_changed`, `session_changed`).
5. Built-in i18n (`简体中文` + `English`) with auto-detect and persisted preference.
6. WeChat-inspired lightweight UI.

## Scope Boundary

This project intentionally excludes write/agent-control functions:

1. No new chat creation.
2. No resume chat.
3. No task abort.
4. No Diff modal.
5. No MCP panel.
6. No file-completion panel.

## Commands

```bash
pnpm install
pnpm dev
pnpm build
pnpm start
pnpm test
pnpm check
pnpm lint
```

## Routes

1. `/projects`
2. `/projects/:projectId`
3. `/projects/:projectId/sessions/:sessionId`
4. `/api/projects`
5. `/api/projects/:projectId`
6. `/api/projects/:projectId/sessions/:sessionId`
7. `/api/events/state_changes`

## Tech Stack

1. SvelteKit 2 + Svelte 5
2. Hono 4 (API routing)
3. Node file system readers for Codex JSONL files
4. marked (Markdown rendering)
5. Biome + Vitest
