# Codex Viewer Lite

Read-only Codex session viewer built with SvelteKit 2 + Hono 4.

## Key Features

- **Project / session browsing** from local `~/.codex/sessions`
- **Chat timeline** with Markdown rendering (marked, GFM)
- **Live refresh via SSE** — file watcher emits `project_changed` / `session_changed` events; client debounces at 180 ms then calls `invalidateAll()`
- **i18n** — 简体中文 + English with auto-detect and persisted preference
- **Dark mode** — theme toggle with local persistence and no-flash startup
- **Modern UI** — token-based CSS design system with depth, micro-interactions, and glassmorphism accents
- **Security** — HTML sanitization, path traversal protection, base64-URL encoded IDs

## Scope Boundary

This project intentionally excludes write/agent-control functions:

1. No new chat creation.
2. No resume chat.
3. No task abort.
4. No Diff modal.
5. No MCP panel.
6. No file-completion panel.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | SvelteKit 2 + Svelte 5 (runes) |
| API routing | Hono 4 (mounted via SvelteKit `handle` hook) |
| Adapter | `@sveltejs/adapter-node` |
| Markdown | marked 17 |
| Lint / Format | Biome |
| Test | Vitest |
| Styling | Token-based CSS design system (no Tailwind) |

## Quick Start

```bash
pnpm install
pnpm dev          # dev server with HMR
pnpm build        # production build
pnpm start        # run production build (node build)
```

Other commands:

```bash
pnpm test         # run unit tests
pnpm check        # svelte-check type checking
pnpm lint         # biome lint + format check
pnpm fix          # biome auto-fix
```

## Routes

### Pages

| Path | Description |
|------|-------------|
| `/projects` | Project list |
| `/projects/:projectId` | Session list for a project |
| `/projects/:projectId/sessions/:sessionId` | Chat timeline for a session |

### API

| Endpoint | Description |
|----------|-------------|
| `GET /api/projects` | All projects |
| `GET /api/projects/:projectId` | Project detail with sessions |
| `GET /api/projects/:projectId/sessions/:sessionId` | Parsed session messages |
| `GET /api/events/state_changes` | SSE stream (file change events) |

## Project Structure

```
src/
├── hooks.server.ts              # routes /api/* to Hono
├── routes/                      # SvelteKit pages
│   ├── projects/
│   │   ├── [projectId]/
│   │   │   └── sessions/[sessionId]/
├── lib/
│   ├── server/
│   │   ├── hono/                # Hono app + route definitions
│   │   ├── events/              # FileWatcher, EventBus, SSE helpers
│   │   ├── codex/               # JSONL parsing, session file readers
│   │   ├── services/            # projects & sessions business logic
│   │   ├── ids.ts               # base64-URL encode/decode
│   │   └── paths.ts             # resolved filesystem paths
│   ├── client/                  # API client, SSE client
│   ├── components/              # Svelte components (Markdown, i18n switcher, SSE status)
│   ├── i18n/                    # dictionaries + locale store
│   └── shared/                  # shared types
```

## Architecture Overview

### Data Flow

```
~/.codex/sessions/*.jsonl  →  parse  →  Hono API  →  SvelteKit pages
```

JSONL session files are read from disk, parsed into structured messages, served as JSON through Hono routes, and rendered by SvelteKit pages with Markdown formatting.

### SSE Pipeline

```
FileWatcher (fs.watch)  →  EventBus (EventEmitter)  →  SSE stream  →  client invalidateAll()
```

`FileWatcher` monitors `~/.codex/sessions` recursively. File changes emit typed events (`project_changed`, `session_changed`) through the `EventBus`. The SSE endpoint streams these to the browser, where the client debounces (180 ms) and triggers SvelteKit's `invalidateAll()` to re-fetch data.

### Hono Integration

The SvelteKit `handle` hook in `hooks.server.ts` intercepts all `/api/*` requests and forwards them to the Hono app. Everything else falls through to normal SvelteKit page rendering.
