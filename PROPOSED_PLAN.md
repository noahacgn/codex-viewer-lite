# Codex Viewer Lite 重建计划（SvelteKit + Hono，只读版，微信聊天风）

## 摘要
基于现有 `codex-viewer`，在 `D:\IdeaProjects` 新建全新项目与 Git 仓库，重建只读核心能力：项目/会话浏览、会话内容查看、Markdown 高质量渲染、SSE 实时刷新、中英双语。

## 已锁定决策
1. 新仓库目录名与 Git 仓库名：`D:\IdeaProjects\codex-viewer-lite`。
2. 技术栈：`SvelteKit + Hono + TypeScript`。
3. 交付方式：仅 Web 应用，不提供 CLI bin 封装。
4. 范围：只读查看器，不提供新建/续聊/中止任务能力。
5. Markdown：安全优先（GFM + 代码高亮 + 安全清洗，默认禁用原始 HTML）。
6. i18n：简体中文 + 英文，首次自动检测，用户切换后本地记忆。
7. 实时能力：保留 SSE，移除 Diff。
8. 附加面板：移除 MCP 与文件补全面板。
9. 视觉方向：微信聊天界面气质（清爽、轻层级、高可读）。

## 范围定义

### In Scope
1. `/projects`：项目列表页（搜索、排序、空状态、最后活跃时间、消息计数）。
2. `/projects/:projectId`：会话列表页（筛选、排序、快速进入会话）。
3. `/projects/:projectId/sessions/:sessionId`：会话详情页（时间线、Markdown 渲染、会话元信息）。
4. SSE 实时刷新：项目和会话变更自动刷新，不手动轮询。
5. i18n 双语全覆盖：页面文案、按钮、空状态、错误提示、时间格式。
6. 兼容 `.codex` 数据读取：`~/.codex/sessions` + `~/.codex/history.jsonl`。
7. 保留 ID 语义兼容：`projectId/sessionId` 仍采用绝对路径的 base64url 编码。

### Out of Scope
1. 新建会话、续聊、任务中止、任务状态管理。
2. Diff 比对弹窗与对应 API。
3. MCP 列表面板与 API。
4. 文件补全（`@`）与对应 API。
5. 通知设置、任务完成提示音等任务相关功能。

## 技术实施概要
1. 使用 SvelteKit App Router 承载前端页面。
2. 通过 `hooks.server.ts` 将 `/api/*` 请求转发给 Hono 路由。
3. 后端读取 `~/.codex/sessions` JSONL 与 `~/.codex/history.jsonl`，解析成项目/会话/turn 数据。
4. 使用 SSE 推送 `connected | heartbeat | project_changed | session_changed`。
5. 聊天消息统一走安全 Markdown 渲染管道。
6. 使用本地词典 + store 实现 `zh-CN/en-US` i18n，支持自动检测与持久化。

## 验收标准
1. 项目可在 `D:\IdeaProjects\codex-viewer-lite` 独立运行。
2. 具备只读浏览能力，包含项目列表、会话列表、会话详情。
3. Markdown 渲染在主聊天流生效，支持代码块、表格、链接等常用语法。
4. 中英切换可用并可记忆。
5. SSE 实时刷新可用，文件变化无需手动刷新可见。
6. 不包含任务执行、Diff、MCP、文件补全功能。
7. `lint/typecheck/test` 全绿，零 warning。
